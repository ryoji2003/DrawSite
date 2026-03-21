(() => {
  const questionEl = document.getElementById('question');
  const startBtn = document.getElementById('start-btn');
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error-message');
  const successEl = document.getElementById('success-message');
  
  // 新しく追加した歯車ボタンを取得
  const openSettingsBtn = document.getElementById('open-settings-btn');

  // 設定（歯車）ボタンをクリックしたときの処理（オプションページを開く）
  openSettingsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  });

  // Main action (ガイド開始ボタン)
  startBtn.addEventListener('click', async () => {
    const question = questionEl.value.trim();
    if (!question) {
      showError('質問を入力してください');
      return;
    }

    // ストレージからAPIキーを取得してチェック
    const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
    if (!geminiApiKey) {
      showError('APIキーが未設定です。右上の歯車アイコンから設定してください。');
      
      // UX向上：エラーメッセージを見せた後、2秒後に自動で設定画面を開いてあげる
      setTimeout(() => {
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else {
          window.open(chrome.runtime.getURL('options.html'));
        }
      }, 2000);
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('アクティブなタブが見つかりません');

      // 既存のガイドとセッションをクリア
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'clearGuide' });
      } catch { /* 未注入の場合は無視 */ }
      await chrome.runtime.sendMessage({ action: 'endSession' });

      // Check if the tab URL allows content script injection
      const url = tab.url || '';
      if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
          url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('data:')) {
        // AIにURLを提案させて遷移する
        const urlResponse = await chrome.runtime.sendMessage({
          action: 'suggestURL',
          data: { apiKey: geminiApiKey, question }
        });
        if (urlResponse.error) throw new Error(urlResponse.error);
        const suggestedUrl = urlResponse.data.url;
        await chrome.tabs.update(tab.id, { url: suggestedUrl });
        await chrome.runtime.sendMessage({
          action: 'savePendingSession',
          data: { apiKey: geminiApiKey, question }
        });
        showSuccess();
        setTimeout(() => window.close(), 1000);
        return;
      }

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

      // Start session via background
      const sessionResponse = await chrome.runtime.sendMessage({
        action: 'startSession',
        data: {
          apiKey: geminiApiKey,
          userQuestion: question,
          domInfo: domResponse.data
        }
      });
      if (!sessionResponse) throw new Error('バックグラウンドからの応答がありません');
      if (sessionResponse.error) throw new Error(sessionResponse.error);

      // Send first step to content script
      const { done, step, summary, stepNumber } = sessionResponse.data;
      let showResponse;
      if (done) {
        showResponse = await chrome.tabs.sendMessage(tab.id, { action: 'showCompleted', summary });
      } else {
        showResponse = await chrome.tabs.sendMessage(tab.id, { action: 'showSingleStep', step, stepNumber });
      }
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