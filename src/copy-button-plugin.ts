import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { editorLivePreviewField, setIcon, setTooltip } from 'obsidian';
import { findContainingCodeBlock, type CodeBlockInfo } from './code-block';

const BUTTON_CLASS = 'code-block-copy-always-button';
const HIDDEN_CLASS = 'is-hidden';
const FLAIR_INSET = 6;
const COPIED_RESET_MS = 1200;

interface ButtonLayout {
    top: number;
    right: number;
    visible: boolean;
}

// Isolated so Obsidian class name changes stay in one helper.
function findCodeBlockElement(
    view: EditorView,
    from: number,
): HTMLElement | null {
    const start = view.domAtPos(from);
    let element: Node | null = start.node;
    if (!(element instanceof HTMLElement)) {
        element = element.parentElement;
    }

    while (element instanceof HTMLElement && element !== view.contentDOM) {
        if (
            element.classList.contains('HyperMD-codeblock-begin') ||
            element.classList.contains('HyperMD-codeblock')
        ) {
            return element;
        }
        element = element.parentElement;
    }

    element = start.node instanceof HTMLElement ? start.node : start.node.parentElement;
    while (element instanceof HTMLElement && element !== view.contentDOM) {
        if (element.classList.contains('cm-line')) {
            return element;
        }
        element = element.parentElement;
    }

    return null;
}

function isVisibleCopyFlair(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
        return false;
    }
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (!style) {
        return false;
    }
    return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
    );
}

function isNativeCopyFlairVisible(
    view: EditorView,
    blockEl: HTMLElement | null,
    blockBox: { top: number; right: number; bottom: number; left: number },
): boolean {
    // Live Preview sometimes leaves .code-block-flair on empty-line clicks.
    const flairs = view.scrollDOM.getElementsByClassName('code-block-flair');
    if (flairs.length === 0) {
        return false;
    }

    const corner = {
        left: blockBox.right - 40,
        right: blockBox.right,
        top: blockBox.top,
        bottom: blockBox.top + 40,
    };

    for (let i = 0; i < flairs.length; i++) {
        const flair = flairs.item(i);
        if (!(flair instanceof HTMLElement) || !isVisibleCopyFlair(flair)) {
            continue;
        }
        if (blockEl?.contains(flair)) {
            return true;
        }
        const rect = flair.getBoundingClientRect();
        const overlapsCorner =
            rect.left < corner.right &&
            rect.right > corner.left &&
            rect.top < corner.bottom &&
            rect.bottom > corner.top;
        if (overlapsCorner) {
            return true;
        }
    }
    return false;
}

function isMarkdownEditorFocused(view: EditorView): boolean {
    if (!view.hasFocus) {
        return false;
    }
    const leaf = view.dom.closest('.workspace-leaf');
    return !leaf || leaf.classList.contains('mod-active');
}

class CodeBlockCopyButtonPlugin {
    private readonly button: HTMLElement;
    private readonly leafObserver: MutationObserver | null;
    private readonly flairObserver: MutationObserver;
    private block: CodeBlockInfo | null = null;
    private copiedTimer: number | null = null;

    constructor(private readonly view: EditorView) {
        this.button = document.createElement('span');
        this.button.classList.add(BUTTON_CLASS, HIDDEN_CLASS);
        this.button.setAttribute('role', 'button');
        this.button.setAttribute('aria-label', 'Copy');
        setIcon(this.button, 'copy');

        this.button.addEventListener('pointerdown', this.preserveFocus, true);
        this.button.addEventListener('mousedown', this.preserveFocus, true);
        this.button.addEventListener('click', this.onClick);

        this.view.dom.appendChild(this.button);
        setTooltip(this.button, 'Copy');
        this.view.contentDOM.addEventListener('focus', this.onFocusChange);
        this.view.contentDOM.addEventListener('blur', this.onFocusChange);

        const leaf = this.view.dom.closest('.workspace-leaf');
        if (leaf) {
            this.leafObserver = new MutationObserver(() => {
                this.scheduleMeasure();
            });
            this.leafObserver.observe(leaf, {
                attributes: true,
                attributeFilter: ['class'],
            });
        } else {
            this.leafObserver = null;
        }

        this.flairObserver = new MutationObserver(() => {
            this.scheduleMeasure();
        });
        this.flairObserver.observe(this.view.contentDOM, {
            subtree: true,
            childList: true,
        });

        this.scheduleMeasure();
    }

