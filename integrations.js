/**
 * BugJar — Integrations module
 * Sends reports to configured destinations (Slack, Azure DevOps, Email, GitHub)
 * All credentials are stored per-user in chrome.storage.local — nothing hardcoded.
 *
 * Storage format (profile-based):
 *   bugjarIntegrations: {
 *     activeProfile: 'default',
 *     profiles: [ { id, name, urlPattern, integrations: { slack, azureDevOps, email, github } }, ... ]
 *   }
 */

var INTEGRATIONS_STORAGE_KEY = 'bugjarIntegrations';

// Default settings (all disabled)
var DEFAULT_INTEGRATIONS = {
  slack: { enabled: false, botToken: '', channelId: '' },
  azureDevOps: { enabled: false, organization: '', project: '', pat: '', workItemType: 'Bug', areaPath: '', iterationPath: '', assignedTo: '' },
  email: { enabled: false, to: '', subject: 'Bug Report — BugJar' },
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

// ============================================================================
// Category → platform type mapping
// Maps BugJar report categories to the correct type on each platform
// ============================================================================
var CATEGORY_MAP = {
  azureDevOps: {
    bug: 'Bug',
    feature: 'User Story',
    question: 'Task',
    other: 'Task'
  },
  github: {
    bug: ['bug'],
    feature: ['enhancement'],
    question: ['question'],
    other: []
  },
  slack: {
    bug: ':beetle: Bug',
    feature: ':bulb: Feature Request',
    question: ':question: Question',
    other: ':memo: Other'
  }
};

function getAzureDevOpsType(category, configDefault) {
  // "Auto" or empty = use category mapping; otherwise use the fixed type from settings
  if (!configDefault || configDefault === 'Auto') {
    return CATEGORY_MAP.azureDevOps[category] || 'Bug';
  }
  return configDefault;
}

function getGitHubLabels(category, priority) {
  var labels = (CATEGORY_MAP.github[category] || []).slice();
  if (priority === 'critical' || priority === 'high') labels.push('priority: high');
  if (priority === 'critical') labels.push('critical');
  return labels;
}

function getSlackCategoryLabel(category) {
  return CATEGORY_MAP.slack[category] || category;
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

// Platform icons for display
var PLATFORM_ICONS = {
  'Slack': '\uD83D\uDCAC',
  'Azure DevOps': '\uD83D\uDD37',
  'Email': '\u2709\uFE0F',
  'GitHub': '\uD83D\uDC19'
};

function getPlatformIcon(name) {
  return PLATFORM_ICONS[name] || '\u2699\uFE0F';
}

/**
 * Send report to all enabled integrations IN PARALLEL.
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
  var promises = [];

  if (config.slack.enabled && config.slack.botToken && config.slack.channelId) {
    promises.push(sendToSlack(config.slack, reportMarkdown, metadata));
  }
  if (config.azureDevOps.enabled && config.azureDevOps.pat) {
    promises.push(sendToAzureDevOps(config.azureDevOps, reportMarkdown, metadata));
  }
  if (config.email.enabled && config.email.to) {
    promises.push(Promise.resolve(sendToEmail(config.email, reportMarkdown, metadata)));
  }
  if (config.github.enabled && config.github.token) {
    promises.push(sendToGitHub(config.github, reportMarkdown, metadata));
  }

  // Send all in parallel — wait for ALL to complete
  var results = promises.length > 0 ? await Promise.all(promises) : [];

  return { results: results, profileName: profile.name };
}

// -- SLACK --
async function sendToSlack(config, reportMD, metadata) {
  try {
    var catLabel = getSlackCategoryLabel(metadata.category);
    var priorityEmoji = { critical: ':rotating_light:', high: ':warning:', medium: ':large_blue_circle:', low: ':white_circle:' };
    var emoji = priorityEmoji[metadata.priority] || ':beetle:';

    // Build summary for parent message
    var summary = emoji + ' *' + catLabel + '* — ' + (metadata.priority || 'Medium') + '\n';
    summary += ':link: ' + (metadata.url || 'Unknown') + '\n';
    summary += (metadata.description || '').substring(0, 300);

    return await sendToSlackWithThread(config, reportMD, metadata, summary);
  } catch (e) {
    return { integration: 'Slack', success: false, error: e.message };
  }
}

// Slack Web API with threading: parent message + detailed replies
async function sendToSlackWithThread(config, reportMD, metadata, summary) {
  var catLabel = getSlackCategoryLabel(metadata.category);
  var headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + config.botToken
  };
  var apiUrl = 'https://slack.com/api/chat.postMessage';

  // Count screenshots upfront (needed for parent blocks + later)
  var screenshotCount = 0;
  if (metadata.steps) {
    for (var sci2 = 0; sci2 < metadata.steps.length; sci2++) {
      if (metadata.steps[sci2].screenshots) screenshotCount += metadata.steps[sci2].screenshots.length;
    }
  }

  // 1. Post parent message (summary with blocks for rich formatting)
  var priorityEmojis = { critical: ':rotating_light:', high: ':red_circle:', medium: ':large_blue_circle:', low: ':white_circle:' };
  var pEmoji = priorityEmojis[metadata.priority] || ':large_blue_circle:';

  var blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: (metadata.category === 'bug' ? '\uD83E\uDEB2 ' : '\uD83D\uDCA1 ') + (metadata.description || 'Bug Report').substring(0, 100) }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: '*Category:*\n' + catLabel },
        { type: 'mrkdwn', text: '*Priority:*\n' + pEmoji + ' ' + (metadata.priority || 'medium') },
        { type: 'mrkdwn', text: '*URL:*\n<' + (metadata.url || '#') + '>' },
        { type: 'mrkdwn', text: '*Status:*\n:new: New' }
      ]
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: ':mag: ' + (metadata.consoleErrorCount || 0) + ' error(s) \u2022 ' + (metadata.networkFailCount || 0) + ' failure(s) \u2022 ' + screenshotCount + ' screenshot(s) \u2022 ID: `' + (metadata.id || '?') + '`' }
      ]
    },
    { type: 'divider' }
  ];

  var parentRes = await bgFetch(apiUrl, 'POST', headers, JSON.stringify({
    channel: config.channelId,
    text: summary,
    blocks: blocks,
    unfurl_links: false
  }));

  if (!parentRes || !parentRes.success || !parentRes.json || !parentRes.json.ok) {
    var err = (parentRes && parentRes.json) ? parentRes.json.error : 'Failed';
    return { integration: 'Slack', success: false, error: err };
  }

  var threadTs = parentRes.json.ts;

  // 1b. Add 🆕 reaction for status tracking
  await bgFetch('https://slack.com/api/reactions.add', 'POST', headers, JSON.stringify({
    channel: config.channelId,
    timestamp: threadTs,
    name: 'new'
  }));

  // 1c. Post structured metadata (machine-parseable by Claude MCP)
  var metaBlock = ':robot_face: *Metadata (for automation)*\n```json\n' + JSON.stringify({
    bugjar_id: metadata.id,
    url: metadata.url,
    category: metadata.category,
    priority: metadata.priority,
    console_errors: metadata.consoleErrorCount || 0,
    network_failures: metadata.networkFailCount || 0,
    screenshots: screenshotCount,
    timestamp: metadata.date || new Date().toISOString(),
    status: 'new'
  }, null, 2) + '\n```';

  await bgFetch(apiUrl, 'POST', headers, JSON.stringify({
    channel: config.channelId,
    thread_ts: threadTs,
    text: metaBlock
  }));

  // 2. Upload full report as .md file
  var cleanReport = reportMD.replace(/!\[([^\]]*)\]\(data:image[^)]+\)/g, '![$1](see attached screenshots)');
  await slackUploadTextFile(config, threadTs, cleanReport, 'report.md', ':page_facing_up: Full Report');

  // 3. Build and upload console.md (if any console logs)
  var consoleMd = buildConsoleMd(metadata);
  if (consoleMd) {
    await slackUploadTextFile(config, threadTs, consoleMd, 'console.md', ':clipboard: Console Logs');
  }

  // 4. Build and upload network.md (if any network logs)
  var networkMd = buildNetworkMd(metadata);
  if (networkMd) {
    await slackUploadTextFile(config, threadTs, networkMd, 'network.md', ':globe_with_meridians: Network Requests');
  }

  // 5. Build and upload environment.md
  var envMd = buildEnvironmentMd(metadata);
  if (envMd) {
    await slackUploadTextFile(config, threadTs, envMd, 'environment.md', ':computer: Environment');
  }

  // 6. Upload screenshots as image files in the thread
  if (metadata.steps) {
    for (var si = 0; si < metadata.steps.length; si++) {
      var step = metadata.steps[si];
      if (step.screenshots) {
        for (var sci = 0; sci < step.screenshots.length; sci++) {
          var dataUrl = step.screenshots[sci];
          if (!dataUrl || dataUrl.indexOf('data:image') !== 0) continue;

          var base64 = dataUrl.split(',')[1];
          var mime = dataUrl.indexOf('data:image/jpeg') === 0 ? 'image/jpeg' : 'image/png';
          var ext = mime === 'image/jpeg' ? 'jpg' : 'png';
          var comment = ':camera: Step ' + (si + 1);
          if (step.description) comment += ' — ' + step.description.substring(0, 100);

          await new Promise(function (resolve) {
            chrome.runtime.sendMessage({
              action: 'slackUploadFile',
              base64: base64,
              mimeType: mime,
              filename: 'step-' + (si + 1) + '-screenshot-' + (sci + 1) + '.' + ext,
              channelId: config.channelId,
              threadTs: threadTs,
              botToken: config.botToken,
              comment: comment
            }, function (r) { resolve(r); });
          });
        }
      }
    }
  }

  return {
    integration: 'Slack',
    success: true,
    threadTs: threadTs
  };
}

// -- Slack: upload text as .md file in thread --
async function slackUploadTextFile(config, threadTs, content, filename, comment) {
  try {
    // Convert text to base64
    var base64 = btoa(unescape(encodeURIComponent(content)));
    await new Promise(function (resolve) {
      chrome.runtime.sendMessage({
        action: 'slackUploadFile',
        base64: base64,
        mimeType: 'text/markdown',
        filename: filename,
        channelId: config.channelId,
        threadTs: threadTs,
        botToken: config.botToken,
        comment: comment
      }, function (r) { resolve(r); });
    });
  } catch (e) { /* non-critical */ }
}

