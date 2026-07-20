---
name: EXTENSION_CHAT
type: architecture-spine
purpose: build-substrate
altitude: feature
paradigm: Chrome Extension (Manifest V3) with Offscreen WebSocket Client
scope: TikTok Live Chat DOM extraction and localhost HTTP/WS forwarding
status: final
created: 2026-07-20
updated: 2026-07-20
binds: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10]
sources: []
companions: []
---

# Architecture Spine — EXTENSION_CHAT

## Design Paradigm

Chrome Extension (Manifest V3) architecture, separating responsibilities as follows:
- **Content Script**: Performs high-performance DOM monitoring and scraping on `tiktok.com/*/live` tabs.
- **Service Worker (Background Script)**: Coordinates message passing between UI, content scripts, and offscreen context. Holds state for port/protocol and active tab.
- **Offscreen Document**: Manages a persistent WebSocket connection to `localhost` and a buffer queue for connection dropouts, bypassing Manifest V3's ephemeral execution lifecycle constraints.
- **Popup UI**: Renders configuration settings (port, protocol, path, selectors), toggle switches, and a session-only rolling feed preview.

## Invariants & Rules

### AD-1 — Offscreen WebSocket Broker
- **Binds:** FR-5, FR-6
- **Prevents:** Network termination due to the 30-second inactive Service Worker limit, and bypasses secure-page (HTTPS) Mixed-Content blocks.
- **Rule:** The WebSocket client connection to `ws://localhost` must run inside an Offscreen Document spawned by the Service Worker. The Content Script must send parsed comments to the Service Worker via `chrome.runtime.sendMessage`, which in turn forwards them to the Offscreen Document to be transmitted.

### AD-2 — Dynamic Selector Storage
- **Binds:** FR-10
- **Prevents:** Extension downtime if TikTok changes its chat DOM class names or structure.
- **Rule:** The default selectors defined in `selectors.json` must be copied to `chrome.storage.local` upon installation. The Content Script must query selectors dynamically from `chrome.storage.local` on start/change. The Popup Settings panel must allow editing these storage values in real time.

### AD-3 — Disconnection Buffer Queue
- **Binds:** FR-5, FR-6
- **Prevents:** Comment loss when the local coordinator (e.g. Flutter app) is restarted or temporarily unreachable.
- **Rule:** When the WebSocket connection is dropped, the Offscreen Document must buffer incoming parsed comments in a local memory queue (First-In, First-Out) up to a maximum limit of 100 comments. The queue must be completely flushed to the local server immediately upon successful reconnection.

### AD-4 — Flat Data Payload
- **Binds:** FR-5
- **Prevents:** Schema mismatch and parsing overhead in the local target coordinator.
- **Rule:** All messages sent over WebSocket or HTTP POST must be raw flat JSON objects matching:
  ```json
  {
    "platform": "tiktok",
    "nickname": "String",
    "username": "String",
    "message": "String",
    "profilePic": "String",
    "timestamp": 1690000000000
  }
  ```
  No wrapper envelope or event type wraps are permitted.

### AD-5 — Scraper Auto-Reattachment Loop
- **Binds:** FR-2
- **Prevents:** Silent scraping failures if the TikTok live chat container is reloaded, replaced, or if the page dynamically re-renders.
- **Rule:** The Content Script must run a 2-second interval checker loop. It must verify if the target chat container element still exists in the page DOM and if its `MutationObserver` is active. If the element is replaced or detached, it must locate the new container and re-attach the observer instantly.

### AD-6 — Popup-Only Preview Memory
- **Binds:** FR-8
- **Prevents:** Unnecessary background memory footprint when the extension is not being actively viewed.
- **Rule:** The list of the last 20 comments shown in the scrolling feed preview must be stored only in the memory of the Popup UI script. Closing the popup clears this list. The background Service Worker and Offscreen Document must not maintain a running preview history.

## Consistency Conventions

| Concern | Convention |
| --- | --- |
| Naming | Files: `kebab-case.js` (e.g., `content-script.js`). Classes & Functions: `camelCase`. |
| Storage keys | `selectors`, `connection_settings` (port, protocol, path, host), `monitoring_active`. |
| Message types | `{"type": "CHAT_MESSAGE", "payload": {...}}`, `{"type": "CONNECTION_STATUS", "status": "connected"}`. |

## Stack

| Name | Version |
| --- | --- |
| Chrome Extension Manifest | MV3 |
| Vanilla JS (ES6+) | Modern ECMAScript |

## Structural Seed

```text
EXTENSION_CHAT/
  manifest.json
  selectors.json
  popup/
    popup.html
    popup.js
    popup.css
  offscreen/
    offscreen.html
    offscreen.js
  content-script.js
  background.js
```

## Deferred
- Custom API key authentication or headers for the localhost endpoint.
- Support for multiple concurrent TikTok Live tab monitoring sessions.
- System tray notifications on connection loss.
