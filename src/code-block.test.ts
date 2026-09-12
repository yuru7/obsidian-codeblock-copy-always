import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { findContainingCodeBlock } from './code-block';

function makeState(doc: string): EditorState {
    return EditorState.create({
        doc,
        extensions: [markdown()],
    });
}

function dumpTree(state: EditorState): string[] {
    const names: string[] = [];
    syntaxTree(state).iterate({
        enter(node) {
            names.push(`${node.name}[${node.from},${node.to}]`);
        },
    });
    return names;
}

function caretIn(doc: string, needle: string): number {
    const index = doc.indexOf(needle);
    if (index < 0) {
        throw new Error(`needle not found: ${needle}`);
    }
    return index;
}

describe('fenced code syntax tree (Phase 1)', () => {
    it('uses FencedCode / CodeMark / CodeInfo / CodeText for backtick fences', () => {
        const doc = '```python\nprint("hello")\n```\n';
        const names = dumpTree(makeState(doc)).join('\n');
        expect(names).toContain('FencedCode');
        expect(names).toContain('CodeMark');
        expect(names).toContain('CodeInfo');
        expect(names).toContain('CodeText');
    });

    it('treats tilde fences as FencedCode', () => {
        const names = dumpTree(makeState('~~~\nfoo\n~~~\n')).join('\n');
        expect(names).toContain('FencedCode');
        expect(names).toContain('CodeText');
    });
});

describe('findContainingCodeBlock', () => {
    it('returns null when the caret is outside a code block', () => {
        const doc = 'hello\n\n```js\nfoo()\n```\n';
        const state = makeState(doc);
        expect(findContainingCodeBlock(state, caretIn(doc, 'hello'))).toBeNull();
    });

    it('finds a backtick fence and copies only the body', () => {
        const doc = '```python\nprint("hello")\n```\n';
        const state = makeState(doc);
        const block = findContainingCodeBlock(state, caretIn(doc, 'print'));
        expect(block).not.toBeNull();
        expect(block?.bodyText).toBe('print("hello")');
    });

    it('finds a fence with no language info', () => {
        const doc = '```\nhello\n```\n';
        const state = makeState(doc);
        const block = findContainingCodeBlock(state, caretIn(doc, 'hello'));
        expect(block?.bodyText).toBe('hello');
    });

    it('finds a tilde fence', () => {
        const doc = '~~~python\nprint("hello")\n~~~\n';
        const state = makeState(doc);
        const block = findContainingCodeBlock(state, caretIn(doc, 'print'));
        expect(block?.bodyText).toBe('print("hello")');
    });

    it('copies an empty body for an empty fence', () => {
        const doc = '```python\n```\n';
        const state = makeState(doc);
        const block = findContainingCodeBlock(state, caretIn(doc, 'python'));
        expect(block?.bodyText).toBe('');
    });

    it('moves to the block that contains the caret', () => {
        const doc = '```python\na()\n```\n\ntext\n\n```javascript\nb()\n```\n';
        const state = makeState(doc);
        expect(findContainingCodeBlock(state, caretIn(doc, 'a()'))?.bodyText).toBe('a()');
        expect(findContainingCodeBlock(state, caretIn(doc, 'b()'))?.bodyText).toBe('b()');
        expect(findContainingCodeBlock(state, caretIn(doc, 'text'))).toBeNull();
    });

    it('copies code inside a blockquote without quote markers', () => {
        const doc = '> ```python\n> print("hello")\n> ```\n';
        const state = makeState(doc);
        const block = findContainingCodeBlock(state, caretIn(doc, 'print'));
        expect(block?.bodyText).toBe('print("hello")');
    });

    it('copies a multi-line body with internal newlines', () => {
        const doc = '```python\nline1\nline2\n```\n';
        const state = makeState(doc);
        const block = findContainingCodeBlock(state, caretIn(doc, 'line2'));
        expect(block?.bodyText).toBe('line1\nline2');
    });

    it('copies indented list code without the fence lines', () => {
        const doc = '- item\n\n  ```python\n  print("hello")\n  ```\n';
        const state = makeState(doc);
        const block = findContainingCodeBlock(state, caretIn(doc, 'print'));
        expect(block?.bodyText).toBe('print("hello")');
    });

    it('finds the block when the caret is on an empty body line', () => {
        const doc = '```python\nprint("hello")\n\nprint("world")\n```\n';
        const state = makeState(doc);
        const emptyLine = state.doc.line(3);
        expect(emptyLine.text).toBe('');
        const block = findContainingCodeBlock(state, emptyLine.from);
        expect(block?.bodyText).toBe('print("hello")\n\nprint("world")');
    });

    it('finds the block when the caret is on a leading empty body line', () => {
        const doc = '```python\n\nprint("hello")\n```\n';
        const state = makeState(doc);
        const emptyLine = state.doc.line(2);
        expect(emptyLine.text).toBe('');
        const block = findContainingCodeBlock(state, emptyLine.from);
        expect(block?.bodyText).toBe('\nprint("hello")');
    });

    it('does not treat a blank line between two code blocks as inside a fence', () => {
        const doc = '```js\na()\n```\n\n```python\nb()\n```\n';
        const state = makeState(doc);
        const blank = state.doc.line(4);
        expect(blank.text).toBe('');
        expect(findContainingCodeBlock(state, blank.from)).toBeNull();
    });

    it('does not treat indented code as a fenced block', () => {
        const doc = 'paragraph\n\n    indented()\n';
        const state = makeState(doc);
        expect(findContainingCodeBlock(state, caretIn(doc, 'indented'))).toBeNull();
    });
});
