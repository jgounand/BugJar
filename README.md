<p align="center">
  <img src="icons/icon128.png" alt="BugJar" width="80" />
</p>

<h1 align="center">BugJar</h1>

<p align="center">
  <strong>Capture bugs in a jar.</strong><br>
  Screenshot, console, network, annotations — generates AI-ready reports.
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/jgounand/BugJar?style=flat-square&color=e94560" alt="Version" />
  <img src="https://img.shields.io/badge/manifest-v3-blue?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square" alt="Dependencies" />
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20FR%20%7C%20ES-blueviolet?style=flat-square" alt="i18n" />
</p>

---

## What it does

A Chrome extension that lets **anyone** — developers, QA, clients, integrators — report bugs with full context. The generated report is a structured `.md` file designed for **AI assistants** (Claude, ChatGPT) to understand and fix the issue.

### Popup — Capture & Report

```
┌─────────────────────────────────────┐
│  🐞 BugJar           v2.2.0  ? ✕   │
│  [EN] [FR] [ES]                     │
├──────────┬──────────────────────────┤
│ Report   │ History                  │
├──────────┴──────────────────────────┤
│                                     │
│  Description                        │
│  ┌─────────────────────────────┐    │
│  │ The save button doesn't...  │    │
│  └─────────────────────────────┘    │
│                                     │
│  Steps to reproduce                 │
│  ┌─────────────────────────────┐    │
│  │ 1. Go to /settings          │    │
│  │ 2. Click Save               │    │
│  │ 3. See error in console     │    │
│  └─────────────────────────────┘    │
│                                     │
│  Category: [Bug ▾]  Priority: [High]│
│                                     │
│  ┌─────────────────────────────┐    │
│  │     ⚡ Capture All          │    │
│  └─────────────────────────────┘    │
│                                     │
│  📸 Screenshot ✓  🖱️ Element ✓     │
│  📋 Console ✓     🌐 Network ✓     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │     📄 Generate Report      │    │
│  └─────────────────────────────┘    │
│                                     │
│  Status: Ready                      │
└─────────────────────────────────────┘
```

### Annotation Editor

```
┌─────────────────────────────────────────────┐
│  ✏️ Pen  ➡️ Arrow  ▢ Rect  T Text          │
│  🔴 🔵 🟢 🟡 ⚫  Size: ━━━●━━  ↩ Undo  ✓ │
├─────────────────────────────────────────────┤
│                                             │
│   ┌─────────────────────────────────┐       │
│   │                                 │       │
│   │    Your page screenshot         │       │
│   │    with annotations drawn       │       │
│   │    on top ──────────> ⬅️        │       │
│   │                                 │       │
│   └─────────────────────────────────┘       │
│                                             │
└─────────────────────────────────────────────┘
```

### Element Inspector

```
┌──────────────────────────────────────────────────┐
│  ⚠️ Click on any element to select it   [Cancel] │  ← Red banner
├──────────────────────────────────────────────────┤
│                                                  │
│   ┌──── div.kanban-column  320x450 ────┐         │  ← Tooltip follows cursor
│   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │         │
│   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │         │  ← Red highlight on hover
│   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │         │
│   └────────────────────────────────────┘         │
│                                                  │
│   After click: green persistent highlight        │
│   ┌── div.kanban-column (320x450) ──┐            │  ← Green + badge
│   │   ████████████████████████████  │            │
│   └─────────────────────────────────┘            │
│                                                  │
│   Toast: "Element captured: div.kanban-column" ──┘  │
└──────────────────────────────────────────────────┘
```

### History Tab

```
┌─────────────────────────────────────┐
│ Report   │ History                  │
├──────────┴──────────────────────────┤
│  3 reports              [Clear All] │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Mar 29, 10:30  High Bug  ✕ │    │
│  │ https://app.example.com/... │    │
│  │ The save button doesn't...  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Mar 28, 15:45  Med Feature  │    │
│  │ https://app.example.com/... │    │
│  │ Add filter by project...    │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

## Features

| Feature | Description |
|---------|-------------|
| **Capture All** | One click captures screenshot + console + network |
| **Screenshot** | Capture visible tab + annotate (pen, arrows, rectangles, text) |
| **Console** | Last 100 messages with timestamps + **stack traces** for errors |
| **Network** | XHR/fetch requests with status, duration + **response body** for 4xx/5xx |
| **DOM Inspector** | Click any element → captures selector, XPath, computed styles |
| **Framework Detection** | Detects Angular, React, Vue, jQuery with version |
| **SPA Navigation** | Tracks pushState/replaceState route changes |
| **Storage Keys** | Captures localStorage/sessionStorage key names + sizes |
| **Multi-screenshots** | Up to 5 screenshots per report |
| **AI-Ready Report** | Structured `.md` file optimized for Claude/ChatGPT |
| **History** | View and manage past reports |
| **i18n** | English, French, Spanish |
| **Dark Mode** | Follows system preference |
| **Auto-Update** | Checks GitHub releases every 24h, shows badge |
| **Keyboard Shortcuts** | `Ctrl+Shift+B` open, `Ctrl+Shift+J` capture all |

## Install

1. Download the [latest release](https://github.com/jgounand/BugJar/releases/latest)
2. Unzip `BugJar-vX.X.X.zip`
3. Open `chrome://extensions/` in Chrome
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked** → select the unzipped folder
6. The BugJar icon appears in the toolbar

## Generated Report

The `.md` file contains everything an AI needs to fix the bug:

```markdown
# Bug Report / Feedback
**URL:** https://app.example.com/dashboard
**Category:** Bug  |  **Priority:** High

## Environment
- Resolution: 1920x1080 (viewport: 1280x720)
- Browser: Chrome 120.0.0.0
- Framework: Angular 21.0.0

## Description
The save button doesn't respond after editing...

## Steps to Reproduce
1. Go to /settings
2. Edit any field
3. Click Save → nothing happens

## Screenshot
![Screenshot](feedback-screenshot.png)

## Selected DOM Element
Tag: button.btn-save
Selector: #settings-form > .actions > button.btn-save

## Console Logs (3 errors)
10:30:01 [ERROR] TypeError: Cannot read property 'save' of undefined
  at SettingsComponent.onSave (settings.component.ts:45)

## Network Requests (1 failed)
| Method | Status | URL | Duration |
|--------|--------|-----|----------|
| POST | 500 | /api/settings | 234ms |
> Response: {"error":"Column 'NAME' cannot be null"}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+B` (Mac: `Cmd+Shift+B`) | Open BugJar popup |
| `Ctrl+Shift+J` (Mac: `Cmd+Shift+J`) | Quick capture all |

## Tech

- Vanilla JavaScript — no framework, no build step, no bundler
- Chrome Extension Manifest V3
- Canvas API for annotations
- Zero external dependencies
- 96 unit tests (`node tests/test.js`)

## License

Current versions (v1.x, v2.x): **MIT License** — free for personal and commercial use.

Future versions may be released under a different license. See [LICENSE](LICENSE) for details.

Copyright (c) 2026 Joris Gounand — All rights reserved for future versions.
