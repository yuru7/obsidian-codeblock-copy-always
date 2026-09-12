# ExecPlan: Obsidian Live Preview で編集中のコードブロックにもコピーボタンを表示する

## 1. 目的

Obsidian の Live Preview エディターでは、コードブロック外にキャレットがある場合はコードブロック右上に言語表示兼コピーボタンが表示されるが、コードブロック内にキャレットを移動すると、そのUIが非表示になる。

この挙動をプラグインで補完し、コードブロック編集中でも右上にコピーアイコンを表示できるようにする。

### 期待する表示

コードブロック外にキャレットがある場合は、Obsidian 標準表示をそのまま利用する。

```text
                Python  ⧉
┌──────────────────────────────┐
│ print("hello")               │
└──────────────────────────────┘
```

コードブロック内にキャレットがある場合は、Live Preview 標準どおり Markdown の fence を表示しつつ、opening fence 行の右上にコピーアイコンだけを表示する。

````text
┌──────────────────────────────┐
│ ```python                  ⧉ │
│ print("hello")|              │
│ ```                          │
└──────────────────────────────┘
````

編集中は `Python ⧉` のような言語ラベルを追加表示しない。言語は ` ```python ` の opening fence から確認できるため、表示が重複するためである。

---

## 2. スコープ

### 対象

* Obsidian Desktop
* Live Preview モード
* fenced code block
* キャレットがコードブロック内にある状態
* コードブロック本文のクリップボードへのコピー

### 対象外

初期実装では以下を対象外とする。

* Reading View のコピーボタン置換
* Source Mode への独自UI追加
* 言語ラベルの独自表示
* コード実行機能
* Markdown parser の独自実装
* Obsidian 標準コピーボタンそのものの改変

---

## 3. 基本設計

Obsidian / CodeMirror 6 がすでに解析している構文情報を利用し、自前で Markdown を前後探索して fenced code block を検出する実装は行わない。

責務を次のように分離する。

```text
CodeMirror 6 syntaxTree
  ↓
コードブロックであることの意味的判定
  - キャレットが fenced code block 内にあるか
  - コードブロックの from / to
  - 必要に応じて fence / body の範囲

DOM / CodeMirror View
  ↓
画面上の位置判定
  - opening fence 行の Y 座標
  - コードブロック描画領域の右端

独自 overlay
  ↓
コピーアイコンを表示
```

原則として、

* 「何であるか」の判定は構文ツリー
* 「どこに表示するか」の判定は DOM

とする。

---

## 4. CodeMirror 拡張

Obsidian の `registerEditorExtension()` から CodeMirror 6 の `ViewPlugin` を登録する。

概念構造:

```ts
const codeBlockCopyExtension = ViewPlugin.fromClass(
  class {
    constructor(private view: EditorView) {
      // overlay 作成
      // event listener 登録
      // 初期状態更新
    }

    update(update: ViewUpdate) {
      // selection / document / viewport 等の変更時に再計算
    }

    destroy() {
      // DOM / listener を破棄
    }
  }
);
```

プラグイン側では、

```ts
this.registerEditorExtension(codeBlockCopyExtension);
```

として登録する。

---

## 5. コードブロック判定

現在のキャレット位置を取得する。

```ts
const pos = view.state.selection.main.head;
```

CodeMirror の構文ツリーを取得する。

```ts
const tree = syntaxTree(view.state);
```

現在位置の構文ノードから親方向へ辿り、fenced code block を表すノードを特定する。

```ts
let node = tree.resolveInner(pos, -1);

while (node) {
  if (isFencedCodeBlock(node)) {
    // 対象コードブロック
    break;
  }

  node = node.parent;
}
```

### 重要事項

`FencedCode` 等の node name は事前に決め打ちしない。

Obsidian が実際に利用している Markdown parser の構文ノードを開発時に確認し、実際の node name / tree structure に合わせて `isFencedCodeBlock()` を実装する。

必要であれば開発用コードで、

```ts
console.log(node.name, node.from, node.to);
```

を出力して確認する。

---

## 6. Markdown の自前解析を行わない

以下のような実装は原則採用しない。

````ts
// 上方向に ``` を探索
// 下方向に ``` を探索
````

理由:

* Markdown parser の再実装に近くなる
* `~~~` fence への対応が必要になる
* fence 内の fence 文字列を誤判定する可能性がある
* インデントや Markdown 構造の考慮が必要になる
* Obsidian が既に構文解析済みなので二重実装になる

構文判定には可能な限り CodeMirror / Obsidian 側の解析結果を利用する。

---

## 7. 表示条件

独自コピーボタンを表示する条件は以下とする。

```text
Live Preview
AND
selection.main.head が fenced code block 内
```

コードブロック外では独自ボタンを非表示にする。

これにより、

```text
コードブロック外
→ Obsidian 標準UI

コードブロック内
→ Obsidian 標準UIは消える
→ プラグイン独自の ⧉ を表示
```

となる。

標準UIを CSS 等で無理に再表示する方式は採用しない。

---

## 8. 独自コピーボタン

ViewPlugin 初期化時に、エディターに独自 overlay element を1個作成する。

