/**
 * BugJar — Unit Tests
 *
 * Self-contained test runner with no external dependencies.
 * Run: node tests/test.js
 */

// ============================================================================
// Test runner
// ============================================================================
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${message}`);
  } else {
    failed++;
    console.error(`  \u2717 ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const ok = actual === expected;
  if (ok) {
    passed++;
    console.log(`  \u2713 ${message}`);
  } else {
    failed++;
    console.error(`  \u2717 ${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  \u2713 ${message}`);
  } else {
    failed++;
    console.error(`  \u2717 ${message}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    got:      ${JSON.stringify(actual)}`);
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// ============================================================================
// Load helpers
// ============================================================================
const { parseUserAgent, escapeHtml, isNewerVersion, dataUrlToBlob } = require('./report-helpers');
const { getXPath, getCssSelector, detectFramework } = require('./content-helpers');
const {
  DEFAULT_INTEGRATIONS, createDefaultProfile, createEmptyProfile, migrateOldFormat,
  matchUrlPattern, getProfileForUrl, getProfileById,
  getAzureDevOpsType, getGitHubLabels, getSlackCategoryLabel, getPlatformIcon,
  buildConsoleMd, buildNetworkMd, buildEnvironmentMd, markdownToHtml
} = require('./integration-helpers');

// ============================================================================
// Load TRANSLATIONS by parsing the i18n.js source as JSON-like data
// ============================================================================
const fs = require('fs');
const path = require('path');
const i18nSource = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf-8');

// Extract the TRANSLATIONS object from the source by finding the balanced braces.
// The object starts at "const TRANSLATIONS = {" and ends at the matching "};".
const startMarker = 'const TRANSLATIONS = {';
const startIdx = i18nSource.indexOf(startMarker);
// Find the matching closing brace by counting brace depth
let depth = 0;
let endIdx = -1;
// Execute i18n.js in a sandboxed context to extract TRANSLATIONS natively
const vm = require('vm');
let TRANSLATIONS;
try {
  // Wrap in a function that returns TRANSLATIONS (const is block-scoped in vm)
  const wrappedSource = '(function() { ' + i18nSource + '\n return TRANSLATIONS; })()';
  TRANSLATIONS = vm.runInNewContext(wrappedSource, {});
  if (!TRANSLATIONS) throw new Error('TRANSLATIONS not found in i18n.js');
} catch (e) {
  console.error('Failed to load TRANSLATIONS from i18n.js:', e.message);
  process.exit(1);
}

// ============================================================================
// i18n helper functions (reimplemented from i18n.js for testing)
// ============================================================================
function detectLanguage(navigatorLang) {
  const lang = (navigatorLang || 'en').substring(0, 2).toLowerCase();
  return TRANSLATIONS[lang] ? lang : 'en';
}

function t(key, lang) {
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || (TRANSLATIONS.en[key]) || key;
}

// ============================================================================
// 1. i18n.js tests
// ============================================================================
describe('i18n: detectLanguage()', () => {
  assertEqual(detectLanguage('en-US'), 'en', 'English navigator returns "en"');
  assertEqual(detectLanguage('fr-FR'), 'fr', 'French navigator returns "fr"');
  assertEqual(detectLanguage('es-MX'), 'es', 'Spanish navigator returns "es"');
  assertEqual(detectLanguage('de-DE'), 'en', 'Unsupported language falls back to "en"');
  assertEqual(detectLanguage('ja'), 'en', 'Japanese falls back to "en"');
  assertEqual(detectLanguage(undefined), 'en', 'Undefined navigator.language falls back to "en"');
  assert(['en', 'fr', 'es'].includes(detectLanguage('fr')), 'detectLanguage returns a valid language code');
});

describe('i18n: t() translation lookup', () => {
  assertEqual(t('description', 'en'), 'Description', 'EN: "description" returns "Description"');
  assertEqual(t('description', 'fr'), 'Description', 'FR: "description" returns "Description"');
  assertEqual(t('description', 'es'), 'Descripci\u00f3n', 'ES: "description" returns "Descripcion" (with accent)');
  assertEqual(t('generate', 'en'), 'Generate Report', 'EN: "generate" returns "Generate Report"');
  assertEqual(t('generate', 'fr'), 'G\u00e9n\u00e9rer le rapport', 'FR: "generate" returns "Generer le rapport" (with accents)');
  assertEqual(t('generate', 'es'), 'Generar informe', 'ES: "generate" returns "Generar informe"');
  assertEqual(t('catBug', 'en'), 'Bug', 'EN: category "catBug" returns "Bug"');
  assertEqual(t('priCritical', 'fr'), 'Critique', 'FR: priority "priCritical" returns "Critique"');
  assertEqual(t('priCritical', 'es'), 'Cr\u00edtica', 'ES: priority "priCritical" returns "Critica" (with accent)');
});

describe('i18n: t() fallback behavior', () => {
  // Fallback to English when key missing in target language
  assertEqual(t('description', 'de'), 'Description', 'Missing language falls back to English value');

  // Fallback to key itself when not found anywhere
  assertEqual(t('nonExistentKey', 'en'), 'nonExistentKey', 'Missing key falls back to key itself');
  assertEqual(t('totallyFakeKey', 'fr'), 'totallyFakeKey', 'Missing key in FR falls back to key itself');
});

// ============================================================================
// 2. i18n completeness: all languages have the same keys
// ============================================================================
describe('i18n: translation completeness (all languages have same keys)', () => {
  const languages = Object.keys(TRANSLATIONS);
  const enKeys = Object.keys(TRANSLATIONS.en).sort();

  for (const lang of languages) {
    const langKeys = Object.keys(TRANSLATIONS[lang]).sort();
    const missing = enKeys.filter(k => !langKeys.includes(k));
    const extra = langKeys.filter(k => !enKeys.includes(k));

    assert(missing.length === 0, `"${lang}" has no missing keys vs EN` + (missing.length > 0 ? ` (missing: ${missing.join(', ')})` : ''));
    assert(extra.length === 0, `"${lang}" has no extra keys vs EN` + (extra.length > 0 ? ` (extra: ${extra.join(', ')})` : ''));
  }

  // Verify all three expected languages exist
  assert(languages.includes('en'), 'English translations exist');
  assert(languages.includes('fr'), 'French translations exist');
  assert(languages.includes('es'), 'Spanish translations exist');
  assertEqual(languages.length, 3, 'Exactly 3 languages defined');
});

// ============================================================================
// 3. Report helpers: parseUserAgent()
// ============================================================================
describe('parseUserAgent()', () => {
  const chromeUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const firefoxUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
  const safariUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
  const edgeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
  const androidUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const iosUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';

  // Chrome on macOS
  let result = parseUserAgent(chromeUA);
  assertEqual(result.os, 'macOS', 'Chrome UA: OS is macOS');
  assertEqual(result.browser, 'Chrome 120.0.0.0', 'Chrome UA: browser is Chrome 120.0.0.0');

  // Firefox on Windows
  result = parseUserAgent(firefoxUA);
  assertEqual(result.os, 'Windows', 'Firefox UA: OS is Windows');
  assertEqual(result.browser, 'Firefox 121.0', 'Firefox UA: browser is Firefox 121.0');

  // Safari on macOS
  result = parseUserAgent(safariUA);
  assertEqual(result.os, 'macOS', 'Safari UA: OS is macOS');
  assertEqual(result.browser, 'Safari 17.2', 'Safari UA: browser is Safari 17.2');

  // Edge on Windows
  result = parseUserAgent(edgeUA);
  assertEqual(result.os, 'Windows', 'Edge UA: OS is Windows');
  assertEqual(result.browser, 'Edge 120.0.0.0', 'Edge UA: browser is Edge 120.0.0.0');

  // Chrome on Android
  result = parseUserAgent(androidUA);
  assertEqual(result.os, 'Android', 'Android UA: OS is Android');
  assertEqual(result.browser, 'Chrome 120.0.0.0', 'Android UA: browser is Chrome 120.0.0.0');

  // Safari on iOS
  result = parseUserAgent(iosUA);
  assertEqual(result.os, 'iOS', 'iOS UA: OS is iOS');
  assertEqual(result.browser, 'Safari 17.2', 'iOS UA: browser is Safari 17.2');

  // Unknown UA
  result = parseUserAgent('SomeCustomBot/1.0');
  assertEqual(result.os, 'Unknown', 'Unknown UA: OS is Unknown');
  assertEqual(result.browser, 'Unknown', 'Unknown UA: browser is Unknown');
});

// ============================================================================
// 4. Report helpers: escapeHtml()
// ============================================================================
describe('escapeHtml()', () => {
  assertEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', 'Escapes HTML tags and quotes');
  assertEqual(escapeHtml('&'), '&amp;', 'Escapes ampersand');
  assertEqual(escapeHtml('<'), '&lt;', 'Escapes less-than');
  assertEqual(escapeHtml('>'), '&gt;', 'Escapes greater-than');
  assertEqual(escapeHtml('"'), '&quot;', 'Escapes double quote');
  assertEqual(escapeHtml("'"), '&#039;', 'Escapes single quote');
  assertEqual(escapeHtml('Hello World'), 'Hello World', 'Plain text unchanged');
  assertEqual(escapeHtml(''), '', 'Empty string returns empty');
  assertEqual(escapeHtml(null), '', 'null returns empty');
  assertEqual(escapeHtml(undefined), '', 'undefined returns empty');
  assertEqual(escapeHtml('a < b && c > d'), 'a &lt; b &amp;&amp; c &gt; d', 'Mixed special characters');
  assertEqual(escapeHtml('<div class="foo">bar</div>'), '&lt;div class=&quot;foo&quot;&gt;bar&lt;/div&gt;', 'Full HTML tag escaped');
});

// ============================================================================
// 5. Report helpers: dataUrlToBlob()
// ============================================================================
describe('dataUrlToBlob()', () => {
  // Use a simple, valid base64-encoded text for PNG MIME
  // "Hello" in base64 is "SGVsbG8="
  const pngDataUrl = 'data:image/png;base64,SGVsbG8=';

  const blob = dataUrlToBlob(pngDataUrl);
  assert(blob instanceof Blob, 'dataUrlToBlob returns a Blob instance');
  assertEqual(blob.type, 'image/png', 'Blob has correct MIME type (image/png)');
  assert(blob.size > 0, 'Blob has non-zero size');
  assertEqual(blob.size, 5, 'Blob size matches decoded content length (5 bytes for "Hello")');

  // Test with JPEG data URL
  const jpegDataUrl = 'data:image/jpeg;base64,AQID';
  const jpegBlob = dataUrlToBlob(jpegDataUrl);
  assertEqual(jpegBlob.type, 'image/jpeg', 'JPEG blob has correct MIME type');
  assert(jpegBlob.size > 0, 'JPEG blob has non-zero size');

  // Test with text data URL
  const textDataUrl = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';
  const textBlob = dataUrlToBlob(textDataUrl);
  assertEqual(textBlob.type, 'text/plain', 'Text blob has correct MIME type');
  assertEqual(textBlob.size, 11, 'Text blob size matches "Hello World" (11 bytes)');
});

// ============================================================================
// 6. Version comparison: isNewerVersion()
// ============================================================================
describe('isNewerVersion()', () => {
  // Basic comparisons
  assertEqual(isNewerVersion('1.1.0', '1.0.0'), true, '1.1.0 > 1.0.0');
  assertEqual(isNewerVersion('1.0.0', '1.0.0'), false, '1.0.0 == 1.0.0 (not newer)');
  assertEqual(isNewerVersion('1.0.0', '1.1.0'), false, '1.0.0 < 1.1.0 (not newer)');
  assertEqual(isNewerVersion('2.0.0', '1.9.9'), true, '2.0.0 > 1.9.9');

  // Patch version differences
  assertEqual(isNewerVersion('1.0.1', '1.0.0'), true, '1.0.1 > 1.0.0');
  assertEqual(isNewerVersion('1.0.0', '1.0.1'), false, '1.0.0 < 1.0.1 (not newer)');

  // Major version jump
  assertEqual(isNewerVersion('3.0.0', '2.99.99'), true, '3.0.0 > 2.99.99');
  assertEqual(isNewerVersion('10.0.0', '9.9.9'), true, '10.0.0 > 9.9.9');

  // Edge cases with short version strings
  assertEqual(isNewerVersion('1.1', '1.0'), true, '1.1 > 1.0 (missing patch)');
  assertEqual(isNewerVersion('1.0', '1.0'), false, '1.0 == 1.0 (missing patch, not newer)');
});

// ============================================================================
// 7. Content helpers: getXPath() with mock DOM
// ============================================================================
describe('getXPath()', () => {
  // Mock DOM element factory
  function mockElement(tagName, opts = {}) {
    return {
      nodeType: 1, // Node.ELEMENT_NODE
      tagName: tagName.toUpperCase(),
      id: opts.id || '',
      previousElementSibling: opts.previousElementSibling || null,
      parentElement: opts.parentElement || null,
    };
  }

  // Test: element with ID
  const elWithId = mockElement('div', { id: 'main-content' });
  assertEqual(getXPath(elWithId), '//*[@id="main-content"]', 'Element with ID returns ID-based XPath');

  // Test: simple element without ID at root
  const htmlEl = mockElement('html', { id: '', parentElement: null });
  const bodyEl = mockElement('body', { parentElement: htmlEl });
  const divEl = mockElement('div', { parentElement: bodyEl });

  assertEqual(getXPath(htmlEl), '/html[1]', 'Root html element returns /html[1]');

  // Test: nested element (body > div)
  assertEqual(getXPath(divEl), '/html[1]/body[1]/div[1]', 'Nested div returns full path');

  // Test: element with siblings of same tag
  const sibling1 = mockElement('div', { parentElement: bodyEl });
  const sibling2 = mockElement('div', {
    parentElement: bodyEl,
    previousElementSibling: sibling1,
  });
  sibling1.tagName = 'DIV';
  assertEqual(getXPath(sibling2), '/html[1]/body[1]/div[2]', 'Second sibling div returns index [2]');

  // Test: element with siblings of different tags (should still be index 1)
  const spanSibling = mockElement('span', { parentElement: bodyEl });
  const afterSpan = mockElement('div', {
    parentElement: bodyEl,
    previousElementSibling: spanSibling,
  });
  assertEqual(getXPath(afterSpan), '/html[1]/body[1]/div[1]', 'Div after span sibling is still div[1]');
});

// ============================================================================
// 8. Content helpers: getCssSelector() with mock DOM
// ============================================================================
describe('getCssSelector()', () => {
  // Mock DOM element factory with body marker
  function mockElement(tagName, opts = {}) {
    const el = {
      nodeType: 1,
      tagName: tagName.toUpperCase(),
      id: opts.id || '',
      className: opts.className || '',
      parentElement: opts.parentElement || null,
      children: opts.children || [],
      _mockBody: opts._mockBody || null,
    };
    return el;
  }

  // Test: element with ID returns #id shortcut
  const elWithId = mockElement('div', { id: 'sidebar' });
  assertEqual(getCssSelector(elWithId), '#sidebar', 'Element with ID returns #id');

  // Test: element with classes
  const bodyEl = mockElement('body');
  bodyEl._mockBody = bodyEl; // mark as body
  const divWithClass = mockElement('div', {
    className: 'card primary',
    parentElement: bodyEl,
    _mockBody: bodyEl,
  });
  bodyEl.children = [divWithClass];
  const result = getCssSelector(divWithClass);
  assertEqual(result, 'div.card.primary', 'Element with classes returns tag.class1.class2');

  // Test: parent with ID stops traversal
  const parentWithId = mockElement('section', { id: 'content', _mockBody: bodyEl });
  parentWithId._mockBody = bodyEl;
  const child = mockElement('p', {
    parentElement: parentWithId,
    _mockBody: bodyEl,
  });
  parentWithId.children = [child];
  const selectorWithParentId = getCssSelector(child);
  assertEqual(selectorWithParentId, '#content > p', 'Child of #id parent produces #id > tag');

  // Test: multiple siblings of same type get nth-of-type
  const container = mockElement('ul', { parentElement: bodyEl, _mockBody: bodyEl });
  container._mockBody = bodyEl;
  const li1 = mockElement('li', { parentElement: container, _mockBody: bodyEl });
  const li2 = mockElement('li', { parentElement: container, _mockBody: bodyEl });
  container.children = [li1, li2];
  bodyEl.children = [container];

  const selectorLi2 = getCssSelector(li2);
  assert(selectorLi2.includes(':nth-of-type(2)'), 'Second li gets :nth-of-type(2) selector');
});

// ============================================================================
// 9. Content helpers: detectFramework() with mock window/document
// ============================================================================
describe('detectFramework()', () => {
  // Test: no framework detected
  let result = detectFramework({}, { querySelector: () => null });
  assertEqual(result.name, 'Unknown', 'No framework: name is Unknown');
  assertEqual(result.version, '', 'No framework: version is empty');

  // Test: React detected via devtools hook
  result = detectFramework(
    { __REACT_DEVTOOLS_GLOBAL_HOOK__: {}, React: { version: '18.2.0' } },
    { querySelector: () => null }
  );
  assertEqual(result.name, 'React', 'React detected via devtools hook');
  assertEqual(result.version, '18.2.0', 'React version extracted from window.React');

  // Test: Vue detected via __VUE__
  result = detectFramework(
    { __VUE__: true, Vue: { version: '3.4.0' } },
    { querySelector: () => null }
  );
  assertEqual(result.name, 'Vue', 'Vue detected via __VUE__');
  assertEqual(result.version, '3.4.0', 'Vue version extracted from window.Vue');

  // Test: Angular detected via ng-version attribute
  result = detectFramework(
    {},
    {
      querySelector: (sel) => {
        if (sel === '[ng-version]') return { getAttribute: (attr) => attr === 'ng-version' ? '17.0.0' : null };
        return null;
      }
    }
  );
  assertEqual(result.name, 'Angular', 'Angular detected via ng-version attribute');
  assertEqual(result.version, '17.0.0', 'Angular version extracted from attribute');

  // Test: Angular detected via window.ng
  result = detectFramework(
    { ng: { getComponent: () => {} } },
    {
      querySelector: (sel) => {
        if (sel === '[ng-version]') return { getAttribute: (attr) => attr === 'ng-version' ? '16.2.0' : null };
        return null;
      }
    }
  );
  assertEqual(result.name, 'Angular', 'Angular detected via window.ng');
  assertEqual(result.version, '16.2.0', 'Angular version from attribute when window.ng present');

  // Test: jQuery detection (additive, alongside other frameworks)
  result = detectFramework(
    { jQuery: { fn: { jquery: '3.7.1' } } },
    { querySelector: () => null }
  );
  assertEqual(result.jquery, '3.7.1', 'jQuery version detected alongside other frameworks');
  assertEqual(result.name, 'Unknown', 'jQuery alone does not set framework name');

  // Test: React + jQuery combo
  result = detectFramework(
    {
      __REACT_DEVTOOLS_GLOBAL_HOOK__: {},
      React: { version: '18.2.0' },
      jQuery: { fn: { jquery: '3.6.0' } }
    },
    { querySelector: () => null }
  );
  assertEqual(result.name, 'React', 'React + jQuery: framework name is React');
  assertEqual(result.jquery, '3.6.0', 'React + jQuery: jQuery version also captured');
});

// ============================================================================
// 10. Integration helpers: createDefaultProfile / createEmptyProfile
// ============================================================================
describe('createDefaultProfile()', () => {
  const p = createDefaultProfile();
  assertEqual(p.id, 'default', 'Default profile id is "default"');
  assertEqual(p.name, 'Default', 'Default profile name is "Default"');
  assertEqual(p.urlPattern, '', 'Default profile has empty URL pattern');
  assert(p.integrations.slack !== undefined, 'Default profile has Slack integration');
  assert(p.integrations.azureDevOps !== undefined, 'Default profile has Azure DevOps integration');
  assert(p.integrations.email !== undefined, 'Default profile has Email integration');
  assert(p.integrations.github !== undefined, 'Default profile has GitHub integration');
  assertEqual(p.integrations.slack.enabled, false, 'Slack is disabled by default');
  assertEqual(p.integrations.azureDevOps.enabled, false, 'Azure DevOps is disabled by default');
});

describe('createEmptyProfile()', () => {
  const p = createEmptyProfile('prof-123', 'Client A', '*.example.com');
  assertEqual(p.id, 'prof-123', 'Custom profile has correct id');
  assertEqual(p.name, 'Client A', 'Custom profile has correct name');
  assertEqual(p.urlPattern, '*.example.com', 'Custom profile has correct URL pattern');
  assertEqual(p.integrations.slack.enabled, false, 'Custom profile Slack is disabled');

  const p2 = createEmptyProfile('x', 'Y');
  assertEqual(p2.urlPattern, '', 'URL pattern defaults to empty string');
});

// ============================================================================
// 11. Integration helpers: migrateOldFormat
// ============================================================================
describe('migrateOldFormat()', () => {
  // Already new format — returned as-is
  const newFormat = { activeProfile: 'default', profiles: [{ id: 'default' }] };
  const result1 = migrateOldFormat(newFormat);
  assertEqual(result1, newFormat, 'New format returned as-is (same reference)');

  // Old flat format
  const oldFormat = { slack: { enabled: true, botToken: 'xoxb-123', channelId: 'C123' } };
  const result2 = migrateOldFormat(oldFormat);
  assertEqual(result2.activeProfile, 'default', 'Migrated: activeProfile is "default"');
  assertEqual(result2.profiles.length, 1, 'Migrated: one profile');
  assertEqual(result2.profiles[0].id, 'default', 'Migrated: profile id is "default"');
  assertEqual(result2.profiles[0].integrations.slack.enabled, true, 'Migrated: Slack enabled preserved');
  assertEqual(result2.profiles[0].integrations.slack.botToken, 'xoxb-123', 'Migrated: Slack botToken preserved');
  assertEqual(result2.profiles[0].integrations.azureDevOps.enabled, false, 'Migrated: AzDO defaults applied');

  // Null/undefined input
  const result3 = migrateOldFormat(null);
  assertEqual(result3.profiles.length, 1, 'Null input: one default profile created');
  assertEqual(result3.profiles[0].integrations.slack.enabled, false, 'Null input: Slack disabled');

  const result4 = migrateOldFormat(undefined);
  assertEqual(result4.profiles.length, 1, 'Undefined input: one default profile created');
});

// ============================================================================
// 12. Integration helpers: matchUrlPattern
// ============================================================================
describe('matchUrlPattern()', () => {
  // Basic wildcards
  assertEqual(matchUrlPattern('https://app.example.com/page', '*example*'), true, 'Wildcard *example* matches example.com URL');
  assertEqual(matchUrlPattern('https://app.other.com/page', '*example*'), false, 'Wildcard *example* does not match other.com URL');
  assertEqual(matchUrlPattern('https://app.example.com/page', '*.example.com*'), true, 'Pattern *.example.com* matches subdomain');

  // Case insensitive
  assertEqual(matchUrlPattern('https://APP.EXAMPLE.COM', '*example*'), true, 'Matching is case-insensitive');

  // Empty pattern
  assertEqual(matchUrlPattern('https://anything.com', ''), false, 'Empty pattern never matches');
  assertEqual(matchUrlPattern('https://anything.com', null), false, 'Null pattern never matches');

  // Exact domain
  assertEqual(matchUrlPattern('https://staging.client-a.io/dashboard', '*client-a*'), true, 'Pattern *client-a* matches staging URL');
  assertEqual(matchUrlPattern('https://staging.client-b.io/dashboard', '*client-a*'), false, 'Pattern *client-a* does not match client-b');

  // Special regex chars in URL — pattern should escape them
  assertEqual(matchUrlPattern('https://app.test.io', '*test.io*'), true, 'Dot in pattern is literal');
  assertEqual(matchUrlPattern('https://app.testXio.com', '*test.io*'), false, 'Dot in pattern does not match arbitrary char');
});

// ============================================================================
// 13. Integration helpers: getProfileForUrl / getProfileById
// ============================================================================
describe('getProfileForUrl() / getProfileById()', () => {
  const profiles = [
    { id: 'default', name: 'Default', urlPattern: '', integrations: {} },
    { id: 'p1', name: 'Client A', urlPattern: '*client-a*', integrations: {} },
    { id: 'p2', name: 'Client B', urlPattern: '*client-b.io*', integrations: {} }
  ];

  // URL matching
  let result = getProfileForUrl(profiles, 'https://app.client-a.com/page');
  assertEqual(result.id, 'p1', 'URL matching client-a returns Client A profile');

  result = getProfileForUrl(profiles, 'https://client-b.io/dashboard');
  assertEqual(result.id, 'p2', 'URL matching client-b.io returns Client B profile');

  // Fallback to default
  result = getProfileForUrl(profiles, 'https://unknown-site.com');
  assertEqual(result.id, 'default', 'Unmatched URL falls back to default profile');

  // getProfileById
  assertEqual(getProfileById(profiles, 'p1').name, 'Client A', 'getProfileById finds Client A');
  assertEqual(getProfileById(profiles, 'p2').name, 'Client B', 'getProfileById finds Client B');
  assertEqual(getProfileById(profiles, 'nonexistent'), null, 'getProfileById returns null for unknown id');
  assertEqual(getProfileById(profiles, 'default').name, 'Default', 'getProfileById finds default');

  // No default profile — falls back to first
  const noDefault = [
    { id: 'p1', name: 'Only', urlPattern: '*special*', integrations: {} }
  ];
  result = getProfileForUrl(noDefault, 'https://other.com');
  assertEqual(result.id, 'p1', 'No default profile: falls back to first profile');
});

// ============================================================================
// 14. Integration helpers: getAzureDevOpsType (category mapping)
// ============================================================================
describe('getAzureDevOpsType()', () => {
  // Auto mode (empty or "Auto")
  assertEqual(getAzureDevOpsType('bug', 'Auto'), 'Bug', 'Auto + bug → Bug');
  assertEqual(getAzureDevOpsType('feature', 'Auto'), 'User Story', 'Auto + feature → User Story');
  assertEqual(getAzureDevOpsType('question', 'Auto'), 'Task', 'Auto + question → Task');
  assertEqual(getAzureDevOpsType('other', 'Auto'), 'Task', 'Auto + other → Task');
  assertEqual(getAzureDevOpsType('bug', ''), 'Bug', 'Empty config + bug → Bug');
  assertEqual(getAzureDevOpsType('bug', null), 'Bug', 'Null config + bug → Bug');
  assertEqual(getAzureDevOpsType('bug', undefined), 'Bug', 'Undefined config + bug → Bug');

  // Unknown category in Auto mode
  assertEqual(getAzureDevOpsType('unknown_cat', 'Auto'), 'Bug', 'Auto + unknown category → fallback Bug');

  // Fixed type override
  assertEqual(getAzureDevOpsType('bug', 'Epic'), 'Epic', 'Fixed Epic overrides bug category');
  assertEqual(getAzureDevOpsType('feature', 'Task'), 'Task', 'Fixed Task overrides feature category');
  assertEqual(getAzureDevOpsType('question', 'User Story'), 'User Story', 'Fixed User Story overrides question');
});

// ============================================================================
// 15. Integration helpers: getGitHubLabels
// ============================================================================
describe('getGitHubLabels()', () => {
  // Bug category
  assertDeepEqual(getGitHubLabels('bug', 'low'), ['bug'], 'Bug + low → ["bug"]');
  assertDeepEqual(getGitHubLabels('bug', 'medium'), ['bug'], 'Bug + medium → ["bug"]');
  assertDeepEqual(getGitHubLabels('bug', 'high'), ['bug', 'priority: high'], 'Bug + high → includes priority: high');
  assertDeepEqual(getGitHubLabels('bug', 'critical'), ['bug', 'priority: high', 'critical'], 'Bug + critical → includes priority: high + critical');

  // Feature category
  assertDeepEqual(getGitHubLabels('feature', 'low'), ['enhancement'], 'Feature + low → ["enhancement"]');
  assertDeepEqual(getGitHubLabels('feature', 'critical'), ['enhancement', 'priority: high', 'critical'], 'Feature + critical → all labels');

  // Question category
  assertDeepEqual(getGitHubLabels('question', 'medium'), ['question'], 'Question + medium → ["question"]');

  // Other category
  assertDeepEqual(getGitHubLabels('other', 'low'), [], 'Other + low → empty labels');

  // Unknown category
  assertDeepEqual(getGitHubLabels('xyz', 'low'), [], 'Unknown category → empty labels');
  assertDeepEqual(getGitHubLabels('xyz', 'critical'), ['priority: high', 'critical'], 'Unknown category + critical → priority labels only');
});

// ============================================================================
// 16. Integration helpers: getSlackCategoryLabel
// ============================================================================
describe('getSlackCategoryLabel()', () => {
  assertEqual(getSlackCategoryLabel('bug'), ':beetle: Bug', 'Bug → :beetle: Bug');
  assertEqual(getSlackCategoryLabel('feature'), ':bulb: Feature Request', 'Feature → :bulb: Feature Request');
  assertEqual(getSlackCategoryLabel('question'), ':question: Question', 'Question → :question: Question');
  assertEqual(getSlackCategoryLabel('other'), ':memo: Other', 'Other → :memo: Other');
  assertEqual(getSlackCategoryLabel('unknown'), 'unknown', 'Unknown category → category name as-is');
});

// ============================================================================
// 17. Integration helpers: getPlatformIcon
// ============================================================================
describe('getPlatformIcon()', () => {
  assert(getPlatformIcon('Slack').length > 0, 'Slack icon is non-empty');
  assert(getPlatformIcon('Azure DevOps').length > 0, 'Azure DevOps icon is non-empty');
  assert(getPlatformIcon('Email').length > 0, 'Email icon is non-empty');
  assert(getPlatformIcon('GitHub').length > 0, 'GitHub icon is non-empty');
  assertEqual(getPlatformIcon('Unknown Platform'), '\u2699\uFE0F', 'Unknown platform → gear icon fallback');
});

// ============================================================================
// 18. Integration helpers: markdownToHtml
// ============================================================================
describe('markdownToHtml()', () => {
  // Headers
  assert(markdownToHtml('# Title').includes('<h1>Title</h1>'), 'H1 converted');
  assert(markdownToHtml('## Subtitle').includes('<h2>Subtitle</h2>'), 'H2 converted');
  assert(markdownToHtml('### Sub-sub').includes('<h3>Sub-sub</h3>'), 'H3 converted');

  // Bold
  assert(markdownToHtml('**bold text**').includes('<strong>bold text</strong>'), 'Bold converted');

  // Inline code
  assert(markdownToHtml('use `code` here').includes('<code'), 'Inline code converted');
  assert(markdownToHtml('use `code` here').includes('code'), 'Inline code content preserved');

  // Code blocks
  assert(markdownToHtml('```\nvar x = 1;\n```').includes('<pre'), 'Code block converted to <pre>');

  // Lists
  assert(markdownToHtml('- item one').includes('<li>item one</li>'), 'List item converted');

  // Blockquotes
  assert(markdownToHtml('> quoted text').includes('<blockquote'), 'Blockquote converted');
  assert(markdownToHtml('> quoted text').includes('quoted text'), 'Blockquote content preserved');

  // Images
  const imgResult = markdownToHtml('![alt text](https://example.com/img.png)');
  assert(imgResult.includes('<img'), 'Image tag created');
  assert(imgResult.includes('src="https://example.com/img.png"'), 'Image src preserved');
  assert(imgResult.includes('alt="alt text"'), 'Image alt preserved');

  // Data URL images (the AzDO fix scenario)
  const dataUrlImg = markdownToHtml('![screenshot](data:image/png;base64,abc123)');
  assert(dataUrlImg.includes('src="data:image/png;base64,abc123"'), 'Data URL image src preserved');

  // Newlines → <br>
  assert(markdownToHtml('line1\nline2').includes('<br>'), 'Newlines become <br>');
});

// ============================================================================
// 19. Integration helpers: buildConsoleMd
// ============================================================================
describe('buildConsoleMd()', () => {
  // No steps → null
  assertEqual(buildConsoleMd({}), null, 'No steps → null');
  assertEqual(buildConsoleMd({ steps: [] }), null, 'Empty steps → null');

  // Steps with no console logs → null
  assertEqual(buildConsoleMd({ steps: [{ consoleLogs: null }, { consoleLogs: [] }] }), null, 'Steps without console logs → null');

  // Steps with console logs
  const result = buildConsoleMd({
    steps: [{
      description: 'Click button',
      consoleLogs: [
        { level: 'log', timestamp: '2024-01-01T10:00:00.000Z', message: 'Button clicked' },
        { level: 'error', timestamp: '2024-01-01T10:00:01.000Z', message: 'TypeError: undefined', stack: 'Error\n  at x\n  at y\n  at z\n  at w' }
      ]
    }]
  });
  assert(result !== null, 'Console MD generated for steps with logs');
  assert(result.includes('# Console Logs'), 'Has Console Logs heading');
  assert(result.includes('Click button'), 'Includes step description');
  assert(result.includes('2 log(s), 1 error(s)'), 'Includes log count summary');
  assert(result.includes('```'), 'Includes code fence');
  assert(result.includes('[LOG]'), 'Includes LOG level');
  assert(result.includes('[ERROR]'), 'Includes ERROR level');
  assert(result.includes('Button clicked'), 'Includes log message');
  assert(result.includes('TypeError: undefined'), 'Includes error message');

  // Multiple steps
  const multi = buildConsoleMd({
    steps: [
      { description: 'Step A', consoleLogs: [{ level: 'log', timestamp: '2024-01-01T10:00:00.000Z', message: 'A' }] },
      { description: 'Step B', consoleLogs: [{ level: 'warn', timestamp: '2024-01-01T10:00:01.000Z', message: 'B' }] }
    ]
  });
  assert(multi.includes('Step 1:'), 'Multi-step: has Step 1');
  assert(multi.includes('Step 2:'), 'Multi-step: has Step 2');
  assert(multi.includes('Step A'), 'Multi-step: has Step A description');
  assert(multi.includes('Step B'), 'Multi-step: has Step B description');
});

// ============================================================================
// 20. Integration helpers: buildNetworkMd
// ============================================================================
describe('buildNetworkMd()', () => {
  // No data → null
  assertEqual(buildNetworkMd({}), null, 'No steps → null');
  assertEqual(buildNetworkMd({ steps: [{ networkLogs: null }] }), null, 'Null network logs → null');
  assertEqual(buildNetworkMd({ steps: [{ networkLogs: [] }] }), null, 'Empty network logs → null');

  // Normal requests
  const result = buildNetworkMd({
    steps: [{
      description: 'Load page',
      networkLogs: [
        { method: 'GET', status: 200, url: 'https://api.example.com/data', duration: 150 },
        { method: 'POST', status: 500, url: 'https://api.example.com/save', duration: 2000, responseBody: 'Internal Server Error' }
      ]
    }]
  });
  assert(result !== null, 'Network MD generated');
  assert(result.includes('# Network Requests'), 'Has heading');
  assert(result.includes('2 request(s), 1 failed'), 'Correct request/fail count');
  assert(result.includes('| Method | Status | URL | Duration |'), 'Has table header');
  assert(result.includes('| GET | 200 |'), 'Successful request status not bolded');
  assert(result.includes('**500**'), 'Failed request status is bolded');
  assert(result.includes('> Response: Internal Server Error'), 'Failed request includes response body');

  // Zero-status (network error)
  const errResult = buildNetworkMd({
    steps: [{
      description: 'Offline',
      networkLogs: [
        { method: 'GET', status: 0, url: 'https://api.example.com/health', duration: 0 }
      ]
    }]
  });
  assert(errResult.includes('**ERR**'), 'Zero status shows ERR');
  assert(errResult.includes('1 failed'), 'Zero status counted as failure');
});

// ============================================================================
// 21. Integration helpers: buildEnvironmentMd
// ============================================================================
describe('buildEnvironmentMd()', () => {
  // No data → null
  assertEqual(buildEnvironmentMd({}), null, 'No environment or UA → null');
  assertEqual(buildEnvironmentMd({ url: 'https://x.com' }), null, 'URL alone without env/UA → null');

  // With environment
  const result = buildEnvironmentMd({
    url: 'https://app.example.com',
    title: 'My App',
    date: '2024-01-01T00:00:00Z',
    environment: { os: 'macOS', browser: 'Chrome 120', resolution: '1920x1080' },
    userAgent: 'Mozilla/5.0 Chrome/120'
  });
  assert(result.includes('# Environment'), 'Has heading');
  assert(result.includes('https://app.example.com'), 'Has URL');
  assert(result.includes('My App'), 'Has title');
  assert(result.includes('| OS | macOS |'), 'Has OS in table');
  assert(result.includes('| Browser | Chrome 120 |'), 'Has browser in table');
  assert(result.includes('Mozilla/5.0 Chrome/120'), 'Has user agent');

  // With UA only
  const uaOnly = buildEnvironmentMd({ userAgent: 'CustomBot/1.0' });
  assert(uaOnly !== null, 'UA only → not null');
  assert(uaOnly.includes('CustomBot/1.0'), 'UA content present');
});

// ============================================================================
// 22. AzDO fix verification: image attachment filtering
// ============================================================================
describe('AzDO image attachment filtering (fix #1)', () => {
  // Simulate the fixed logic: only image attachments should be used for data:image replacement
  const attachmentUrls = [
    { url: 'https://azdo/report.md', name: 'report.md', type: 'md' },
    { url: 'https://azdo/console.md', name: 'console.md', type: 'md' },
    { url: 'https://azdo/screenshot1.png', name: 'screenshot1.png', type: 'image' },
    { url: 'https://azdo/screenshot2.png', name: 'screenshot2.png', type: 'image' }
  ];

  var imageAttachments = attachmentUrls.filter(function (a) { return a.type === 'image'; });
  assertEqual(imageAttachments.length, 2, 'Filter: only 2 image attachments');
  assertEqual(imageAttachments[0].name, 'screenshot1.png', 'First image is screenshot1');
  assertEqual(imageAttachments[1].name, 'screenshot2.png', 'Second image is screenshot2');

  // Simulate HTML replacement with ONLY images
  var html = '<img src="data:image/png;base64,aaa"> <img src="data:image/jpeg;base64,bbb">';
  for (var ai = 0; ai < imageAttachments.length; ai++) {
    html = html.replace(/src="data:image\/[^"]+"/,
      'src="' + imageAttachments[ai].url + '" alt="' + imageAttachments[ai].name + '"');
  }
  assert(html.includes('src="https://azdo/screenshot1.png"'), 'First image replaced with screenshot1 URL');
  assert(html.includes('src="https://azdo/screenshot2.png"'), 'Second image replaced with screenshot2 URL');
  assert(!html.includes('report.md'), 'No .md URLs in image tags');
  assert(!html.includes('data:image'), 'No data URLs remaining');
});

// ============================================================================
// 23. parseUserAgent: mobile OS detection (fix #12)
// ============================================================================
describe('parseUserAgent() mobile OS detection (fix #12)', () => {
  const androidChrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';
  const iosSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1';
  const ipadSafari = 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1';
  const androidFirefox = 'Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0';
  const linuxDesktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

  assertEqual(parseUserAgent(androidChrome).os, 'Android', 'Android Chrome → Android (not Linux)');
  assertEqual(parseUserAgent(iosSafari).os, 'iOS', 'iOS Safari → iOS (not macOS)');
  assertEqual(parseUserAgent(ipadSafari).os, 'iOS', 'iPad Safari → iOS (not macOS)');
  assertEqual(parseUserAgent(androidFirefox).os, 'Android', 'Android Firefox → Android');
  assertEqual(parseUserAgent(linuxDesktop).os, 'Linux', 'Linux desktop → Linux (no Android string)');
});

// ============================================================================
// Summary
// ============================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
  console.log('\nSome tests FAILED.');
} else {
  console.log('\nAll tests PASSED.');
}
process.exit(failed > 0 ? 1 : 0);
