/**
 * Extracted pure functions from content.js for testing.
 * These are exact copies of the source logic — not modified.
 *
 * Requires a mock DOM environment (provided by the test runner).
 */

function getXPath(element) {
  if (element.id) return `//*[@id="${element.id}"]`;

  const parts = [];
  let current = element;
  while (current && current.nodeType === 1 /* Node.ELEMENT_NODE */) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    const tagName = current.tagName.toLowerCase();
    parts.unshift(`${tagName}[${index}]`);
    current = current.parentElement;
  }
  return '/' + parts.join('/');
}

function getCssSelector(element) {
  if (element.id) return `#${element.id}`;

  const parts = [];
  let current = element;
  while (current && current.nodeType === 1 /* Node.ELEMENT_NODE */ && current !== current._mockBody) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = `#${current.id}`;
      parts.unshift(selector);
      break;
    }
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 3);
      if (classes.length > 0 && classes[0] !== '') {
        selector += '.' + classes.join('.');
      }
    }
    // Add nth-child if needed for uniqueness
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += `:nth-child(${idx})`;
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function detectFramework(mockWindow, mockDocument) {
  const info = { name: 'Unknown', version: '' };

  // Angular
  if (mockWindow.ng && mockWindow.ng.getComponent) {
    info.name = 'Angular';
    const vEl = mockDocument.querySelector('[ng-version]');
    if (vEl) info.version = vEl.getAttribute('ng-version');
  } else if (mockDocument.querySelector('[ng-version]')) {
    info.name = 'Angular';
    info.version = mockDocument.querySelector('[ng-version]').getAttribute('ng-version');
  }
  // React
  else if (mockWindow.__REACT_DEVTOOLS_GLOBAL_HOOK__ || mockDocument.querySelector('[data-reactroot]')) {
    info.name = 'React';
    if (mockWindow.React && mockWindow.React.version) info.version = mockWindow.React.version;
  }
  // Vue
  else if (mockWindow.__VUE__ || mockDocument.querySelector('[data-v-]')) {
    info.name = 'Vue';
    if (mockWindow.Vue && mockWindow.Vue.version) info.version = mockWindow.Vue.version;
  }
  // jQuery
  if (mockWindow.jQuery) {
    info.jquery = mockWindow.jQuery.fn.jquery;
  }

  return info;
}

module.exports = { getXPath, getCssSelector, detectFramework };
