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

  // 保存済みAPIキーを読み込む
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyEl.value = result.geminiApiKey;
    }
  });

  // 設定パネルの開閉
  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });

  // APIキーの保存
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

  // ガイド開始
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
      // アクティブタブを取得
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('アクティブなタブが見つかりません');

      const url = tab.url || '';
      if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
          url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('data:')) {
        throw new Error('このページでは使用できません。通常のWebページ（http/https）で使用してください。');
      }

      // Content ScriptからDOM情報を取得
      let domResponse;
      try {
        domResponse = await chrome.tabs.sendMessage(tab.id, { action: 'analyze' });
      } catch {
        // Content Scriptがまだ注入されていない場合は注入する
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

      // Service WorkerにセッションをstartSession（AI呼び出しも含む）
      const geminiResponse = await chrome.runtime.sendMessage({
        action: 'startSession',
        data: {
          apiKey: geminiApiKey,
          userQuestion: question,
          domInfo: domResponse.data
        }
      });
      if (geminiResponse.error) throw new Error(geminiResponse.error);

      // Content Scriptに結果を表示
      if (geminiResponse.data.done) {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'showCompleted',
          summary: geminiResponse.data.summary
        });
      } else {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'showSingleStep',
          step: geminiResponse.data.step,
          stepNumber: geminiResponse.data.stepNumber
        });
      }

      showSuccess();

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
