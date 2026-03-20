/**
 * DOM Analyzer - extracts interactive elements from the page
 */

function analyzeDom() {
  const interactiveSelectors = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[onclick]',
    '[tabindex]',
    '.btn',
    '[data-action]'
  ];

  const allElements = new Set();
  for (const selector of interactiveSelectors) {
    try {
      document.querySelectorAll(selector).forEach(el => allElements.add(el));
    } catch {
      // ignore invalid selectors
    }
  }

  const visibleElements = [];
  for (const element of allElements) {
    if (visibleElements.length >= 200) break;
    if (!isElementVisible(element)) continue;
    visibleElements.push(element);
  }

  return {
    url: location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    regions: groupByRegion(visibleElements)
  };
}

function groupByRegion(domElements) {
  const landmarkSelectors = [
    'nav',
    'header',
    'main',
    'aside',
    'footer',
    '[role="navigation"]',
    '[role="main"]',
    '[role="banner"]',
    '[role="complementary"]',
    '[role="contentinfo"]'
  ];

  const landmarks = [];
  for (const sel of landmarkSelectors) {
    try {
      document.querySelectorAll(sel).forEach(el => {
        if (!landmarks.find(l => l.el === el)) {
          const label = el.getAttribute('aria-label') || el.getAttribute('id') || '';
          const tagName = el.tagName.toLowerCase();
          const name = label ? `${tagName} (${label})` : tagName;
          landmarks.push({ el, name });
        }
      });
    } catch { /* ignore */ }
  }

  if (landmarks.length === 0) {
    return [{ area: 'ページ全体', elements: domElements.map(slimElement) }];
  }

  const groups = new Map();
  landmarks.forEach(l => groups.set(l.name, []));
  const other = [];

  for (const el of domElements) {
    let found = false;
    for (const landmark of landmarks) {
      if (landmark.el.contains(el)) {
        groups.get(landmark.name).push(slimElement(el));
        found = true;
        break;
      }
    }
    if (!found) other.push(slimElement(el));
  }

  const regions = [];
  for (const [area, elements] of groups.entries()) {
    if (elements.length > 0) regions.push({ area, elements });
  }
  if (other.length > 0) regions.push({ area: 'その他', elements: other });

  return regions;
}

function slimElement(element) {
  return {
    tag: element.tagName.toLowerCase(),
    text: element.textContent.trim().substring(0, 50) || undefined,
    ariaLabel: element.getAttribute('aria-label') || undefined,
    role: element.getAttribute('role') || undefined,
    selector: generateUniqueSelector(element),
    placeholder: element.getAttribute('placeholder') || undefined
  };
}

function isElementVisible(element) {
  if (element.offsetParent === null && element.tagName !== 'BODY') {
    const style = getComputedStyle(element);
    if (style.position !== 'fixed' && style.position !== 'sticky') {
      return false;
    }
  }

  const style = getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  return true;
}

function generateUniqueSelector(element) {
  // Use ID if available
  if (element.id) {
    const selector = `#${CSS.escape(element.id)}`;
    try {
      if (document.querySelectorAll(selector).length === 1) return selector;
    } catch { /* ignore */ }
  }

  // Try data-testid or data-id attributes
  for (const attr of ['data-testid', 'data-id', 'name']) {
    const val = element.getAttribute(attr);
    if (val) {
      const selector = `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch { /* ignore */ }
    }
  }

  return buildPathSelector(element);
}

function buildPathSelector(element) {
  const parts = [];
  let current = element;

  while (current && current !== document.documentElement && parts.length < 6) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      part = `#${CSS.escape(current.id)}`;
      parts.unshift(part);
      break;
    }

    const siblings = current.parentElement
      ? [...current.parentElement.children].filter(el => el.tagName === current.tagName)
      : [];
    if (siblings.length > 1) {
      const idx = siblings.indexOf(current) + 1;
      part += `:nth-of-type(${idx})`;
    }

    parts.unshift(part);
    current = current.parentElement;
  }

  const selector = parts.join(' > ');

  try {
    if (document.querySelectorAll(selector).length === 1) return selector;
  } catch { /* ignore */ }

  return selector || element.tagName.toLowerCase();
}
