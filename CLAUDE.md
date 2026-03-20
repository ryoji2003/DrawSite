# CLAUDE.md — Web App Visual Guide 改修ガイド

## プロジェクト概要

AIがウェブアプリの操作をリアルタイムで視覚的にガイドするChrome拡張機能。
Gemini 2.0 Flash を使い、ページのDOM情報からユーザーの目的達成に必要な操作手順を1ステップずつ案内する。

## ディレクトリ構成

```
web-app-visual-guide/
├── manifest.json              # Manifest V3 定義
├── popup/
│   ├── popup.html             # ポップアップUI
│   ├── popup.css              # スタイル（ダークモード対応）
│   └── popup.js               # ポップアップロジック
├── background/
│   ├── service-worker.js      # メッセージハンドラ・セッション管理
│   └── session.js             # GuideSessionクラス（新規作成）
├── content/
│   ├── content.js             # メッセージングハブ
│   ├── overlay.js             # SVGオーバーレイ描画
│   └── dom-analyzer.js        # DOM情報収集
├── utils/
│   └── gemini-api.js          # Gemini API呼び出し
└── icons/
```

## 現在の問題と改修方針

### 問題1: ハイライトの精度が低い（当たったり外れたりする）
### 問題2: ページ遷移するとガイドが消える

これらを3フェーズに分けて改修する。**必ずPhase 1 → Phase 2 → Phase 3の順に実装すること。**

---

## Phase 1: DOM情報のスリム化 + スクリーンショット削除

### 目的
- APIトークン消費を削減しレイテンシを改善する
- AIに渡す情報のノイズを減らし精度を上げる

### 1-1. スクリーンショット送信の削除

**対象ファイル:** `utils/gemini-api.js`, `background/service-worker.js`, `popup/popup.js`

- `callGemini` / `callGeminiOnce` の引数から `screenshotBase64` を削除する
- リクエストボディの `contents.parts` から `inlineData`（画像）を削除し、テキストパートのみにする
- `service-worker.js` の `handleCaptureScreen` 関数は残してよいが、メインフローからは呼ばない
- `popup.js` の `chrome.runtime.sendMessage({ action: 'captureScreen' })` 呼び出しを削除する

### 1-2. DOM情報のスリム化

**対象ファイル:** `content/dom-analyzer.js`

`analyzeDom()` が返す各要素のフィールドを以下に絞る:

```javascript
// 残すフィールド
{
  tag: string,          // タグ名
  text: string,         // textContent 50文字に短縮（現在は100文字）
  ariaLabel: string,    // そのまま
  role: string,         // そのまま
  selector: string,     // そのまま
  placeholder: string   // そのまま
}
```

**削除するフィールド:** `id`, `classes`, `type`, `href`, `rect`, `isVisible`

これらはAIの判断には使わない。selectorの中にidやclass情報は含まれるので問題ない。

### 1-3. DOM情報のグルーピング

**対象ファイル:** `content/dom-analyzer.js`

フラットな配列ではなく、ページ構造をAIが理解しやすいグループ形式で返す:

```javascript
function analyzeDom() {
  // ... 要素収集後 ...
  return {
    url: location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    regions: groupByRegion(results) // ← 新規関数
  };
}
```

`groupByRegion` の実装方針:
- `<nav>`, `<header>`, `<main>`, `<aside>`, `<footer>`, `[role="navigation"]`, `[role="main"]` などのランドマーク要素をキーにする
- 各インタラクティブ要素がどのランドマークの子孫かを判定し、グループに分配する
- どのランドマークにも属さない要素は `"その他"` グループに入れる
- ランドマークが無いページではフラットな `"ページ全体"` 1グループにする

出力イメージ:
```json
{
  "url": "https://example.com/dashboard",
  "title": "ダッシュボード - MyApp",
  "viewport": { "width": 1280, "height": 720 },
  "regions": [
    {
      "area": "nav (上部ナビゲーション)",
      "elements": [
        { "tag": "a", "text": "ホーム", "selector": "..." },
        { "tag": "a", "text": "設定", "selector": "..." }
      ]
    },
    {
      "area": "main (メインコンテンツ)",
      "elements": [
        { "tag": "button", "text": "新規作成", "selector": "..." }
      ]
    }
  ]
}
```

