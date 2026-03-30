/**
 * BugJar -- Popup Logic (popup.js)
 *
 * Orchestrates the step-based capture workflow:
 *  - Each reproduction step has its own captures (screenshots, elements, console, network)
 *  - Screenshot capture + annotation
 *  - Console log retrieval
 *  - Network log retrieval
 *  - DOM element selection
 *  - Report generation
 *
 * SECURITY NOTE: All dynamic content is built via createElement/textContent.
 * No innerHTML is used anywhere.
 */

// ============================================================================
// State
// ============================================================================
const MAX_SCREENSHOTS_PER_STEP = 5;
const MAX_STEPS = 10;

const state = {
  description: '',
  category: 'bug',
  priority: 'medium',
  currentStepId: null,
  steps: [],
  tabInfo: null,
  frameworkInfo: null,
  storageInfo: null,
  navigationHistory: null
};

/**
 * Persist the entire capture state to chrome.storage.local under one key.
 * Call after every state mutation so data survives popup close/reopen.
 */
function persistState() {
  chrome.storage.local.set({
    bugjarState: {
      currentStepId: state.currentStepId,
      steps: state.steps,
      tabInfo: state.tabInfo,
      frameworkInfo: state.frameworkInfo,
      storageInfo: state.storageInfo,
      navigationHistory: state.navigationHistory
    }
  });
}

// ============================================================================
// DOM references
// ============================================================================
const els = {
  description: document.getElementById('description'),
  category: document.getElementById('category'),
  priority: document.getElementById('priority'),
  btnClear: document.getElementById('btn-clear'),
  btnGenerate: document.getElementById('btn-generate'),
  btnAddStep: document.getElementById('btn-add-step'),
  stepsList: document.getElementById('steps-list'),
  integrationResults: document.getElementById('integration-results'),
  statusBar: document.getElementById('status-bar')
};

// ============================================================================
// Helpers
// ============================================================================
function setStatus(text, type) {
  if (type === undefined) type = '';
  els.statusBar.textContent = text;
  els.statusBar.className = 'status-bar' + (type ? ' ' + type : '');
  if (type === 'success') {
    clearTimeout(setStatus._timer);
    setStatus._timer = setTimeout(function () {
      els.statusBar.textContent = 'Ready';
      els.statusBar.className = 'status-bar';
    }, 4000);
  }
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
 */
function createElement(tag, attrs) {
  var children = [];
  for (var i = 2; i < arguments.length; i++) {
    children.push(arguments[i]);
  }
  var el = document.createElement(tag);
  if (attrs) {
    var keys = Object.keys(attrs);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var value = attrs[key];
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
  for (var c = 0; c < children.length; c++) {
    var child = children[c];
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child) {
      el.appendChild(child);
    }
  }
  return el;
}

/**
 * Ensure content script is injected into the active tab.
 * Returns the tab ID on success, or null.
 */
async function ensureContentScript() {
  var tabs = await new Promise(function (resolve) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (t) { resolve(t || []); });
  });
  var tab = tabs[0];

  if (!tab) {
    setStatus('No active tab found', 'error');
    return null;
  }

  var tabId = tab.id;

  // Try ping first (already injected?)
  var alreadyReady = await new Promise(function (resolve) {
    chrome.tabs.sendMessage(tabId, { action: 'ping' }, function (r) {
      resolve(!chrome.runtime.lastError && r && r.injected);
    });
  });
  if (alreadyReady) return tabId;

  // Inject
  var res = await new Promise(function (resolve) {
    chrome.runtime.sendMessage({ action: 'injectContentScript', tabId: tabId }, resolve);
  });
  if (!res || !res.success) {
    setStatus('Cannot inject: ' + ((res && res.error) || 'Restricted page'), 'error');
    return null;
  }

  // Wait for ready with retries
  for (var i = 0; i < 15; i++) {
    await new Promise(function (r) { setTimeout(r, 100); });
    var ready = await new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, function (r) {
        resolve(!chrome.runtime.lastError && r && r.injected);
      });
    });
    if (ready) return tabId;
  }

  setStatus('Content script not responding', 'error');
  return null;
}

// ============================================================================
// Step management
// ============================================================================
function createStep() {
  if (state.steps.length >= MAX_STEPS) {
    setStatus('Maximum ' + MAX_STEPS + ' steps reached', 'error');
    return null;
  }
  var step = {
    id: Date.now(),
    description: '',
    elements: [],
    screenshots: [],
    consoleLogs: null,
    networkLogs: null,
    timestamp: new Date().toISOString()
  };
  state.steps.push(step);
  state.currentStepId = step.id;
  renderSteps();
  persistState();
  return step;
}

function deleteStep(stepId) {
  state.steps = state.steps.filter(function (s) { return s.id !== stepId; });
  if (state.currentStepId === stepId) {
    state.currentStepId = state.steps.length > 0 ? state.steps[state.steps.length - 1].id : null;
  }
  renderSteps();
  persistState();
}

function getCurrentStep() {
  for (var i = 0; i < state.steps.length; i++) {
    if (state.steps[i].id === state.currentStepId) return state.steps[i];
  }
  return null;
}

function getStepById(stepId) {
  for (var i = 0; i < state.steps.length; i++) {
    if (state.steps[i].id === stepId) return state.steps[i];
  }
  return null;
}

