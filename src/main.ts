import { Plugin } from 'obsidian';
import { codeBlockCopyExtension } from './copy-button-plugin';

export default class CodeBlockCopyAlwaysPlugin extends Plugin {
    onload(): void {
       this.registerEditorExtension(codeBlockCopyExtension);
    }
}
