# Story 1.5: Create Popup UI dashboard with settings and rolling comment preview

Status: review

## Story

As a developer/streamer (Nhquang),
I want a modern, clean Popup UI dashboard that displays connection configurations, allows toggling the scraper on/off, shows connection status feedback, and displays a rolling list of the last 20 comments in memory,
so that I can easily configure and monitor the extension's behavior and see live feedback.

## Acceptance Criteria

1. **Active Page Detection (AC-1):** The "Start Monitoring" toggle switch must be enabled only if the active tab is a valid TikTok Live stream URL matching `*://*.tiktok.com/*/live*` or `*://*.tiktok.com/live*`. On non-matching pages, the toggle must be disabled and display the warning message: "Please navigate to a TikTok Live stream page."
2. **Scraper State Toggle (AC-2):** Toggling monitoring to `true` updates `monitoring_active: true` in `chrome.storage.local`. Toggling it to `false` updates `monitoring_active: false` in `chrome.storage.local`.
3. **Connection Settings Panel (AC-3):** The settings panel in the Popup must allow the user to view and modify `connection_settings` (`host`, `port`, `protocol`, `path`) in `chrome.storage.local`. Modifying these settings must update the local storage in real-time.
4. **Connection Status Feedback (AC-4):** The Popup must display the current connection status (`Disconnected`, `Connecting`, or `Connected`) based on `chrome.storage.local` key `connection_status` or incoming `CONNECTION_STATUS` messages, updating the status indicator color/text dynamically.
5. **Live Rolling Preview (AC-5):** The Popup UI must display a scrolling feed of the last 20 comments captured during the active session. If a new comment arrives and the list has 20 comments, the oldest comment must be removed from the DOM and memory.
6. **Popup-Only Preview Memory (AC-6):** The preview list must exist only in the temporary popup UI memory. The Service Worker and Offscreen Document must not maintain any history, and closing the popup must clear the preview list.
7. **Dynamic Selectors Configuration (AC-7):** The Popup must provide a settings section allowing editing the active DOM selectors (`chatContainer`, `commentNode`, `nickname`, `username`, `message`, `profilePic`) stored in `chrome.storage.local`. Saving these selectors must update local storage immediately.

## Tasks / Subtasks

- [ ] Task 1: Design Premium UI and Styling (Popup HTML & CSS)
  - [ ] Implement layout with modern, premium dark-mode styling (e.g. dynamic background/colors, smooth borders, nice typography).
  - [ ] Create layout sections: Connection settings (Host, Port, Protocol, Path), Selector settings (collapsible / toggleable panel), Scraper Control Toggle, Connection Status indicator, and rolling comment list.
- [ ] Task 2: Active Tab & URL Validation (AC-1)
  - [ ] Query the current active tab dynamically when the popup opens.
  - [ ] Check if the active tab URL matches valid TikTok Live streams (`*://*.tiktok.com/*/live*` or `*://*.tiktok.com/live*`).
  - [ ] If invalid, disable the Start/Stop toggle switch and display the warning notice.
- [ ] Task 3: Load & Save Settings and State (AC-2, AC-3, AC-7)
  - [ ] Read `connection_settings`, `selectors`, and `monitoring_active` from `chrome.storage.local` upon popup loading and pre-fill form fields.
  - [ ] Save modifications to `connection_settings` (including changes to host, port, protocol, path dropdown) and update `chrome.storage.local`.
  - [ ] Save modifications to selectors (Chat Container, Comment Node, Nickname, Username, Message, Profile Pic) and update `chrome.storage.local`.
- [ ] Task 4: Real-time Connection Status (AC-4)
  - [ ] Listen for changes to `connection_status` or `monitoring_active` in storage.
  - [ ] Listen for runtime messages of type `CONNECTION_STATUS` and update status text/badge indicator styles (e.g. Green for Connected, Yellow for Connecting, Red/Gray for Disconnected).
- [ ] Task 5: Live Scrolling Feed Preview (AC-5, AC-6)
  - [ ] Listen for runtime messages of type `CHAT_MESSAGE` containing comment payloads.
  - [ ] Maintain an in-memory array of up to 20 comments within the popup script's volatile scope.
  - [ ] Append new comments dynamically to the scrolling list container.
  - [ ] Trim the list to enforce a strict limit of 20 comments, immediately discarding oldest elements from both DOM and memory array.

## Dev Notes

- **Aesthetics & Styling:**
  - Standard guidelines demand premium looks. Use custom styled inputs, buttons, toggles, gradients, and rounded corners. Avoid default browser controls where possible.
  - Provide good layout hierarchy: Settings at the top (potentially collapsible to save space), status in the middle, comment feed occupying the scrollable bottom section.
- **Chrome APIs Usage:**
  - Active Tab details require querying `chrome.tabs.query({ active: true, currentWindow: true })`.
  - Listeners for incoming messages: `chrome.runtime.onMessage.addListener(...)`.
  - Local storage retrieval: `chrome.storage.local.get(...)` and writes: `chrome.storage.local.set(...)`.
  - Ensure popup closes/clears correctly (default behavior for browser popup ensures script executes from clean state upon reopen, so no history persistence in background context).

### Project Structure Notes

- Extends files in `popup/`:
  ```text
  popup/
    popup.html
    popup.js
    popup.css
  ```

### References

- [PRD CAP-1: Active Page Detection](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CAP-1)
- [PRD CAP-5: Status Tracking](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CAP-5)
- [PRD CAP-6: Extension Dashboard](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CAP-6)
- [PRD Constraint CO-6: Popup-Only Preview](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CO-6)
- [Architecture Spine AD-6: Popup-Only Preview](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/planning-artifacts/architecture/architecture-EXTENSION_CHAT-2026-07-20/ARCHITECTURE-SPINE.md#AD-6)
- [conventions.md §2 & §3](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/conventions.md)

## Dev Agent Record

### Agent Model Used

Gemini 3.5 Flash (Medium)

### Debug Log References

- Mock verification assertions logged in execution console of `test-story-1-5.js`.

### Completion Notes List

- Designed a premium, modern dark-themed layout using HTML5 semantic elements and Vanilla CSS with custom scrollbars and transition effects.
- Implemented active tab URL validation using a robust regex match to check valid live stream pages and disable controls on invalid pages.
- Prefilled settings inputs and selectors from `chrome.storage.local` on popup startup and saved changes back to storage dynamically.
- Synchronized status indicator badge dynamically matching `chrome.storage` updates and `CONNECTION_STATUS` runtime messages.
- Programmed a rolling preview feed capped at 20 comments, safely pruning oldest comments from the DOM and memory.
- Wrote and passed a comprehensive Node.js unit test suite simulating chrome tabs, storage, runtime messaging, and DOM manipulation.

### File List

- [popup/popup.html](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/popup/popup.html)
- [popup/popup.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/popup/popup.js)
- [popup/popup.css](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/popup/popup.css)
- [_bmad-output/scratch/test-story-1-5.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/scratch/test-story-1-5.js)
