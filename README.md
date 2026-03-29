# BugJar

Capture bugs in a jar. Screenshot, console, network, annotations — generates AI-ready reports.

A Chrome extension that lets anyone report bugs with full context: annotated screenshots, console logs, network requests, and DOM element inspection. The generated report is a structured Markdown file designed to be directly consumed by AI assistants (Claude, ChatGPT) for faster debugging.

## Features

- **Screenshot** — capture the visible tab with one click
- **Annotate** — draw on the screenshot: freehand pen, arrows, rectangles, text labels, color picker
- **Console Capture** — collects the last 100 console messages (log, warn, error, info) with timestamps
- **Network Capture** — collects recent XHR/fetch requests with method, status, URL, duration
- **DOM Inspector** — click any element to capture its tag, classes, CSS selector, XPath, computed styles
- **AI-Ready Report** — generates a `.md` file with embedded screenshot that Claude/AI can parse and act on

## Install

1. Clone or download this repo
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the `BugJar/` folder
5. The BugJar icon appears in the toolbar

## Usage

1. Navigate to the page with the bug
2. Click the BugJar icon in the toolbar
3. Describe the issue
4. Use the capture buttons:
   - **Screenshot** — captures + opens the annotation editor
   - **Select Element** — click an element on the page to inspect it
   - **Console** — grabs console logs
   - **Network** — grabs network requests
5. Click **Generate Report** — downloads a `.md` file
6. Share the `.md` file with your developer or AI assistant

## Annotation Editor

When you capture a screenshot, an annotation editor opens in a new tab:

- **Pen** (P) — freehand drawing
- **Arrow** (A) — draw arrows
- **Rectangle** (R) — draw rectangles/highlights
- **Text** (T) — click to place text labels
- **Color picker** — red, blue, green, yellow, black
- **Size slider** — adjust line thickness
- **Undo** (Ctrl/Cmd+Z)
- **Done** — save and close

## Report Format

The generated `.md` file is structured for AI consumption:

```markdown
# Bug Report / Feedback
**URL:** https://app.example.com/dashboard
**Category:** Bug  |  **Priority:** High

## Description
The save button doesn't work...

## Screenshot
![Screenshot](data:image/png;base64,...)

## Console Logs
10:30:01 [ERROR] Cannot read property 'save' of undefined

## Network Requests
| Method | Status | URL              | Duration |
|--------|--------|------------------|----------|
| POST   | 500    | /api/save        | 234ms    |

## Instructions for AI (Claude)
Identify the root cause and propose a fix...
```

## Tech

- Vanilla JS — no framework, no build step
- Chrome Extension Manifest V3
- Canvas API for annotations
- Zero external dependencies

## License

MIT License - Copyright (c) 2026 Joris Gounand