例:

```ts
const button = document.createElement("button");

button.classList.add("code-block-copy-button");
button.setAttribute("aria-label", "Copy code");
```

ボタンはコードブロックごとに生成・破棄するのではなく、原則として EditorView ごとに1個持ち、対象コードブロックが変わるたびに位置とコピー対象を更新する。

これにより DOM の生成・破棄を減らす。

---

## 9. 表示位置

目標位置:

````text
│ ```python                  ⧉ │
````

つまり、

* opening fence と同じ高さ
* コードブロック描画領域の右端
* コード内容の上ではなく、右上に overlay

とする。

### Y座標

構文ツリーから取得したコードブロック開始位置を利用して、

```ts
view.coordsAtPos(codeBlock.from)
```

等から opening fence 行の画面座標を取得する。

### X座標

単純に `.cm-content` 全体の右端には置かない。

以下のような Markdown も考慮する。

````markdown
> ```python
> print("hello")
> ```
````

または、

````markdown
- item

  ```python
  print("hello")
````

````

そのため、可能であれば対象コードブロックの実際の描画 DOM を取得し、

```ts
element.getBoundingClientRect().right
````

を基準に配置する。

これにより、

* blockquote
* list
* indentation

内でもコードブロック自身の右端に配置できるようにする。

---

## 10. DOM の利用範囲

DOM は意味判定には使用しない。

DOM の用途は原則以下に限定する。

* コードブロックの描画領域取得
* overlay の座標計算

例えば、

```text
DOM class が .HyperMD-codeblock だから
コードブロックである
```

というロジックは極力避ける。

Obsidian の内部 class 変更に対する依存を減らすためである。

ただし、対象コードブロックに対応する描画要素を特定する目的で内部 class が必要になる場合は、その依存箇所を1か所に隔離する。

例:

```ts
function findCodeBlockElement(
  view: EditorView,
  block: SyntaxNode
): HTMLElement | null
```

---

## 11. コピー対象

コピーするのは fence を除いたコード本文のみ。

例えば、

````markdown
```python
print("hello")
````

````

ならコピー結果は、

