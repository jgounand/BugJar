/**
 * BugJar — Popup Logic (popup.js)
 *
 * Orchestrates the capture workflow:
 *  - Screenshot capture + annotation
 *  - Console log retrieval
 *  - Network log retrieval
 *  - DOM element selection
 *  - Report generation
 *
 * SECURITY NOTE: All dynamic content is escaped via escapeHtml() before
 * insertion. The data displayed originates from the user's own browser
 * session and never from untrusted external sources.
 */

// ============================================================================
// State
// ============================================================================
const MAX_SCREENSHOTS = 5;
const state = {
  screenshots: [],         // array of data URLs (annotated or raw) — P3-19
  consoleLogs: null,       // array of log entries
  networkLogs: null,       // array of network entries
  elementInfo: null,       // selected element details
  tabInfo: null,           // active tab URL/title
  frameworkInfo: null,     // P2-13: detected framework
  storageInfo: null,       // P2-15: localStorage/sessionStorage keys
  navigationHistory: null  // P2-16: SPA route history
};

// ============================================================================
// DOM references
// ============================================================================
const els = {
  description: document.getElementById('description'),
  steps: document.getElementById('steps'),
  category: document.getElementById('category'),
  priority: document.getElementById('priority'),
  btnScreenshot: document.getElementById('btn-screenshot'),
  btnElement: document.getElementById('btn-element'),
  btnConsole: document.getElementById('btn-console'),
  btnNetwork: document.getElementById('btn-network'),
  btnCaptureAll: document.getElementById('btn-capture-all'),
  btnClear: document.getElementById('btn-clear'),
  btnGenerate: document.getElementById('btn-generate'),
  capturedPreview: document.getElementById('captured-preview'),
  screenshotPreview: document.getElementById('screenshot-preview'),
  screenshotImg: document.getElementById('screenshot-img'),
  elementPreview: document.getElementById('element-preview'),
  statusBar: document.getElementById('status-bar')
};

// ============================================================================
// Helpers
// ============================================================================
function setStatus(text, type = '') {
  els.statusBar.textContent = text;
  els.statusBar.className = 'status-bar' + (type ? ' ' + type : '');
  if (type === 'success') {
    clearTimeout(setStatus._timer);
    setStatus._timer = setTimeout(() => {
      els.statusBar.textContent = 'Ready';
      els.statusBar.className = 'status-bar';
    }, 4000);
  }
}

function markCaptured(btn) {
  btn.classList.add('captured');
}

function setLoading(btn, loading) {
  btn.classList.toggle('loading', loading);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Safe DOM builder: creates an element, sets attributes and text, appends children.
 * Used to avoid raw innerHTML where practical.
 */
function createElement(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'textContent') {
        el.textContent = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'className') {
        el.className = value;
      } else {
        el.setAttribute(key, value);
      }
    }
  }
  for (const child of children) {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child) {
      el.appendChild(child);
    }
  }
  return el;
}

function updatePreviewBadges() {
  const badges = [];
  if (state.screenshots.length > 0) badges.push({ icon: '\u{1F4F8}', text: state.screenshots.length === 1 ? 'Screenshot' : `${state.screenshots.length} screenshots` });
  if (state.elementInfo) badges.push({ icon: '\u{1F5B1}\uFE0F', text: 'Element' });
  if (state.consoleLogs) badges.push({ icon: '\u{1F4CB}', text: `Console (${state.consoleLogs.length})` });
  if (state.networkLogs) badges.push({ icon: '\u{1F310}', text: `Network (${state.networkLogs.length})` });

  // Build badges safely using DOM API
  els.capturedPreview.replaceChildren();
  for (const b of badges) {
    const badge = createElement('span', { className: 'badge' },
      createElement('span', { className: 'badge-icon', textContent: b.icon }),
      b.text
    );
    els.capturedPreview.appendChild(badge);
  }

  els.capturedPreview.classList.toggle('has-data', badges.length > 0);
}

/**
 * Ensure content script is injected into the active tab.
 * Returns the tab ID on success, or null.
 */
