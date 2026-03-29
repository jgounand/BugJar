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
for (let i = startIdx + startMarker.length - 1; i < i18nSource.length; i++) {
  if (i18nSource[i] === '{') depth++;
  else if (i18nSource[i] === '}') {
    depth--;
    if (depth === 0) { endIdx = i + 1; break; }
  }
}
const objectText = i18nSource.substring(startIdx + startMarker.length - 1, endIdx);

// Parse the JS object literal into JSON:
// - Remove single-line comments
// - Convert single-quoted strings to double-quoted (protecting escaped singles)
// - Remove trailing commas before } or ]
let jsonText = objectText
  .replace(/\/\/.*$/gm, '')                    // remove // comments
  .replace(/\\'/g, '\u0000ESCAPED_SQUOTE')     // protect escaped single quotes
  .replace(/'/g, '"')                           // single -> double quotes
  .replace(/\u0000ESCAPED_SQUOTE/g, "'")       // restore as unescaped ' (valid inside double-quoted JSON strings)
  .replace(/,(\s*[}\]])/g, '$1')               // remove trailing commas
  .replace(/(\s*)(\w+)(\s*:)/gm, '$1"$2"$3'); // quote unquoted property keys

let TRANSLATIONS;
try {
  TRANSLATIONS = JSON.parse(jsonText);
} catch (e) {
  console.error('Failed to parse TRANSLATIONS from i18n.js:', e.message);
  // Show context around the error
  console.error('First 200 chars of jsonText:', jsonText.substring(0, 200));
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
  // NOTE: the source code checks 'Linux' before 'Android', so Android UAs
  // (which contain "Linux; Android") match 'Linux' first. This is a known
  // limitation of parseUserAgent() that could be improved.
  result = parseUserAgent(androidUA);
  assertEqual(result.os, 'Linux', 'Android UA: OS matches "Linux" (Linux checked before Android in source)');
  assertEqual(result.browser, 'Chrome 120.0.0.0', 'Android UA: browser is Chrome 120.0.0.0');

  // Safari on iOS
  // NOTE: iOS UAs contain "like Mac OS X", so the source code matches macOS
  // before reaching the iPhone/iPad check. This is a known limitation.
  result = parseUserAgent(iosUA);
  assertEqual(result.os, 'macOS', 'iOS UA: OS matches "macOS" (Mac OS X checked before iPhone in source)');
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

  // Test: multiple siblings of same type get nth-child
  const container = mockElement('ul', { parentElement: bodyEl, _mockBody: bodyEl });
  container._mockBody = bodyEl;
  const li1 = mockElement('li', { parentElement: container, _mockBody: bodyEl });
  const li2 = mockElement('li', { parentElement: container, _mockBody: bodyEl });
  container.children = [li1, li2];
  bodyEl.children = [container];

  const selectorLi2 = getCssSelector(li2);
  assert(selectorLi2.includes(':nth-child(2)'), 'Second li gets :nth-child(2) selector');
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