// ============================================================================
// Render steps
// ============================================================================
function renderSteps() {
  els.stepsList.replaceChildren();

  for (var idx = 0; idx < state.steps.length; idx++) {
    var step = state.steps[idx];
    var stepNum = idx + 1;
    var isActive = step.id === state.currentStepId;

    var card = document.createElement('div');
    card.className = 'step-card' + (isActive ? ' active' : '');

    // Header: "Step N" + delete button
    var header = document.createElement('div');
    header.className = 'step-header';

    var numberSpan = document.createElement('span');
    numberSpan.className = 'step-number';
    // Hide number if only 1 step (simpler UX for quick bugs)
    if (state.steps.length > 1) {
      numberSpan.textContent = t('stepN') + ' ' + stepNum;
    } else {
      numberSpan.textContent = t('stepsLabel');
    }
    header.appendChild(numberSpan);

    // Only show delete button if more than 1 step
    if (state.steps.length > 1) {
      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'step-delete';
      deleteBtn.textContent = '\u00d7';
      deleteBtn.title = 'Delete step';
      (function (sid) {
        deleteBtn.addEventListener('click', function () { deleteStep(sid); });
      })(step.id);
      header.appendChild(deleteBtn);
    }

    card.appendChild(header);

    // Description input
    var descInput = document.createElement('textarea');
    descInput.className = 'step-description';
    descInput.placeholder = t('stepDescription');
    descInput.value = step.description;
    descInput.rows = 1;
    (function (sid) {
      descInput.addEventListener('input', function (e) {
        var s = getStepById(sid);
        if (s) {
          s.description = e.target.value;
          persistState();
        }
      });
      descInput.addEventListener('focus', function () {
        state.currentStepId = sid;
        renderSteps();
      });
    })(step.id);
    card.appendChild(descInput);

    // Capture buttons row
    var captures = document.createElement('div');
    captures.className = 'step-captures';

    var captureItems = [
      { icon: '\uD83D\uDCF8', label: 'Screenshot', action: 'screenshot', stepId: step.id, hasCap: step.screenshots.length > 0 },
      { icon: '\uD83D\uDDB1\uFE0F', label: 'Element', action: 'element', stepId: step.id, hasCap: step.elements.length > 0 },
      { icon: '\uD83D\uDCCB', label: 'Console', action: 'console', stepId: step.id, hasCap: step.consoleLogs !== null },
      { icon: '\uD83C\uDF10', label: 'Network', action: 'network', stepId: step.id, hasCap: step.networkLogs !== null },
      { icon: '\u26A1', label: t('captureAllStep'), action: 'captureAll', stepId: step.id, hasCap: false }
    ];

    for (var ci = 0; ci < captureItems.length; ci++) {
      var item = captureItems[ci];
      var btn = document.createElement('button');
      btn.className = 'step-capture-btn' + (item.hasCap ? ' captured' : '');
      var iconSpan = document.createElement('span');
      iconSpan.className = 'btn-icon';
      iconSpan.textContent = item.icon;
      btn.appendChild(iconSpan);
      var labelSpan = document.createElement('span');
      labelSpan.className = 'btn-label';
      labelSpan.textContent = item.label;
      btn.appendChild(labelSpan);
      btn.title = item.action;
      (function (act, sid) {
        btn.addEventListener('click', function () {
          state.currentStepId = sid;
          handleStepCapture(act, sid);
        });
      })(item.action, item.stepId);
      captures.appendChild(btn);
    }

    card.appendChild(captures);

    // Captured items summary
    var summary = document.createElement('div');
    summary.className = 'step-summary';
    var hasSummary = false;

    // Elements list
    if (step.elements.length > 0) {
      for (var ei = 0; ei < step.elements.length; ei++) {
        var elInfo = step.elements[ei];
        var elItem = document.createElement('div');
        elItem.className = 'step-summary-item';

        var elIcon = document.createElement('span');
        elIcon.textContent = '\uD83D\uDDB1\uFE0F ';
        elItem.appendChild(elIcon);

        var elTag = document.createElement('span');
        elTag.className = 'el-tag';
        var elLabel = elInfo.tagName;
        if (elInfo.classes && elInfo.classes.length) {
          elLabel += '.' + elInfo.classes.slice(0, 2).join('.');
        }
        elTag.textContent = elLabel;
        elItem.appendChild(elTag);

        summary.appendChild(elItem);
      }
      hasSummary = true;
    }

    // Console + network badges on same line
    var badgeLine = document.createElement('div');
    badgeLine.className = 'step-summary-item';
    var hasBadge = false;

    if (step.consoleLogs !== null) {
      var errCount = 0;
      for (var cl = 0; cl < step.consoleLogs.length; cl++) {
        if (step.consoleLogs[cl].level === 'error') errCount++;
      }
      var conSpan = document.createElement('span');
      conSpan.textContent = '\uD83D\uDCCB ' + errCount + ' error' + (errCount !== 1 ? 's' : '');
      badgeLine.appendChild(conSpan);
      hasBadge = true;
    }
    if (step.networkLogs !== null) {
      var failCount = 0;
      for (var nl = 0; nl < step.networkLogs.length; nl++) {
        if (step.networkLogs[nl].status >= 400 || step.networkLogs[nl].status === 0) failCount++;
      }
      var netSpan = document.createElement('span');
      netSpan.textContent = '  \uD83C\uDF10 ' + failCount + ' failed';
      badgeLine.appendChild(netSpan);
      hasBadge = true;
    }
    if (hasBadge) {
      summary.appendChild(badgeLine);
      hasSummary = true;
    }

    // Screenshots count
    if (step.screenshots.length > 0) {
      var ssItem = document.createElement('div');
      ssItem.className = 'step-summary-item';
      ssItem.textContent = '\uD83D\uDCF8 ' + step.screenshots.length + ' screenshot' + (step.screenshots.length !== 1 ? 's' : '');
      summary.appendChild(ssItem);
      hasSummary = true;
    }

    if (hasSummary) {
      card.appendChild(summary);
    }

    els.stepsList.appendChild(card);
  }
}

// ============================================================================
// Step capture handlers
// ============================================================================
async function handleStepCapture(action, stepId) {
  var step = getStepById(stepId);
  if (!step) return;

  switch (action) {
    case 'screenshot':
      await captureScreenshotForStep(step);
      break;
    case 'element':
      await captureElementForStep(step);
      break;
    case 'console':
      await captureConsoleForStep(step);
      break;
    case 'network':
      await captureNetworkForStep(step);
      break;
    case 'captureAll':
      await captureAllForStep(step);
      break;
  }
}

async function captureScreenshotForStep(step) {
  setStatus('Capturing screenshot...');

  var response = await new Promise(function (resolve) {
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, function (r) { resolve(r); });
  });

  if (!response || !response.success) {
    setStatus('Screenshot failed: ' + (response ? response.error : 'Unknown error'), 'error');
    return;
  }

  var dataUrl = response.dataUrl;

  // Try to open annotation editor
  setStatus('Opening annotation editor...');
  var annoRes = await new Promise(function (resolve) {
    chrome.runtime.sendMessage({ action: 'openAnnotationEditor', dataUrl: dataUrl }, function (r) { resolve(r); });
  });

  // Always save the raw screenshot as a fallback (will be replaced by annotated version if user clicks Done)
  if (step.screenshots.length >= MAX_SCREENSHOTS_PER_STEP) step.screenshots.shift();
  step.screenshots.push(dataUrl);
  persistState();
  renderSteps();

  if (annoRes && annoRes.success) {
    setStatus('Annotate the screenshot in the new tab', 'success');
  } else {
    setStatus('Screenshot captured', 'success');
  }
}

async function captureElementForStep(step) {
  setStatus('Activating element selector...');

  var tabId = await ensureContentScript();
  if (!tabId) return;

  var response = await new Promise(function (resolve) {
    chrome.tabs.sendMessage(tabId, { action: 'activateInspector' }, function (r) { resolve(r); });
  });

  if (response && response.success) {
    setStatus('Click an element on the page to select it', 'success');
    // Popup will close. Content script sends elementSelected message.
    // We pick it up in the onMessage listener below.
  } else {
    setStatus('Could not activate inspector', 'error');
  }
}