### 1-4. プロンプトの調整

**対象ファイル:** `utils/gemini-api.js`

プロンプトを以下の方針で修正する:
- スクリーンショットへの言及を削除する
- 「selectorが動的クラス名に依存する場合は、必ず fallback.text を付与すること」を明記する
- DOM情報がグループ化されていることを説明に反映する

---

## Phase 2: Agent型ループへの移行

### 目的
- 「全ステップ一括生成」から「1ステップずつ判断」に変更する
- ページ遷移しても目的を忘れず、新しいDOMに基づいて次の操作を案内する

### 2-1. セッション管理クラスの作成

**新規ファイル:** `background/session.js`

```javascript
class GuideSession {
  constructor(userQuestion) {
    this.userQuestion = userQuestion;
    this.history = [];        // { step, pageTitle, pageUrl, timestamp }
    this.status = 'active';   // 'active' | 'completed'
  }

  addStep(step, pageTitle, pageUrl) {
    this.history.push({
      step,
      pageTitle,
      pageUrl,
      timestamp: Date.now()
    });
  }

  // AIに送るコンテキスト構築
  buildContext() {
    return {
      goal: this.userQuestion,
      completedSteps: this.history.map((h, i) => ({
        stepNumber: i + 1,
        action: h.step.description,
        page: h.pageTitle
      }))
    };
  }

  toJSON() { /* chrome.storage.session に保存可能な形式 */ }
  static fromJSON(obj) { /* 復元 */ }
}
```

このクラスは `service-worker.js` から `importScripts('./session.js')` で読み込む。

### 2-2. manifest.json の更新

```json
{
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "webNavigation"
  ]
}
```

`webNavigation` を追加する。

### 2-3. Service Worker の改修

**対象ファイル:** `background/service-worker.js`

新しいメッセージハンドラを追加:

- `startSession`: セッション作成 → `chrome.storage.session` に保存 → 最初のステップをAIに問い合わせ → 返却
- `nextStep`: 現在のセッションに完了ステップを追加 → 新しいDOMで次のステップをAIに問い合わせ → 返却
- `getSession`: 保存済みセッションの取得（Content Script初期化時に使う）
- `endSession`: セッションをクリア

ページ遷移検知を追加:
```javascript
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return; // メインフレームのみ
  const session = await getSessionFromStorage();
  if (!session || session.status !== 'active') return;
  // Content Scriptに「セッション継続中」を通知
  chrome.tabs.sendMessage(details.tabId, {
    action: 'resumeSession',
    session: session
  });
});
```

### 2-4. プロンプトをAgent型に変更

**対象ファイル:** `utils/gemini-api.js`

関数を2つに分ける:

- `callGeminiFirstStep(apiKey, question, domInfo)`: 初回。目的+DOMから最初の1ステップを取得
- `callGeminiNextStep(apiKey, context, domInfo)`: 2回目以降。目的+履歴+DOMから次の1ステップを取得

Agent型プロンプトの構造:
```
あなたはウェブアプリケーションの操作ガイドエージェントです。
ユーザーの目的と、これまでに完了した操作、そして現在のページのDOM情報に基づき、
次に行うべき操作を1つだけ判断してください。

## ユーザーの目的
${question}

## 完了済みステップ
${context.completedSteps の一覧。初回は「なし」}

## 現在のページ
タイトル: ${domInfo.title}
URL: ${domInfo.url}

## 現在のページのDOM情報
${domInfo の JSON}

## 回答形式
次の操作がある場合:
{
  "done": false,
  "step": {
    "action": "click",
    "selector": "CSSセレクタ",
    "description": "操作の説明",
    "fallback": {
      "text": "要素のテキスト",
      "approximatePosition": { "top": "20%", "left": "80%" }
    }
  }
}

目的が達成済みの場合:
{
  "done": true,
  "summary": "完了の要約"
}

注意:
- selectorが動的クラス名（ランダム文字列を含む）に依存する場合は、必ずfallback.textを付与すること
- 1つの操作のみを返すこと。複数ステップをまとめないこと
```

レスポンスパーサー `parseGeminiResponse` も修正する:
- `done: true` の場合は `{ done: true, summary: "..." }` を返す
- `done: false` の場合は `{ done: false, step: { ... } }` を返す
- 旧形式の `steps` 配列が返ってきた場合も `steps[0]` を取り出して互換処理する

