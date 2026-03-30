/**
 * BugJar — Service Worker (background.js)
 *
 * Responsibilities:
 *  - Capture visible tab screenshot via chrome.tabs.captureVisibleTab
 *  - Route messages between popup <-> content script
 *  - Open the annotation editor in a new tab
 */

// ---------------------------------------------------------------------------
// Update checker — compares against GitHub Releases
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => checkForUpdates());
chrome.alarms.create('updateCheck', { periodInMinutes: 1440 }); // every 24h
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'updateCheck') checkForUpdates();
});

async function checkForUpdates() {
  try {
    const response = await fetch('https://api.github.com/repos/jgounand/BugJar/releases/latest');
    if (!response.ok) return;
    const release = await response.json();
    const latestVersion = release.tag_name.replace('v', '');
    const currentVersion = chrome.runtime.getManifest().version;

    if (isNewerVersion(latestVersion, currentVersion)) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#e94560' });
      chrome.storage.local.set({
        updateAvailable: { version: latestVersion, url: release.html_url }
      });
    }
  } catch {
    // Silently fail — not critical
  }
}

function isNewerVersion(latest, current) {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// P3-23: Keyboard shortcut handler
// ---------------------------------------------------------------------------
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-all') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'triggerCaptureAll' });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // P1-7: Badge for console errors detected by content script
  if (message.action === 'consoleErrorDetected' && message.count > 0) {
    chrome.action.setBadgeText({ text: String(message.count) });
    chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
    return;
  }

  if (message.action === 'checkForUpdates') {
    checkForUpdates();
    return;
  }

  // Reopen popup after element selection (Chrome 99+)
  if (message.action === 'reopenPopup') {
    try {
      chrome.action.openPopup();
    } catch (e) {
      // Chrome < 99 or restricted context — user clicks icon manually
    }
    return;
  }

  // Upload binary file to Slack (requires FormData, not JSON)
  if (message.action === 'slackUploadFile') {
    handleSlackFileUpload(message, sendResponse);
    return true; // async
  }

  switch (message.action) {
    case 'captureScreenshot':
      handleCaptureScreenshot(sendResponse);
      return true; // keep channel open for async response

    case 'openAnnotationEditor':
      handleOpenAnnotationEditor(message, sendResponse);
      return true;

    case 'injectContentScript':
      handleInjectContentScript(message, sendResponse);
      return true;

    case 'getActiveTabInfo':
      handleGetActiveTabInfo(sendResponse);
      return true;

    case 'fetchProxy':
      handleFetchProxy(message, sendResponse);
      return true;

    default:
      break;
  }
});

// ---------------------------------------------------------------------------
// Screenshot capture
// ---------------------------------------------------------------------------
async function handleCaptureScreenshot(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 100
    });

    sendResponse({ success: true, dataUrl });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Open annotation editor in new tab, passing screenshot via storage
// ---------------------------------------------------------------------------
async function handleOpenAnnotationEditor(message, sendResponse) {
  try {
    // Compress screenshot to JPEG if it exceeds 4MB to avoid storage quota issues
    let dataUrl = message.dataUrl;
    if (dataUrl && dataUrl.length > 4 * 1024 * 1024) {
      dataUrl = await compressScreenshot(dataUrl, 0.85);
    }

    // Store screenshot for the annotation page to pick up
    await chrome.storage.local.set({ pendingScreenshot: dataUrl });

    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL('annotate/annotate.html')
    });

    sendResponse({ success: true, tabId: tab.id });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Compress a data URL image to JPEG using OffscreenCanvas.
 * Falls back to the original if compression fails.
 */
async function compressScreenshot(dataUrl, quality) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
    const octx = offscreen.getContext('2d');
    octx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpegBlob = await offscreen.convertToBlob({ type: 'image/jpeg', quality });
    // Convert blob back to data URL
    const arrayBuffer = await jpegBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return 'data:image/jpeg;base64,' + btoa(binary);
  } catch {
    return dataUrl; // fallback to original
  }
}

// ---------------------------------------------------------------------------
// Inject content script into active tab (if not already injected)
// ---------------------------------------------------------------------------
async function handleInjectContentScript(message, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }

    // Attempt injection — if already injected the catch block handles gracefully
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    sendResponse({ success: true, tabId: tab.id });
  } catch (err) {
    // Script may already be injected or page may not allow it
    sendResponse({ success: false, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Get active tab info (URL, title, etc.)
// ---------------------------------------------------------------------------
async function handleGetActiveTabInfo(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }

    sendResponse({
      success: true,
      tabInfo: {
        url: tab.url,
        title: tab.title,
        id: tab.id
      }
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Fetch proxy — allows popup/integrations to call external APIs via the
// background service worker (relaxed CORS, no extra host_permissions needed)
// ---------------------------------------------------------------------------
async function handleSlackFileUpload(message, sendResponse) {
  try {
    var authHeader = { 'Authorization': 'Bearer ' + message.botToken };

    // Convert base64 to binary
    var binary = atob(message.base64);
    var array = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);

    // Step 1: Get upload URL from Slack
    var getUrlRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, authHeader),
      body: 'filename=' + encodeURIComponent(message.filename || 'screenshot.png') + '&length=' + array.length
    });
    var getUrlJson = await getUrlRes.json();

    if (!getUrlJson.ok) {
      sendResponse({ success: false, error: 'getUploadURL: ' + (getUrlJson.error || 'failed') });
      return;
    }

    var uploadUrl = getUrlJson.upload_url;
    var fileId = getUrlJson.file_id;

    // Step 2: Upload binary to the presigned URL
    var uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': message.mimeType || 'image/png' },
      body: array.buffer
    });

    if (!uploadRes.ok) {
      sendResponse({ success: false, error: 'upload: HTTP ' + uploadRes.status });
      return;
    }

    // Step 3: Complete the upload and share to channel/thread
    var completeBody = {
      files: [{ id: fileId, title: message.comment || message.filename || 'Screenshot' }],
      channel_id: message.channelId
    };
    if (message.threadTs) completeBody.thread_ts = message.threadTs;

    var completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader),
      body: JSON.stringify(completeBody)
    });
    var completeJson = await completeRes.json();

    sendResponse({ success: completeJson.ok, error: completeJson.ok ? undefined : completeJson.error });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleFetchProxy(message, sendResponse) {
  try {
    var response = await fetch(message.url, {
      method: message.method || 'POST',
      headers: message.headers || {},
      body: message.body || undefined
    });
    var text = await response.text();
    var json = null;
    try { json = JSON.parse(text); } catch (e) { }
    sendResponse({ success: response.ok, status: response.status, body: text, json: json });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}