async function ensureContentScript() {
  const [tab] = await new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs || []));
  });

  if (!tab) {
    setStatus('No active tab found', 'error');
    return null;
  }

  const tabId = tab.id;

  // Try ping first (already injected?)
  const alreadyReady = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'ping' }, (r) => {
      resolve(!chrome.runtime.lastError && r && r.injected);
    });
  });
  if (alreadyReady) return tabId;

  // Inject
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'injectContentScript', tabId }, resolve);
  });
  if (!res || !res.success) {
    setStatus(`Cannot inject: ${(res && res.error) || 'Restricted page'}`, 'error');
    return null;
  }

  // Wait for ready with retries
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const ready = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (r) => {
        resolve(!chrome.runtime.lastError && r && r.injected);
      });
    });
    if (ready) return tabId;
  }

  setStatus('Content script not responding', 'error');
  return null;
}

// ============================================================================
// Screenshot capture
// ============================================================================
els.btnScreenshot.addEventListener('click', async () => {
  setLoading(els.btnScreenshot, true);
  setStatus('Capturing screenshot...');

  chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
    setLoading(els.btnScreenshot, false);

    if (!response || !response.success) {
      setStatus('Screenshot failed: ' + (response ? response.error : 'Unknown error'), 'error');
      return;
    }

    // Store raw screenshot, then open annotation editor
    const dataUrl = response.dataUrl;

    setStatus('Opening annotation editor...');

    chrome.runtime.sendMessage({
      action: 'openAnnotationEditor',
      dataUrl: dataUrl
    }, (res) => {
      if (res && res.success) {
        setStatus('Annotate the screenshot in the new tab', 'success');
        // The popup will close when user clicks away. The annotation editor
        // will save results to chrome.storage.local and the popup can pick
        // them up next time it opens.
      } else {
        // Even without annotation, we still have the raw screenshot — P3-19: push to array
        if (state.screenshots.length >= MAX_SCREENSHOTS) state.screenshots.shift();
        state.screenshots.push(dataUrl);
        markCaptured(els.btnScreenshot);
        showScreenshotPreview();
        updatePreviewBadges();
        setStatus('Screenshot captured (annotation unavailable)', 'success');
      }
    });
  });
});

function showScreenshotPreview() {
  if (state.screenshots.length === 0) {
    els.screenshotPreview.classList.remove('visible');
    return;
  }
  // Show the latest screenshot thumbnail
  els.screenshotImg.src = state.screenshots[state.screenshots.length - 1];
  els.screenshotPreview.classList.add('visible');
  // Show count badge if more than one
  let countBadge = els.screenshotPreview.querySelector('.screenshot-count');
  if (state.screenshots.length > 1) {
    if (!countBadge) {
      countBadge = createElement('div', {
        className: 'screenshot-count',
        style: { position: 'absolute', top: '6px', right: '6px', background: '#e94560', color: '#fff', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' }
      });
      els.screenshotPreview.style.position = 'relative';
      els.screenshotPreview.appendChild(countBadge);
    }
    countBadge.textContent = state.screenshots.length + ' screenshots';
  } else if (countBadge) {
    countBadge.remove();
  }
}

// ============================================================================
// DOM Element selector
// ============================================================================
els.btnElement.addEventListener('click', async () => {
  setLoading(els.btnElement, true);
  setStatus('Activating element selector...');

  const tabId = await ensureContentScript();
  if (!tabId) {
    setLoading(els.btnElement, false);
    return;
  }

  chrome.tabs.sendMessage(tabId, { action: 'activateInspector' }, (response) => {
    setLoading(els.btnElement, false);
    if (response && response.success) {
      setStatus('Click an element on the page to select it', 'success');
      // The popup will close; selection is handled by content script which sends
      // a message back. We listen for it below.
    } else {
      setStatus('Could not activate inspector', 'error');
    }
  });
});

// Listen for element selection from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'elementSelected') {
    state.elementInfo = message.elementInfo;
    markCaptured(els.btnElement);
    showElementPreview(state.elementInfo);
    updatePreviewBadges();
    setStatus('Element captured', 'success');

    // Persist to storage so it survives popup re-open
    chrome.storage.local.set({ capturedElement: state.elementInfo });
  }
});