### 2-5. Content Script の改修

**対象ファイル:** `content/content.js`

新しいメッセージハンドラ:

- `resumeSession`: ページ遷移後にService Workerから呼ばれる。DOMを取得してService Workerに送り、次のステップを受け取ってオーバーレイ表示する
- `showSingleStep`: 1ステップだけ表示（現在の `showGuide` を置き換え）
- `showCompleted`: 目的達成時の完了メッセージを表示

### 2-6. Overlay の改修

**対象ファイル:** `content/overlay.js`

変更点:
- `show(steps)` を `showSingle(step, stepNumber)` に変更。1ステップだけ表示する
- 「次へ」ボタンのラベルを「操作を実行して次へ」等に変更し、押したときに新しいDOMで次のステップをリクエストする流れにする
- 「次へ」ボタン押下時: `content.js` にメッセージ → Service Worker に `nextStep` → AI呼び出し → 新ステップ表示
- 「次へ」ボタン押下時にローディング表示（AIの応答を待つ間）を追加する
- 完了表示用のUIを追加する（`showCompleted(summary)` メソッド）

### 2-7. Popup の改修

**対象ファイル:** `popup/popup.js`

- スクリーンショット取得処理を削除する
- ガイド開始時のフローを変更:
  1. Service Worker に `startSession` メッセージを送信
  2. Content Script に DOM取得を依頼
  3. Service Worker に DOM を渡してAI呼び出し
  4. Content Script に最初の1ステップを表示依頼
- `setTimeout(() => window.close(), 1000)` を削除する（セッション中はpopupを閉じても動作継続するが、即閉じは不要）

---

## Phase 3: 要素検索フォールバックの強化

### 目的
- CSSセレクタで要素が見つからない場合の検索精度を上げる

### 3-1. `_findElement` の強化

**対象ファイル:** `content/overlay.js`

検索を3段階にする:

```javascript
_findElement(step) {
  // 1. CSSセレクタで検索
  if (step.selector) {
    try {
      const el = document.querySelector(step.selector);
      if (el && this._isVisible(el)) return el;
    } catch {}
  }

  // 2. aria-labelで検索
  if (step.fallback?.ariaLabel) {
    const el = document.querySelector(`[aria-label="${CSS.escape(step.fallback.ariaLabel)}"]`);
    if (el && this._isVisible(el)) return el;
  }

  // 3. テキスト内容で検索（対象セレクタを拡大）
  if (step.fallback?.text) {
    const text = step.fallback.text.toLowerCase();
    const candidates = document.querySelectorAll(
      'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], ' +
      'input, select, textarea, [onclick], [tabindex], .btn, [data-action]'
    );
    // 完全一致 → 前方一致 → 部分一致の優先順で検索
    let partial = null;
    for (const el of candidates) {
      if (!this._isVisible(el)) continue;
      const elText = el.textContent.trim().toLowerCase();
      if (elText === text) return el;
      if (!partial && elText.includes(text)) partial = el;
    }
    if (partial) return partial;
  }

  return null;
}
```

---

## 実装上の注意事項

### テスト方法
- `chrome://extensions/` でパッケージ化されていない拡張機能として読み込む
- コードを変更したら拡張機能の「更新」ボタンを押してリロードする
- Service Worker のログは `chrome://extensions/` の「Service Worker」リンクからDevToolsを開いて確認する
- Content Script のログは対象ページのDevToolsコンソールで確認する

### chrome.storage.session について
- `chrome.storage.session` はService Workerのライフサイクルに依存しない（Service Workerが停止しても保持される）
- ただしブラウザを閉じるとクリアされる（これはガイドセッションの用途に適している）

### エラーハンドリング
- AI呼び出しが失敗した場合、オーバーレイにエラーメッセージを表示し、「再試行」ボタンを出す
- セッション復元時にContent Scriptがまだ読み込まれていない場合は `chrome.scripting.executeScript` で注入する

### 言語
- UIテキスト・プロンプト・コメントはすべて日本語を維持する
- 変数名・関数名は英語

### やらないこと（スコープ外）
- iframe内の要素対応
- Shadow DOM内の要素対応
- 多言語対応
- スクリーンショットのオプション化（将来の課題として残す）
