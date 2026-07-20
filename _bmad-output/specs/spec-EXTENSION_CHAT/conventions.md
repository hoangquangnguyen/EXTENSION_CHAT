# Extension Chat - Coding Conventions and Schemes

This document defines the schemas, message conventions, and configurations required for the extension chat implementation.

## 1. Comment Payload Schema

All comments forwarded to the local target server via WebSocket or HTTP POST must conform to the following raw flat JSON structure:

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

### Fields Description
- `platform`: Constant string value `"tiktok"`.
- `nickname`: Display name of the commenter.
- `username`: Unique handle of the commenter (e.g., `@user123`).
- `message`: Text message sent by the user. Emojis and plain text are supported.
- `profilePic`: URL of the user's profile avatar (may be empty string if extraction fails).
- `timestamp`: Epoch milliseconds integer (e.g., `1690000000000`).

---

## 2. Internal Chrome Message Conventions

Communication between extension contexts (Content Script, Background Service Worker, Popup UI, Offscreen Document) must use the following standard formats:

### Chat Message Frame
Sent from the Content Script to the background script, which then relays it to the Offscreen Document and the Popup UI.
```json
{
  "type": "CHAT_MESSAGE",
  "payload": {
    "platform": "tiktok",
    "nickname": "String",
    "username": "String",
    "message": "String",
    "profilePic": "String",
    "timestamp": 1690000000000
  }
}
```

### Connection Status Frame
Sent from the Offscreen Document to the background Service Worker, which updates storage and updates the Popup UI.
```json
{
  "type": "CONNECTION_STATUS",
  "status": "connected" | "disconnected" | "connecting"
}
```

---

## 3. Selector Configuration Schema

`selectors.json` defines the default DOM selectors for scraping the live stream page. The file must match this structure:

```json
{
  "chatContainer": "String",
  "commentNode": "String",
  "nickname": "String",
  "username": "String",
  "message": "String",
  "profilePic": "String"
}
```
