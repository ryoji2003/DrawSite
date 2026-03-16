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

  const results = [];
  for (const element of allElements) {
    if (results.length >= 200) break;

    if (!isElementVisible(element)) continue;

    const rect = element.getBoundingClientRect();
    results.push({
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      classes: [...element.classList].slice(0, 5),
      text: element.textContent.trim().substring(0, 100),
      ariaLabel: element.getAttribute('aria-label') || undefined,
      role: element.getAttribute('role') || undefined,
      type: element.getAttribute('type') || undefined,
      href: element.getAttribute('href')?.substring(0, 100) || undefined,
      selector: generateUniqueSelector(element),
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      isVisible: true,
      placeholder: element.getAttribute('placeholder') || undefined
    });
  }

  return {
    url: location.href,
    title: document.title,
    elements: results,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };
}

function isElementVisible(element) {
  if (element.offsetParent === null && element.tagName !== 'BODY') {
    // Fixed/sticky elements may have null offsetParent, check differently
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

  // Build path from ancestors
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

    // Add nth-of-type to disambiguate siblings
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

  // Validate uniqueness
  try {
    if (document.querySelectorAll(selector).length === 1) return selector;
  } catch { /* ignore */ }

  // Fallback: use a best-effort selector
  return selector || element.tagName.toLowerCase();
}
