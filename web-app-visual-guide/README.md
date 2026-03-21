# Web App Visual Guide - Chrome Extension

AIがウェブアプリの操作を1ステップずつリアルタイムで視覚的にガイドするChrome拡張機能です。

## セットアップ

### 1. Gemini APIキーの取得

[Google AI Studio](https://aistudio.google.com/app/apikey) でAPIキーを取得してください。

### 2. Chrome拡張機能の読み込み

1. `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」で `web-app-visual-guide/` フォルダを選択

### 3. APIキーの設定

1. 拡張機能アイコンをクリック
2. ポップアップ右上の歯車アイコンをクリック（設定ページが開く）
3. Gemini APIキーを入力して「保存」

## 使い方

1. ガイドしてほしいウェブページを開く（または、ページを開かずに質問するとAIが適切なURLを提案）
2. 拡張機能アイコンをクリック
3. 質問を入力（例: 「新しいプロジェクトを作成するには？」）
4. 「ガイド開始」をクリック
5. ページ上に現在行うべき操作が1ステップ表示される
6. 操作を実施したら「次へ」をクリックすると、次のステップへ進む
7. 目的達成まで繰り返す（ページ遷移があっても自動的に継続）

## 機能

- **1ステップずつのエージェント型ガイド**: AIが完了済みステップの文脈を保持しながら、次の操作を1つずつ提示
- **URLの自動提案**: 質問の内容からAIが適切なページのURLを提案して遷移
- **ページ遷移の追従**: 通常のページ遷移・SPAのルーティング変更どちらにも対応し、セッションを継続
- **Shadow DOM隔離**: オーバーレイUIはホストページのCSSの影響を受けない
- **フォールバック描画**: CSSセレクタで要素が見つからない場合、テキストや概略位置を使って代替ハイライト

## 技術スタック

| カテゴリ | 技術 |
|---|---|
| Chrome拡張 | Manifest V3 |
| AI | Gemini 3.1 Flash Lite Preview (`gemini-3.1-flash-lite-preview`) via REST API |
| 画面キャプチャ | `chrome.tabs.captureVisibleTab()` |
| DOM解析 | Content Script（JavaScript） |
| オーバーレイ描画 | SVG overlay + Shadow DOM（Content Script から注入） |
| セッション管理 | `chrome.storage.session` |
| 言語 | JavaScript（バックエンド不要） |

## ファイル構成

```
web-app-visual-guide/
├── manifest.json
├── popup/
│   ├── popup.html      # ポップアップUI
│   ├── popup.css       # スタイル（ダークモード対応）
│   ├── popup.js        # ポップアップロジック
│   ├── options.html    # API設定ページ
│   └── options.js      # API設定ロジック
├── background/
│   ├── service-worker.js  # メッセージハブ・ページ遷移検知
│   └── session.js         # GuideSession クラス（セッション管理）
├── content/
│   ├── content.js      # メッセージングハブ・セッション再開
│   ├── overlay.js      # SVGオーバーレイ描画（Shadow DOM）
│   └── dom-analyzer.js # DOM情報収集
├── utils/
│   └── gemini-api.js   # Gemini API呼び出し（エージェント型プロンプト）
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## アーキテクチャ

```
popup.js
  │
  ├─[analyze]──────────► content.js ──► dom-analyzer.js
  │                          │
  │◄──────────────────── DOM情報
  │
  ├─[startSession / nextStep]──► service-worker.js
  │                                  │
  │                                  ├─ session.js (セッション履歴管理)
  │                                  └─ gemini-api.js (Gemini API呼び出し)
  │
  └─[showSingleStep]──────► content.js ──► overlay.js (オーバーレイ描画)

ページ遷移検知 (webNavigation):
  service-worker.js ──► content.js ──► 次ステップ自動リクエスト
```

### エージェント型の動作

1. 「ガイド開始」時に `GuideSession` を作成し `chrome.storage.session` に保存
2. Gemini に「次の1ステップのみ」を問い合わせる
3. ユーザーが操作を完了して「次へ」を押すと、完了したステップをセッション履歴に追加
4. Gemini に「目的・完了済みステップ・現在のDOM情報」を渡して次のステップを再問い合わせ
5. `done: true` が返るまで繰り返す
