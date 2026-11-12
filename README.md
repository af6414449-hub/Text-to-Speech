# Text to Speech — Browser Extension

A minimal browser extension that reads text aloud. Hold **Ctrl** to highlight text under the cursor, then **Ctrl + Click** to speak it. Click again to stop.

No build step, no dependencies — plain Manifest V3.

## Features

- Hold **Ctrl** to highlight text under the cursor
- **Ctrl + Click** to speak — or speak the current selection (selection takes priority)
- Click again to stop
- EN / RU / TR voices
- Speed slider (0.5× – 2×)
- Works inside iframes
- Lightweight cursor-following speaker indicator while speaking
- No tracking, no network calls except optional Edge TTS for the context menu

> **Note:** The Turkish (TR) voice is available only in **Microsoft Edge**.
> In Chrome, TR will silently fall back to another installed voice.

## Install (unpacked)

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder with `manifest.json`.
5. Pin the extension to the toolbar.

## Usage

1. Click the extension icon and turn **Mode** on.
2. On any page, hold **Ctrl** — text under the cursor gets a colored outline.
3. **Ctrl + Click** the text to hear it.
4. Click again (anywhere) to stop.
5. If you have text selected, **Ctrl + Click** speaks only the selection.

In the popup you can also:

- Pick the voice: **EN**, **RU**, **TR** (TR in Edge only)
- Adjust speed with the slider
- Turn the mode on/off

## How it works

- `content.js` runs in all frames, handles Ctrl tracking, hover highlight, and speech via the Web Speech API.
- `background.js` provides the context menu ("Speak selection") and optional Edge TTS for higher-quality audio.
- `popup.html` / `popup.js` — settings UI; everything is stored in `chrome.storage.local`.

## Files