```text
print("hello")
````

とする。

構文ツリーから以下の情報を取得できる場合は、それを利用する。

```text
FencedCode
├─ CodeMark
├─ CodeInfo
├─ CodeText
└─ CodeMark
```

実際の tree structure は開発時に確認する。

コード本文に相当する子ノードを直接特定できる場合は、

```ts
view.state.doc.sliceString(bodyFrom, bodyTo)
```

で取得する。

構文ツリーだけで本文範囲を安全に取得できない場合でも、コードブロック全体の `from / to` を基点として処理し、自前の「前後探索」によるコードブロック判定は行わない。

---

## 12. クリック時のエディター挙動

コピーボタンをクリックした際に、

* キャレットがコードブロック外へ移動する
* editor の selection が変わる
* コードブロックが Live Preview の非編集表示へ切り替わる

といった挙動が起こらないようにする。

特に `mousedown` / `pointerdown` 時点で focus が移動する可能性を考慮する。

例:

```ts
button.addEventListener("mousedown", (event) => {
  event.preventDefault();
});
```

必要に応じて、

```ts
event.stopPropagation();
```

も使用する。

クリック後も元の editor focus / selection を維持する。

---

## 13. クリップボード

コピーにはブラウザー / Electron の Clipboard API を利用する。

基本:

```ts
await navigator.clipboard.writeText(code);
```

成功時には Obsidian 標準UIに近いフィードバックを検討する。

例:

```text
⧉
↓
✓
```

を短時間表示してから戻す。

ただし初期実装では、コピー動作そのものを優先し、フィードバックは後回しでもよい。

---

## 14. ViewPlugin の更新条件

毎描画で全処理を実行しない。

少なくとも以下の場合だけ状態更新する。

```ts
if (
  update.selectionSet ||
  update.docChanged ||
  update.viewportChanged ||
  update.geometryChanged
) {
  updateCopyButton();
}
```

主な更新理由:

### `selectionSet`

キャレットがコードブロック内外を移動した。

### `docChanged`

コードブロックが編集された。

### `viewportChanged`

スクロール等で表示領域が変化した。

### `geometryChanged`

折り返しやサイズ変更等で座標が変化した。

実際に必要なイベントは動作確認しながら絞る。

---

## 15. 複数 selection

初期実装では `selection.main` を基準とする。

複数キャレットが存在する場合も、main selection が所属するコードブロックだけにコピーボタンを表示する。

---

## 16. ボタンデザイン

独自デザインにはせず、可能な限り Obsidian の見た目に合わせる。

アイコンには Obsidian API / Lucide の copy icon を利用する。

概念例:

```ts
setIcon(button, "copy");
```

CSS は Obsidian の theme variable を利用する。

例:

```css
.code-block-copy-button {
  position: absolute;
  z-index: var(--layer-popover);
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
```

hover:

```css
.code-block-copy-button:hover {
  color: var(--text-normal);
}
```

具体的な padding / size / opacity は、Obsidian 標準コピーボタンに近づける。

---

## 17. 状態遷移

想定する基本状態:

```text
A. キャレットがコードブロック外
   ↓
   独自ボタン非表示

B. コードブロック内へ移動
   ↓
   構文ツリーから block 特定
   ↓
   座標計算
   ↓
   独自 ⧉ 表示

C. 同じコードブロック内で移動
   ↓
   基本的に表示位置維持

D. 別コードブロックへ移動
   ↓
   target block 更新
   ↓
   overlay 移動

E. コードブロック外へ移動
   ↓
   独自ボタン非表示
   ↓
   Obsidian 標準UIに戻る
```

---

## 18. 実装フェーズ

### Phase 1: 構文ツリー調査

最小の ViewPlugin を実装し、カーソル位置の構文ノードをログ出力する。

確認対象:

* fenced code block 全体の node name
* opening fence
* language info
* code body
* closing fence
* `from / to`

以下も確認する。

````markdown
```python
print("hello")
````

````

```markdown
~~~
foo
~~~
````

````markdown
> ```python
> foo
> ```
````

````markdown
- item

  ```python
  foo
````

````

### Phase 2: コードブロック検出

以下の関数を実装する。

```ts
function findContainingCodeBlock(
  state: EditorState,
  pos: number
): CodeBlockInfo | null
````

想定型:

```ts
interface CodeBlockInfo {
  from: number;
  to: number;
  bodyFrom: number;
  bodyTo: number;
}
```

### Phase 3: コピー処理

`CodeBlockInfo` からコード本文を取得し、

```ts
navigator.clipboard.writeText()
```

できるところまで実装する。

まだ UI の位置は仮でよい。

### Phase 4: overlay UI

EditorView ごとにコピーアイコンを1個生成する。

* 表示
* 非表示
* click
* focus 維持

を実装する。

### Phase 5: 正確な位置合わせ

opening fence 行の Y 座標を取得する。

対象コードブロック DOM を特定して右端を取得する。

以下で確認する。

* 通常コードブロック
* editor 横幅変更
* vertical scroll
* horizontal scroll
* long line
* line wrapping
* blockquote
* list

### Phase 6: デザイン調整

Obsidian 標準UIに合わせる。

* icon
* size
* opacity
* hover
* padding
* cursor
* tooltip

### Phase 7: エッジケース対応

後述のテストケースを実施し、不具合を修正する。

---

## 19. テストケース

### 基本

````markdown
```python
print("hello")
````

````

- コード外では標準UIだけ表示される
- コード内へ入ると独自 ⧉ が表示される
- opening fence 行右端に表示される
- コード外へ出ると独自 ⧉ が消える

### 言語指定なし

```markdown
````

hello

```
```

独自ボタンだけ正常表示されること。

### tilde fence

```markdown
~~~python
print("hello")
~~~
```

構文ツリーが fenced code として扱う場合は対応する。

### 長いコード

横方向に非常に長いコードでも、コピーアイコン位置が不自然にならないこと。

### 複数コードブロック

````markdown
```python
a()
````

text

```javascript
b()
```

````

キャレット移動時に正しいブロックへボタンが移動すること。

### blockquote

```markdown
> ```python
> print("hello")
> ```
````

blockquote 内のコードブロック右端に表示されること。

### list

````markdown
- item

  ```python
  print("hello")
````

インデントされたコードブロック右端に表示されること。

### 編集中

以下の操作中でも位置が破綻しないこと。

- 改行追加
- fence 編集
- language 名変更
- closing fence 削除
- closing fence 再追加

### スクロール

コードブロックを表示したまま上下スクロールし、ボタンが追従すること。

### ウィンドウサイズ変更

Obsidian ウィンドウ幅を変更しても右端に追従すること。

---

## 20. 完了条件

以下を満たしたら初期版を完了とする。

- Live Preview で動作する
- コードブロック外では Obsidian 標準UIを変更しない
- コードブロック内では右上にコピーアイコンのみ表示される
- 言語ラベルは追加表示しない
- fenced code block 判定に Markdown の前後探索を使用しない
- CodeMirror / Obsidian の構文解析結果を利用する
- fence を除いたコード本文だけコピーできる
- コピー時に editor のキャレット位置が変わらない
- スクロールに追従する
- 通常コードブロック、blockquote、list 内で実用上問題のない位置に表示される
- ViewPlugin の破棄時に DOM / event listener が残らない

---

## 21. 実装上の優先順位

優先順位は以下とする。

1. 構文ツリーによる正しいコードブロック判定
2. 正しいコード本文のコピー
3. キャレット / focus を壊さないこと
4. opening fence 行右上への位置合わせ
5. Obsidian 標準UIに近いデザイン
6. エッジケース対応

内部 DOM class への依存を減らすことよりも、まずは正しい動作を優先する。

ただし DOM 依存が必要になった場合は、依存部分を helper 関数へ隔離し、Obsidian の変更時に修正箇所が広がらない構造にする。

特に最初の実装では、**Phase 1 の構文ツリー調査を飛ばさず、実際の node structure を確認してから実装する**のが重要です。ここが分かれば、その後の実装はかなり素直になると思います。
