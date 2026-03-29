/**
 * BugJar — Service Worker (background.js)
 *
 * Responsibilities:
 *  - Capture visible tab screenshot via chrome.tabs.captureVisibleTab
 *  - Route messages between popup <-> content script
 *  - Open the annotation editor in a new tab
 */

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    // Store screenshot for the annotation page to pick up
    await chrome.storage.local.set({ pendingScreenshot: message.dataUrl });

    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL('annotate/annotate.html')
    });

    sendResponse({ success: true, tabId: tab.id });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
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
