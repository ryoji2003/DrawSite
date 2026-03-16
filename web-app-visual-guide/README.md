# Web App Visual Guide - Chrome Extension

AIがウェブアプリの操作をリアルタイムで視覚的にガイドするChrome拡張機能です。

## セットアップ

### 1. Gemini APIキーの取得
[Google AI Studio](https://aistudio.google.com/app/apikey) でAPIキーを取得してください。

### 2. Chrome拡張機能の読み込み
1. `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」で `web-app-visual-guide/` フォルダを選択

### 3. APIキーの設定
1. 拡張機能アイコンをクリック
2. ポップアップ下部の「API設定」をクリック
3. Gemini APIキーを入力して「保存」

## 使い方

1. ガイドしてほしいウェブページを開く
2. 拡張機能アイコンをクリック
3. 質問を入力（例: 「新しいプロジェクトを作成するには？」）
4. 「ガイド開始」をクリック
5. ページ上にステップガイドが表示される
6. 「次へ」「前へ」でステップを移動

## 技術スタック

- **Chrome Extension**: Manifest V3
- **AI**: Gemini 2.0 Flash (REST API)
- **画面キャプチャ**: `chrome.tabs.captureVisibleTab()`
- **オーバーレイ**: SVG + Shadow DOM
- **バックエンド**: なし（全てフロントエンドで完結）

## ファイル構成

```
web-app-visual-guide/
├── manifest.json
├── popup/
│   ├── popup.html      # ポップアップUI
│   ├── popup.css       # スタイル（ダークモード対応）
│   └── popup.js        # ポップアップロジック
├── background/
│   └── service-worker.js  # Gemini API中継・スクリーンショット取得
├── content/
│   ├── content.js      # メッセージングハブ
│   ├── overlay.js      # SVGオーバーレイ描画
│   └── dom-analyzer.js # DOM情報収集
├── utils/
│   └── gemini-api.js   # Gemini API呼び出し
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
