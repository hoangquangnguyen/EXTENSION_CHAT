---
baseline_commit: ed78c0b3a39728909cfbf8a4da7a4581894ba554
---

# Story 1.3: Implement Offscreen Document for local server forwarding

Status: review

## Story

As a developer/streamer (Nhquang),
I want the background Service Worker to spawn an Offscreen Document, coordinate message passing, and forward parsed comments to a local server using either WebSocket or HTTP POST based on connection settings,
so that comments are forwarded in real-time to the local server without being affected by the background Service Worker's ephemeral lifecycle or Mixed-Content restrictions.

## Acceptance Criteria

1. **Offscreen Document Lifecycle (AC-1):** The background Service Worker (`background.js`) manages the lifecycle of the Offscreen Document. It spawns the document when `monitoring_active` is set to `true`, and closes it via `chrome.offscreen.closeDocument()` when `monitoring_active` becomes `false`.
2. **Dynamic Offscreen Check (AC-2):** The Service Worker checks if an offscreen document already exists before attempting to create one using `chrome.runtime.getContexts` or standard error catching, avoiding runtime exceptions from duplicate creation.
3. **Message Relay (AC-3):** When the background Service Worker receives a comment payload via `chrome.runtime.sendMessage` of type `CHAT_MESSAGE` from the content script, it forwards/relays it to the active Offscreen Document.
4. **Connection Settings Retrieval (AC-4):** The Offscreen Document reads `connection_settings` from `chrome.storage.local` key `connection_settings` on startup and dynamically updates/restarts its connections when these settings are updated at runtime (via `chrome.storage.onChanged`). Default settings if not configured: `host: "localhost"`, `port: "3000"`, `protocol: "ws"`, `path: "/"`.
5. **WebSocket Client Transport (AC-5):** When the configured protocol is `ws`, the Offscreen Document opens a persistent WebSocket connection to `ws://{host}:{port}{path}` and transmits parsed comment payloads as raw flat JSON strings (complying with the payload schema).
6. **HTTP POST Transport (AC-6):** When the configured protocol is `http`, the Offscreen Document forwards the parsed comment payloads as flat JSON strings via HTTP POST requests to `http://{host}:{port}{path}` using the standard `fetch` API.
7. **Resource Clean-up (AC-7):** When `monitoring_active` is set to `false`, the Offscreen Document terminates any open WebSocket connections and releases networking resources.

## Tasks / Subtasks

- [x] Task 1: Background Service Worker Lifecycle and Broker Control (AC-1, AC-2, AC-3)
  - [x] Add `connection_settings` initialization default values to `background.js` inside `onInstalled`.
  - [x] Implement `manageOffscreenDocument(active)` function in `background.js` to create or close the offscreen document based on state.
  - [x] Implement robust check (e.g., using `chrome.runtime.getContexts` or standard error catching) to verify offscreen document presence before spawning.
  - [x] Add runtime message listener in `background.js` to intercept `CHAT_MESSAGE` and relay it to the offscreen document.
- [x] Task 2: Offscreen Document Networking Clients (AC-4, AC-5, AC-6, AC-7)
  - [x] Query `connection_settings` and `monitoring_active` in `offscreen.js` on startup and listen for changes dynamically.
  - [x] Implement WebSocket client functions: `connectWebSocket()`, `disconnectWebSocket()`, and `sendViaWebSocket(payload)`.
  - [x] Implement HTTP client function: `sendViaHttpPost(payload)` using fetch API.
  - [x] Implement `handleChatMessage(payload)` that routes comments depending on the active protocol (`ws` vs `http`).

## Dev Notes

- **Architecture Invariant Compliance:**
  - **AD-1 — Offscreen WebSocket Broker:** Avoid opening WebSocket connections directly from the content script. Network transport must reside in `offscreen/offscreen.js`.
  - **AD-4 — Flat Data Payload:** Conforms to the flat JSON convention:
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
- **Chrome Offscreen API Considerations:**
  - Creating an offscreen document requires a reason and path:
    ```javascript
    chrome.offscreen.createDocument({
      url: chrome.runtime.getURL("offscreen/offscreen.html"),
      reasons: [chrome.offscreen.Reason.WEBSOCKETS],
      justification: "Forward TikTok Live comment payloads to local WebSocket/HTTP server"
    });
    ```
  - In Chrome extensions, the background script can check if contexts exist. `chrome.runtime.getContexts` is supported in newer Chrome versions, but a simple try-catch or global variable state tracking (e.g., `let offscreenCreating = null`) can prevent concurrent overlapping calls.
- **WebSocket and HTTP Client details:**
  - Standard WebSocket handles `ws://` protocols. If connection fails in this story, log errors using `console.error`. Advanced auto-reconnect and comment buffering (FIFO queue up to 100) are reserved for **Story 1.4**.
  - Keep the code clean, modular, and well-commented.

### Project Structure Notes

- Relies on existing structure matching the seed:
  ```text
  EXTENSION_CHAT/
    manifest.json
    background.js
    content-script.js
    offscreen/
      offscreen.html
      offscreen.js
  ```

### References

- [PRD CAP-4: Local Forwarding Broker](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CAP-4)
- [PRD Constraint CO-1: Offscreen Broker](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CO-1)
- [PRD Constraint CO-4: Flat Payload Schema](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CO-4)
- [Architecture Spine AD-1: Offscreen WebSocket Broker](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/planning-artifacts/architecture/architecture-EXTENSION_CHAT-2026-07-20/ARCHITECTURE-SPINE.md#AD-1)
- [Architecture Spine AD-4: Flat Data Payload](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/planning-artifacts/architecture/architecture-EXTENSION_CHAT-2026-07-20/ARCHITECTURE-SPINE.md#AD-4)
- [conventions.md §1 & §2](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/conventions.md)

## Dev Agent Record

### Agent Model Used

Gemini 3.5 Flash (Medium)

### Debug Log References

- Mock verification assertions logged in execution console of `test-story-1-3.js`.

### Completion Notes List

- Implemented `connection_settings` default initialization in `background.js` on install.
- Implemented background Service Worker managing lifecycle of Offscreen Document dynamically based on `monitoring_active` changes.
- Implemented robust `hasOffscreenDocument` check using `chrome.runtime.getContexts` (and fallback `getViews`).
- Added message broker relay inside `background.js` forwarding `CHAT_MESSAGE` to active offscreen document context.
- Implemented WebSocket persistent client inside `offscreen.js` with connection status updates.
- Implemented HTTP POST transport client inside `offscreen.js` using fetch.
- Filtered out direct content script broadcasts in offscreen to avoid duplicate comment processing.
- Verified all behaviors using Node.js sandboxed testing in `_bmad-output/scratch/test-story-1-3.js` (100% test passes).

### File List

- [background.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/background.js)
- [offscreen/offscreen.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/offscreen/offscreen.js)
- [_bmad-output/scratch/test-story-1-3.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/scratch/test-story-1-3.js)
