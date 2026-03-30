/**
 * BugJar — Integrations module
 * Sends reports to configured destinations (Slack, Azure DevOps, Email, Webhook, GitHub)
 * All credentials are stored per-user in chrome.storage.local — nothing hardcoded.
 *
 * Storage format (profile-based):
 *   bugjarIntegrations: {
 *     activeProfile: 'default',
 *     profiles: [ { id, name, urlPattern, integrations: { slack, azureDevOps, email, webhook, github } }, ... ]
 *   }
 */

var INTEGRATIONS_STORAGE_KEY = 'bugjarIntegrations';

// Default settings (all disabled)
var DEFAULT_INTEGRATIONS = {
  slack: { enabled: false, webhookUrl: '' },
  azureDevOps: { enabled: false, organization: '', project: '', pat: '', workItemType: 'Bug' },
  email: { enabled: false, to: '', subject: 'Bug Report — BugJar' },
  webhook: { enabled: false, url: '', method: 'POST', headers: '' },
  github: { enabled: false, owner: '', repo: '', token: '' }
};

function createDefaultProfile() {
  return {
    id: 'default',
    name: 'Default',
    urlPattern: '',
    integrations: JSON.parse(JSON.stringify(DEFAULT_INTEGRATIONS))
  };
}

function createEmptyProfile(id, name, urlPattern) {
  return {
    id: id,
    name: name,
    urlPattern: urlPattern || '',
    integrations: JSON.parse(JSON.stringify(DEFAULT_INTEGRATIONS))
  };
}

/**
 * Migrate old flat integration config (pre-profile) to the new profile-based format.
 */
function migrateOldFormat(stored) {
  if (stored && stored.profiles) return stored; // already new format
  // Old format: { slack: {...}, azureDevOps: {...}, ... }
  var integrations = {};
  var keys = Object.keys(DEFAULT_INTEGRATIONS);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    integrations[k] = Object.assign({}, DEFAULT_INTEGRATIONS[k], (stored && stored[k]) || {});
  }
  return {
    activeProfile: 'default',
    profiles: [{
      id: 'default',
      name: 'Default',
      urlPattern: '',
      integrations: integrations
    }]
  };
}

/**
 * Load all profiles from storage.
 * Returns { activeProfile: string, profiles: Array }
 */
async function loadProfiles() {
  var stored = (await chrome.storage.local.get(INTEGRATIONS_STORAGE_KEY))[INTEGRATIONS_STORAGE_KEY] || {};
  var data = migrateOldFormat(stored);
  // Ensure every profile has all integration keys with defaults
  for (var pi = 0; pi < data.profiles.length; pi++) {
    var profile = data.profiles[pi];
    var keys = Object.keys(DEFAULT_INTEGRATIONS);
    for (var ki = 0; ki < keys.length; ki++) {
      var k = keys[ki];
      profile.integrations[k] = Object.assign({}, DEFAULT_INTEGRATIONS[k], profile.integrations[k] || {});
    }
  }
  // Ensure default profile always exists
  var hasDefault = false;
  for (var di = 0; di < data.profiles.length; di++) {
    if (data.profiles[di].id === 'default') { hasDefault = true; break; }
  }
  if (!hasDefault) {
    data.profiles.unshift(createDefaultProfile());
  }
  return data;
}

/**
 * Save all profiles to storage.
 */
async function saveProfiles(data) {
  await chrome.storage.local.set({ [INTEGRATIONS_STORAGE_KEY]: data });
}

/**
 * Backward-compatible: load integrations from the active (or default) profile.
 * Used by sendToIntegrations when no URL matching is needed.
 */
async function loadIntegrations() {
  var data = await loadProfiles();
  var profile = getProfileById(data.profiles, data.activeProfile) || data.profiles[0];
  return profile.integrations;
}

/**
 * Backward-compatible: save integrations to the active profile.
 */
async function saveIntegrations(config) {
  var data = await loadProfiles();
  var profile = getProfileById(data.profiles, data.activeProfile) || data.profiles[0];
  profile.integrations = config;
  await saveProfiles(data);
}

