---
id: SPEC-EXTENSION_CHAT
companions:
  - conventions.md
  - ../../planning-artifacts/architecture/architecture-EXTENSION_CHAT-2026-07-20/ARCHITECTURE-SPINE.md
sources:
  - ../../planning-artifacts/prds/prd-EXTENSION_CHAT-2026-07-20/prd.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# TikTok Chat Chrome Extension SPEC

## Why

Streamers and developers (such as Nhquang) need a way to capture TikTok live stream comments and route them to local processing applications (e.g. Flutter live chat coordinator or Text-To-Speech systems) without the complexity of cloud servers, third-party scraping subscription services, or manual interaction. A lightweight, locally-running Chrome extension provides real-time DOM extraction and forwards structured payloads to `localhost` protocols directly.

## Capabilities

- **CAP-1**
  - **intent:** Extension detects if the active tab is a valid TikTok Live stream URL and restricts operations appropriately.
  - **success:** The Start monitoring toggle is enabled only on URLs matching `*://*.tiktok.com/*/live*` or `*://*.tiktok.com/live*`. On non-matching pages, the toggle is disabled and displays the warning: "Please navigate to a TikTok Live stream page."
- **CAP-2**
  - **intent:** Content Script monitors the TikTok Live chat DOM container to capture and parse incoming comments in real-time.
  - **success:** New comment elements are parsed to extract user nickname, username, comment text, and profile picture avatar URL within 200ms of appearing in the DOM.
- **CAP-3**
  - **intent:** Content Script retrieves CSS query selectors dynamically from local storage to handle potential DOM structure changes at runtime.
  - **success:** Modifying target CSS selectors in local storage updates the elements queried by the scraper immediately without requiring an extension restart or update.
- **CAP-4**
  - **intent:** Offscreen document forwards parsed comment payloads in real-time to a local target server.
  - **success:** Comments are sent as raw flat JSON objects over the configured localhost port using either WebSocket or HTTP POST based on user settings.
- **CAP-5**
  - **intent:** Extension tracks the localhost connection state and automatically attempts recovery upon connection loss.
  - **success:** The UI displays current status indicator states (`Disconnected`, `Connecting`, `Connected`, `Monitoring Active`), and the connection client automatically retries failed/dropped connections every 5 seconds.
- **CAP-6**
  - **intent:** Popup UI dashboard manages session monitoring and renders a live, rolling comment stream.
  - **success:** The toggle switch controls the active/inactive state of both the DOM scraper and connection client, and the UI displays a scrolling list of the last 20 captured comments.

## Constraints

- **CO-1 (Offscreen Broker):** The WebSocket connection to `localhost` must run inside an Offscreen Document spawned by the background Service Worker to prevent connection drops from Service Worker ephemerality (30-second inactive limit) and to bypass secure-page mixed-content blocks.
- **CO-2 (Storage Initialization):** Default DOM selectors from `selectors.json` must be copied to `chrome.storage.local` upon extension installation, and the Content Script must read them dynamically.
- **CO-3 (Reconnection Buffer):** When the localhost server is disconnected, the Offscreen Document must buffer up to 100 comments in a First-In, First-Out memory queue, flushing them to the server immediately upon reconnection.
- **CO-4 (Flat Payload Schema):** All comments sent via WebSocket or HTTP POST must be raw flat JSON objects with no wrapping envelopes or event type packaging, matching the defined schema exactly.
- **CO-5 (Scraper Reattachment Loop):** The Content Script must run a 2-second checker interval to verify if the active MutationObserver is still attached to a valid chat container DOM element, and re-initialize the observer if the element is detached or replaced.
- **CO-6 (Popup-Only Preview):** The scrolling live preview list of up to 20 comments must exist only in the temporary popup UI memory. The background contexts (Service Worker, Offscreen Document) must not maintain any preview history, and closing the popup must clear the preview list.

## Non-goals

- **No Cloud Database or Syncing:** All connection states, settings, and scraped messages must remain entirely local to the extension and user's machine.
- **No Native TTS/Audio Output:** Audio or TTS playback must not be performed inside the extension; audio generation is delegated entirely to the external local host coordinator.
- **No Multi-Tab Scraping:** The extension must only target and scrape the active/selected TikTok Live stream page in the current window.
- **No Local Server Authentication:** Transport credentials, authorization headers, or access tokens for the localhost server are out of scope.

## Success signal

- The extension executes continuously for 1 hour on a high-volume live stream (10+ comments/second) without freezing the browser tab or leaking memory, while forwarding 100% of captured comments to the local application.
