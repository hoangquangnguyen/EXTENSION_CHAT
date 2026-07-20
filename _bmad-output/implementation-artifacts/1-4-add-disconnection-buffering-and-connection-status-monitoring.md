# Story 1.4: Add disconnection buffering and connection status monitoring

Status: review

## Story

As a developer/streamer (Nhquang),
I want the extension's Offscreen Document to automatically monitor connection state, attempt recovery every 5 seconds upon disconnect, and buffer comments in memory during downtime,
so that I do not lose any live stream comments when my local coordinator application is restarted or briefly offline.

## Acceptance Criteria

1. **Auto-Reconnection (AC-1):** In WebSocket mode, if the connection to the server is lost or fails to open, and monitoring is active, the client must automatically retry connection establishment every 5 seconds.
2. **HTTP Failure Detection (AC-2):** In HTTP POST mode, if a request fails (throws a network error or returns a non-2xx status code), the connection status must update to `disconnected` and trigger connection recovery polling.
3. **In-Memory FIFO Buffer (AC-3):** The Offscreen Document must implement an in-memory queue to buffer comments during disconnections. The queue size must not exceed 100 comments.
4. **Buffer Size Cap (AC-4):** If the buffer is full (100 comments) and a new comment arrives, the oldest comment (index 0) must be discarded to keep the memory footprint bounded.
5. **Flush-on-Reconnection (AC-5):** When the connection (either WS or HTTP) is re-established, the buffer must be flushed to the local server in the original order. If flushing fails midway, remaining comments must be kept in the buffer.
6. **No Storage Overhead (AC-6):** The queue must be stored entirely in offscreen page memory (plain JavaScript array). Do not write comments to `chrome.storage.local` to avoid heavy disk IO overhead.
7. **Connection State Propagation (AC-7):** The Offscreen Document must send `CONNECTION_STATUS` updates (states: `disconnected`, `connecting`, `connected`) via `chrome.runtime.sendMessage` to inform background/popup of state transitions.

## Tasks

- [x] Implement connection status monitoring and auto-reconnection in `offscreen/offscreen.js`.
- [x] Implement in-memory FIFO queue (max 100 comments) to buffer comments during disconnection.
- [x] Verify buffer flushing in correct order upon reconnection.
- [x] Propagate connection status changes.
- [x] Verify with automated Node.js tests.

## Dev Notes

- **Architecture Invariant Compliance:**
  - **AD-3 — Disconnection Buffer Queue:** Implemented a plain memory JS array `commentBuffer` inside the Offscreen Document context. It is capped at 100 entries, dropping the oldest comment first (FIFO) on overflow. Comments are not written to `chrome.storage.local`.
  - **AD-4 — Flat Data Payload:** Flushed comments are sent exactly as they are received (already formatted in flat JSON schema by the content script / background relay).
- **Transport Reliability:**
  - WebSocket auto-reconnects every 5 seconds using `setInterval` when monitoring is active and status is not connected or connecting.
  - HTTP POST failures trigger a transition to `disconnected` and schedule a 5-second interval timer.
  - While HTTP is disconnected, the polling loop attempts to ping the server. If the buffer is non-empty, it probes using the first buffered comment (removing it on success and triggering a flush for the rest of the queue). If the buffer is empty, it uses a simple GET request.
  - Correct WebSocket teardown/disconnection is performed when switching connection settings from WebSocket to HTTP at runtime.

## Completion Notes List

- Implemented in-memory `commentBuffer` array capped at 100 elements.
- Implemented state tracking: `connectionStatus` (`disconnected`, `connecting`, `connected`).
- Implemented WebSocket `onclose` handler and catch-block handlers to trigger `handleDisconnect()` and schedule the 5-second reconnection loop.
- Implemented HTTP error and response-failure handlers inside `sendViaHttpPost()` to fall back to `handleDisconnect()` and queue message payloads.
- Implemented `checkHttpConnection()` polling routine for HTTP recovery using buffered messages or GET requests.
- Implemented `flushBuffer()` which flushes WebSocket messages synchronously and HTTP messages sequentially via recursion.
- Added connection settings change listener teardown: closes active WebSocket when switching protocol from `ws` to `http` at runtime.
- Propagated status updates through messages (`type: "CONNECTION_STATUS"`) and storage updates (`connection_status`).
- Verified all behaviors using Node.js sandboxed testing in `_bmad-output/scratch/test-story-1-4.js` (100% test passes).

## File List

- [offscreen/offscreen.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/offscreen/offscreen.js)
- [_bmad-output/scratch/test-story-1-4.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/scratch/test-story-1-4.js)
