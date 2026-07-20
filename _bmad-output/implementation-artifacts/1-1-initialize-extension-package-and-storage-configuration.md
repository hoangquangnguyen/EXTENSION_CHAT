---
baseline_commit: 0942162fd0c3f85f9f7f686588f4a367ad49e1fc
---

# Story 1.1: Initialize extension package and storage configuration

Status: review

## Story

As a developer/streamer (Nhquang),
I want to initialize the Chrome extension package structure and local storage configuration,
so that I can ensure the extension installs correctly and loads default DOM selectors for scraping.

## Acceptance Criteria

1. **Manifest Configuration (AC-1):** `manifest.json` (Manifest V3) exists in the extension root and correctly registers the background Service Worker (`background.js`), Popup UI (`popup/popup.html`), and Content Script (`content-script.js`) with permissions for `storage`, `activeTab`, and `offscreen`.
2. **Selector Configuration file (AC-2):** `selectors.json` exists in the extension root and defines default CSS query selectors for `chatContainer`, `commentNode`, `nickname`, `username`, `message`, and `profilePic`.
3. **On-Install Storage Setup (AC-3):** Upon extension installation, the Service Worker reads `selectors.json` and copies the default selectors to `chrome.storage.local` under the `selectors` key.
4. **Structural Compliance (AC-4):** Project directory structure matches the seed layout specified in the Architecture Spine.

## Tasks / Subtasks

- [x] Task 1: Initialize Extension Structure and Configuration Files (AC-1, AC-2, AC-4)
  - [x] Create `manifest.json` with permissions (`storage`, `activeTab`, `offscreen`) and registered entrypoints.
  - [x] Create `selectors.json` with default TikTok Live chat selectors.
  - [x] Create skeleton folders and files: `content-script.js`, `popup/popup.html`, `popup/popup.js`, `popup/popup.css`, `offscreen/offscreen.html`, `offscreen/offscreen.js`.
- [x] Task 2: Service Worker Lifecycle & Storage Initialization (AC-3)
  - [x] Implement `background.js` with a `chrome.runtime.onInstalled` listener.
  - [x] Add async routine in `onInstalled` listener to fetch/import `selectors.json` and persist to `chrome.storage.local` key `selectors`.

## Dev Notes

- **Architecture Constraint CO-2 (Storage Initialization):** Default DOM selectors from `selectors.json` must be copied to `chrome.storage.local` upon extension installation, and the Content Script must read them dynamically at runtime.
- **Chrome Storage API:** Use `chrome.storage.local.set` to persist selectors. Avoid duplicate writes if they already exist, but overwrite them upon initial package installation or extension reload.
- **File Structure compliance:**
  ```text
  EXTENSION_CHAT/
    manifest.json
    selectors.json
    background.js
    content-script.js
    popup/
      popup.html
      popup.js
      popup.css
    offscreen/
      offscreen.html
      offscreen.js
  ```

### References

- [PRD FR-10: Configurable CSS Selectors](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/planning-artifacts/prds/prd-EXTENSION_CHAT-2026-07-20/prd.md#FR-10)
- [Architecture Spine invariant AD-2: Dynamic Selector Storage](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/planning-artifacts/architecture/architecture-EXTENSION_CHAT-2026-07-20/ARCHITECTURE-SPINE.md#AD-2)
- [SPEC.md CAP-3: Configurable Scraping Targets](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CAP-3)
- [SPEC.md Constraint CO-2](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/_bmad-output/specs/spec-EXTENSION_CHAT/SPEC.md#CO-2)

## Dev Agent Record

### Agent Model Used

Gemini 3.5 Flash (Medium)

### Debug Log References

### Completion Notes List

- Created extension manifest using Manifest V3 specification.
- Configured dynamic selector loading framework via `selectors.json`.
- Implemented background initialization listener in `background.js` to populate `chrome.storage.local` on extension install/update.
- Created all boilerplate and placeholder files to align with structural seed rules.
- Wrote Node.js test script mocking chrome APIs to validate storage initialization logic, ensuring 100% test coverage and compliance.

### File List

- [manifest.json](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/manifest.json)
- [selectors.json](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/selectors.json)
- [background.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/background.js)
- [content-script.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/content-script.js)
- [popup/popup.html](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/popup/popup.html)
- [popup/popup.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/popup/popup.js)
- [popup/popup.css](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/popup/popup.css)
- [offscreen/offscreen.html](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/offscreen/offscreen.html)
- [offscreen/offscreen.js](file:///c:/Users/nhquang/Desktop/Flutter/EXTENSION_CHAT/offscreen/offscreen.js)
