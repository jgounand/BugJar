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
const state = {
  screenshot: null,        // data URL (annotated or raw)
  consoleLogs: null,       // array of log entries
  networkLogs: null,       // array of network entries
  elementInfo: null,       // selected element details
  tabInfo: null            // active tab URL/title
};

// ============================================================================
// DOM references
// ============================================================================
const els = {
  description: document.getElementById('description'),
  category: document.getElementById('category'),
  priority: document.getElementById('priority'),
  btnScreenshot: document.getElementById('btn-screenshot'),
  btnElement: document.getElementById('btn-element'),
  btnConsole: document.getElementById('btn-console'),
  btnNetwork: document.getElementById('btn-network'),
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
  if (state.screenshot) badges.push({ icon: '\u{1F4F8}', text: 'Screenshot' });
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
    state.screenshot = response.dataUrl;

    setStatus('Opening annotation editor...');

    chrome.runtime.sendMessage({
      action: 'openAnnotationEditor',
      dataUrl: response.dataUrl
    }, (res) => {
      if (res && res.success) {
        setStatus('Annotate the screenshot in the new tab', 'success');
        // The popup will close when user clicks away. The annotation editor
        // will save results to chrome.storage.local and the popup can pick
        // them up next time it opens.
      } else {
        // Even without annotation, we still have the raw screenshot
        markCaptured(els.btnScreenshot);
        showScreenshotPreview(state.screenshot);
        updatePreviewBadges();
        setStatus('Screenshot captured (annotation unavailable)', 'success');
      }
    });
  });
});

function showScreenshotPreview(dataUrl) {
  els.screenshotImg.src = dataUrl;
  els.screenshotPreview.classList.add('visible');
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
// Generate Report
// ============================================================================
els.btnGenerate.addEventListener('click', () => {
  setStatus('Generating report...');

  // Gather tab info
  chrome.runtime.sendMessage({ action: 'getActiveTabInfo' }, (res) => {
    if (res && res.success) {
      state.tabInfo = res.tabInfo;
    }
    buildAndDownloadReport();
  });
});

function buildAndDownloadReport() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const description = els.description.value.trim() || '(No description provided)';
  const category = els.category.value;
  const priority = els.priority.value;

  const categoryLabels = { bug: 'Bug', feature: 'Feature Request', question: 'Question', other: 'Other' };
  const priorityLabels = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
  const priorityColors = { low: '#27ae60', medium: '#f39c12', high: '#e67e22', critical: '#e74c3c' };

  const url = state.tabInfo ? state.tabInfo.url : '(Unknown)';
  const title = state.tabInfo ? state.tabInfo.title : '(Unknown)';
  const userAgent = navigator.userAgent;

  const ctx = {
    now, dateStr, description, category, priority,
    categoryLabels, priorityLabels, priorityColors,
    url, title, userAgent
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
    now, dateStr, description, category, priority,
    categoryLabels, priorityLabels,
    url, title, userAgent
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

  // Description
  lines.push('## Description');
  lines.push('');
  lines.push(description);
  lines.push('');

  // Screenshot — saved as separate file, referenced by filename
  if (state.screenshot) {
    const imgExt = state.screenshot.startsWith('data:image/jpeg') ? 'jpg' : 'png';
    const imgMime = state.screenshot.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
    const imgFilename = `feedback-${dateStr}-screenshot.${imgExt}`;
    downloadFile(imgFilename, dataUrlToBlob(state.screenshot), imgMime);
    lines.push('## Screenshot');
    lines.push('');
    lines.push(`![Screenshot](${imgFilename})`);
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
// Restore persisted data on popup open (CRIT-2 + update banner)
// ============================================================================
chrome.storage.local.get(['annotatedScreenshot', 'capturedElement', 'updateAvailable'], (stored) => {
  if (stored.annotatedScreenshot) {
    state.screenshot = stored.annotatedScreenshot;
    markCaptured(els.btnScreenshot);
    showScreenshotPreview(state.screenshot);
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
});