// -- Profile URL matching --

function matchUrlPattern(url, pattern) {
  if (!pattern) return false; // empty pattern = default only
  var regex = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*/g, '.*');
  return new RegExp(regex, 'i').test(url);
}

function getProfileForUrl(profiles, url) {
  // Try specific profiles first (non-empty pattern)
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].urlPattern && matchUrlPattern(url, profiles[i].urlPattern)) {
      return profiles[i];
    }
  }
  // Fall back to default
  return getProfileById(profiles, 'default') || profiles[0];
}

function getProfileById(profiles, id) {
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].id === id) return profiles[i];
  }
  return null;
}

/**
 * Proxy fetch through the background service worker.
 * Background scripts have relaxed CORS in MV3 — no extra permissions needed.
 */
function bgFetch(url, method, headers, body) {
  return new Promise(function (resolve) {
    chrome.runtime.sendMessage({
      action: 'fetchProxy',
      url: url,
      method: method || 'POST',
      headers: headers || {},
      body: body || undefined
    }, resolve);
  });
}

/**
 * Send report to all enabled integrations.
 * If a URL is provided in metadata.url, the matching profile is used.
 * Returns { results: Array, profileName: string }
 */
async function sendToIntegrations(reportMarkdown, metadata) {
  var data = await loadProfiles();
  var profile;
  if (metadata && metadata.url) {
    profile = getProfileForUrl(data.profiles, metadata.url);
  } else {
    profile = getProfileById(data.profiles, data.activeProfile) || data.profiles[0];
  }
  var config = profile.integrations;
  var results = [];

  if (config.slack.enabled && config.slack.webhookUrl) {
    results.push(await sendToSlack(config.slack, reportMarkdown, metadata));
  }
  if (config.azureDevOps.enabled && config.azureDevOps.pat) {
    results.push(await sendToAzureDevOps(config.azureDevOps, reportMarkdown, metadata));
  }
  if (config.email.enabled && config.email.to) {
    results.push(sendToEmail(config.email, reportMarkdown, metadata));
  }
  if (config.webhook.enabled && config.webhook.url) {
    results.push(await sendToWebhook(config.webhook, reportMarkdown, metadata));
  }
  if (config.github.enabled && config.github.token) {
    results.push(await sendToGitHub(config.github, reportMarkdown, metadata));
  }

  return { results: results, profileName: profile.name };
}

// -- SLACK --
async function sendToSlack(config, reportMD, metadata) {
  try {
    var text = '*Bug Report* — ' + (metadata.category || 'Bug') + ' (' + (metadata.priority || 'Medium') + ')\n';
    text += '*URL:* ' + (metadata.url || 'Unknown') + '\n';
    text += '*Description:* ' + (metadata.description || '').substring(0, 300) + '\n';
    if (metadata.consoleErrorCount > 0) text += '*Console errors:* ' + metadata.consoleErrorCount + '\n';
    if (metadata.networkFailCount > 0) text += '*Network failures:* ' + metadata.networkFailCount + '\n';

    var response = await bgFetch(
      config.webhookUrl,
      'POST',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ text: text })
    );

    return { integration: 'Slack', success: response && response.success, error: (response && response.success) ? undefined : 'HTTP ' + ((response && response.status) || '?') };
  } catch (e) {
    return { integration: 'Slack', success: false, error: e.message };
  }
}