function showElementPreview(info) {
  els.elementPreview.replaceChildren();

  // First line: <tag#id.class>
  const line1 = createElement('div', { className: 'el-line' });
  line1.appendChild(createElement('span', { className: 'el-tag', textContent: `<${info.tagName}` }));
  if (info.id) {
    line1.appendChild(document.createTextNode(' '));
    line1.appendChild(createElement('span', { className: 'el-id', textContent: `#${info.id}` }));
  }
  if (info.classes.length) {
    line1.appendChild(document.createTextNode(' '));
    line1.appendChild(createElement('span', { className: 'el-class', textContent: `.${info.classes.join('.')}` }));
  }
  line1.appendChild(createElement('span', { className: 'el-tag', textContent: '>' }));
  els.elementPreview.appendChild(line1);

  // CSS Selector
  const line2 = createElement('div', {
    className: 'el-line',
    textContent: info.cssSelector,
    style: { marginTop: '4px', color: '#888', fontSize: '10px' }
  });
  els.elementPreview.appendChild(line2);

  // Dimensions
  const line3 = createElement('div', {
    className: 'el-line',
    textContent: `${info.boundingRect.width}x${info.boundingRect.height}px`,
    style: { marginTop: '2px', color: '#888', fontSize: '10px' }
  });
  els.elementPreview.appendChild(line3);

  els.elementPreview.classList.add('visible');
}

// ============================================================================
// Console capture
// ============================================================================
els.btnConsole.addEventListener('click', async () => {
  setLoading(els.btnConsole, true);
  setStatus('Capturing console logs...');

  const tabId = await ensureContentScript();
  if (!tabId) {
    setLoading(els.btnConsole, false);
    return;
  }

  chrome.tabs.sendMessage(tabId, { action: 'getConsoleLogs' }, (response) => {
    setLoading(els.btnConsole, false);

    if (chrome.runtime.lastError) {
      setStatus('Failed to get console logs', 'error');
      return;
    }

    if (response && response.success) {
      state.consoleLogs = response.logs;
      markCaptured(els.btnConsole);
      updatePreviewBadges();
      setStatus(`Captured ${response.logs.length} console messages`, 'success');
    } else {
      setStatus('No console data available', 'error');
    }
  });
});

// ============================================================================
// Network capture
// ============================================================================
els.btnNetwork.addEventListener('click', async () => {
  setLoading(els.btnNetwork, true);
  setStatus('Capturing network requests...');

  const tabId = await ensureContentScript();
  if (!tabId) {
    setLoading(els.btnNetwork, false);
    return;
  }

  chrome.tabs.sendMessage(tabId, { action: 'getNetworkLogs' }, (response) => {
    setLoading(els.btnNetwork, false);

    if (chrome.runtime.lastError) {
      setStatus('Failed to get network logs', 'error');
      return;
    }

    if (response && response.success) {
      state.networkLogs = response.logs;
      markCaptured(els.btnNetwork);
      updatePreviewBadges();
      setStatus(`Captured ${response.logs.length} network requests`, 'success');
    } else {
      setStatus('No network data available', 'error');
    }
  });
});