    update(update: ViewUpdate): void {
        const livePreviewChanged =
            update.startState.field(editorLivePreviewField, false) !==
            update.state.field(editorLivePreviewField, false);

        if (
            livePreviewChanged ||
            update.focusChanged ||
            update.selectionSet ||
            update.docChanged ||
            update.viewportChanged ||
            update.geometryChanged
        ) {
            this.scheduleMeasure();
        }
    }

    destroy(): void {
        if (this.copiedTimer !== null) {
            window.clearTimeout(this.copiedTimer);
            this.copiedTimer = null;
        }
        this.button.removeEventListener('pointerdown', this.preserveFocus, true);
        this.button.removeEventListener('mousedown', this.preserveFocus, true);
        this.button.removeEventListener('click', this.onClick);
        this.view.contentDOM.removeEventListener('focus', this.onFocusChange);
        this.view.contentDOM.removeEventListener('blur', this.onFocusChange);
        this.leafObserver?.disconnect();
        this.flairObserver.disconnect();
        this.button.remove();
    }

    private preserveFocus = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
    };

    private onFocusChange = (): void => {
        this.scheduleMeasure();
    };

    private onClick = (event: MouseEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        const text = this.block?.bodyText;
        if (text === undefined) {
            return;
        }

        void navigator.clipboard.writeText(text).then(
            () => {
                this.showCopied();
            },
            () => {
                return;
            },
        );
    };

    private showCopied(): void {
        if (this.copiedTimer !== null) {
            window.clearTimeout(this.copiedTimer);
        }
        setIcon(this.button, 'check');
        this.button.setAttribute('aria-label', 'Copied');
        setTooltip(this.button, 'Copied');
        this.copiedTimer = window.setTimeout(() => {
            setIcon(this.button, 'copy');
            this.button.setAttribute('aria-label', 'Copy');
            setTooltip(this.button, 'Copy');
            this.copiedTimer = null;
        }, COPIED_RESET_MS);
    }

    private scheduleMeasure(): void {
        this.view.requestMeasure({
            key: this,
            read: () => this.readLayout(),
            write: (layout) => this.writeLayout(layout),
        });
    }

    private readLayout(): ButtonLayout | null {
        const { view } = this;
        // Unfocused Live Preview restores the native copy control.
        // Hide ours so the two buttons do not overlap.
        if (!isMarkdownEditorFocused(view) || !view.state.field(editorLivePreviewField, false)) {
            this.block = null;
            return null;
        }

        const pos = view.state.selection.main.head;
        const block = findContainingCodeBlock(view.state, pos);
        this.block = block;
        if (!block) {
            return null;
        }

        const fence = view.coordsAtPos(block.from);
        if (!fence) {
            return null;
        }

        const host = view.dom.getBoundingClientRect();
        const scroll = view.scrollDOM.getBoundingClientRect();
        const blockEl = findCodeBlockElement(view, block.from);
        const blockRect = blockEl?.getBoundingClientRect();
        const boxTop = blockRect?.top ?? fence.top;
        const boxBottom = blockRect?.bottom ?? fence.bottom;
        const boxRight = blockRect?.right ?? scroll.right;
        const boxLeft = blockRect?.left ?? boxRight;
        const blockBox = {
            top: boxTop,
            right: boxRight,
            bottom: boxBottom,
            left: boxLeft,
        };

        if (isNativeCopyFlairVisible(view, blockEl, blockBox)) {
            return null;
        }

        return {
            top: boxTop - host.top + FLAIR_INSET,
            right: host.right - boxRight + FLAIR_INSET,
            visible: boxBottom > scroll.top && boxTop < scroll.bottom,
        };
    }

    private writeLayout(layout: ButtonLayout | null): void {
        if (!this.button.isConnected) {
            return;
        }
        if (!layout || !layout.visible) {
            this.button.classList.add(HIDDEN_CLASS);
            return;
        }

        this.button.classList.remove(HIDDEN_CLASS);
        this.button.style.top = `${layout.top}px`;
        this.button.style.right = `${layout.right}px`;
        this.button.style.left = 'auto';
    }
}

export const codeBlockCopyExtension = ViewPlugin.fromClass(CodeBlockCopyButtonPlugin);
