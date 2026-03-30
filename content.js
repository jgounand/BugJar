/**
 * BugJar — Content Script (content.js)
 *
 * Injected into the active page. Provides:
 *  - Console capture (overrides console.log / warn / error / info)
 *  - Network capture (intercepts XMLHttpRequest and fetch)
 *  - DOM inspector (highlight on hover, capture info on click)
 */

(() => {
  // Guard against double-injection
  if (window.__bugjarInjected) return;
  window.__bugjarInjected = true;

  // =========================================================================
  // 1. CONSOLE CAPTURE
  // =========================================================================
  const MAX_CONSOLE_ENTRIES = 100;
  const consoleLogs = [];

  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console)
  };

  function captureConsole(level) {
    return function (...args) {
      const entry = {
        level,
        timestamp: new Date().toISOString(),
        message: args.map(arg => {
          try {
            if (typeof arg === 'object') return JSON.stringify(arg, null, 2);
            return String(arg);
          } catch {
            return String(arg);
          }
        }).join(' ')
      };

      // P2-11: Capture stack trace for errors
      if (level === 'error') {
        try { throw new Error(); } catch(e) { entry.stack = e.stack; }
      }

      consoleLogs.push(entry);

      // Keep buffer bounded
      if (consoleLogs.length > MAX_CONSOLE_ENTRIES) {
        consoleLogs.shift();
      }

      // Notify background of error count for badge
      if (level === 'error') {
        try {
          chrome.runtime.sendMessage({
            action: 'consoleErrorDetected',
            count: consoleLogs.filter(l => l.level === 'error').length
          });
        } catch {
          // Extension context may be invalidated — ignore
        }
      }

      // Call original
      originalConsole[level](...args);
    };
  }

  console.log = captureConsole('log');
  console.warn = captureConsole('warn');
  console.error = captureConsole('error');
  console.info = captureConsole('info');

  // Also capture unhandled errors
  window.addEventListener('error', (event) => {
    consoleLogs.push({
      level: 'error',
      timestamp: new Date().toISOString(),
      message: `Uncaught ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`
    });
    if (consoleLogs.length > MAX_CONSOLE_ENTRIES) consoleLogs.shift();
  });

  window.addEventListener('unhandledrejection', (event) => {
    consoleLogs.push({
      level: 'error',
      timestamp: new Date().toISOString(),
      message: `Unhandled Promise Rejection: ${event.reason}`
    });
    if (consoleLogs.length > MAX_CONSOLE_ENTRIES) consoleLogs.shift();
  });

  // =========================================================================
  // 2. NETWORK CAPTURE
  // =========================================================================
  const MAX_NETWORK_ENTRIES = 100;
  const networkLogs = [];

  // --- Intercept XMLHttpRequest ---
  const OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OriginalXHR();
    const entry = {
      type: 'xhr',
      method: '',
      url: '',
      status: 0,
      statusText: '',
      startTime: 0,
      endTime: 0,
      duration: 0,
      responseSize: 0,
      error: null
    };

    const origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      entry.method = method.toUpperCase();
      entry.url = url;
      return origOpen(method, url, ...rest);
    };

    const origSend = xhr.send.bind(xhr);
    xhr.send = function (...args) {
      entry.startTime = performance.now();

      xhr.addEventListener('loadend', () => {
        entry.endTime = performance.now();
        entry.duration = Math.round(entry.endTime - entry.startTime);
        entry.status = xhr.status;
        entry.statusText = xhr.statusText;
        try {
          entry.responseSize = xhr.response
            ? new Blob([xhr.response]).size
            : 0;
        } catch {
          entry.responseSize = 0;
        }
        // P2-12: Capture response body for failed requests (4xx/5xx)
        if (xhr.status >= 400) {
          try {
            entry.responseBody = (xhr.responseText || '').substring(0, 500);
          } catch {
            entry.responseBody = '';
          }
        }
        entry.timestamp = new Date().toISOString();
        networkLogs.push(entry);
        if (networkLogs.length > MAX_NETWORK_ENTRIES) networkLogs.shift();
      });

      xhr.addEventListener('error', () => {
        entry.error = 'Network Error';
      });

      return origSend(...args);
    };

    return xhr;
  }
  // Copy static props
  PatchedXHR.prototype = OriginalXHR.prototype;
  PatchedXHR.UNSENT = 0;
  PatchedXHR.OPENED = 1;
  PatchedXHR.HEADERS_RECEIVED = 2;
  PatchedXHR.LOADING = 3;
  PatchedXHR.DONE = 4;
  window.XMLHttpRequest = PatchedXHR;

  // --- Intercept fetch ---
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (resource, init) {
    const entry = {
      type: 'fetch',
      method: (init && init.method) ? init.method.toUpperCase() : 'GET',
      url: typeof resource === 'string' ? resource : resource.url,
      status: 0,
      statusText: '',
      startTime: performance.now(),
      endTime: 0,
      duration: 0,
      responseSize: 0,
      error: null,
      timestamp: ''
    };

    try {
      const response = await originalFetch(resource, init);
      entry.endTime = performance.now();
      entry.duration = Math.round(entry.endTime - entry.startTime);
      entry.status = response.status;
      entry.statusText = response.statusText;
      entry.timestamp = new Date().toISOString();

      // Clone to read size without consuming body
      try {
        const clone = response.clone();
        const blob = await clone.blob();
        entry.responseSize = blob.size;
      } catch {
        entry.responseSize = 0;
      }

      // P2-12: Capture response body for failed requests (4xx/5xx)
      if (response.status >= 400) {
        try {
          const clone2 = response.clone();
          const text = await clone2.text();
          entry.responseBody = text.substring(0, 500);
        } catch {
          entry.responseBody = '';
        }
      }

      networkLogs.push(entry);
      if (networkLogs.length > MAX_NETWORK_ENTRIES) networkLogs.shift();
      return response;
    } catch (err) {
      entry.endTime = performance.now();
      entry.duration = Math.round(entry.endTime - entry.startTime);
      entry.error = err.message;
      entry.timestamp = new Date().toISOString();
      networkLogs.push(entry);
      if (networkLogs.length > MAX_NETWORK_ENTRIES) networkLogs.shift();
      throw err;
    }
  };

  // =========================================================================
  // 3. DOM INSPECTOR (with full UX: banner, tooltip, persistent highlight)
  // =========================================================================
  let inspectorActive = false;
  let highlightOverlay = null;
  let tooltipEl = null;
  let bannerEl = null;
  let selectedHighlight = null;
  let selectedElementInfo = null;

  function createInspectorUI() {
    // Highlight overlay (follows mouse)
    if (!highlightOverlay) {
      highlightOverlay = document.createElement('div');
      highlightOverlay.id = '__bugjar_overlay';
      highlightOverlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #e94560;background:rgba(233,69,96,0.15);z-index:2147483646;transition:all 0.05s ease;display:none;border-radius:2px;';
      document.body.appendChild(highlightOverlay);
    }

    // Tooltip (shows tag.class near cursor)
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = '__bugjar_tooltip';
      tooltipEl.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:#1a1a2e;color:#fff;padding:4px 8px;border-radius:4px;font:12px monospace;white-space:nowrap;display:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      document.body.appendChild(tooltipEl);
    }

    // Top banner with instructions + cancel button
    if (!bannerEl) {
      bannerEl = document.createElement('div');
      bannerEl.id = '__bugjar_banner';
      bannerEl.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#e94560;color:#fff;padding:10px 20px;font:14px system-ui,sans-serif;text-align:center;display:flex;align-items:center;justify-content:center;gap:16px;box-shadow:0 2px 12px rgba(0,0,0,0.3);';

      const textSpan = document.createElement('span');
      textSpan.textContent = 'Click on any element to select it';
      bannerEl.appendChild(textSpan);

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'background:#fff;color:#e94560;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font:13px system-ui;font-weight:600;';
      cancelBtn.addEventListener('click', () => { deactivateInspector(); showToast('Inspector cancelled', 'error'); });
      bannerEl.appendChild(cancelBtn);

      document.body.appendChild(bannerEl);
    }
  }

  function removeInspectorUI() {
    if (highlightOverlay) { highlightOverlay.remove(); highlightOverlay = null; }
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    if (bannerEl) { bannerEl.remove(); bannerEl = null; }
  }

  function showSelectedHighlight(rect, info) {
    if (selectedHighlight) selectedHighlight.remove();

    selectedHighlight = document.createElement('div');
    selectedHighlight.id = '__bugjar_selected';
    selectedHighlight.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;border:3px solid #27ae60;background:rgba(39,174,96,0.1);border-radius:2px;top:' + rect.top + 'px;left:' + rect.left + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;';

    const label = document.createElement('div');
    const tagText = info.tagName + (info.id ? '#' + info.id : '') + (info.classes.length ? '.' + info.classes.slice(0, 2).join('.') : '');
    label.textContent = tagText + ' (' + rect.width + 'x' + rect.height + ')';
    label.style.cssText = 'position:absolute;top:-24px;left:0;background:#27ae60;color:#fff;padding:2px 8px;border-radius:3px;font:11px monospace;white-space:nowrap;';
    selectedHighlight.appendChild(label);

    document.body.appendChild(selectedHighlight);
    setTimeout(() => { if (selectedHighlight) { selectedHighlight.remove(); selectedHighlight = null; } }, 5000);
  }

  function getXPath(element) {
    if (element.id) return `//*[@id="${element.id}"]`;

    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }
    return '/' + parts.join('/');
  }

  function getCssSelector(element) {
    if (element.id) return `#${element.id}`;

    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${current.id}`;
        parts.unshift(selector);
        break;
      }
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).slice(0, 3);
        if (classes.length > 0 && classes[0] !== '') {
          selector += '.' + classes.join('.');
        }
      }
      // Add nth-child if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          c => c.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function getElementInfo(element) {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList),
      textContent: (element.textContent || '').trim().substring(0, 200),
      xpath: getXPath(element),
      cssSelector: getCssSelector(element),
      attributes: Array.from(element.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}),
      boundingRect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      computedStyles: {
        display: computedStyle.display,
        position: computedStyle.position,
        color: computedStyle.color,
        backgroundColor: computedStyle.backgroundColor,
        fontSize: computedStyle.fontSize,
        fontFamily: computedStyle.fontFamily,
        margin: computedStyle.margin,
        padding: computedStyle.padding,
        border: computedStyle.border
      }
    };
  }

  function isInspectorElement(el) {
    let node = el;
    while (node) {
      if (node.id && node.id.startsWith('__bugjar_')) return true;
      node = node.parentElement;
    }
    return false;
  }

  function onInspectorMouseMove(e) {
    if (!inspectorActive || !highlightOverlay) return;
    const target = e.target;
    if (isInspectorElement(target)) return;

    const rect = target.getBoundingClientRect();
    highlightOverlay.style.display = 'block';
    highlightOverlay.style.top = rect.top + 'px';
    highlightOverlay.style.left = rect.left + 'px';
    highlightOverlay.style.width = rect.width + 'px';
    highlightOverlay.style.height = rect.height + 'px';

    // Show tooltip with element info near cursor
    if (tooltipEl) {
      const tag = target.tagName.toLowerCase();
      const id = target.id ? '#' + target.id : '';
      const cls = target.className && typeof target.className === 'string'
        ? '.' + target.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
      const size = Math.round(rect.width) + 'x' + Math.round(rect.height);
      tooltipEl.textContent = tag + id + cls + '  ' + size;
      tooltipEl.style.display = 'block';
      tooltipEl.style.top = Math.min(e.clientY + 20, window.innerHeight - 30) + 'px';
      tooltipEl.style.left = Math.min(e.clientX + 15, window.innerWidth - 200) + 'px';
    }
  }

  function onInspectorClick(e) {
    if (!inspectorActive) return;
    const target = e.target;
    if (isInspectorElement(target)) return;

    e.preventDefault();
    e.stopPropagation();

    selectedElementInfo = getElementInfo(target);
    const rect = target.getBoundingClientRect();

    // Show persistent green highlight on selected element
    deactivateInspector();
    showSelectedHighlight(
      { top: rect.top, left: rect.left, width: Math.round(rect.width), height: Math.round(rect.height) },
      selectedElementInfo
    );

    // Toast confirmation
    var toastLabel = selectedElementInfo.tagName;
    if (selectedElementInfo.classes && selectedElementInfo.classes.length) {
      toastLabel += '.' + selectedElementInfo.classes.slice(0, 2).join('.');
    }
    showToast('Element captured: ' + toastLabel);

    // Store in chrome.storage + notify + reopen popup
    chrome.storage.local.set({ capturedElement: selectedElementInfo });
    chrome.runtime.sendMessage({
      action: 'elementSelected',
      elementInfo: selectedElementInfo
    });
    // Ask background to reopen the popup automatically
    chrome.runtime.sendMessage({ action: 'reopenPopup' });
  }

  function activateInspector() {
    inspectorActive = true;
    createInspectorUI();
    document.addEventListener('mousemove', onInspectorMouseMove, true);
    document.addEventListener('click', onInspectorClick, true);
    document.body.style.cursor = 'crosshair';
  }

  function deactivateInspector() {
    inspectorActive = false;
    removeInspectorUI();
    document.removeEventListener('mousemove', onInspectorMouseMove, true);
    document.removeEventListener('click', onInspectorClick, true);
    document.body.style.cursor = '';
  }

  // =========================================================================
  // 4. TOAST NOTIFICATIONS
  // =========================================================================
  function showToast(message, type) {
    if (type === undefined) type = 'success';
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:' +
      (type === 'success' ? '#27ae60' : '#e94560') +
      ';color:#fff;padding:12px 20px;border-radius:8px;font:14px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.3s;';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () { toast.style.opacity = '0'; setTimeout(function () { toast.remove(); }, 300); }, 3000);
  }

  // =========================================================================
  // 5. FRAMEWORK DETECTION (P2-13)
  // =========================================================================
  function detectFramework() {
    const info = { name: 'Unknown', version: '' };

    // Angular
    if (window.ng && window.ng.getComponent) {
      info.name = 'Angular';
      const vEl = document.querySelector('[ng-version]');
      if (vEl) info.version = vEl.getAttribute('ng-version');
    } else if (document.querySelector('[ng-version]')) {
      info.name = 'Angular';
      info.version = document.querySelector('[ng-version]').getAttribute('ng-version');
    }
    // React
    else if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector('[data-reactroot]')) {
      info.name = 'React';
      if (window.React && window.React.version) info.version = window.React.version;
    }
    // Vue
    else if (window.__VUE__ || document.querySelector('[data-v-]')) {
      info.name = 'Vue';
      if (window.Vue && window.Vue.version) info.version = window.Vue.version;
    }
    // jQuery
    if (window.jQuery) {
      info.jquery = window.jQuery.fn.jquery;
    }

    return info;
  }

  // =========================================================================
  // 6. ROUTE/URL HISTORY — SPA navigation tracking (P2-16)
  // =========================================================================
  const navigationHistory = [];
  const MAX_NAV_ENTRIES = 20;

  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    navigationHistory.push({ url: args[2] || location.href, timestamp: new Date().toISOString(), type: 'pushState' });
    if (navigationHistory.length > MAX_NAV_ENTRIES) navigationHistory.shift();
    return originalPushState.apply(this, args);
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    navigationHistory.push({ url: args[2] || location.href, timestamp: new Date().toISOString(), type: 'replaceState' });
    if (navigationHistory.length > MAX_NAV_ENTRIES) navigationHistory.shift();
    return originalReplaceState.apply(this, args);
  };

  window.addEventListener('popstate', () => {
    navigationHistory.push({ url: location.href, timestamp: new Date().toISOString(), type: 'popstate' });
    if (navigationHistory.length > MAX_NAV_ENTRIES) navigationHistory.shift();
  });

  // =========================================================================
  // 7. MESSAGE HANDLER
  // =========================================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'getConsoleLogs':
        sendResponse({
          success: true,
          logs: consoleLogs.slice(-50)
        });
        break;

      case 'getNetworkLogs':
        sendResponse({
          success: true,
          logs: networkLogs.slice(-50)
        });
        break;

      case 'activateInspector':
        activateInspector();
        sendResponse({ success: true });
        break;

      case 'deactivateInspector':
        deactivateInspector();
        sendResponse({ success: true });
        break;

      case 'getSelectedElement':
        sendResponse({
          success: true,
          elementInfo: selectedElementInfo
        });
        break;

      case 'getFrameworkInfo':
        sendResponse({ success: true, framework: detectFramework() });
        break;

      case 'getStorageInfo':
        try {
          const storageInfo = {
            localStorage: Object.keys(localStorage).map(k => ({ key: k, size: localStorage.getItem(k).length })),
            sessionStorage: Object.keys(sessionStorage).map(k => ({ key: k, size: sessionStorage.getItem(k).length }))
          };
          sendResponse({ success: true, storage: storageInfo });
        } catch(e) {
          sendResponse({ success: false, error: e.message });
        }
        break;

      case 'getNavigationHistory':
        sendResponse({ success: true, history: navigationHistory.slice() });
        break;

      case 'triggerCaptureAll':
        showToast('Capture All triggered (open BugJar to see results)', 'success');
        sendResponse({ success: true });
        break;

      case 'ping':
        sendResponse({ success: true, injected: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  });
})();