// ============================================================================
// Capture All — sequential: screenshot (raw) + console + network + tab info
// ============================================================================
els.btnCaptureAll.addEventListener('click', async () => {
  els.btnCaptureAll.disabled = true;

  // 1/6 — Screenshot (raw, no annotation editor) — P3-19: push to array
  setStatus('Capturing 1/6 — Screenshot...');
  const screenshotOk = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
      if (response && response.success) {
        if (state.screenshots.length >= MAX_SCREENSHOTS) state.screenshots.shift();
        state.screenshots.push(response.dataUrl);
        markCaptured(els.btnScreenshot);
        showScreenshotPreview();
        updatePreviewBadges();
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
  if (!screenshotOk) {
    setStatus('Screenshot failed, continuing...', 'error');
  }

  // 2/6 — Console logs
  setStatus('Capturing 2/6 — Console...');
  const tabId = await ensureContentScript();
  if (tabId) {
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'getConsoleLogs' }, (response) => {
        if (response && response.success) {
          state.consoleLogs = response.logs;
          markCaptured(els.btnConsole);
          updatePreviewBadges();
        }
        resolve();
      });
    });

    // 3/6 — Network logs
    setStatus('Capturing 3/6 — Network...');
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'getNetworkLogs' }, (response) => {
        if (response && response.success) {
          state.networkLogs = response.logs;
          markCaptured(els.btnNetwork);
          updatePreviewBadges();
        }
        resolve();
      });
    });

    // 4/6 — Framework info (P2-13)
    setStatus('Capturing 4/6 — Framework...');
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'getFrameworkInfo' }, (response) => {
        if (response && response.success) {
          state.frameworkInfo = response.framework;
        }
        resolve();
      });
    });

    // 5/6 — Storage info (P2-15)
    setStatus('Capturing 5/6 — Storage...');
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'getStorageInfo' }, (response) => {
        if (response && response.success) {
          state.storageInfo = response.storage;
        }
        resolve();
      });
    });

    // 6/6 — Navigation history (P2-16)
    setStatus('Capturing 6/6 — Navigation...');
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'getNavigationHistory' }, (response) => {
        if (response && response.success) {
          state.navigationHistory = response.history;
        }
        resolve();
      });
    });
  }

  // Also grab tab info
  await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getActiveTabInfo' }, (res) => {
      if (res && res.success) state.tabInfo = res.tabInfo;
      resolve();
    });
  });

  els.btnCaptureAll.disabled = false;
  setStatus('All captured!', 'success');
});

// ============================================================================
// Clear / Reset
// ============================================================================
els.btnClear.addEventListener('click', () => {
  // Reset state
  state.screenshots = [];
  state.consoleLogs = null;
  state.networkLogs = null;
  state.elementInfo = null;
  state.tabInfo = null;
  state.frameworkInfo = null;
  state.storageInfo = null;
  state.navigationHistory = null;

  // Clear storage
  chrome.storage.local.remove(['annotatedScreenshot', 'capturedElement']);

  // Reset captured badges on buttons
  [els.btnScreenshot, els.btnElement, els.btnConsole, els.btnNetwork].forEach(btn => {
    btn.classList.remove('captured');
  });

  // Clear form fields
  els.description.value = '';
  els.steps.value = '';

  // Hide previews
  els.screenshotPreview.classList.remove('visible');
  els.screenshotImg.src = '';
  els.elementPreview.classList.remove('visible');
  els.elementPreview.replaceChildren();
  els.capturedPreview.replaceChildren();
  els.capturedPreview.classList.remove('has-data');

  setStatus('Cleared', 'success');
});

// ============================================================================
// Generate Report
// ============================================================================
els.btnGenerate.addEventListener('click', async () => {
  setStatus('Generating report...');

  // Gather tab info
  await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getActiveTabInfo' }, (res) => {
      if (res && res.success) state.tabInfo = res.tabInfo;
      resolve();
    });
  });

  // P2-13, P2-15, P2-16: Fetch framework, storage, navigation if not already captured
  const tabId = await ensureContentScript();
  if (tabId) {
    if (!state.frameworkInfo) {
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'getFrameworkInfo' }, (response) => {
          if (response && response.success) state.frameworkInfo = response.framework;
          resolve();
        });
      });
    }
    if (!state.storageInfo) {
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'getStorageInfo' }, (response) => {
          if (response && response.success) state.storageInfo = response.storage;
          resolve();
        });
      });
    }
    if (!state.navigationHistory) {
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'getNavigationHistory' }, (response) => {
          if (response && response.success) state.navigationHistory = response.history;
          resolve();
        });
      });
    }
  }

  {
    // Preview summary before download
    const parts = [];
    if (state.screenshots.length > 0) parts.push(state.screenshots.length + ' screenshot' + (state.screenshots.length !== 1 ? 's' : ''));
    if (state.consoleLogs) {
      const errCount = state.consoleLogs.filter(l => l.level === 'error').length;
      parts.push(errCount + ' error' + (errCount !== 1 ? 's' : ''));
    }
    if (state.networkLogs) parts.push(state.networkLogs.length + ' request' + (state.networkLogs.length !== 1 ? 's' : ''));
    if (state.elementInfo) parts.push('1 element');
    const summary = parts.length > 0 ? parts.join(', ') : 'no captures';
    setStatus('Report: ' + summary + ' \u2192 Downloading...');

    buildAndDownloadReport();
  }
});

