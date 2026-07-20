---
baseline_commit: 75ff86aa2f394c467fb7588c26a5a8954222dcc9
---

# Story 1.2: Implement Content Script for real-time comment extraction

Status: review

## Story

As a developer/streamer (Nhquang),
I want the Content Script to monitor the TikTok Live chat DOM container using a MutationObserver and parse new comments dynamically, while verifying the observer state with a 2-second checker interval,
so that comment payloads are reliably captured and sent to the background script in real-time as they appear in the DOM.

## Acceptance Criteria

1. **Dynamic Selector Retrieval (AC-1):** The Content Script reads the active DOM selectors from `chrome.storage.local` key `selectors` on startup and dynamically updates its configuration whenever selectors are modified at runtime by listening to `chrome.storage.onChanged`.
2. **High-Performance Observer (AC-2):** When monitoring is active (`monitoring_active` is set to `true` in `chrome.storage.local`), the Content Script initializes a `MutationObserver` on the target chat container element using the configured selector.
3. **Robust Node Parsing (AC-3):** Newly added chat message nodes matching the comment selector are parsed to extract:
   - `platform`: `"tiktok"`
   - `nickname`: Display name of the commenter.
   - `username`: Unique handle of the commenter (e.g., `@username`).
   - `message`: Text message content.
   - `profilePic`: Avatar image source URL.
   - `timestamp`: Epoch milliseconds integer of when the comment was processed.
   The extracted fields must conform to the flat JSON schema specified in `conventions.md`.
4. **Resilient Handling (AC-4):** Individual comment parsing logic must be wrapped in `try-catch` blocks. Any parsing failure (e.g., due to an unexpected layout change or a missing element/selector) must not throw unhandled exceptions, halt the scraper, or crash the host TikTok page execution. Fallback values (like empty strings) should be used gracefully.
5. **Real-time Event Dispatch (AC-5):** Successfully parsed comments must be instantly dispatched to the background Service Worker via `chrome.runtime.sendMessage` with the `CHAT_MESSAGE` internal message frame.
6. **Auto-Reattachment Loop (AC-6):** The Content Script must run a 2-second interval loop (`setInterval`) to verify:
   - Whether the target chat container element is still present in the page DOM.
   - Whether the `MutationObserver` is active and attached to the correct element.
   If the container element is detached, re-rendered, or replaced, the loop must automatically search for the new container and re-attach the observer immediately.
7. **Observer State Coordination (AC-7):** The Content Script must observe the `monitoring_active` key in `chrome.storage.local`. If it changes to `false`, the observer is disconnected, the checker interval is suspended, and resources are cleared. If it changes to `true`, the scraping session is re-initialized.

## Tasks / Subtasks

- [x] Task 1: Storage Listeners and Selectors Management (AC-1, AC-7)
  - [x] Implement startup initialization to query `selectors` and `monitoring_active` from `chrome.storage.local`.
  - [x] Implement a `chrome.storage.onChanged` listener to dynamically handle changes to `selectors` (updating selectors in memory) and `monitoring_active` (starting or stopping the observation state).
- [x] Task 2: MutationObserver Setup and DOM Scraping (AC-2, AC-3, AC-4, AC-5)
  - [x] Implement `startMonitoring()` to locate the chat container element using the `chatContainer` selector and attach a MutationObserver.
  - [x] Implement MutationObserver callback to iterate over newly added nodes matching the `commentNode` selector.
  - [x] Implement `parseCommentNode(node)` that parses nickname, username, message, and avatar source.
  - [x] Add robust try-catch handling in the node parsing loop to log parsing failures without halting execution.
  - [x] Format the payload exactly to the convention schema and forward it using `chrome.runtime.sendMessage({ type: "CHAT_MESSAGE", payload })`.
  - [x] Implement `stopMonitoring()` to cleanly disconnect the observer, clear any state, and reset pointers.
- [x] Task 3: Auto-Reattachment Interval (AC-6)
  - [x] Implement a 2-second check loop using `setInterval` when monitoring is active.
  - [x] Ensure the loop checks if the target chat container element is still attached to the DOM and the observer is running.
  - [x] Re-bind observer if the target element is detached or replaced.
  - [x] Ensure the interval is cleared upon `stopMonitoring()`.

## Dev Notes

- **Architecture Invariant Compliance:**
  - **AD-2 — Dynamic Selector Storage:** Retrieve selectors dynamically from storage. Listen to runtime selector updates.
  - **AD-5 — Scraper Auto-Reattachment Loop:** Check container and observer status every 2 seconds.
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
- **DOM Parsing Details:**
  - Standard live chat list nodes might contain multiple child elements or badge icons. Ensure that text extractions for `nickname`, `username`, and `message` extract pure text (using `.innerText` or `.textContent`) and strip extraneous whitespace.
  - Emojis in comments must be preserved in the `message` string.
  - Profile image selector will point to an `img` element. Extract the `src` attribute. If it's missing or matches a lazy-loading placeholder (e.g. data-src is present instead), fetch the real image URL. If not found, default to an empty string.
  - Ensure resource cleanup (disconnect observer, clear interval) is executed cleanly to prevent memory leaks in the active tab context.

### References

- [PRD FR-2: Real-time Comment Capture](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/planning-artifacts/prds/prd-EXTENSION_CHAT-2026-07-20/prd.md#FR-2)
- [PRD FR-3: Comment Parsing](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/planning-artifacts/prds/prd-EXTENSION_CHAT-2026-07-20/prd.md#FR-3)
- [PRD FR-10: Configurable CSS Selectors](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/planning-artifacts/prds/prd-EXTENSION_CHAT-2026-07-20/prd.md#FR-10)
- [Architecture Spine AD-2: Dynamic Selector Storage](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/planning-artifacts/architecture/architecture-EXTENSION_CHAT-2026-07-20/ARCHITECTURE-SPINE.md#AD-2)
- [Architecture Spine AD-5: Scraper Auto-Reattachment Loop](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/planning-artifacts/architecture/architecture-EXTENSION_CHAT-2026-07-20/ARCHITECTURE-SPINE.md#AD-5)
- [conventions.md §1 & §2](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/conventions.md)
- [SPEC.md CAP-2: Real-time Comment Extraction](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CAP-2)
- [SPEC.md CAP-3: Selector Retrieval](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CAP-3)
- [SPEC.md Constraint CO-5: Scraper Reattachment Loop](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CO-5)

## Dev Agent Record

### Agent Model Used

Gemini 3.5 Flash (Medium)

### Debug Log References

- Mock verification assertions logged in execution console of `test-content-script.js`.

### Completion Notes List

- Implemented dynamic selectors loading from `chrome.storage.local` inside `content-script.js`.
- Implemented MutationObserver for real-time TikTok chat container DOM scraping matching selectors.
- Created `parseCommentNode` with robust `try-catch` wrapper for fault-resilient parsing.
- Added lazy-loading fallback logic for comment avatar images.
- Implemented dynamic state updating by listening to `chrome.storage.onChanged` events.
- Created a 2-second heartbeat loop checking observed container presence and re-binding dynamically upon replacement or page shifts.
- Implemented node-based sandboxed testing (`test-content-script.js`) validating all core functionality and edge cases with 100% assertion passes.

### File List

- [content-script.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/content-script.js)