async function captureConsoleForStep(step) {
  setStatus('Capturing console logs...');

  var tabId = await ensureContentScript();
  if (!tabId) return;

  var response = await new Promise(function (resolve) {
    chrome.tabs.sendMessage(tabId, { action: 'getConsoleLogs' }, function (r) {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(r);
    });
  });

  if (response && response.success) {
    step.consoleLogs = response.logs;
    persistState();
    renderSteps();
    setStatus('Captured ' + response.logs.length + ' console messages', 'success');
  } else {
    setStatus('No console data available', 'error');
  }
}

async function captureNetworkForStep(step) {
  setStatus('Capturing network requests...');

  var tabId = await ensureContentScript();
  if (!tabId) return;

  var response = await new Promise(function (resolve) {
    chrome.tabs.sendMessage(tabId, { action: 'getNetworkLogs' }, function (r) {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(r);
    });
  });

  if (response && response.success) {
    step.networkLogs = response.logs;
    persistState();
    renderSteps();
    setStatus('Captured ' + response.logs.length + ' network requests', 'success');
  } else {
    setStatus('No network data available', 'error');
  }
}

async function captureAllForStep(step) {
  state.currentStepId = step.id;

  // 1/6 -- Screenshot (raw, no annotation editor)
  setStatus('Capturing 1/6 -- Screenshot...');
  var screenshotRes = await new Promise(function (resolve) {
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, function (r) { resolve(r); });
  });
  if (screenshotRes && screenshotRes.success) {
    if (step.screenshots.length >= MAX_SCREENSHOTS_PER_STEP) step.screenshots.shift();
    step.screenshots.push(screenshotRes.dataUrl);
    persistState();
    renderSteps();
  } else {
    setStatus('Screenshot failed, continuing...', 'error');
  }

  // 2/6 -- Console logs
  setStatus('Capturing 2/6 -- Console...');
  var tabId = await ensureContentScript();
  if (tabId) {
    await new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, { action: 'getConsoleLogs' }, function (response) {
        if (response && response.success) {
          step.consoleLogs = response.logs;
          persistState();
          renderSteps();
        }
        resolve();
      });
    });

    // 3/6 -- Network logs
    setStatus('Capturing 3/6 -- Network...');
    await new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, { action: 'getNetworkLogs' }, function (response) {
        if (response && response.success) {
          step.networkLogs = response.logs;
          persistState();
          renderSteps();
        }
        resolve();
      });
    });

    // 4/6 -- Framework info (global, not per-step)
    setStatus('Capturing 4/6 -- Framework...');
    await new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, { action: 'getFrameworkInfo' }, function (response) {
        if (response && response.success) {
          state.frameworkInfo = response.framework;
          persistState();
        }
        resolve();
      });
    });

    // 5/6 -- Storage info (global)
    setStatus('Capturing 5/6 -- Storage...');
    await new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, { action: 'getStorageInfo' }, function (response) {
        if (response && response.success) {
          state.storageInfo = response.storage;
          persistState();
        }
        resolve();
      });
    });

    // 6/6 -- Navigation history (global)
    setStatus('Capturing 6/6 -- Navigation...');
    await new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, { action: 'getNavigationHistory' }, function (response) {
        if (response && response.success) {
          state.navigationHistory = response.history;
          persistState();
        }
        resolve();
      });
    });
  }

  // Tab info (global)
  await new Promise(function (resolve) {
    chrome.runtime.sendMessage({ action: 'getActiveTabInfo' }, function (res) {
      if (res && res.success) {
        state.tabInfo = res.tabInfo;
        persistState();
      }
      resolve();
    });
  });

  setStatus('All captured!', 'success');
}

// ============================================================================
// Listen for element selection from content script
// ============================================================================
chrome.runtime.onMessage.addListener(function (message) {
  if (message.action === 'elementSelected') {
    var step = getCurrentStep();
    if (!step) {
      // If no step exists yet, create one
      step = createStep();
    }
    if (step) {
      step.elements.push(message.elementInfo);
      persistState();
      renderSteps();
      setStatus('Element captured', 'success');
    }

    // Remove capturedElement from storage to prevent double-import on next popup open
    // (content.js also writes it, but we've already handled it via onMessage)
    chrome.storage.local.remove('capturedElement');
  }
});

// ============================================================================
// Add Step button
// ============================================================================
els.btnAddStep.addEventListener('click', function () {
  createStep();
});

// ============================================================================
// Clear / Reset
// ============================================================================
els.btnClear.addEventListener('click', function () {
  // Reset state
  state.steps = [];
  state.currentStepId = null;
  state.tabInfo = null;
  state.frameworkInfo = null;
  state.storageInfo = null;
  state.navigationHistory = null;

  // Clear storage
  chrome.storage.local.remove(['annotatedScreenshot', 'capturedElement', 'bugjarForm', 'bugjarState']);

  // Clear form fields
  els.description.value = '';

  // Re-render
  renderSteps();

  setStatus('Cleared', 'success');
});

// ============================================================================
// Generate Report
// ============================================================================
els.btnGenerate.addEventListener('click', async function () {
  setStatus('Generating report...');

  // Gather tab info
  await new Promise(function (resolve) {
    chrome.runtime.sendMessage({ action: 'getActiveTabInfo' }, function (res) {
      if (res && res.success) state.tabInfo = res.tabInfo;
      resolve();
    });
  });

  // Fetch framework, storage, navigation if not already captured
  var tabId = await ensureContentScript();
  if (tabId) {
    if (!state.frameworkInfo) {
      await new Promise(function (resolve) {
        chrome.tabs.sendMessage(tabId, { action: 'getFrameworkInfo' }, function (response) {
          if (response && response.success) state.frameworkInfo = response.framework;
          resolve();
        });
      });
    }
    if (!state.storageInfo) {
      await new Promise(function (resolve) {
        chrome.tabs.sendMessage(tabId, { action: 'getStorageInfo' }, function (response) {
          if (response && response.success) state.storageInfo = response.storage;
          resolve();
        });
      });
    }
    if (!state.navigationHistory) {
      await new Promise(function (resolve) {
        chrome.tabs.sendMessage(tabId, { action: 'getNavigationHistory' }, function (response) {
          if (response && response.success) state.navigationHistory = response.history;
          resolve();
        });
      });
    }
  }

  // Build summary for status bar
  var parts = [];
  var totalScreenshots = 0;
  var totalElements = 0;
  var totalConsoleSteps = 0;
  var totalNetworkSteps = 0;
  for (var si = 0; si < state.steps.length; si++) {
    totalScreenshots += state.steps[si].screenshots.length;
    totalElements += state.steps[si].elements.length;
    if (state.steps[si].consoleLogs) totalConsoleSteps++;
    if (state.steps[si].networkLogs) totalNetworkSteps++;
  }
  if (totalScreenshots > 0) parts.push(totalScreenshots + ' screenshot' + (totalScreenshots !== 1 ? 's' : ''));
  if (totalElements > 0) parts.push(totalElements + ' element' + (totalElements !== 1 ? 's' : ''));
  if (totalConsoleSteps > 0) parts.push('console in ' + totalConsoleSteps + ' step' + (totalConsoleSteps !== 1 ? 's' : ''));
  if (totalNetworkSteps > 0) parts.push('network in ' + totalNetworkSteps + ' step' + (totalNetworkSteps !== 1 ? 's' : ''));
  var summary = parts.length > 0 ? parts.join(', ') : 'no captures';
  setStatus('Report: ' + summary + ' \u2192 Downloading...');

  await buildAndDownloadReport();
});