function parseUserAgent(ua) {
  let os = 'Unknown';
  if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  let browser = 'Unknown';
  const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
  const firefoxMatch = ua.match(/Firefox\/([\d.]+)/);
  const safariMatch = ua.match(/Version\/([\d.]+).*Safari/);
  const edgeMatch = ua.match(/Edg\/([\d.]+)/);
  if (edgeMatch) browser = 'Edge ' + edgeMatch[1];
  else if (chromeMatch) browser = 'Chrome ' + chromeMatch[1];
  else if (firefoxMatch) browser = 'Firefox ' + firefoxMatch[1];
  else if (safariMatch) browser = 'Safari ' + safariMatch[1];

  return { os, browser };
}

function getEnvironmentInfo() {
  const ua = navigator.userAgent;
  const parsed = parseUserAgent(ua);
  const screenW = window.screen.width;
  const screenH = window.screen.height;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;

  return {
    resolution: screenW + 'x' + screenH + ' (viewport: ' + vpW + 'x' + vpH + ')',
    devicePixelRatio: window.devicePixelRatio || 1,
    os: parsed.os,
    browser: parsed.browser,
    language: navigator.language || 'Unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
    touch: ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 'Yes' : 'No'
  };
}

function buildAndDownloadReport() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const description = els.description.value.trim() || '(No description provided)';
  const steps = els.steps.value.trim();
  const category = els.category.value;
  const priority = els.priority.value;

  const categoryLabels = { bug: 'Bug', feature: 'Feature Request', question: 'Question', other: 'Other' };
  const priorityLabels = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
  const priorityColors = { low: '#27ae60', medium: '#f39c12', high: '#e67e22', critical: '#e74c3c' };

  const url = state.tabInfo ? state.tabInfo.url : '(Unknown)';
  const title = state.tabInfo ? state.tabInfo.title : '(Unknown)';
  const userAgent = navigator.userAgent;
  const environment = getEnvironmentInfo();

  const ctx = {
    now, dateStr, description, steps, category, priority,
    categoryLabels, priorityLabels, priorityColors,
    url, title, userAgent, environment
  };

  // Build Claude-friendly Markdown report
  const reportMD = buildReportMarkdown(ctx);
  downloadFile(`feedback-${dateStr}.md`, reportMD, 'text/markdown');

  setStatus('Report downloaded (.md for Claude)', 'success');
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

function downloadFile(filename, content, mimeType) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

/**
 * Builds a Markdown report optimized for Claude / AI consumption.
 * All data is structured as text blocks that Claude can parse and act on.
 */