// -- AZURE DEVOPS --
async function sendToAzureDevOps(config, reportMD, metadata) {
  try {
    var url = 'https://dev.azure.com/' + encodeURIComponent(config.organization) + '/' +
              encodeURIComponent(config.project) + '/_apis/wit/workitems/$' +
              encodeURIComponent(config.workItemType || 'Bug') + '?api-version=7.1';

    var title = (metadata.category || 'Bug') + ': ' + (metadata.description || 'Bug Report').substring(0, 100);

    var body = [
      { op: 'add', path: '/fields/System.Title', value: title },
      { op: 'add', path: '/fields/Microsoft.VSTS.TCM.ReproSteps', value: reportMD.replace(/\n/g, '<br>') },
      { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: metadata.priority === 'critical' ? 1 : metadata.priority === 'high' ? 2 : metadata.priority === 'medium' ? 3 : 4 }
    ];

    var response = await bgFetch(
      url,
      'POST',
      {
        'Content-Type': 'application/json-patch+json',
        'Authorization': 'Basic ' + btoa(':' + config.pat)
      },
      JSON.stringify(body)
    );

    var json = response && response.json ? response.json : null;
    return {
      integration: 'Azure DevOps',
      success: response && response.success,
      error: (response && response.success) ? undefined : ((json && json.message) || 'HTTP ' + ((response && response.status) || '?')),
      workItemId: json ? json.id : undefined,
      workItemUrl: (json && json._links) ? json._links.html.href : undefined
    };
  } catch (e) {
    return { integration: 'Azure DevOps', success: false, error: e.message };
  }
}

// -- EMAIL (mailto: link) --
function sendToEmail(config, reportMD, metadata) {
  try {
    var subject = encodeURIComponent(config.subject || 'Bug Report — BugJar');
    var body = encodeURIComponent(reportMD.substring(0, 2000)); // mailto has length limits
    var mailto = 'mailto:' + encodeURIComponent(config.to) + '?subject=' + subject + '&body=' + body;

    // Open in background — Chrome will open the default mail client
    chrome.tabs.create({ url: mailto, active: false });

    return { integration: 'Email', success: true };
  } catch (e) {
    return { integration: 'Email', success: false, error: e.message };
  }
}

// -- CUSTOM WEBHOOK --
async function sendToWebhook(config, reportMD, metadata) {
  try {
    var headers = { 'Content-Type': 'application/json' };
    // Parse custom headers if provided
    if (config.headers) {
      try {
        var customHeaders = JSON.parse(config.headers);
        Object.assign(headers, customHeaders);
      } catch (e) { /* ignore invalid JSON */ }
    }

    var payload = {
      source: 'BugJar',
      timestamp: new Date().toISOString(),
      url: metadata.url,
      title: metadata.title,
      category: metadata.category,
      priority: metadata.priority,
      description: metadata.description,
      consoleErrors: metadata.consoleErrorCount,
      networkFailures: metadata.networkFailCount,
      report: reportMD
    };

    var response = await bgFetch(
      config.url,
      config.method || 'POST',
      headers,
      JSON.stringify(payload)
    );

    return { integration: 'Webhook', success: response && response.success, error: (response && response.success) ? undefined : 'HTTP ' + ((response && response.status) || '?') };
  } catch (e) {
    return { integration: 'Webhook', success: false, error: e.message };
  }
}

// -- GITHUB ISSUES --
async function sendToGitHub(config, reportMD, metadata) {
  try {
    var url = 'https://api.github.com/repos/' + encodeURIComponent(config.owner) + '/' +
              encodeURIComponent(config.repo) + '/issues';

    var title = (metadata.category || 'Bug') + ': ' + (metadata.description || 'Bug Report').substring(0, 100);
    var labels = [];
    if (metadata.category === 'bug') labels.push('bug');
    if (metadata.category === 'feature') labels.push('enhancement');
    if (metadata.priority === 'critical' || metadata.priority === 'high') labels.push('priority: high');

    var response = await bgFetch(
      url,
      'POST',
      {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.token,
        'Accept': 'application/vnd.github+json'
      },
      JSON.stringify({
        title: title,
        body: reportMD,
        labels: labels
      })
    );

    var json = response && response.json ? response.json : null;
    return {
      integration: 'GitHub',
      success: response && response.success,
      error: (response && response.success) ? undefined : ((json && json.message) || 'HTTP ' + ((response && response.status) || '?')),
      issueUrl: json ? json.html_url : undefined
    };
  } catch (e) {
    return { integration: 'GitHub', success: false, error: e.message };
  }
}
