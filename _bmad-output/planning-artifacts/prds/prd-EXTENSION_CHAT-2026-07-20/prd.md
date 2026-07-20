---
title: TikTok Chat Chrome Extension PRD
status: final
created: 2026-07-20
updated: 2026-07-20
---

# PRD: TikTok Chat Chrome Extension

## 0. Document Purpose
This Product Requirements Document (PRD) defines the scope, requirements, and design for a lightweight Google Chrome Extension that extracts live chat messages from active TikTok stream pages in real-time. This document is written for developers and downstream stakeholders to implement the extension and integrate it with local applications (such as a local Flutter live chat coordinator). Requirements are defined with globally unique IDs (e.g., FR-1) and inline assumptions are flagged with `[ASSUMPTION]` tags.

## 1. Vision
The TikTok Chat Chrome Extension is a simple, lightweight utility that allows users to monitor TikTok Live streams and capture real-time comments. Instead of manually copying or using heavy, un-integratable third-party services, this extension runs locally within the browser. It monitors the active TikTok live page, displays the live feed on its user interface, and instantly forwards comments via HTTP/WebSocket to a local server (`localhost`), enabling seamless integrations with external tools like Text-To-Speech (TTS) coordinators or dashboard apps.

## 2. Target User

### 2.1 Jobs To Be Done
- **Capture Live Interactions:** As a streamer or streamer assistant, I want to capture TikTok live chat messages in real-time so that I can process them locally.
- **Local Application Integration:** As a developer/user (Nhquang), I want to easily stream active TikTok comments to my local Flutter application via a reliable local connection (localhost) without complex cloud setups.
- **Real-time Monitoring Status:** I want to see if the connection is active and if comments are being successfully scraped and forwarded.

### 2.2 Non-Users (v1)
- **General Viewers:** Users who just want to watch the stream and do not have local applications or a need to capture chat data.
- **Historical Exporters:** Users looking to export old/past live stream chat logs after a stream has already ended.

### 2.3 Key User Journeys

- **UJ-1. Nhquang streams TikTok live chat to local TTS application.**
  - **Persona + context:** Nhquang wants to run a TikTok live monitoring session and hear comments read out loud by a local TTS engine.
  - **Entry state:** Nhquang is viewing a TikTok live stream channel on Google Chrome, and his local Flutter live chat app is running, listening on port 8080.
  - **Path:**
    1. Nhquang clicks the Extension icon to open the Extension interface (Popup or Sidebar).
    2. He enters the local port configuration (`8080`) and sets the protocol to WebSocket.
    3. He toggles the "Start Monitoring" switch to "ON".
    4. The Extension connects to `ws://localhost:8080` and begins scanning the TikTok page's live chat DOM container.
  - **Climax:** When a viewer submits a comment on the TikTok stream, the comment is captured by the extension, rendered in the Extension UI, and instantly sent to `ws://localhost:8080`. The Flutter application receives the JSON payload and reads the comment via TTS.
  - **Resolution:** Nhquang leaves the tab open, listening to the comments, and can stop monitoring at any time by toggling the switch "OFF".
  - **Edge case:** If the local Flutter app is not running when the toggle is turned "ON", the Extension shows a "Connection Failed" status, keeping the local scraping paused until it can reconnect.

## 3. Glossary
- **TikTok Live Stream** — An active live broadcasting channel on `tiktok.com/@username/live`.
- **Extension UI** — The Chrome Extension frontend popup panel or sidebar window.
- **Content Script** — The Chrome Extension script that runs in the context of the TikTok live web page to access the DOM.
- **Local Host Port** — The local port on `localhost` (e.g., `8080` or `3000`) where the user's secondary application (e.g. Flutter app) listens for incoming chat events.
- **Comment Payload** — The JSON structured object containing comment details: nickname, username, profile image URL, and comment message.

## 4. Features

### 4.1 TikTok Live Chat Extraction
**Description:** The extension detects if the active tab is a TikTok Live stream. When monitoring is active, it runs a script that detects new comment elements added to the TikTok live chat container DOM. It parses and formats the information.
[ASSUMPTION: The extension will target the standard TikTok live chat CSS selectors, which may require updates if TikTok changes its DOM structure.]

**Functional Requirements:**

#### FR-1: Active Page Detection
The extension must check if the current active tab's URL matches TikTok Live streams (e.g., `*://*.tiktok.com/*/live*` or `*://*.tiktok.com/live*`). Realizes UJ-1.
**Consequences (testable):**
- Toggling monitoring is only enabled when the active tab is a valid TikTok Live page; otherwise, show a disabled state and a warning: "Please navigate to a TikTok Live stream page."

#### FR-2: Real-time Comment Capture
The extension's Content Script must monitor the TikTok Live chat DOM box for newly added nodes using a MutationObserver or efficient polling. Realizes UJ-1.
**Consequences (testable):**
- As soon as a new comment node appears in the DOM, the content script captures it within 200ms.

#### FR-3: Comment Parsing
The extension must parse the comment DOM node to extract the following fields into a structured JSON Comment Payload:
- `nickname`: Display name of the user.
- `username`: The unique handle of the user (e.g., `@user123`).
- `message`: The text message sent by the user.
- `profilePic`: URL of the user's profile avatar [ASSUMPTION: The profile pic URL is optional and will be set to empty if extraction fails due to lazy loading or blocking].
**Consequences (testable):**
- Correctly parses text and emojis. Emoticons and badges (like subscriber tags) are stripped or simplified.