// ============================================================================
// Report building helpers
// ============================================================================
function showIntegrationResults(results, profileName) {
  var panel = els.integrationResults;
  panel.replaceChildren();

  // Header
  var header = document.createElement('div');
  header.className = 'ir-header';
  header.textContent = 'Sent via profile: ' + profileName;
  panel.appendChild(header);

  // Result items
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var item = document.createElement('div');
    item.className = 'ir-item ' + (r.success ? 'ir-success' : 'ir-fail');

    var icon = document.createElement('span');
    icon.className = 'ir-icon';
    icon.textContent = getPlatformIcon(r.integration);
    item.appendChild(icon);

    var statusIcon = document.createElement('span');
    statusIcon.textContent = r.success ? ' \u2705' : ' \u274C';
    item.appendChild(statusIcon);

    var name = document.createElement('span');
    name.className = 'ir-name';
    name.textContent = r.integration;
    item.appendChild(name);

    var status = document.createElement('span');
    status.className = 'ir-status';
    if (r.success) {
      status.textContent = 'OK';
    } else {
      status.textContent = r.error || 'Failed';
    }
    item.appendChild(status);

    // Link if available (work item URL, issue URL)
    if (r.workItemUrl) {
      var link = document.createElement('a');
      link.href = r.workItemUrl;
      link.target = '_blank';
      link.className = 'ir-link';
      link.textContent = 'Open #' + (r.workItemId || '');
      item.appendChild(link);
    }
    if (r.issueUrl) {
      var issueLink = document.createElement('a');
      issueLink.href = r.issueUrl;
      issueLink.target = '_blank';
      issueLink.className = 'ir-link';
      issueLink.textContent = 'Open issue';
      item.appendChild(issueLink);
    }

    panel.appendChild(item);
  }

  // Close button
  var closeBtn = document.createElement('button');
  closeBtn.className = 'ir-close';
  closeBtn.textContent = '\u2715';
  closeBtn.addEventListener('click', function () { panel.style.display = 'none'; });
  panel.appendChild(closeBtn);

  panel.style.display = 'block';
}

function parseUserAgent(ua) {
  var os = 'Unknown';
  if (ua.indexOf('Mac OS X') !== -1) os = 'macOS';
  else if (ua.indexOf('Windows') !== -1) os = 'Windows';
  else if (ua.indexOf('Linux') !== -1) os = 'Linux';
  else if (ua.indexOf('Android') !== -1) os = 'Android';
  else if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) os = 'iOS';

  var browser = 'Unknown';
  var chromeMatch = ua.match(/Chrome\/([\d.]+)/);
  var firefoxMatch = ua.match(/Firefox\/([\d.]+)/);
  var safariMatch = ua.match(/Version\/([\d.]+).*Safari/);
  var edgeMatch = ua.match(/Edg\/([\d.]+)/);
  if (edgeMatch) browser = 'Edge ' + edgeMatch[1];
  else if (chromeMatch) browser = 'Chrome ' + chromeMatch[1];
  else if (firefoxMatch) browser = 'Firefox ' + firefoxMatch[1];
  else if (safariMatch) browser = 'Safari ' + safariMatch[1];

  return { os: os, browser: browser };
}

