# Code Block Copy Always

[English](README.md) | [日本語](README_ja.md)

An [Obsidian](https://obsidian.md) plugin that keeps a copy button visible while you edit a fenced code block in Live Preview.

## Why

In Live Preview, Obsidian shows a language label and copy control on a code block when the cursor is outside it. Click inside the block to edit, and that control disappears.

This plugin fills that gap. While you are editing a fenced code block, a copy icon stays in the top-right corner of the block.

## How to use

1. Open a note in **Live Preview**.
2. Place the cursor inside a fenced code block (` ``` ` or `~~~`).
3. Click the copy icon in the top-right of the block.

The plugin copies the code itself, not the fence lines.

When the cursor leaves the block, or the editor loses focus, the plugin hides its button so Obsidian’s built-in copy control can show again.

## Installation

### From Community Plugins

Search for **Code Block Copy Always** in Community Plugins and install it.

## Requirements

- Obsidian 1.8.0 or later
- Desktop (Windows, macOS, or Linux)

## Limitations

- Live Preview only. Reading view already has a copy button, and Source mode is unchanged.
- Fenced code blocks only. Indented code blocks are not supported.
- Desktop only. The plugin does not run on mobile.
