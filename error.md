# エラー原因まとめ

## エラー1: Service worker registration failed. Status code: 15

### 概要
Service Workerの登録に失敗している。

### 原因
Chrome拡張機能のService Worker登録時にステータスコード15が返されており、これはService Workerファイルが見つからない場合に発生する。

### 該当箇所
`manifest.json`
```json
"background": {
  "service_worker": "background/service-worker.js"
}
```

### 対処法
- `background/service-worker.js` ファイルが指定パスに存在するか確認する
- ファイルパスのスペルミスがないか確認する

---

## エラー2: Uncaught TypeError: Cannot read properties of undefined (reading 'onCompleted')

### 概要
`chrome.webNavigation` が `undefined` になっており、`.onCompleted` プロパティにアクセスできない。

### 原因
`manifest.json` の `permissions` に `"webNavigation"` が含まれていないため、`chrome.webNavigation` APIが利用できない状態になっている。

### 該当箇所
`background/service-worker.js:105`
```javascript
chrome.webNavigation.onCompleted.addListener(async (details) => { ... });
```

現在の `manifest.json` の permissions:
```json
"permissions": ["activeTab", "scripting", "storage"]
```

### 対処法
`manifest.json` の `permissions` に `"webNavigation"` を追加する。

```json
"permissions": ["activeTab", "scripting", "storage", "webNavigation"]
```
