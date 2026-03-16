/**
 * Content Script - messaging hub
 */
(() => {
  let currentOverlay = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'analyze') {
      try {
        const data = analyzeDom();
        sendResponse({ data });
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return false; // sync
    }

    if (message.action === 'showGuide') {
      try {
        if (!message.steps || message.steps.length === 0) {
          sendResponse({ error: 'ガイドのステップが見つかりませんでした' });
          return false;
        }
        if (currentOverlay) {
          currentOverlay.destroy();
        }
        currentOverlay = new VisualGuideOverlay();
        currentOverlay.show(message.steps);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return false;
    }

    if (message.action === 'clearGuide') {
      if (currentOverlay) {
        currentOverlay.destroy();
        currentOverlay = null;
      }
      sendResponse({ ok: true });
      return false;
    }
  });

  // Watch for DOM mutations while overlay is active
  const observer = new MutationObserver(() => {
    if (currentOverlay) {
      currentOverlay.recalculatePositions();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
})();
