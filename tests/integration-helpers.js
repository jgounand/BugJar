/**
 * Extracted pure functions from integrations.js for testing.
 * KEEP IN SYNC with integrations.js
 */

var DEFAULT_INTEGRATIONS = {
  slack: { enabled: false, botToken: '', channelId: '' },
  azureDevOps: { enabled: false, organization: '', project: '', pat: '', workItemType: 'Bug', areaPath: '', iterationPath: '', assignedTo: '' },
  email: { enabled: false, to: '', subject: 'Bug Report — BugJar' },
  github: { enabled: false, owner: '', repo: '', token: '' }
};

var CATEGORY_MAP = {
  azureDevOps: { bug: 'Bug', feature: 'User Story', question: 'Task', other: 'Task' },
  github: { bug: ['bug'], feature: ['enhancement'], question: ['question'], other: [] },
  slack: { bug: ':beetle: Bug', feature: ':bulb: Feature Request', question: ':question: Question', other: ':memo: Other' }
};

var PLATFORM_ICONS = { 'Slack': '\uD83D\uDCAC', 'Azure DevOps': '\uD83D\uDD37', 'Email': '\u2709\uFE0F', 'GitHub': '\uD83D\uDC19' };

function createDefaultProfile() {
  return { id: 'default', name: 'Default', urlPattern: '', integrations: JSON.parse(JSON.stringify(DEFAULT_INTEGRATIONS)) };
}

function createEmptyProfile(id, name, urlPattern) {
  return { id: id, name: name, urlPattern: urlPattern || '', integrations: JSON.parse(JSON.stringify(DEFAULT_INTEGRATIONS)) };
}

function migrateOldFormat(stored) {
  if (stored && stored.profiles) return stored;
  var integrations = {};
  var keys = Object.keys(DEFAULT_INTEGRATIONS);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    integrations[k] = Object.assign({}, DEFAULT_INTEGRATIONS[k], (stored && stored[k]) || {});
  }
  return { activeProfile: 'default', profiles: [{ id: 'default', name: 'Default', urlPattern: '', integrations: integrations }] };
}

function matchUrlPattern(url, pattern) {
  if (!pattern) return false;
  var regex = pattern.replace(/[.+?^${}()|[\]\\*]/g, '\\$&').replace(/\\\*/g, '.*');
  return new RegExp(regex, 'i').test(url);
}

function getProfileForUrl(profiles, url) {
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].urlPattern && matchUrlPattern(url, profiles[i].urlPattern)) return profiles[i];
  }
  return getProfileById(profiles, 'default') || profiles[0];
}

function getProfileById(profiles, id) {
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].id === id) return profiles[i];
  }
  return null;
}

function getAzureDevOpsType(category, configDefault) {
  if (!configDefault || configDefault === 'Auto') return CATEGORY_MAP.azureDevOps[category] || 'Bug';
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

function getPlatformIcon(name) {
  return PLATFORM_ICONS[name] || '\u2699\uFE0F';
}

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
        for (var sli = 0; sli < stackLines.length; sli++) lines.push('  ' + stackLines[sli].trim());
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
      if (req.responseBody && (req.status >= 400 || req.status === 0)) lines.push('> Response: ' + req.responseBody);
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

function markdownToHtml(md) {
  return md
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;margin:8px 0;">')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/```([^`]*)```/gs, '<pre style="background:#f4f4f4;padding:8px;border-radius:4px;overflow-x:auto;font-size:12px;">$1</pre>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:2px;">$1</code>')
    .replace(/\|(.+)\|/g, function (match) {
      var cells = match.split('|').filter(function (c) { return c.trim(); });
      if (cells[0] && cells[0].trim().match(/^[-:]+$/)) return '';
      return '<tr>' + cells.map(function (c) { return '<td style="padding:4px 8px;border:1px solid #ddd;">' + c.trim() + '</td>'; }).join('') + '</tr>';
    })
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #ddd;padding-left:8px;color:#666;">$1</blockquote>')
    .replace(/\n/g, '<br>');
}

module.exports = {
  DEFAULT_INTEGRATIONS, CATEGORY_MAP, PLATFORM_ICONS,
  createDefaultProfile, createEmptyProfile, migrateOldFormat,
  matchUrlPattern, getProfileForUrl, getProfileById,
  getAzureDevOpsType, getGitHubLabels, getSlackCategoryLabel, getPlatformIcon,
  buildConsoleMd, buildNetworkMd, buildEnvironmentMd, markdownToHtml
};
