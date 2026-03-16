// Import Gemini API utility
importScripts('../utils/gemini-api.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureScreen') {
    handleCaptureScreen(sendResponse);
    return true; // async
  }

  if (message.action === 'callGemini') {
    handleCallGemini(message.data, sendResponse);
    return true; // async
  }
});

async function handleCaptureScreen(sendResponse) {
  try {
    // Capture the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 70 });

    // Strip data URI prefix (data:image/jpeg;base64,)
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    sendResponse({ data: base64 });
  } catch (err) {
    sendResponse({ error: `スクリーンショットの取得に失敗しました: ${err.message}` });
  }
}

async function handleCallGemini(data, sendResponse) {
  try {
    const { apiKey, userQuestion, screenshotBase64, domInfo } = data;
    const result = await callGemini(apiKey, userQuestion, screenshotBase64, domInfo);
    sendResponse({ data: result });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}
