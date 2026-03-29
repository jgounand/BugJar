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
  if (window.__kmFeedbackInjected) return;
  window.__kmFeedbackInjected = true;

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
      consoleLogs.push({
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
      });

      // Keep buffer bounded
      if (consoleLogs.length > MAX_CONSOLE_ENTRIES) {
        consoleLogs.shift();
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
  // 3. DOM INSPECTOR
  // =========================================================================
  let inspectorActive = false;
  let highlightOverlay = null;
  let selectedElementInfo = null;

  function createHighlightOverlay() {
    if (highlightOverlay) return;
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = '__km_feedback_overlay';
    highlightOverlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 2px solid #e94560;
      background: rgba(233, 69, 96, 0.15);
      z-index: 2147483647;
      transition: all 0.1s ease;
      display: none;
    `;
    document.body.appendChild(highlightOverlay);
  }

  function removeHighlightOverlay() {
    if (highlightOverlay) {
      highlightOverlay.remove();
      highlightOverlay = null;
    }
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
          selector += `:nth-child(${idx})`;
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

  function onInspectorMouseMove(e) {
    if (!inspectorActive || !highlightOverlay) return;
    const target = e.target;
    if (target === highlightOverlay || target.id === '__km_feedback_overlay') return;

    const rect = target.getBoundingClientRect();
    highlightOverlay.style.display = 'block';
    highlightOverlay.style.top = rect.top + 'px';
    highlightOverlay.style.left = rect.left + 'px';
    highlightOverlay.style.width = rect.width + 'px';
    highlightOverlay.style.height = rect.height + 'px';
  }

  function onInspectorClick(e) {
    if (!inspectorActive) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    if (target === highlightOverlay || target.id === '__km_feedback_overlay') return;

    selectedElementInfo = getElementInfo(target);
    deactivateInspector();

    // Notify popup
    chrome.runtime.sendMessage({
      action: 'elementSelected',
      elementInfo: selectedElementInfo
    });
  }

  function activateInspector() {
    inspectorActive = true;
    createHighlightOverlay();
    document.addEventListener('mousemove', onInspectorMouseMove, true);
    document.addEventListener('click', onInspectorClick, true);
    document.body.style.cursor = 'crosshair';
  }

  function deactivateInspector() {
    inspectorActive = false;
    removeHighlightOverlay();
    document.removeEventListener('mousemove', onInspectorMouseMove, true);
    document.removeEventListener('click', onInspectorClick, true);
    document.body.style.cursor = '';
  }

  // =========================================================================
  // 4. MESSAGE HANDLER
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

      case 'ping':
        sendResponse({ success: true, injected: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  });
})();
