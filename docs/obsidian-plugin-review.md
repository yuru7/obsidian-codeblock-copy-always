# Obsidian plugin automated review

コミュニティプラグイン公開時の自動レビュー（および `eslint-plugin-obsidianmd`）で落ちないための観点リストです。DOM・スタイル・Obsidian API を触る変更では、実装前にこのファイルを確認してください。

公式の一次情報:

- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Developer policies](https://docs.obsidian.md/Developer+policies)
- [HTML elements](https://docs.obsidian.md/Plugins/User+interface/HTML+elements)
- [Pop-out windows](https://docs.obsidian.md/plugins/guides/pop-out-windows)
- [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin)

ローカル確認は `eslint-plugin-obsidianmd` の `recommended` 設定を使う。プレビュースキャンは Obsidian の developer dashboard からも実行できる。

## DOM とスタイル

このリポジトリで実際に指摘された項目です。同じ書き方を再導入しないこと。

| 重要度 | ルール | 禁止 | 代わりに使うもの |
| --- | --- | --- | --- |
| Error | `obsidianmd/no-static-styles-assignment` | `el.style.color = 'red'` や `el.style.left = 'auto'` | 静的な見た目は CSS クラス。動的な値だけ `setCssStyles` / `setCssProps` |
| Warning | `obsidianmd/prefer-instanceof` | `node instanceof HTMLElement` / `event instanceof MouseEvent` | `node.instanceOf(HTMLElement)` / `event.instanceOf(MouseEvent)` |
| Warning | `obsidianmd/prefer-create-el` | `document.createElement('span')` | 親要素の `createEl` / `createDiv` / `createSpan` / `createSvg` |

補足:

- テーマと CSS スニペットが上書きできるよう、ハードコードした見た目は `styles.css` に置く。色や余白は Obsidian の CSS 変数を使う。
- ポップアウトウィンドウでは `HTMLElement` などのコンストラクタがウィンドウごとに別物になる。`instanceof` はメインウィンドウ以外で false になる。
- 要素の生成は、対象ウィンドウの親ノードから行う（`document.createElement` はメインウィンドウの document を使う）。
- `innerHTML` / `outerHTML` / `insertAdjacentHTML` は使わない。内容のクリアは `el.empty()`。

## よく引っかかるその他のルール

今は未使用でも、追加実装で踏みやすいものです。

- `obsidianmd/platform`: OS 判定に `navigator` を使わない。`Platform` を使う。
- `obsidianmd/no-nodejs-modules`: Node 組み込みモジュールは `Platform.isDesktop` でガードしない限り import しない。このプラグインは `isDesktopOnly: true` でも、不要な Node API は増やさない。
- `obsidianmd/regex-lookbehind`: 正規表現の lookbehind は一部 iOS で動かない。
- `obsidianmd/prefer-window-timers`: `setTimeout` などは `window.setTimeout` のように `window` 経由で呼ぶ。
- `obsidianmd/no-sample-code` / `obsidianmd/sample-names`: テンプレートのサンプル名やサンプルコードを残さない。
- `obsidianmd/validate-manifest`: `manifest.json` の `id` / `name` / `description` / `author` / `minAppVersion` をガイドラインどおりにする。
- `obsidianmd/ui/sentence-case`: コマンド名・設定名・ボタン文言は Sentence case（例: `Copy`、`Copied`）。
- `obsidianmd/commands/*`: コマンド ID に `command` やプラグイン ID を入れない。コマンド名にプラグイン名を入れない。デフォルトホットキーを設定しない。
- `obsidianmd/detach-leaves`: `onunload` で leaf を detach しない。
- `obsidianmd/no-view-references-in-plugin`: カスタム View の参照をプラグインインスタンスに保持しない。
- `obsidianmd/vault/iterate`: パス検索で全ファイルを走査しない。`getFileByPath` などを使う。

## 公式ガイドラインの要点

自動レビューと手動レビューの両方で見られる項目です。

- グローバルの `app` / `window.app` を使わない。`this.app` を使う。
- 不要な `console.log` を残さない。
- 設定見出しに HTML の `h1`〜`h6` を使わない。`Setting#setHeading()` を使う。
- イベントやタイマーなど、プラグインが作った資源は unload 時に破棄する。ViewPlugin なら `destroy()` で DOM と listener を外す。
- アクティブなノートの編集は `Vault.modify` ではなく Editor API を使う。
- ユーザー入力のパスは `normalizePath()` を通す。
- モバイル非対応なら `manifest.json` の `isDesktopOnly` を正しく付ける。
