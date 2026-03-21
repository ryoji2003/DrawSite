importScripts('../utils/gemini-api.js');
importScripts('./session.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureScreen') {
    handleCaptureScreen(sendResponse);
    return true;
  }

  if (message.action === 'startSession') {
    handleStartSession(message.data, sendResponse);
    return true;
  }

  if (message.action === 'nextStep') {
    handleNextStep(message.data, sendResponse);
    return true;
  }

  if (message.action === 'getSession') {
    handleGetSession(sendResponse);
    return true;
  }

  if (message.action === 'endSession') {
    handleEndSession(sendResponse);
    return true;
  }

  if (message.action === 'suggestURL') {
    handleSuggestURL(message.data, sendResponse);
    return true;
  }

  if (message.action === 'savePendingSession') {
    handleSavePendingSession(message.data, sendResponse);
    return true;
  }
});

async function handleCaptureScreen(sendResponse) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 70 });
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    sendResponse({ data: base64 });
  } catch (err) {
    sendResponse({ error: `スクリーンショットの取得に失敗しました: ${err.message}` });
  }
}

async function handleStartSession(data, sendResponse) {
  try {
    const { apiKey, userQuestion, domInfo } = data;
    const session = new GuideSession(userQuestion);
    await saveSession(session);
    const result = await callGeminiFirstStep(apiKey, userQuestion, domInfo);
    sendResponse({ data: { ...result, stepNumber: 1 } });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function handleNextStep(data, sendResponse) {
  try {
    const { apiKey, completedStep, domInfo } = data;
    const session = await loadSession();
    if (!session) {
      sendResponse({ error: 'セッションが見つかりません' });
      return;
    }

    if (completedStep) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      session.addStep(completedStep, tab?.title || '', tab?.url || '');
      await saveSession(session);
    }

    const context = session.buildContext();
    const result = await callGeminiNextStep(apiKey, context, domInfo);
    sendResponse({ data: { ...result, stepNumber: session.history.length + 1 } });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function handleGetSession(sendResponse) {
  try {
    const session = await loadSession();
    sendResponse({ data: session ? session.toJSON() : null });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function handleEndSession(sendResponse) {
  try {
    await chrome.storage.session.remove('guideSession');
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function handleSuggestURL(data, sendResponse) {
  try {
    const { apiKey, question } = data;
    const url = await callGeminiSuggestURL(apiKey, question);
    sendResponse({ data: { url } });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function handleSavePendingSession(data, sendResponse) {
  try {
    await chrome.storage.session.set({ pendingSession: data });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function saveSession(session) {
  await chrome.storage.session.set({ guideSession: session.toJSON() });
}

async function loadSession() {
  const result = await chrome.storage.session.get('guideSession');
  if (!result.guideSession) return null;
  return GuideSession.fromJSON(result.guideSession);
}

// ページ遷移検知
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return; // メインフレームのみ

  // pendingSession チェック（URLを提案してタブを遷移させた場合）
  const pendingResult = await chrome.storage.session.get('pendingSession');
  if (pendingResult.pendingSession) {
    const { apiKey, question } = pendingResult.pendingSession;
    await chrome.storage.session.remove('pendingSession');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        files: ['content/dom-analyzer.js', 'content/overlay.js', 'content/content.js']
      });
    } catch { /* すでに注入済みの場合は無視 */ }
    try {
      const domResponse = await chrome.tabs.sendMessage(details.tabId, { action: 'analyze' });
      if (!domResponse.error) {
        const session = new GuideSession(question);
        await saveSession(session);
        const result = await callGeminiFirstStep(apiKey, question, domResponse.data);
        const { done, step, summary } = result;
        if (done) {
          await chrome.tabs.sendMessage(details.tabId, { action: 'showCompleted', summary });
        } else {
          await chrome.tabs.sendMessage(details.tabId, { action: 'showSingleStep', step, stepNumber: 1 });
        }
      }
    } catch { /* ignore */ }
    return;
  }

  const session = await loadSession();
  if (!session || session.status !== 'active') return;

  const notifyContent = async () => {
    await chrome.tabs.sendMessage(details.tabId, {
      action: 'resumeSession',
      session: session.toJSON()
    });
  };

  try {
    await notifyContent();
  } catch {
    // Content Scriptがまだ読み込まれていない場合は注入する
    try {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        files: ['content/dom-analyzer.js', 'content/overlay.js', 'content/content.js']
      });
      await notifyContent();
    } catch { /* ignore */ }
  }
});

// SPA遷移検知（history.pushState / replaceState）
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const session = await loadSession();
  if (!session || session.status !== 'active') return;

  const notifyContent = async () => {
    await chrome.tabs.sendMessage(details.tabId, {
      action: 'resumeSession',
      session: session.toJSON()
    });
  };

  try {
    await notifyContent();
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        files: ['content/dom-analyzer.js', 'content/overlay.js', 'content/content.js']
      });
      await notifyContent();
    } catch { /* ignore */ }
  }
});
