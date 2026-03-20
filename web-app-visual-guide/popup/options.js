// 画面が開かれたとき、すでに保存されているキーがあれば入力欄に表示する
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      document.getElementById('api-key').value = result.geminiApiKey;
    }
  });
});

// 「保存する」ボタンが押されたときの処理
document.getElementById('save-btn').addEventListener('click', () => {
  const apiKey = document.getElementById('api-key').value.trim();
  
  if (!apiKey) {
    alert('APIキーを入力してください。');
    return;
  }

  // chrome.storage.local に安全に保存
  chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
    // 保存完了のメッセージを表示して、3秒後に消す
    const status = document.getElementById('status');
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  });
});