#### FR-10: Configurable CSS Selectors
The extension must load the target CSS selectors (for the chat container, individual comment node, nickname, username, and message elements) from a local JSON configuration file (e.g., `selectors.json`) inside the extension package or allow updating them via the extension settings.
**Consequences (testable):**
- Modifying the selectors in the configuration file/interface changes the target elements targeted by the content script's observer and parser immediately, enabling rapid hot-fixes when TikTok's DOM changes.

### 4.2 Localhost Forwarding
**Description:** The extension connects to a local server running on the user's machine (localhost) and forwards the captured Comment Payloads in real-time. It supports configuration of the port, protocol (WebSocket or HTTP POST), and endpoint path.

**Functional Requirements:**

#### FR-4: Protocol Selection & Port Config
The extension must allow the user to configure connection settings on the UI:
- Protocol: `WebSocket` (recommended) or `HTTP POST`.
- Host: `localhost` or `127.0.0.1`.
- Port: Numeric value (e.g., `8080`, `3000`).
- Path/Endpoint: String value (e.g., `/comments` or `/` for WS).
**Consequences (testable):**
- Values are saved in `chrome.storage.local` and persisted between sessions.

#### FR-5: Real-time Forwarding
The extension must establish a client connection when monitoring is active and forward each parsed Comment Payload immediately.
**Consequences (testable):**
- Under WebSocket protocol: The extension opens a persistent connection and sends the payload as a JSON string stringified.
- Under HTTP POST protocol: The extension fires a POST request with `Content-Type: application/json` containing the payload.
- Payload structure:
  ```json
  {
    "platform": "tiktok",
    "nickname": "John Doe",
    "username": "johndoe",
    "message": "Hello stream!",
    "profilePic": "https://...",
    "timestamp": 1690000000000
  }
  ```

#### FR-6: Connection Status Monitoring
The extension must detect if the connection to the localhost port is successfully established or has failed, updating the UI accordingly.
**Consequences (testable):**
- If a connection drops, the extension retries connecting every 5 seconds (configurable) and displays a "Reconnecting..." state.

### 4.3 Extension UI (Popup/Sidebar)
**Description:** The Extension UI provides a simple dashboard to toggle monitoring, configure connection settings, and view a preview of incoming comments.

**Functional Requirements:**

#### FR-7: Monitoring Switch
The UI must provide a clear "Start/Stop" toggle switch.
**Consequences (testable):**
- Clicking "Start" initiates the Content Script scraping and establishes the local connection.
- Clicking "Stop" closes the local connection and halts DOM observation on the TikTok page.

#### FR-8: Live Feed Preview
The Extension UI must display a scrolling preview of the last 20 comments captured during the active session. Realizes UJ-1.
**Consequences (testable):**
- Performance must not degrade as comments stream in. Old comments beyond the 20-limit are discarded from UI memory to prevent memory leaks.

#### FR-9: Connection Status Indicators
The UI must show clear visual states:
- `Disconnected` (Gray/Red)
- `Connecting/Reconnecting` (Yellow)
- `Connected` (Green)
- `Monitoring Active` (Blue/Pulse)

---

## 5. Non-Goals (Explicit)
- **No Cloud Database/Syncing:** The extension will not store comments in a cloud database or sync settings across accounts. All data stays local.
- **No Direct Audio Output/TTS inside Extension:** The extension is purely a forwarder and viewer; it does not read comments aloud itself (this is delegated to the local Flutter app).
- **No Multi-Tab Monitoring:** The extension only monitors the active/selected TikTok live stream tab. Multi-tab scraping is out of scope for v1.

## 6. MVP Scope

### 6.1 In Scope
- Chrome Extension based on Manifest V3.
- DOM Scraping of TikTok Live chats when viewed on the active Chrome tab.
- Comment details extraction: Nickname, Username, Message, Profile Pic (optional).
- Configurable CSS selectors loaded from a local JSON configuration file in the extension.
- Localhost WebSocket client connection & HTTP POST forwarder.
- Popup UI with connection settings (port, protocol, path), toggle switch, connection status, and list of last 20 comments.

### 6.2 Out of Scope for MVP
- Auto-reloading or auto-navigating to TikTok Live streams.
- Filtering or moderation tools (muting users, censoring words) inside the extension.
- Custom authentication/security tokens for local connection (assumes trusted local network).
- Exporting to CSV/JSON file directly from UI (deferred to a future release if requested, since forwarding is active).

## 7. Success Metrics
- **Success Criteria:** The extension can run continuously for 1 hour on a high-traffic live stream (10+ comments/second) without freezing the tab or leaking memory, and forwards 100% of captured comments to the local application.

## 8. Open Questions
1. **Fallback scraping:** [RESOLVED] Configurable CSS selectors will be loaded directly from a local configuration file inside the extension package or settings interface for rapid developer updates.
2. **Local CORS / Mixed Content:** Chrome extensions typically bypass CORS in background scripts, but does sending WebSocket/HTTP requests from Content Scripts to `http://localhost` trigger mixed-content blocks? [ASSUMPTION: We will run the local request forwarding from the Service Worker background script to bypass page security restrictions.]

## 9. Assumptions Index
- [ASSUMPTION in §4.1] TikTok's DOM elements for live chat are identifiable by CSS selectors that remain relatively stable.
- [ASSUMPTION in §4.1 / FR-3] Profile picture URLs are best-effort; some may be empty due to lazy loading or rate limits on media source domains.
- [ASSUMPTION in §8 / Question 2] Running the local connection clients from the background Service Worker is sufficient to avoid Mixed Content / CORS errors that might occur if run from a page content script directly.
