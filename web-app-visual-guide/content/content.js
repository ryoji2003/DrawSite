/**
 * Content Script - messaging hub
 */
(() => {
  let currentOverlay = null;
  let currentStep = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'analyze') {
      try {
        const data = analyzeDom();
        sendResponse({ data });
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return false;
    }

    if (message.action === 'showSingleStep') {
      try {
        const { step, stepNumber } = message;
        currentStep = step;
        if (currentOverlay) currentOverlay.destroy();
        currentOverlay = new VisualGuideOverlay();
        currentOverlay.showSingle(step, stepNumber);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return false;
    }

    if (message.action === 'showCompleted') {
      try {
        if (currentOverlay) currentOverlay.destroy();
        currentOverlay = new VisualGuideOverlay();
        currentOverlay.showCompleted(message.summary);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return false;
    }

    if (message.action === 'resumeSession') {
      handleResumeSession(message.session, sendResponse);
      return true;
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

  async function handleResumeSession(sessionData, sendResponse) {
    try {
      const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
      if (!geminiApiKey) {
        sendResponse({ error: 'APIキーが設定されていません' });
        return;
      }

      if (currentOverlay) currentOverlay.destroy();
      currentOverlay = new VisualGuideOverlay();
      currentOverlay.showLoading();

      await waitForDOMSettle();

      const domInfo = analyzeDom();
      const response = await chrome.runtime.sendMessage({
        action: 'nextStep',
        data: { apiKey: geminiApiKey, completedStep: currentStep, domInfo }
      });

      if (response.error) {
        currentOverlay.showError(response.error);
        sendResponse({ error: response.error });
        return;
      }

      if (response.data.done) {
        currentOverlay.showCompleted(response.data.summary);
      } else {
        currentStep = response.data.step;
        currentOverlay.showSingle(response.data.step, response.data.stepNumber);
      }

      sendResponse({ ok: true });
    } catch (err) {
      if (currentOverlay) currentOverlay.showError(err.message);
      sendResponse({ error: err.message });
    }
  }

  function waitForDOMSettle(timeout = 2000, quietPeriod = 500) {
    return new Promise((resolve) => {
      let lastMutation = Date.now();
      const observer = new MutationObserver(() => { lastMutation = Date.now(); });
      observer.observe(document.documentElement, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['style', 'class']
      });
      const check = setInterval(() => {
        if (Date.now() - lastMutation > quietPeriod) {
          clearInterval(check);
          observer.disconnect();
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        observer.disconnect();
        resolve();
      }, timeout);
    });
  }

  // × ボタン押下時のハンドラ（guideCloseイベントでセッションを終了）
  window.addEventListener('guideClose', () => {
    currentStep = null;
    currentOverlay = null;
    chrome.runtime.sendMessage({ action: 'endSession' });
  });

  // 「次へ」ボタン押下時のハンドラ（overlay.jsからカスタムイベントで通知される）
  window.addEventListener('guideNextStep', async (e) => {
    const { currentStep: completedStepFromEvent } = e.detail;

    try {
      const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
      if (!geminiApiKey) {
        if (currentOverlay) currentOverlay.showError('APIキーが設定されていません');
        return;
      }

      if (currentOverlay) currentOverlay.showLoading();

      const domInfo = analyzeDom();
      const response = await chrome.runtime.sendMessage({
        action: 'nextStep',
        data: { apiKey: geminiApiKey, completedStep: completedStepFromEvent, domInfo }
      });

      if (response.error) {
        if (currentOverlay) currentOverlay.showError(response.error);
        return;
      }

      if (response.data.done) {
        if (currentOverlay) currentOverlay.showCompleted(response.data.summary);
      } else {
        currentStep = response.data.step;
        if (currentOverlay) currentOverlay.showSingle(response.data.step, response.data.stepNumber);
      }
    } catch (err) {
      if (currentOverlay) currentOverlay.showError(err.message);
    }
  });

  // オーバーレイが表示中にDOMが変化したら位置を再計算
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
