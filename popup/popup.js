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
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) {
        setStatus('No active tab found', 'error');
        resolve(null);
        return;
      }

      const tabId = tabs[0].id;

      // First, try pinging an already-injected script
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.injected) {
          // Inject it
          chrome.runtime.sendMessage({ action: 'injectContentScript' }, (res) => {
            if (res && res.success) {
              // Short delay for script initialization
              setTimeout(() => resolve(tabId), 150);
            } else {
              setStatus('Cannot inject into this page', 'error');
              resolve(null);
            }
          });
        } else {
          resolve(tabId);
        }
      });
    });
  });
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

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
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
    now, description, category, priority,
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

  // Screenshot
  if (state.screenshot) {
    lines.push('## Screenshot');
    lines.push('');
    lines.push(`![Screenshot](${state.screenshot})`);
    lines.push('');
  }

  // Selected Element
  if (state.elementInfo) {
    const el = state.elementInfo;
    lines.push('## Selected DOM Element');
    lines.push('');
    lines.push('```');
    lines.push(`Tag:      ${el.tag || ''}`);
    lines.push(`ID:       ${el.id || '(none)'}`);
    lines.push(`Classes:  ${el.classes || '(none)'}`);
    lines.push(`Selector: ${el.cssSelector || ''}`);
    lines.push(`XPath:    ${el.xpath || ''}`);
    lines.push(`Text:     ${(el.textContent || '').slice(0, 200)}`);
    lines.push(`Rect:     ${el.rect ? `${el.rect.width}x${el.rect.height} at (${Math.round(el.rect.x)}, ${Math.round(el.rect.y)})` : ''}`);
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

/**
 * Builds the self-contained HTML report string.
 * All user-provided and captured values are escaped before embedding.
 */
function buildReportHTML(ctx) {
  const {
    now, dateStr, description, category, priority,
    categoryLabels, priorityLabels, priorityColors,
    url, title, userAgent
  } = ctx;

  // -- Console section --
  let consoleSection = '';
  if (state.consoleLogs && state.consoleLogs.length > 0) {
    const levelColors = { log: '#333', warn: '#f39c12', error: '#e74c3c', info: '#3498db' };
    const levelBg = { log: '#f8f9fa', warn: '#fff8e1', error: '#fdecea', info: '#e3f2fd' };
    const rows = state.consoleLogs.map(entry => {
      const time = escapeHtml(entry.timestamp.split('T')[1].split('.')[0]);
      const lvl = escapeHtml(entry.level);
      const msg = escapeHtml(entry.message);
      const color = levelColors[entry.level] || '#333';
      const bg = levelBg[entry.level] || '#f8f9fa';
      return `<div style="padding:6px 10px;border-bottom:1px solid #eee;background:${bg};"><span style="color:#999;font-size:11px;">${time}</span> <span style="display:inline-block;width:50px;font-weight:600;color:${color};text-transform:uppercase;font-size:11px;">${lvl}</span> <span style="font-family:'SF Mono',Consolas,monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;">${msg}</span></div>`;
    }).join('');
    consoleSection = `<div style="margin-top:24px;"><h2 style="font-size:16px;color:#1a1a2e;margin-bottom:8px;">Console Logs (${state.consoleLogs.length})</h2><div style="border:1px solid #ddd;border-radius:6px;overflow:hidden;max-height:400px;overflow-y:auto;">${rows}</div></div>`;
  }

  // -- Network section --
  let networkSection = '';
  if (state.networkLogs && state.networkLogs.length > 0) {
    const rows = state.networkLogs.map(entry => {
      const statusColor = entry.status >= 400 ? '#e74c3c' : entry.status >= 300 ? '#f39c12' : '#27ae60';
      const size = entry.responseSize > 1024
        ? (entry.responseSize / 1024).toFixed(1) + ' KB'
        : entry.responseSize + ' B';
      return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;white-space:nowrap;">${escapeHtml(entry.method)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;word-break:break-all;max-width:300px;">${escapeHtml(entry.url)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:600;color:${statusColor};font-size:12px;">${entry.status || 'ERR'}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-size:11px;color:#666;">${entry.duration}ms</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-size:11px;color:#666;">${size}</td></tr>`;
    }).join('');
    networkSection = `<div style="margin-top:24px;"><h2 style="font-size:16px;color:#1a1a2e;margin-bottom:8px;">Network Requests (${state.networkLogs.length})</h2><div style="border:1px solid #ddd;border-radius:6px;overflow:hidden;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-family:system-ui,sans-serif;"><thead><tr style="background:#f5f5f8;"><th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:#666;border-bottom:2px solid #ddd;">Method</th><th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:#666;border-bottom:2px solid #ddd;">URL</th><th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:600;color:#666;border-bottom:2px solid #ddd;">Status</th><th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:600;color:#666;border-bottom:2px solid #ddd;">Duration</th><th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:600;color:#666;border-bottom:2px solid #ddd;">Size</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  // -- Screenshot section --
  let screenshotSection = '';
  if (state.screenshot) {
    screenshotSection = `<div style="margin-top:24px;"><h2 style="font-size:16px;color:#1a1a2e;margin-bottom:8px;">Screenshot</h2><div style="border:1px solid #ddd;border-radius:6px;overflow:hidden;"><img src="${state.screenshot}" style="width:100%;height:auto;display:block;" alt="Screenshot"></div></div>`;
  }

  // -- Element section --
  let elementSection = '';
  if (state.elementInfo) {
    const ei = state.elementInfo;
    const idPart = ei.id ? ` <span style="color:#2980b9;">id="${escapeHtml(ei.id)}"</span>` : '';
    const classPart = ei.classes.length ? ` <span style="color:#27ae60;">class="${escapeHtml(ei.classes.join(' '))}"</span>` : '';
    const textPart = ei.textContent
      ? `<div style="margin-top:8px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:8px;"><strong>Text:</strong> ${escapeHtml(ei.textContent.substring(0, 150))}${ei.textContent.length > 150 ? '...' : ''}</div>`
      : '';
    const styles = Object.entries(ei.computedStyles).map(([k, v]) =>
      `<span style="display:inline-block;margin:2px 4px;padding:1px 6px;background:#fff;border:1px solid #e0e0e0;border-radius:3px;font-family:monospace;">${escapeHtml(k)}: ${escapeHtml(v)}</span>`
    ).join('');
    elementSection = `<div style="margin-top:24px;"><h2 style="font-size:16px;color:#1a1a2e;margin-bottom:8px;">Selected Element</h2><div style="border:1px solid #ddd;border-radius:6px;padding:14px;background:#f8f9fa;"><div style="font-family:monospace;font-size:13px;"><span style="color:#e94560;font-weight:600;">&lt;${escapeHtml(ei.tagName)}</span>${idPart}${classPart}<span style="color:#e94560;">&gt;</span></div><div style="margin-top:8px;font-size:12px;color:#666;"><strong>CSS Selector:</strong> <code style="background:#eee;padding:2px 4px;border-radius:3px;">${escapeHtml(ei.cssSelector)}</code></div><div style="margin-top:4px;font-size:12px;color:#666;"><strong>XPath:</strong> <code style="background:#eee;padding:2px 4px;border-radius:3px;">${escapeHtml(ei.xpath)}</code></div><div style="margin-top:4px;font-size:12px;color:#666;"><strong>Size:</strong> ${ei.boundingRect.width} x ${ei.boundingRect.height}px</div>${textPart}<div style="margin-top:8px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:8px;"><strong>Computed Styles:</strong><br>${styles}</div></div></div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BugJar Report - ${escapeHtml(dateStr)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;background:#fff;}@media print{body{font-size:11px;}.no-print{display:none!important;}}</style>
</head>
<body>
<div style="background:#1a1a2e;color:#fff;padding:20px 32px;"><div style="display:flex;align-items:center;gap:12px;"><span style="font-size:28px;">&#x1F41E;</span><div><h1 style="font-size:20px;font-weight:600;">BugJar Report</h1><div style="font-size:12px;opacity:0.7;margin-top:4px;">${escapeHtml(now.toLocaleString())}</div></div></div></div>
<div style="padding:20px 32px;background:#f5f5f8;border-bottom:1px solid #eee;"><div style="display:flex;flex-wrap:wrap;gap:24px;font-size:13px;"><div><strong style="color:#888;">URL:</strong> <a href="${escapeHtml(url)}" style="color:#2980b9;text-decoration:none;">${escapeHtml(url)}</a></div><div><strong style="color:#888;">Page Title:</strong> ${escapeHtml(title)}</div></div><div style="display:flex;flex-wrap:wrap;gap:24px;font-size:13px;margin-top:8px;"><div><strong style="color:#888;">Category:</strong> <span style="display:inline-block;padding:2px 8px;background:#e3f2fd;color:#1565c0;border-radius:4px;font-size:12px;font-weight:500;">${escapeHtml(categoryLabels[category] || category)}</span></div><div><strong style="color:#888;">Priority:</strong> <span style="display:inline-block;padding:2px 8px;background:${priorityColors[priority]}22;color:${priorityColors[priority]};border-radius:4px;font-size:12px;font-weight:600;">${escapeHtml(priorityLabels[priority] || priority)}</span></div></div><div style="font-size:11px;color:#aaa;margin-top:8px;">Browser: ${escapeHtml(userAgent)}</div></div>
<div style="padding:24px 32px;max-width:960px;"><div><h2 style="font-size:16px;color:#1a1a2e;margin-bottom:8px;">Description</h2><div style="padding:14px;background:#f8f9fa;border:1px solid #ddd;border-radius:6px;white-space:pre-wrap;line-height:1.6;font-size:14px;">${escapeHtml(description)}</div></div>${screenshotSection}${elementSection}${consoleSection}${networkSection}</div>
<div style="padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center;margin-top:32px;">Generated by BugJar v1.0.0</div>
</body>
</html>`;
}