function getEnvironmentInfo() {
  var ua = navigator.userAgent;
  var parsed = parseUserAgent(ua);
  var screenW = window.screen.width;
  var screenH = window.screen.height;
  var vpW = window.innerWidth;
  var vpH = window.innerHeight;

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

function dataUrlToBlob(dataUrl) {
  var splitParts = dataUrl.split(',');
  var mimeMatch = splitParts[0].match(/:(.*?);/);
  var mime = mimeMatch ? mimeMatch[1] : 'image/png';
  var binary = atob(splitParts[1]);
  var array = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

function downloadFile(filename, content, mimeType) {
  var blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  var downloadUrl = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

async function buildAndDownloadReport() {
  var now = new Date();
  var dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

  var description = els.description.value.trim() || '(No description provided)';
  var category = els.category.value;
  var priority = els.priority.value;

  var categoryLabels = { bug: 'Bug', feature: 'Feature Request', question: 'Question', other: 'Other' };
  var priorityLabels = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

  var url = state.tabInfo ? state.tabInfo.url : '(Unknown)';
  var title = state.tabInfo ? state.tabInfo.title : '(Unknown)';
  var userAgent = navigator.userAgent;
  var environment = getEnvironmentInfo();

  var ctx = {
    now: now, dateStr: dateStr, description: description, category: category, priority: priority,
    categoryLabels: categoryLabels, priorityLabels: priorityLabels,
    url: url, title: title, userAgent: userAgent, environment: environment
  };

  // Build Claude-friendly Markdown report (NO auto-download — saved to history)
  var reportMD = buildReportMarkdown(ctx);
  var filename = 'feedback-' + dateStr + '.md';

  // Save to history
  var consoleErrorCount = 0;
  var networkFailCount = 0;
  var totalScreenshots = 0;
  for (var hi = 0; hi < state.steps.length; hi++) {
    var hs = state.steps[hi];
    totalScreenshots += hs.screenshots.length;
    if (hs.consoleLogs) {
      for (var hc = 0; hc < hs.consoleLogs.length; hc++) {
        if (hs.consoleLogs[hc].level === 'error') consoleErrorCount++;
      }
    }
    if (hs.networkLogs) {
      for (var hn = 0; hn < hs.networkLogs.length; hn++) {
        if (hs.networkLogs[hn].status >= 400 || hs.networkLogs[hn].status === 0) networkFailCount++;
      }
    }
  }
  var metadata = {
    id: Date.now(),
    date: now.toISOString(),
    url: url,
    title: title,
    category: category,
    priority: priority,
    description: description.substring(0, 100),
    filename: filename,
    reportContent: reportMD,
    hasScreenshot: totalScreenshots > 0,
    consoleErrorCount: consoleErrorCount,
    networkFailCount: networkFailCount,
    integrations: [] // will be filled after send
  };

  // Send to integrations (profile-aware, in parallel)
  // Pass steps with screenshots for platforms that can upload files (Slack)
  metadata.steps = state.steps;
  setStatus('Sending to integrations...', '');
  var integrationOut = await sendToIntegrations(reportMD, metadata);
  var integrationResults = integrationOut.results;
  var matchedProfileName = integrationOut.profileName;

  // Store integration results in history metadata (name, success, links)
  metadata.integrations = integrationResults.map(function (r) {
    return {
      name: r.integration,
      success: r.success,
      error: r.error || null,
      url: r.workItemUrl || r.issueUrl || null
    };
  });
  metadata.profileName = matchedProfileName;

  saveToHistory(metadata);

  if (integrationResults.length > 0) {
    showIntegrationResults(integrationResults, matchedProfileName);
  }

  // Auto-clear state after report generation
  state.steps = [];
  state.currentStepId = null;
  state.tabInfo = null;
  state.frameworkInfo = null;
  state.storageInfo = null;
  state.navigationHistory = null;

  // Clear chrome.storage.local
  chrome.storage.local.remove(['annotatedScreenshot', 'capturedElement', 'bugjarForm', 'bugjarState']);

  // Clear UI
  els.description.value = '';
  els.category.value = 'bug';
  els.priority.value = 'medium';
  renderSteps();

  setStatus(t('reportCleared'), 'success');
}

/**
 * Builds a Markdown report optimized for Claude / AI consumption.
 * Step-based format: each step gets its own section with captures.
 */
function buildReportMarkdown(ctx) {
  var now = ctx.now;
  var dateStr = ctx.dateStr;
  var description = ctx.description;
  var category = ctx.category;
  var priority = ctx.priority;
  var categoryLabels = ctx.categoryLabels;
  var priorityLabels = ctx.priorityLabels;
  var url = ctx.url;
  var title = ctx.title;
  var userAgent = ctx.userAgent;
  var environment = ctx.environment;

  var lines = [];

  lines.push('# Bug Report / Feedback');
  lines.push('');
  lines.push('**Date:** ' + now.toISOString());
  lines.push('**URL:** ' + url);
  lines.push('**Page Title:** ' + title);
  lines.push('**Category:** ' + (categoryLabels[category] || category));
  lines.push('**Priority:** ' + (priorityLabels[priority] || priority));
  lines.push('**Browser:** ' + userAgent);
  lines.push('');

  // Environment
  if (environment) {
    lines.push('## Environment');
    lines.push('');
    lines.push('- **Resolution:** ' + environment.resolution);
    lines.push('- **Device Pixel Ratio:** ' + environment.devicePixelRatio);
    lines.push('- **OS:** ' + environment.os);
    lines.push('- **Browser:** ' + environment.browser);
    lines.push('- **Language:** ' + environment.language);
    lines.push('- **Timezone:** ' + environment.timezone);
    lines.push('- **Touch:** ' + environment.touch);
    if (state.frameworkInfo) {
      var fw = state.frameworkInfo;
      var fwStr = fw.name !== 'Unknown' ? (fw.name + (fw.version ? ' ' + fw.version : '')) : 'Not detected';
      lines.push('- **Framework:** ' + fwStr);
      if (fw.jquery) lines.push('- **jQuery:** ' + fw.jquery);
    }
    lines.push('');
  }

  // Description
  lines.push('## Description');
  lines.push('');
  lines.push(description);
  lines.push('');

  // Reproduction Steps
  if (state.steps.length > 0) {
    lines.push('## Reproduction Steps');
    lines.push('');

    for (var si = 0; si < state.steps.length; si++) {
      var step = state.steps[si];
      var stepNum = si + 1;
      var stepTitle = step.description || '(no description)';
      lines.push('### Step ' + stepNum + ': ' + stepTitle);
      lines.push('');

      // Elements
      if (step.elements.length > 0) {
        lines.push('**Selected elements:**');
        for (var ei = 0; ei < step.elements.length; ei++) {
          var el = step.elements[ei];
          var elLabel = '`' + el.tagName;
          if (el.classes && el.classes.length) {
            elLabel += '.' + el.classes.slice(0, 2).join('.');
          }
          elLabel += '`';
          var elSelector = el.cssSelector || '';
          var elSize = el.boundingRect ? (el.boundingRect.width + 'x' + el.boundingRect.height) : '';
          lines.push('- ' + elLabel + ' \u2014 ' + elSelector + (elSize ? ' (' + elSize + ')' : ''));
        }
        lines.push('');
      }

      // Console logs
      if (step.consoleLogs && step.consoleLogs.length > 0) {
        var errors = [];
        var warnings = [];
        for (var cl = 0; cl < step.consoleLogs.length; cl++) {
          if (step.consoleLogs[cl].level === 'error') errors.push(step.consoleLogs[cl]);
          if (step.consoleLogs[cl].level === 'warn') warnings.push(step.consoleLogs[cl]);
        }
        lines.push('**Console (' + errors.length + ' error' + (errors.length !== 1 ? 's' : '') + '):**');
        lines.push('```');
        for (var cli = 0; cli < step.consoleLogs.length; cli++) {
          var log = step.consoleLogs[cli];
          var ts = log.timestamp ? new Date(log.timestamp).toISOString().slice(11, 23) : '';
          var level = '[' + (log.level || 'log').toUpperCase() + ']';
          var msg = Array.isArray(log.args) ? log.args.join(' ') : (log.message || '');
          lines.push(ts + ' ' + level + ' ' + msg);
          if (log.stack && log.level === 'error') {
            var stackLines = log.stack.split('\n').slice(2, 6);
            for (var sli = 0; sli < stackLines.length; sli++) {
              lines.push('  ' + stackLines[sli].trim());
            }
          }
        }
        lines.push('```');
        lines.push('');
      }

      // Network - failed requests
      if (step.networkLogs && step.networkLogs.length > 0) {
        var failed = [];
        for (var nli = 0; nli < step.networkLogs.length; nli++) {
          if (step.networkLogs[nli].status >= 400 || step.networkLogs[nli].status === 0) {
            failed.push(step.networkLogs[nli]);
          }
        }
        if (failed.length > 0) {
          lines.push('**Failed requests:**');
          lines.push('| Method | Status | URL | Duration |');
          lines.push('|--------|--------|-----|----------|');
          for (var fi = 0; fi < failed.length; fi++) {
            var req = failed[fi];
            lines.push('| ' + req.method + ' | ' + (req.status || 'ERR') + ' | ' + req.url + ' | ' + (req.duration || '?') + 'ms |');
            if (req.responseBody) {
              lines.push('> Response: ' + req.responseBody);
            }
          }
          lines.push('');
        }
      }

      // Screenshots
      if (step.screenshots.length > 0) {
        for (var ssi = 0; ssi < step.screenshots.length; ssi++) {
          var ss = step.screenshots[ssi];
          // Embed screenshot inline as data URL (no separate file download)
          lines.push('![Step ' + stepNum + ' - Screenshot ' + (ssi + 1) + '](' + ss + ')');
        }
        lines.push('');
      }
    }
  }

  // Storage section (global)
  if (state.storageInfo) {
    var ls = state.storageInfo.localStorage || [];
    var ss2 = state.storageInfo.sessionStorage || [];
    if (ls.length > 0 || ss2.length > 0) {
      lines.push('## Storage');
      lines.push('');
      if (ls.length > 0) {
        lines.push('### localStorage');
        lines.push('');
        lines.push('| Key | Size (chars) |');
        lines.push('|-----|-------------|');
        for (var lsi = 0; lsi < ls.length; lsi++) {
          lines.push('| ' + ls[lsi].key + ' | ' + ls[lsi].size + ' |');
        }
        lines.push('');
      }
      if (ss2.length > 0) {
        lines.push('### sessionStorage');
        lines.push('');
        lines.push('| Key | Size (chars) |');
        lines.push('|-----|-------------|');
        for (var ssi2 = 0; ssi2 < ss2.length; ssi2++) {
          lines.push('| ' + ss2[ssi2].key + ' | ' + ss2[ssi2].size + ' |');
        }
        lines.push('');
      }
    }
  }

  // Navigation History (global)
  if (state.navigationHistory && state.navigationHistory.length > 0) {
    lines.push('## Navigation History');
    lines.push('');
    lines.push('| Time | Type | URL |');
    lines.push('|------|------|-----|');
    for (var ni = 0; ni < state.navigationHistory.length; ni++) {
      var nav = state.navigationHistory[ni];
      var navTs = nav.timestamp ? new Date(nav.timestamp).toISOString().slice(11, 23) : '';
      lines.push('| ' + navTs + ' | ' + nav.type + ' | ' + nav.url + ' |');
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
  lines.push('2. Look at the screenshots to understand the visual state at each step');
  lines.push('3. If DOM elements were selected, inspect the components at those CSS selectors');
  lines.push('4. Propose a fix with the specific file and line to modify');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Dynamic version from manifest
// ============================================================================
document.querySelector('.header-version').textContent = 'v' + chrome.runtime.getManifest().version;

// ============================================================================
// Auto-save form fields on every change (survives popup close/reopen)
// ============================================================================
function saveFormFields() {
  chrome.storage.local.set({
    bugjarForm: {
      description: els.description.value,
      category: els.category.value,
      priority: els.priority.value
    }
  });
}
els.description.addEventListener('input', saveFormFields);
els.category.addEventListener('change', saveFormFields);
els.priority.addEventListener('change', saveFormFields);

// ============================================================================
// Restore persisted data on popup open (CRIT-2 + update banner)
// ============================================================================
chrome.storage.local.get(['annotatedScreenshot', 'capturedElement', 'updateAvailable', 'bugjarLang', 'helpDismissed', 'bugjarForm', 'bugjarState'], function (stored) {
  // Restore form fields
  if (stored.bugjarForm) {
    if (stored.bugjarForm.description) els.description.value = stored.bugjarForm.description;
    if (stored.bugjarForm.category) els.category.value = stored.bugjarForm.category;
    if (stored.bugjarForm.priority) els.priority.value = stored.bugjarForm.priority;
  }

  // Restore full capture state from unified key
  if (stored.bugjarState) {
    var s = stored.bugjarState;
    if (s.steps && s.steps.length) {
      state.steps = s.steps;
      state.currentStepId = s.currentStepId || null;
    }
    if (s.tabInfo) state.tabInfo = s.tabInfo;
    if (s.frameworkInfo) state.frameworkInfo = s.frameworkInfo;
    if (s.storageInfo) state.storageInfo = s.storageInfo;
    if (s.navigationHistory) state.navigationHistory = s.navigationHistory;
  }

  // Consume annotatedScreenshot: replace the last raw screenshot with the annotated version
  if (stored.annotatedScreenshot) {
    var annStep = getCurrentStep();
    if (!annStep) {
      annStep = createStep();
    }
    if (annStep) {
      // Replace the last screenshot (raw fallback) with the annotated version
      if (annStep.screenshots.length > 0) {
        annStep.screenshots[annStep.screenshots.length - 1] = stored.annotatedScreenshot;
      } else {
        annStep.screenshots.push(stored.annotatedScreenshot);
      }
    }
    chrome.storage.local.remove('annotatedScreenshot');
    persistState();
  }

  // Backward compat: content.js writes capturedElement directly -- import into current step
  if (stored.capturedElement) {
    var elStep = getCurrentStep();
    if (!elStep) {
      elStep = createStep();
    }
    if (elStep) {
      elStep.elements.push(stored.capturedElement);
    }
    chrome.storage.local.remove('capturedElement');
    persistState();
  }

  // Auto-create first step if none exist (simple UX for quick bugs)
  if (state.steps.length === 0) {
    createStep();
  }

  // Render steps after all state is restored
  renderSteps();

  // Update banner + version check
  var currentVersion = chrome.runtime.getManifest().version;
  if (stored.updateAvailable) {
    var banner = document.createElement('div');
    banner.className = 'update-banner';
    var icon = document.createElement('span');
    icon.textContent = '\u26A0\uFE0F';
    icon.style.marginRight = '6px';
    banner.appendChild(icon);
    var text = document.createTextNode('v' + stored.updateAvailable.version + ' available (you have v' + currentVersion + ')  ');
    banner.appendChild(text);
    var link = document.createElement('a');
    link.href = stored.updateAvailable.url;
    link.target = '_blank';
    link.textContent = 'Download update';
    banner.appendChild(link);
    document.querySelector('.header').after(banner);
  } else {
    // No update stored -- trigger a check now
    chrome.runtime.sendMessage({ action: 'checkForUpdates' });
  }

  // Show help panel on first ever open
  if (!stored.helpDismissed) {
    document.getElementById('help-panel').classList.add('visible');
  }

  // P3-20: Initialize i18n
  var savedLang = stored.bugjarLang || detectLanguage();
  applyTranslations(savedLang);
});

// P3-20: Language selector click handlers
document.querySelectorAll('.lang-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    applyTranslations(btn.dataset.lang);
  });
});

// ============================================================================
// Help panel
// ============================================================================
document.getElementById('btn-help').addEventListener('click', function () {
  document.getElementById('help-panel').classList.toggle('visible');
});

document.getElementById('btn-help-dismiss').addEventListener('click', function () {
  document.getElementById('help-panel').classList.remove('visible');
  chrome.storage.local.set({ helpDismissed: true });
});

// ============================================================================
// Tab switching (Report / History / Settings)
// ============================================================================
function switchTab(activeTabId) {
  var tabs = ['tab-report', 'tab-history', 'tab-settings'];
  for (var ti = 0; ti < tabs.length; ti++) {
    document.getElementById(tabs[ti]).classList.toggle('active', tabs[ti] === activeTabId);
  }
  document.querySelector('.content').style.display = activeTabId === 'tab-report' ? 'flex' : 'none';
  document.getElementById('history-panel').style.display = activeTabId === 'tab-history' ? 'block' : 'none';
  document.getElementById('settings-panel').style.display = activeTabId === 'tab-settings' ? 'block' : 'none';
}

document.getElementById('tab-report').addEventListener('click', function () {
  switchTab('tab-report');
});

document.getElementById('tab-history').addEventListener('click', function () {
  switchTab('tab-history');
  loadHistory();
});

document.getElementById('tab-settings').addEventListener('click', function () {
  switchTab('tab-settings');
  loadSettingsForm();
});

// ============================================================================
// Settings: load / save / toggle (profile-aware)
// ============================================================================
var settingsCheckboxes = [
  { id: 'int-slack-enabled', fieldsId: 'int-slack-fields' },
  { id: 'int-azdo-enabled', fieldsId: 'int-azdo-fields' },
  { id: 'int-email-enabled', fieldsId: 'int-email-fields' },
  { id: 'int-github-enabled', fieldsId: 'int-github-fields' },
  { id: 'int-webhook-enabled', fieldsId: 'int-webhook-fields' }
];

// Toggle field visibility when checkbox changes
for (var sci = 0; sci < settingsCheckboxes.length; sci++) {
  (function (cbId, fieldsId) {
    document.getElementById(cbId).addEventListener('change', function () {
      document.getElementById(fieldsId).style.display = this.checked ? 'flex' : 'none';
    });
  })(settingsCheckboxes[sci].id, settingsCheckboxes[sci].fieldsId);
}

// In-memory cache of loaded profile data, kept in sync across switches
var _profileData = null;

/**
 * Read the form fields into an integrations config object.
 */
function readIntegrationsFromForm() {
  return {
    slack: {
      enabled: document.getElementById('int-slack-enabled').checked,
      webhookUrl: document.getElementById('int-slack-webhook').value.trim(),
      botToken: document.getElementById('int-slack-bot-token').value.trim(),
      channelId: document.getElementById('int-slack-channel-id').value.trim()
    },
    azureDevOps: {
      enabled: document.getElementById('int-azdo-enabled').checked,
      organization: document.getElementById('int-azdo-org').value.trim(),
      project: document.getElementById('int-azdo-project').value.trim(),
      pat: document.getElementById('int-azdo-pat').value.trim(),
      workItemType: document.getElementById('int-azdo-type').value
    },
    email: {
      enabled: document.getElementById('int-email-enabled').checked,
      to: document.getElementById('int-email-to').value.trim(),
      subject: document.getElementById('int-email-subject').value.trim()
    },
    github: {
      enabled: document.getElementById('int-github-enabled').checked,
      owner: document.getElementById('int-github-owner').value.trim(),
      repo: document.getElementById('int-github-repo').value.trim(),
      token: document.getElementById('int-github-token').value.trim()
    },
    webhook: {
      enabled: document.getElementById('int-webhook-enabled').checked,
      url: document.getElementById('int-webhook-url').value.trim(),
      method: document.getElementById('int-webhook-method').value,
      headers: document.getElementById('int-webhook-headers').value.trim()
    }
  };
}

/**
 * Populate integration form fields from a config object.
 */
function populateIntegrationFields(config) {
  // Slack
  document.getElementById('int-slack-enabled').checked = config.slack.enabled;
  document.getElementById('int-slack-webhook').value = config.slack.webhookUrl || '';
  document.getElementById('int-slack-bot-token').value = config.slack.botToken || '';
  document.getElementById('int-slack-channel-id').value = config.slack.channelId || '';
  document.getElementById('int-slack-fields').style.display = config.slack.enabled ? 'flex' : 'none';

  // Azure DevOps
  document.getElementById('int-azdo-enabled').checked = config.azureDevOps.enabled;
  document.getElementById('int-azdo-org').value = config.azureDevOps.organization || '';
  document.getElementById('int-azdo-project').value = config.azureDevOps.project || '';
  document.getElementById('int-azdo-pat').value = config.azureDevOps.pat || '';
  document.getElementById('int-azdo-type').value = config.azureDevOps.workItemType || 'Bug';
  document.getElementById('int-azdo-fields').style.display = config.azureDevOps.enabled ? 'flex' : 'none';

  // Email
  document.getElementById('int-email-enabled').checked = config.email.enabled;
  document.getElementById('int-email-to').value = config.email.to || '';
  document.getElementById('int-email-subject').value = config.email.subject || '';
  document.getElementById('int-email-fields').style.display = config.email.enabled ? 'flex' : 'none';

  // GitHub
  document.getElementById('int-github-enabled').checked = config.github.enabled;
  document.getElementById('int-github-owner').value = config.github.owner || '';
  document.getElementById('int-github-repo').value = config.github.repo || '';
  document.getElementById('int-github-token').value = config.github.token || '';
  document.getElementById('int-github-fields').style.display = config.github.enabled ? 'flex' : 'none';

  // Webhook
  document.getElementById('int-webhook-enabled').checked = config.webhook.enabled;
  document.getElementById('int-webhook-url').value = config.webhook.url || '';
  document.getElementById('int-webhook-method').value = config.webhook.method || 'POST';
  document.getElementById('int-webhook-headers').value = config.webhook.headers || '';
  document.getElementById('int-webhook-fields').style.display = config.webhook.enabled ? 'flex' : 'none';
}

/**
 * Render the profile dropdown and select the active profile.
 */
function renderProfileDropdown(data) {
  var select = document.getElementById('profile-select');
  select.replaceChildren();
  for (var i = 0; i < data.profiles.length; i++) {
    var opt = document.createElement('option');
    opt.value = data.profiles[i].id;
    opt.textContent = data.profiles[i].name;
    select.appendChild(opt);
  }
  select.value = data.activeProfile || 'default';
}

/**
 * Show / hide profile-specific UI (URL pattern field + delete button).
 */
function updateProfileUI(profileId) {
  var isDefault = (profileId === 'default');
  document.getElementById('profile-url-section').style.display = isDefault ? 'none' : 'block';
  document.getElementById('btn-delete-profile').style.display = isDefault ? 'none' : 'inline-flex';
}

async function loadSettingsForm() {
  _profileData = await loadProfiles();
  renderProfileDropdown(_profileData);

  var profile = getProfileById(_profileData.profiles, _profileData.activeProfile) || _profileData.profiles[0];
  populateIntegrationFields(profile.integrations);
  document.getElementById('profile-url-pattern').value = profile.urlPattern || '';
  updateProfileUI(profile.id);
}

/**
 * Save current form values into the currently selected profile in _profileData,
 * then persist everything to storage.
 */
function saveCurrentProfileFromForm() {
  if (!_profileData) return;
  var currentId = document.getElementById('profile-select').value;
  var profile = getProfileById(_profileData.profiles, currentId);
  if (!profile) return;
  profile.integrations = readIntegrationsFromForm();
  // Save URL pattern (only for non-default)
  if (profile.id !== 'default') {
    profile.urlPattern = document.getElementById('profile-url-pattern').value.trim();
  }
}

// Profile dropdown change handler
document.getElementById('profile-select').addEventListener('change', function () {
  // Save current profile's values first
  saveCurrentProfileFromForm();

  // Switch to new profile
  var newId = this.value;
  _profileData.activeProfile = newId;
  var profile = getProfileById(_profileData.profiles, newId);
  if (profile) {
    populateIntegrationFields(profile.integrations);
    document.getElementById('profile-url-pattern').value = profile.urlPattern || '';
  }
  updateProfileUI(newId);
});

// Add profile button
document.getElementById('btn-add-profile').addEventListener('click', function () {
  var name = prompt(t('intAddProfile'));
  if (!name || !name.trim()) return;
  name = name.trim();

  // Save current profile first
  saveCurrentProfileFromForm();

  var newId = 'prof-' + Date.now();
  var newProfile = createEmptyProfile(newId, name, '');
  _profileData.profiles.push(newProfile);
  _profileData.activeProfile = newId;

  renderProfileDropdown(_profileData);
  populateIntegrationFields(newProfile.integrations);
  document.getElementById('profile-url-pattern').value = '';
  updateProfileUI(newId);

  // Save immediately
  saveProfiles(_profileData);
});

// Delete profile button
document.getElementById('btn-delete-profile').addEventListener('click', function () {
  var currentId = document.getElementById('profile-select').value;
  if (currentId === 'default') return; // Cannot delete default

  _profileData.profiles = _profileData.profiles.filter(function (p) { return p.id !== currentId; });
  _profileData.activeProfile = 'default';

  renderProfileDropdown(_profileData);
  var defaultProfile = getProfileById(_profileData.profiles, 'default') || _profileData.profiles[0];
  populateIntegrationFields(defaultProfile.integrations);
  document.getElementById('profile-url-pattern').value = '';
  updateProfileUI('default');

  // Save immediately
  saveProfiles(_profileData);
});

document.getElementById('btn-save-settings').addEventListener('click', async function () {
  saveCurrentProfileFromForm();
  await saveProfiles(_profileData);
  setStatus('Settings saved', 'success');
});

// ============================================================================
// History functions
// ============================================================================
async function saveToHistory(metadata) {
  var stored = await chrome.storage.local.get('reportHistory');
  var history = stored.reportHistory || [];
  history.unshift(metadata);
  if (history.length > 50) history.pop();
  await chrome.storage.local.set({ reportHistory: history });
}

async function loadHistory() {
  var stored = await chrome.storage.local.get('reportHistory');
  var history = stored.reportHistory || [];
  renderHistory(history);
}

function renderHistory(history) {
  var list = document.getElementById('history-list');
  var empty = document.getElementById('history-empty');
  var count = document.getElementById('history-count');

  list.replaceChildren();
  count.textContent = history.length + ' report' + (history.length !== 1 ? 's' : '');

  if (history.length === 0) {
    empty.style.display = 'block';
    list.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  list.style.display = 'block';

  for (var i = 0; i < history.length; i++) {
    var item = history[i];
    var itemEl = createElement('div', { className: 'history-item' });

    // Header row
    var header = createElement('div', { className: 'history-item-header' });

    var dateText = new Date(item.date).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    header.appendChild(createElement('span', { className: 'history-date', textContent: dateText }));

    var badges = createElement('span', { className: 'history-badges' });
    if (item.priority) {
      badges.appendChild(createElement('span', {
        className: 'badge-priority ' + item.priority,
        textContent: item.priority.charAt(0).toUpperCase() + item.priority.slice(1)
      }));
    }
    if (item.category) {
      badges.appendChild(createElement('span', {
        className: 'badge-category',
        textContent: item.category.charAt(0).toUpperCase() + item.category.slice(1)
      }));
    }
    header.appendChild(badges);

    // Download button (if report content available)
    if (item.reportContent) {
      var dlBtn = createElement('button', { className: 'history-download', title: 'Download .md' });
      dlBtn.textContent = '\u2B07';
      (function (fname, content) {
        dlBtn.addEventListener('click', function () { downloadFile(fname, content, 'text/markdown'); });
      })(item.filename || 'feedback.md', item.reportContent);
      header.appendChild(dlBtn);
    }

    var deleteBtn = createElement('button', { className: 'history-delete', title: 'Delete', textContent: '\u00d7' });
    (function (itemId) {
      deleteBtn.addEventListener('click', function () { deleteHistoryItem(itemId); });
    })(item.id);
    header.appendChild(deleteBtn);

    itemEl.appendChild(header);

    if (item.url) {
      itemEl.appendChild(createElement('div', { className: 'history-url', textContent: item.url }));
    }
    if (item.description) {
      itemEl.appendChild(createElement('div', { className: 'history-description', textContent: item.description }));
    }

    // Integration results badges with links
    if (item.integrations && item.integrations.length > 0) {
      var intDiv = createElement('div', { className: 'history-integrations' });
      for (var ii = 0; ii < item.integrations.length; ii++) {
        var intItem = item.integrations[ii];
        var badge = createElement('span', {
          className: 'history-int-badge ' + (intItem.success ? 'success' : 'fail')
        });
        var platformIcon = getPlatformIcon(intItem.name);
        if (intItem.url) {
          var intLink = createElement('a', { href: intItem.url, target: '_blank', textContent: platformIcon + ' ' + intItem.name + ' \u2197' });
          badge.appendChild(intLink);
        } else {
          badge.textContent = platformIcon + ' ' + intItem.name + (intItem.success ? ' \u2713' : ' \u2717');
        }
        intDiv.appendChild(badge);
      }
      itemEl.appendChild(intDiv);
    }

    list.appendChild(itemEl);
  }
}

async function deleteHistoryItem(id) {
  var stored = await chrome.storage.local.get('reportHistory');
  var history = (stored.reportHistory || []).filter(function (h) { return h.id !== id; });
  await chrome.storage.local.set({ reportHistory: history });
  renderHistory(history);
}

async function clearAllHistory() {
  await chrome.storage.local.set({ reportHistory: [] });
  renderHistory([]);
}

document.getElementById('btn-clear-history').addEventListener('click', function () {
  clearAllHistory();
});

// ============================================================================
// Auto-inject content script on popup open for monitoring
// ============================================================================
(async function autoInject() {
  var tabId = await ensureContentScript();
  var indicator = document.getElementById('monitoring-indicator');
  if (tabId) {
    indicator.textContent = '\u25CF ' + t('monitoringActive');
    indicator.className = 'monitoring-indicator active';
  } else {
    indicator.textContent = '\u25CB ' + t('monitoringInactive');
    indicator.className = 'monitoring-indicator inactive';
  }
})();