function buildReportMarkdown(ctx) {
  const {
    now, dateStr, description, steps, category, priority,
    categoryLabels, priorityLabels,
    url, title, userAgent, environment
  } = ctx;

  const lines = [];

  lines.push('# Bug Report / Feedback');
  lines.push('');
  lines.push(`**Date:** ${now.toISOString()}`);
  lines.push(`**URL:** ${url}`);
  lines.push(`**Page Title:** ${title}`);
  lines.push(`**Category:** ${categoryLabels[category] || category}`);
  lines.push(`**Priority:** ${priorityLabels[priority] || priority}`);
  lines.push(`**Browser:** ${userAgent}`);
  lines.push('');

  // Environment
  if (environment) {
    lines.push('## Environment');
    lines.push('');
    lines.push(`- **Resolution:** ${environment.resolution}`);
    lines.push(`- **Device Pixel Ratio:** ${environment.devicePixelRatio}`);
    lines.push(`- **OS:** ${environment.os}`);
    lines.push(`- **Browser:** ${environment.browser}`);
    lines.push(`- **Language:** ${environment.language}`);
    lines.push(`- **Timezone:** ${environment.timezone}`);
    lines.push(`- **Touch:** ${environment.touch}`);
    // P2-13: Framework info
    if (state.frameworkInfo) {
      const fw = state.frameworkInfo;
      const fwStr = fw.name !== 'Unknown' ? `${fw.name}${fw.version ? ' ' + fw.version : ''}` : 'Not detected';
      lines.push(`- **Framework:** ${fwStr}`);
      if (fw.jquery) lines.push(`- **jQuery:** ${fw.jquery}`);
    }
    lines.push('');
  }

  // Description
  lines.push('## Description');
  lines.push('');
  lines.push(description);
  lines.push('');

  // Steps to Reproduce
  if (steps) {
    lines.push('## Steps to Reproduce');
    lines.push('');
    lines.push(steps);
    lines.push('');
  }

  // Screenshots — P3-19: multi-screenshots saved as separate files
  if (state.screenshots.length > 0) {
    lines.push('## Screenshots');
    lines.push('');
    state.screenshots.forEach((ss, idx) => {
      const imgExt = ss.startsWith('data:image/jpeg') ? 'jpg' : 'png';
      const imgMime = ss.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
      const suffix = state.screenshots.length === 1 ? '' : `-${idx + 1}`;
      const imgFilename = `feedback-${dateStr}-screenshot${suffix}.${imgExt}`;
      downloadFile(imgFilename, dataUrlToBlob(ss), imgMime);
      lines.push(`![Screenshot ${idx + 1}](${imgFilename})`);
    });
    lines.push('');
  }

  // Selected Element
  if (state.elementInfo) {
    const el = state.elementInfo;
    lines.push('## Selected DOM Element');
    lines.push('');
    lines.push('```');
    lines.push(`Tag:      ${el.tagName || ''}`);
    lines.push(`ID:       ${el.id || '(none)'}`);
    lines.push(`Classes:  ${el.classes || '(none)'}`);
    lines.push(`Selector: ${el.cssSelector || ''}`);
    lines.push(`XPath:    ${el.xpath || ''}`);
    lines.push(`Text:     ${(el.textContent || '').slice(0, 200)}`);
    lines.push(`Rect:     ${el.boundingRect ? `${el.boundingRect.width}x${el.boundingRect.height} at (${el.boundingRect.left}, ${el.boundingRect.top})` : ''}`);
    lines.push('```');
    if (el.computedStyles && Object.keys(el.computedStyles).length > 0) {
      lines.push('');
      lines.push('Key computed styles:');
      lines.push('```css');
      for (const [prop, val] of Object.entries(el.computedStyles)) {
        lines.push(`${prop}: ${val};`);
      }
      lines.push('```');
    }
    lines.push('');
  }

  // Console Logs
  if (state.consoleLogs && state.consoleLogs.length > 0) {
    lines.push('## Console Logs');
    lines.push('');
    const errors = state.consoleLogs.filter(l => l.level === 'error');
    const warnings = state.consoleLogs.filter(l => l.level === 'warn');
    lines.push(`Total: ${state.consoleLogs.length} messages (${errors.length} errors, ${warnings.length} warnings)`);
    lines.push('');
    lines.push('```');
    for (const log of state.consoleLogs) {
      const ts = log.timestamp ? new Date(log.timestamp).toISOString().slice(11, 23) : '';
      const level = `[${(log.level || 'log').toUpperCase()}]`;
      const msg = Array.isArray(log.args) ? log.args.join(' ') : (log.message || '');
      lines.push(`${ts} ${level} ${msg}`);
      // P2-11: Include stack trace for errors
      if (log.stack && log.level === 'error') {
        const stackLines = log.stack.split('\n').slice(2, 6); // skip Error + captureConsole frames
        for (const sl of stackLines) {
          lines.push(`  ${sl.trim()}`);
        }
      }
    }
    lines.push('```');
    lines.push('');
  }

  // Network Requests
  if (state.networkLogs && state.networkLogs.length > 0) {
    lines.push('## Network Requests');
    lines.push('');
    const failed = state.networkLogs.filter(r => r.status >= 400 || r.status === 0);
    lines.push(`Total: ${state.networkLogs.length} requests (${failed.length} failed)`);
    lines.push('');

    if (failed.length > 0) {
      lines.push('### Failed Requests');
      lines.push('');
      lines.push('| Method | Status | URL | Duration |');
      lines.push('|--------|--------|-----|----------|');
      for (const req of failed) {
        lines.push(`| ${req.method} | ${req.status || 'ERR'} | ${req.url} | ${req.duration || '?'}ms |`);
        // P2-12: Include response body for failed requests
        if (req.responseBody) {
          lines.push(`> Response: ${req.responseBody}`);
        }
      }
      lines.push('');
    }

    lines.push('### All Requests');
    lines.push('');
    lines.push('| Method | Status | URL | Duration |');
    lines.push('|--------|--------|-----|----------|');
    for (const req of state.networkLogs) {
      lines.push(`| ${req.method} | ${req.status || '?'} | ${req.url} | ${req.duration || '?'}ms |`);
    }
    lines.push('');
  }

  // P2-15: Storage section
  if (state.storageInfo) {
    const ls = state.storageInfo.localStorage || [];
    const ss = state.storageInfo.sessionStorage || [];
    if (ls.length > 0 || ss.length > 0) {
      lines.push('## Storage');
      lines.push('');
      if (ls.length > 0) {
        lines.push('### localStorage');
        lines.push('');
        lines.push('| Key | Size (chars) |');
        lines.push('|-----|-------------|');
        for (const item of ls) {
          lines.push(`| ${item.key} | ${item.size} |`);
        }
        lines.push('');
      }
      if (ss.length > 0) {
        lines.push('### sessionStorage');
        lines.push('');
        lines.push('| Key | Size (chars) |');
        lines.push('|-----|-------------|');
        for (const item of ss) {
          lines.push(`| ${item.key} | ${item.size} |`);
        }
        lines.push('');
      }
    }
  }

  // P2-16: Navigation History
  if (state.navigationHistory && state.navigationHistory.length > 0) {
    lines.push('## Navigation History');
    lines.push('');
    lines.push('| Time | Type | URL |');
    lines.push('|------|------|-----|');
    for (const nav of state.navigationHistory) {
      const ts = nav.timestamp ? new Date(nav.timestamp).toISOString().slice(11, 23) : '';
      lines.push(`| ${ts} | ${nav.type} | ${nav.url} |`);
    }
    lines.push('');
  }

  // Context for AI
  lines.push('---');
  lines.push('');
  lines.push('## Instructions for AI (Claude)');
  lines.push('');
  lines.push('This report was generated by the BugJar extension.');
  lines.push('Use the information above to:');
  lines.push('1. Identify the root cause of the issue based on the console errors and network failures');
  lines.push('2. Look at the screenshot to understand the visual state');
  lines.push('3. If a DOM element was selected, inspect the component at that CSS selector');
  lines.push('4. Propose a fix with the specific file and line to modify');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Dynamic version from manifest
// ============================================================================
document.querySelector('.header-version').textContent = 'v' + chrome.runtime.getManifest().version;

// ============================================================================
// Restore persisted data on popup open (CRIT-2 + update banner)
// ============================================================================
chrome.storage.local.get(['annotatedScreenshot', 'capturedElement', 'updateAvailable', 'bugjarLang'], (stored) => {
  if (stored.annotatedScreenshot) {
    // P3-19: push to screenshots array
    if (state.screenshots.length >= MAX_SCREENSHOTS) state.screenshots.shift();
    state.screenshots.push(stored.annotatedScreenshot);
    markCaptured(els.btnScreenshot);
    showScreenshotPreview();
    updatePreviewBadges();
  }
  if (stored.capturedElement) {
    state.elementInfo = stored.capturedElement;
    markCaptured(els.btnElement);
    showElementPreview(state.elementInfo);
    updatePreviewBadges();
  }
  if (stored.updateAvailable) {
    const banner = document.createElement('div');
    banner.className = 'update-banner';
    const text = document.createTextNode(`Update v${stored.updateAvailable.version} available! `);
    const link = document.createElement('a');
    link.href = stored.updateAvailable.url;
    link.target = '_blank';
    link.textContent = 'Download';
    banner.appendChild(text);
    banner.appendChild(link);
    document.querySelector('.header').after(banner);
  }

  // P3-20: Initialize i18n
  const savedLang = stored.bugjarLang || detectLanguage();
  applyTranslations(savedLang);
});

// P3-20: Language selector click handlers
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    applyTranslations(btn.dataset.lang);
  });
});