// -- Build separate .md files for Slack thread --

function buildConsoleMd(metadata) {
  if (!metadata.steps) return null;
  var lines = ['# Console Logs', ''];
  var hasLogs = false;
  for (var si = 0; si < metadata.steps.length; si++) {
    var step = metadata.steps[si];
    if (!step.consoleLogs || step.consoleLogs.length === 0) continue;
    hasLogs = true;
    lines.push('## Step ' + (si + 1) + ': ' + (step.description || '(no description)'));
    lines.push('');
    var errCount = 0;
    for (var ci = 0; ci < step.consoleLogs.length; ci++) {
      if (step.consoleLogs[ci].level === 'error') errCount++;
    }
    lines.push(step.consoleLogs.length + ' log(s), ' + errCount + ' error(s)');
    lines.push('');
    lines.push('```');
    for (var cli = 0; cli < step.consoleLogs.length; cli++) {
      var log = step.consoleLogs[cli];
      var ts = log.timestamp ? new Date(log.timestamp).toISOString().slice(11, 23) : '';
      var level = '[' + (log.level || 'log').toUpperCase() + ']';
      var msg = log.message || '';
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
  return hasLogs ? lines.join('\n') : null;
}

function buildNetworkMd(metadata) {
  if (!metadata.steps) return null;
  var lines = ['# Network Requests', ''];
  var hasLogs = false;
  for (var si = 0; si < metadata.steps.length; si++) {
    var step = metadata.steps[si];
    if (!step.networkLogs || step.networkLogs.length === 0) continue;
    hasLogs = true;
    var failCount = 0;
    for (var ni = 0; ni < step.networkLogs.length; ni++) {
      if (step.networkLogs[ni].status >= 400 || step.networkLogs[ni].status === 0) failCount++;
    }
    lines.push('## Step ' + (si + 1) + ': ' + (step.description || '(no description)'));
    lines.push('');
    lines.push(step.networkLogs.length + ' request(s), ' + failCount + ' failed');
    lines.push('');
    lines.push('| Method | Status | URL | Duration |');
    lines.push('|--------|--------|-----|----------|');
    for (var nli = 0; nli < step.networkLogs.length; nli++) {
      var req = step.networkLogs[nli];
      var status = (req.status >= 400 || req.status === 0) ? '**' + (req.status || 'ERR') + '**' : String(req.status || '?');
      lines.push('| ' + req.method + ' | ' + status + ' | ' + req.url + ' | ' + (req.duration || '?') + 'ms |');
      if (req.responseBody && (req.status >= 400 || req.status === 0)) {
        lines.push('> Response: ' + req.responseBody);
      }
    }
    lines.push('');
  }
  return hasLogs ? lines.join('\n') : null;
}

function buildEnvironmentMd(metadata) {
  if (!metadata.environment && !metadata.userAgent) return null;
  var lines = ['# Environment', ''];
  if (metadata.url) lines.push('- **URL:** ' + metadata.url);
  if (metadata.title) lines.push('- **Page Title:** ' + metadata.title);
  lines.push('- **Date:** ' + (metadata.date || new Date().toISOString()));
  lines.push('');
  if (metadata.environment) {
    var env = metadata.environment;
    lines.push('## System');
    lines.push('');
    lines.push('| Property | Value |');
    lines.push('|----------|-------|');
    if (env.os) lines.push('| OS | ' + env.os + ' |');
    if (env.browser) lines.push('| Browser | ' + env.browser + ' |');
    if (env.resolution) lines.push('| Resolution | ' + env.resolution + ' |');
    if (env.devicePixelRatio) lines.push('| Device Pixel Ratio | ' + env.devicePixelRatio + ' |');
    if (env.language) lines.push('| Language | ' + env.language + ' |');
    if (env.timezone) lines.push('| Timezone | ' + env.timezone + ' |');
    if (env.touch) lines.push('| Touch | ' + env.touch + ' |');
    lines.push('');
  }
  if (metadata.userAgent) {
    lines.push('## User Agent');
    lines.push('');
    lines.push('```');
    lines.push(metadata.userAgent);
    lines.push('```');
  }
  return lines.join('\n');
}

// -- Markdown → HTML converter (basic, for Azure DevOps ReproSteps) --
function markdownToHtml(md) {
  return md
    // Images: ![alt](src) → <img> (handles data URLs)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;margin:8px 0;">')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Code blocks
    .replace(/```([^`]*)```/gs, '<pre style="background:#f4f4f4;padding:8px;border-radius:4px;overflow-x:auto;font-size:12px;">$1</pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:2px;">$1</code>')
    // Tables (basic)
    .replace(/\|(.+)\|/g, function (match) {
      var cells = match.split('|').filter(function (c) { return c.trim(); });
      if (cells[0] && cells[0].trim().match(/^[-:]+$/)) return ''; // separator row
      return '<tr>' + cells.map(function (c) { return '<td style="padding:4px 8px;border:1px solid #ddd;">' + c.trim() + '</td>'; }).join('') + '</tr>';
    })
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #ddd;padding-left:8px;color:#666;">$1</blockquote>')
    // Line breaks
    .replace(/\n/g, '<br>');
}

// -- AZURE DEVOPS --
async function sendToAzureDevOps(config, reportMD, metadata) {
  try {
    var wiType = getAzureDevOpsType(metadata.category, config.workItemType);
    var authHeader = 'Basic ' + btoa(':' + config.pat);
    var baseUrl = 'https://dev.azure.com/' + encodeURIComponent(config.organization) + '/' +
                  encodeURIComponent(config.project);

    // 1. Upload all attachments (screenshots + .md files)
    var attachmentUrls = []; // { url, name, type }

    // 1a. Upload .md files
    var consoleMd = buildConsoleMd(metadata);
    var networkMd = buildNetworkMd(metadata);
    var envMd = buildEnvironmentMd(metadata);
    var cleanReportMd = reportMD.replace(/!\[([^\]]*)\]\(data:image[^)]+\)/g, '![$1](see attached screenshots)');

    var mdFiles = [
      { content: cleanReportMd, name: 'report.md' },
      { content: consoleMd, name: 'console.md' },
      { content: networkMd, name: 'network.md' },
      { content: envMd, name: 'environment.md' }
    ];
    for (var mfi = 0; mfi < mdFiles.length; mfi++) {
      if (!mdFiles[mfi].content) continue;
      var mdBase64 = btoa(unescape(encodeURIComponent(mdFiles[mfi].content)));
      var mdUploaded = await azdoUploadAttachment(baseUrl, authHeader, 'data:text/markdown;base64,' + mdBase64, mdFiles[mfi].name);
      if (mdUploaded) attachmentUrls.push({ url: mdUploaded, name: mdFiles[mfi].name, type: 'md' });
    }

    // 1b. Upload screenshots
    if (metadata.steps) {
      for (var si = 0; si < metadata.steps.length; si++) {
        var step = metadata.steps[si];
        if (!step.screenshots) continue;
        for (var sci = 0; sci < step.screenshots.length; sci++) {
          var dataUrl = step.screenshots[sci];
          if (!dataUrl || !dataUrl.startsWith('data:')) continue;
          var fileName = 'bugjar-step' + (si + 1) + '-screenshot' + (sci + 1) + '.png';
          var uploaded = await azdoUploadAttachment(baseUrl, authHeader, dataUrl, fileName);
          if (uploaded) attachmentUrls.push({ url: uploaded, name: fileName, type: 'image' });
        }
      }
    }

    // 2. Convert markdown to HTML, replacing data URLs with attachment URLs
    var htmlBody = markdownToHtml(reportMD);
    // Replace inline data:image URLs with uploaded attachment URLs
    for (var ai = 0; ai < attachmentUrls.length; ai++) {
      // Replace first remaining data URL occurrence with the attachment URL
      htmlBody = htmlBody.replace(/src="data:image\/[^"]+"/,
        'src="' + attachmentUrls[ai].url + '" alt="' + attachmentUrls[ai].name + '"');
    }

    // 3. Create work item
    var title = wiType + ': ' + (metadata.description || 'Bug Report').substring(0, 100);
    var patchBody = [
      { op: 'add', path: '/fields/System.Title', value: title },
      { op: 'add', path: '/fields/Microsoft.VSTS.TCM.ReproSteps', value: htmlBody },
      { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: metadata.priority === 'critical' ? 1 : metadata.priority === 'high' ? 2 : metadata.priority === 'medium' ? 3 : 4 }
    ];

    // Severity (same mapping as Priority for Azure DevOps)
    patchBody.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Severity', value: metadata.priority === 'critical' ? '1 - Critical' : metadata.priority === 'high' ? '2 - High' : metadata.priority === 'medium' ? '3 - Medium' : '4 - Low' });

    // System Info (browser, OS, resolution)
    var sysInfo = metadata.userAgent || '';
    if (metadata.environment) {
      sysInfo = 'OS: ' + (metadata.environment.os || 'Unknown') + '<br>'
        + 'Browser: ' + (metadata.environment.browser || 'Unknown') + '<br>'
        + 'Resolution: ' + (metadata.environment.resolution || 'Unknown') + '<br>'
        + 'DPR: ' + (metadata.environment.devicePixelRatio || '1');
    }
    patchBody.push({ op: 'add', path: '/fields/Microsoft.VSTS.TCM.SystemInfo', value: sysInfo });

    // Tags
    var tags = ['BugJar', metadata.category || 'bug', metadata.priority || 'medium'].join(';');
    patchBody.push({ op: 'add', path: '/fields/System.Tags', value: tags });

    // Description (short text)
    if (metadata.description) {
      patchBody.push({ op: 'add', path: '/fields/System.Description', value: metadata.description });
    }

    // Found In (URL)
    if (metadata.url) {
      patchBody.push({ op: 'add', path: '/fields/Microsoft.VSTS.Build.FoundIn', value: metadata.url });
    }

    // Configurable fields (only if set)
    if (config.areaPath) {
      patchBody.push({ op: 'add', path: '/fields/System.AreaPath', value: config.areaPath });
    }
    if (config.iterationPath) {
      patchBody.push({ op: 'add', path: '/fields/System.IterationPath', value: config.iterationPath });
    }
    if (config.assignedTo) {
      patchBody.push({ op: 'add', path: '/fields/System.AssignedTo', value: config.assignedTo });
    }

    // 4. Add attachment relations
    for (var ri = 0; ri < attachmentUrls.length; ri++) {
      patchBody.push({
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'AttachedFile',
          url: attachmentUrls[ri].url,
          attributes: { name: attachmentUrls[ri].name }
        }
      });
    }

    var wiUrl = baseUrl + '/_apis/wit/workitems/$' + encodeURIComponent(wiType) + '?api-version=7.1';
    var response = await bgFetch(
      wiUrl,
      'POST',
      {
        'Content-Type': 'application/json-patch+json',
        'Authorization': authHeader
      },
      JSON.stringify(patchBody)
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

/**
 * Upload a base64 data URL as an attachment to Azure DevOps.
 * Returns the attachment URL or null on failure.
 */
async function azdoUploadAttachment(baseUrl, authHeader, dataUrl, fileName) {
  try {
    var base64 = dataUrl.split(',')[1];
    if (!base64) return null;

    var uploadUrl = baseUrl + '/_apis/wit/attachments?fileName=' +
                    encodeURIComponent(fileName) + '&api-version=7.1';

    // Use dedicated binary upload handler in background.js
    var response = await new Promise(function(resolve) {
      chrome.runtime.sendMessage({
        action: 'azdoUploadBinary',
        url: uploadUrl,
        authHeader: authHeader,
        base64: base64
      }, resolve);
    });

    return (response && response.success && response.json && response.json.url)
      ? response.json.url : null;
  } catch (e) {
    return null;
  }
}

// -- EMAIL (mailto: link) --
// Handles large reports by auto-downloading .md and opening mailto with summary
function sendToEmail(config, reportMD, metadata) {
  try {
    var categoryLabels = { bug: 'Bug', feature: 'Feature Request', question: 'Question', other: 'Other' };
    var catLabel = categoryLabels[metadata.category] || metadata.category;
    var subject = encodeURIComponent(
      (config.subject || 'Bug Report') + ' \u2014 ' + catLabel + ' (' + (metadata.priority || 'Medium') + ')'
    );

    if (reportMD.length <= 1800) {
      // Short report: send directly in mailto body
      var body = encodeURIComponent(reportMD);
      var mailto = 'mailto:' + encodeURIComponent(config.to) + '?subject=' + subject + '&body=' + body;
      chrome.tabs.create({ url: mailto, active: false });
    } else {
      // Long report: download separate .md files + open mailto with summary
      var dateSlug = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      var cleanReportEmail = reportMD.replace(/!\[([^\]]*)\]\(data:image[^)]+\)/g, '![$1](see screenshot files)');

      var emailFiles = [
        { content: cleanReportEmail, name: 'bugjar-report-' + dateSlug + '.md' },
        { content: buildConsoleMd(metadata), name: 'bugjar-console-' + dateSlug + '.md' },
        { content: buildNetworkMd(metadata), name: 'bugjar-network-' + dateSlug + '.md' },
        { content: buildEnvironmentMd(metadata), name: 'bugjar-environment-' + dateSlug + '.md' }
      ];

      var downloadedFiles = [];
      for (var efi = 0; efi < emailFiles.length; efi++) {
        if (!emailFiles[efi].content) continue;
        var blob = new Blob([emailFiles[efi].content], { type: 'text/markdown' });
        var downloadUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = downloadUrl;
        a.download = emailFiles[efi].name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        downloadedFiles.push(emailFiles[efi].name);
      }

      // Open mailto with short summary + instruction
      var summary = 'URL: ' + (metadata.url || 'Unknown') + '\n\n';
      summary += 'Description: ' + (metadata.description || '').substring(0, 200) + '\n\n';
      if (metadata.consoleErrorCount > 0) summary += 'Console errors: ' + metadata.consoleErrorCount + '\n';
      if (metadata.networkFailCount > 0) summary += 'Network failures: ' + metadata.networkFailCount + '\n';
      summary += '\n---\nFiles downloaded to your Downloads folder:\n';
      for (var dfi = 0; dfi < downloadedFiles.length; dfi++) {
        summary += '  - ' + downloadedFiles[dfi] + '\n';
      }
      summary += '\nPlease attach these files to this email.';

      var body = encodeURIComponent(summary);
      var mailto = 'mailto:' + encodeURIComponent(config.to) + '?subject=' + subject + '&body=' + body;
      chrome.tabs.create({ url: mailto, active: false });
    }

    return { integration: 'Email', success: true };
  } catch (e) {
    return { integration: 'Email', success: false, error: e.message };
  }
}

// -- GITHUB ISSUES --
async function sendToGitHub(config, reportMD, metadata) {
  try {
    var url = 'https://api.github.com/repos/' + encodeURIComponent(config.owner) + '/' +
              encodeURIComponent(config.repo) + '/issues';

    // Map BugJar category + priority to GitHub labels
    var categoryLabel = { bug: 'Bug', feature: 'Feature Request', question: 'Question', other: 'Other' };
    var title = (categoryLabel[metadata.category] || metadata.category) + ': ' + (metadata.description || 'Bug Report').substring(0, 100);
    var labels = getGitHubLabels(metadata.category, metadata.priority);

    // Build structured body with collapsible sections
    var cleanBody = reportMD.replace(/!\[([^\]]*)\]\(data:image[^)]+\)/g, '![$1](screenshot — see below)');
    var githubBody = cleanBody;

    // Add separate collapsible sections
    var consoleMd = buildConsoleMd(metadata);
    var networkMd = buildNetworkMd(metadata);
    var envMd = buildEnvironmentMd(metadata);

    if (consoleMd) {
      githubBody += '\n\n<details>\n<summary>📋 Console Logs</summary>\n\n' + consoleMd + '\n</details>';
    }
    if (networkMd) {
      githubBody += '\n\n<details>\n<summary>🌐 Network Requests</summary>\n\n' + networkMd + '\n</details>';
    }
    if (envMd) {
      githubBody += '\n\n<details>\n<summary>💻 Environment</summary>\n\n' + envMd + '\n</details>';
    }

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
        body: githubBody,
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
