// Lezer markdown (and Obsidian's tree) uses FencedCode wrapping
// CodeMark / CodeInfo / CodeText. Obsidian may also expose line-level
// HyperMD-codeblock-begin / HyperMD-codeblock / HyperMD-codeblock-end
// names; those are handled as a fallback without scanning fence text.
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

export interface CodeBlockInfo {
    from: number;
    to: number;
    bodyFrom: number;
    bodyTo: number;
    bodyText: string;
}

function isWrappingFencedCode(node: SyntaxNode): boolean {
    return node.name === 'FencedCode' || node.name.includes('FencedCode');
}

function isHyperMDBegin(node: SyntaxNode): boolean {
    return node.name.includes('HyperMD-codeblock-begin');
}

function isHyperMDEnd(node: SyntaxNode): boolean {
    return node.name.includes('HyperMD-codeblock-end');
}

function isCodeText(node: SyntaxNode): boolean {
    return node.name === 'CodeText' || node.name.includes('CodeText');
}

function isLineMarkup(node: SyntaxNode): boolean {
    return (
        node.name === 'QuoteMark' ||
        node.name === 'ListMark' ||
        node.name.includes('formatting-quote') ||
        node.name.includes('formatting-list')
    );
}

function positionInNode(state: EditorState, node: SyntaxNode, pos: number): boolean {
    if (pos < node.from || pos > node.to) {
        return false;
    }
    if (pos < node.to) {
        return true;
    }
    if (node.to === state.doc.length) {
        return true;
    }
    const endLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
    return pos <= endLine.to;
}

function collectCodeText(state: EditorState, node: SyntaxNode): string | null {
    const parts: string[] = [];
    collectCodeTextInto(state, node, parts);
    return parts.length > 0 ? parts.join('') : null;
}

function collectCodeTextInto(
    state: EditorState,
    node: SyntaxNode,
    parts: string[],
): void {
    if (isCodeText(node)) {
        parts.push(state.doc.sliceString(node.from, node.to));
        return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
        collectCodeTextInto(state, child, parts);
    }
}

function lineBody(
    state: EditorState,
    line: { from: number; to: number },
): string {
    const tree = syntaxTree(state);
    const codeTexts: string[] = [];
    tree.iterate({
        from: line.from,
        to: line.to,
        enter(node) {
            if (isCodeText(node.node)) {
                codeTexts.push(state.doc.sliceString(node.from, node.to));
                return false;
            }
            return true;
        },
    });
    if (codeTexts.length > 0) {
        return codeTexts.join('');
    }

    let start = line.from;
    tree.iterate({
        from: line.from,
        to: line.to,
        enter(node) {
            if (isLineMarkup(node.node) && node.from <= start) {
                start = Math.max(start, node.to);
            }
        },
    });
    return state.doc.sliceString(start, line.to);
}

function bodyFromLines(
    state: EditorState,
    from: number,
    to: number,
    skipFirstLine: boolean,
    skipLastLine: boolean,
): { bodyFrom: number; bodyTo: number; bodyText: string } {
    const firstLine = state.doc.lineAt(from);
    const lastLine = state.doc.lineAt(Math.max(from, to - 1));
    const startNum = firstLine.number + (skipFirstLine ? 1 : 0);
    const endNum = lastLine.number - (skipLastLine ? 1 : 0);

    if (startNum > endNum) {
        const emptyAt = skipFirstLine ? firstLine.to : firstLine.from;
        return { bodyFrom: emptyAt, bodyTo: emptyAt, bodyText: '' };
    }

    const bodyStart = state.doc.line(startNum);
    const bodyEnd = state.doc.line(endNum);
    const lines: string[] = [];
    for (let lineNumber = startNum; lineNumber <= endNum; lineNumber++) {
        const line = state.doc.line(lineNumber);
        lines.push(lineBody(state, line));
    }

    return {
        bodyFrom: bodyStart.from,
        bodyTo: bodyEnd.to,
        bodyText: lines.join('\n'),
    };
}

function infoFromWrappingNode(state: EditorState, node: SyntaxNode): CodeBlockInfo {
    const collected = collectCodeText(state, node);
    if (collected !== null) {
        let bodyFrom = node.from;
        let bodyTo = node.from;
        for (let child = node.firstChild; child; child = child.nextSibling) {
            if (isCodeText(child)) {
                if (bodyFrom === node.from && bodyTo === node.from) {
                    bodyFrom = child.from;
                }
                bodyTo = child.to;
            }
        }
        return {
            from: node.from,
            to: node.to,
            bodyFrom,
            bodyTo,
            bodyText: collected,
        };
    }

    const hasClosingFence = isHyperMDEnd(node) || countCodeMarkLikeChildren(node) >= 2;
    const body = bodyFromLines(state, node.from, node.to, true, hasClosingFence);
    return {
        from: node.from,
        to: node.to,
        ...body,
    };
}

