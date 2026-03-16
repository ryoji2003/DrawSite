(() => {
  const questionEl = document.getElementById('question');
  const startBtn = document.getElementById('start-btn');
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error-message');
  const successEl = document.getElementById('success-message');
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsPanel = document.getElementById('settings-panel');
  const apiKeyEl = document.getElementById('api-key');
  const saveSettingsBtn = document.getElementById('save-settings');
  const settingsMsg = document.getElementById('settings-message');

  // Load saved API key
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyEl.value = result.geminiApiKey;
    }
  });

  // Settings toggle
  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });

  // Save settings
  saveSettingsBtn.addEventListener('click', () => {
    const key = apiKeyEl.value.trim();
    if (!key) {
      showSettingsMessage('APIキーを入力してください', 'error');
      return;
    }
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      showSettingsMessage('保存しました', 'success');
      setTimeout(() => settingsMsg.classList.add('hidden'), 2000);
    });
  });

  function showSettingsMessage(text, type) {
    settingsMsg.textContent = text;
    settingsMsg.className = `settings-message ${type}`;
    settingsMsg.classList.remove('hidden');
  }

  // Main action
  startBtn.addEventListener('click', async () => {
    const question = questionEl.value.trim();
    if (!question) {
      showError('質問を入力してください');
      return;
    }

    const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
    if (!geminiApiKey) {
      showError('Gemini APIキーが設定されていません。下部の「API設定」から設定してください。');
      settingsPanel.classList.remove('hidden');
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('アクティブなタブが見つかりません');

      // Check if the tab URL allows content script injection
      const url = tab.url || '';
      if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
          url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('data:')) {
        throw new Error('このページでは使用できません。通常のWebページ（http/https）で使用してください。');
      }

      // Capture screenshot via background
      const screenshotResponse = await chrome.runtime.sendMessage({
        action: 'captureScreen',
        tabId: tab.id
      });
      if (screenshotResponse.error) throw new Error(screenshotResponse.error);
      const screenshotBase64 = screenshotResponse.data;

      // Get DOM info from content script
      let domResponse;
      try {
        domResponse = await chrome.tabs.sendMessage(tab.id, { action: 'analyze' });
      } catch {
        // Content script not injected yet (e.g. tab was open before extension install)
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/dom-analyzer.js', 'content/overlay.js', 'content/content.js']
          });
          domResponse = await chrome.tabs.sendMessage(tab.id, { action: 'analyze' });
        } catch {
          throw new Error('ページとの通信に失敗しました。ページをリロードしてから再試行してください。');
        }
      }
      if (domResponse.error) throw new Error(domResponse.error);

      // Call Gemini via background
      const geminiResponse = await chrome.runtime.sendMessage({
        action: 'callGemini',
        data: {
          apiKey: geminiApiKey,
          userQuestion: question,
          screenshotBase64,
          domInfo: domResponse.data
        }
      });
      if (geminiResponse.error) throw new Error(geminiResponse.error);

      // Send guide data to content script
      const showResponse = await chrome.tabs.sendMessage(tab.id, {
        action: 'showGuide',
        steps: geminiResponse.data.steps
      });
      if (showResponse && showResponse.error) throw new Error(showResponse.error);

      showSuccess();
      // Close popup after short delay
      setTimeout(() => window.close(), 1000);

    } catch (err) {
      showError(err.message || '予期しないエラーが発生しました');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(active) {
    startBtn.disabled = active;
    loadingEl.classList.toggle('hidden', !active);
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    successEl.classList.add('hidden');
  }

  function showSuccess() {
    successEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
  }

  function clearMessages() {
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');
  }
})();