function countCodeMarkLikeChildren(node: SyntaxNode): number {
    let count = 0;
    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === 'CodeMark' || child.name.includes('CodeMark')) {
            count += 1;
        }
    }
    return count;
}

function infoFromHyperMDRange(
    state: EditorState,
    begin: SyntaxNode,
    end: SyntaxNode | null,
    rangeTo: number,
): CodeBlockInfo {
    const from = begin.from;
    const to = end?.to ?? rangeTo;
    const collected = collectCodeTextInRange(state, from, to);
    if (collected !== null) {
        return {
            from,
            to,
            bodyFrom: from,
            bodyTo: to,
            bodyText: collected,
        };
    }

    const body = bodyFromLines(state, from, to, true, end !== null);
    return { from, to, ...body };
}

function collectCodeTextInRange(
    state: EditorState,
    from: number,
    to: number,
): string | null {
    const tree = syntaxTree(state);
    const parts: string[] = [];
    tree.iterate({
        from,
        to,
        enter(node) {
            if (isHyperMDBegin(node.node) || isHyperMDEnd(node.node)) {
                return false;
            }
            if (isCodeText(node.node)) {
                parts.push(state.doc.sliceString(node.from, node.to));
                return false;
            }
            return true;
        },
    });
    return parts.length > 0 ? parts.join('') : null;
}

function findWrappingFencedCode(
    state: EditorState,
    pos: number,
): CodeBlockInfo | null {
    const tree = syntaxTree(state);
    let found: SyntaxNode | null = null;
    tree.iterate({
        from: pos,
        to: pos,
        enter(node) {
            if (isWrappingFencedCode(node.node) && positionInNode(state, node.node, pos)) {
                found = node.node;
            }
            return true;
        },
    });
    return found ? infoFromWrappingNode(state, found) : null;
}

function findHyperMDCodeBlock(
    state: EditorState,
    pos: number,
): CodeBlockInfo | null {
    const tree = syntaxTree(state);
    // Empty body lines often have no HyperMD-codeblock token, so membership
    // is determined by the begin/end range rather than the caret line.
    const begins: SyntaxNode[] = [];
    const ends: SyntaxNode[] = [];
    tree.iterate({
        enter(current) {
            if (isHyperMDBegin(current.node)) {
                const last = begins[begins.length - 1];
                if (!last || last.from !== current.from) {
                    begins.push(current.node);
                }
                return false;
            }
            if (isHyperMDEnd(current.node)) {
                const last = ends[ends.length - 1];
                if (!last || last.from !== current.from) {
                    ends.push(current.node);
                }
                return false;
            }
            return true;
        },
    });

    let blockBegin: SyntaxNode | null = null;
    for (const begin of begins) {
        if (begin.from <= pos) {
            blockBegin = begin;
        } else {
            break;
        }
    }
    if (!blockBegin) {
        return null;
    }

    const nextBegin = begins.find((begin) => begin.from > blockBegin.from);
    let blockEnd: SyntaxNode | null = null;
    for (const end of ends) {
        if (end.from < blockBegin.from) {
            continue;
        }
        if (nextBegin && end.from >= nextBegin.from) {
            break;
        }
        blockEnd = end;
        break;
    }

    const rangeTo = blockEnd
        ? blockEnd.to
        : nextBegin
            ? nextBegin.from
            : state.doc.length;
    if (pos < blockBegin.from || pos > rangeTo) {
        return null;
    }
    if (pos === rangeTo && rangeTo < state.doc.length) {
        const endLine = state.doc.lineAt(Math.max(blockBegin.from, rangeTo - 1));
        if (pos > endLine.to) {
            return null;
        }
    }

    return infoFromHyperMDRange(state, blockBegin, blockEnd, rangeTo);
}

export function findContainingCodeBlock(
    state: EditorState,
    pos: number,
): CodeBlockInfo | null {
    ensureSyntaxTree(state, state.doc.length, 50);
    return findWrappingFencedCode(state, pos) ?? findHyperMDCodeBlock(state, pos);
}
