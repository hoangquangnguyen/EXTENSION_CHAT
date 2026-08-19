// offscreen.js
// Localhost WebSocket and HTTP client coordinator for the TikTok Live Chat Extension.

console.log("TikTok Chat Extension: Offscreen Script loaded.");

let socket = null;
let connectionSettings = {
  host: "127.0.0.1",
  port: "3003",
  protocol: "http",
  path: "/api/chat/tiktok-comment"
};
let monitoringActive = false;

// Buffer and connection states
const commentBuffer = [];
const MAX_BUFFER_SIZE = 100;
if (typeof globalThis !== "undefined") {
  globalThis.commentBuffer = commentBuffer;
}
let connectionStatus = "disconnected";
let reconnectIntervalId = null;
let isFlushing = false;

// Send connection status updates to other extension contexts (e.g. background, popup)
function sendConnectionStatus(status) {
  connectionStatus = status;
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: "CONNECTION_STATUS",
      status
    }, () => {
      // Suppress errors about closed listeners (e.g. if popup is not open)
      const err = chrome.runtime.lastError;
    });
  }
}

// Save connection error message to local storage for UI display
function saveConnectionError(errMessage) {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: "CONNECTION_ERROR",
      error: errMessage
    }, () => {
      const err = chrome.runtime.lastError;
    });
  }
}

// Schedules a reconnection attempt if monitoring is active
function handleDisconnect() {
  sendConnectionStatus("disconnected");
  if (monitoringActive && !reconnectIntervalId) {
    console.log("Offscreen: Scheduling reconnection attempt in 5 seconds...");
    reconnectIntervalId = setInterval(() => {
      if (monitoringActive) {
        if (!socket && connectionStatus !== "connected" && connectionStatus !== "connecting") {
          console.log("Offscreen: Reconnection timer triggered. Attempting to connect...");
          if (connectionSettings.protocol === "ws") {
            connectWebSocket();
          } else if (connectionSettings.protocol === "http") {
            checkHttpConnection();
          }
        }
      } else {
        stopReconnectTimer();
      }
    }, 5000);
  }
}

// Clears the reconnection timer
function stopReconnectTimer() {
  if (reconnectIntervalId) {
    clearInterval(reconnectIntervalId);
    reconnectIntervalId = null;
    console.log("Offscreen: Reconnection timer stopped.");
  }
}

// Helper to build full URL from protocol, host, port, and path settings
function buildUrl(protocol, host, port, path) {
  let url = (host || "").trim();
  const safeProtocol = (protocol || "http").trim();
  const safePort = (port || "").trim();
  const safePath = (path || "").trim();
  const formattedPath = safePath ? (safePath.startsWith("/") ? safePath : `/${safePath}`) : "";

  if (/^[a-zA-Z]+:\/\//.test(url)) {
    if (safeProtocol === "ws") {
      url = url.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
    } else if (safeProtocol === "http") {
      url = url.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:");
    }
    
    try {
      const parsed = new URL(url);
      if ((parsed.pathname === "/" || parsed.pathname === "") && formattedPath) {
        url = `${parsed.protocol}//${parsed.host}${formattedPath}${parsed.search}`;
      }
    } catch (e) {}
    
    return url;
  }

  const hostPart = url.split("/")[0];
  const hasPort = hostPart.includes(":") && !hostPart.endsWith("]");
  
  const portStr = (hasPort || !safePort) ? "" : `:${safePort}`;
  const hasPath = url.includes("/");
  const pathStr = hasPath ? "" : formattedPath;
  
  return `${safeProtocol}://${url}${portStr}${pathStr}`;
}

// Establishes a connection based on protocol setting
function connectWebSocket() {
  disconnectWebSocket();

  const { host, port, path } = connectionSettings;
  const url = buildUrl("ws", host, port, path);
  let displayHost = `${host}:${port}`;
  try {
    const parsed = new URL(url);
    displayHost = parsed.host;
  } catch (e) {}

  console.log(`Offscreen: Connecting to WebSocket at ${url}`);
  sendConnectionStatus("connecting");

  try {
    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log("Offscreen: WebSocket connection established.");
      sendConnectionStatus("connected");
      saveConnectionError(""); // clear any past errors
      stopReconnectTimer();
      flushBuffer();
    };

    socket.onmessage = (event) => {
      console.log("Offscreen: WebSocket message received from server:", event.data);
    };

    socket.onerror = (error) => {
      console.error("Offscreen: WebSocket error:", error);
      saveConnectionError(`WebSocket error: Connection refused or host unreachable at ${displayHost}.`);
    };

    socket.onclose = (event) => {
      console.log(`Offscreen: WebSocket connection closed: code=${event.code}, reason=${event.reason}`);
      socket = null;
      if (event.code !== 1000 && event.code !== 1005) {
        saveConnectionError(`WebSocket closed: Connection failed (code ${event.code}). Server might be offline.`);
      }
      handleDisconnect();
    };
  } catch (error) {
    console.error("Offscreen: Failed to create WebSocket connection:", error);
    saveConnectionError(`WebSocket creation failed: ${error.message || error}`);
    socket = null;
    handleDisconnect();
  }
}

// Disconnects existing WebSocket connection
function disconnectWebSocket() {
  if (socket) {
    console.log("Offscreen: Disconnecting WebSocket...");
    socket.onclose = null; // Remove listener to prevent triggering handleDisconnect on manual close
    socket.close();
    socket = null;
  }
}

// Polls the HTTP server to check availability and recover
function checkHttpConnection() {
  const { host, port, path } = connectionSettings;
  const url = buildUrl("http", host, port, path);
  let displayHost = `${host}:${port}`;
  try {
    const parsed = new URL(url);
    displayHost = parsed.host;
  } catch (e) {}

  console.log(`Offscreen: Polling HTTP server at ${url}...`);
  sendConnectionStatus("connecting");

  if (commentBuffer.length > 0) {
    // If we have comments, use the first comment as a probe
    const nextPayload = commentBuffer[0];
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(nextPayload)
    })
    .then(response => {
      if (response.ok) {
        console.log("Offscreen: HTTP server is back online. Flushed first buffered comment.");
        commentBuffer.shift();
        sendConnectionStatus("connected");
        saveConnectionError("");
        stopReconnectTimer();
        flushBuffer();
      } else {
        console.error(`Offscreen: HTTP poll failed with status: ${response.status}`);
        sendConnectionStatus("disconnected");
        saveConnectionError(`HTTP poll failed with status code ${response.status}.`);
      }
    })
    .catch(error => {
      console.error("Offscreen: HTTP poll failed:", error);
      sendConnectionStatus("disconnected");
      saveConnectionError(`HTTP connection failed: host ${displayHost} is unreachable.`);
    });
  } else {
    // Otherwise do a simple GET request
    fetch(url, { method: "GET" })
    .then(() => {
      console.log("Offscreen: HTTP server is back online.");
      sendConnectionStatus("connected");
      saveConnectionError("");
      stopReconnectTimer();
    })
    .catch(error => {
      console.error("Offscreen: HTTP poll failed:", error);
      sendConnectionStatus("disconnected");
      saveConnectionError(`HTTP connection failed: host ${displayHost} is unreachable.`);
    });
  }
}

// Initialize active connections depending on monitoring state and protocol
function initializeConnection() {
  console.log("Offscreen initializeConnection called. monitoringActive:", monitoringActive, "connectionSettings:", connectionSettings);
  if (monitoringActive) {
    saveConnectionError(""); // clear when starting a new session
    if (connectionSettings.protocol === "ws") {
      connectWebSocket();
    } else if (connectionSettings.protocol === "http") {
      disconnectWebSocket();
      // For HTTP, default to connected state unless we hit a failure
      sendConnectionStatus("connected");
      stopReconnectTimer();
    }
  } else {
    disconnectWebSocket();
    stopReconnectTimer();
    commentBuffer.length = 0; // Clear queue on stop
    sendConnectionStatus("disconnected");
    saveConnectionError(""); // clear error when stopped
  }
}

// Pushes comments to the FIFO buffer
function queueComment(payload) {
  if (commentBuffer.length >= MAX_BUFFER_SIZE) {
    const discarded = commentBuffer.shift();
    console.warn("Offscreen: Buffer full. Discarded oldest comment:", discarded);
  }
  commentBuffer.push(payload);
  console.log(`Offscreen: Buffered comment. Current buffer size: ${commentBuffer.length}`);
}

// Flushes the memory buffer
function flushBuffer() {
  if (isFlushing || commentBuffer.length === 0) return;
  isFlushing = true;
  console.log(`Offscreen: Flushing ${commentBuffer.length} comments from buffer...`);

  if (connectionSettings.protocol === "ws") {
    while (commentBuffer.length > 0) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = commentBuffer[0];
        try {
          socket.send(JSON.stringify(payload));
          commentBuffer.shift();
        } catch (error) {
          console.error("Offscreen: WebSocket send error during flush:", error);
          break;
        }
      } else {
        console.warn("Offscreen: WebSocket closed during flush.");
        break;
      }
    }
    isFlushing = false;
  } else if (connectionSettings.protocol === "http") {
    sendNextHttpBufferedComment();
  }
}

// Recursively flushes HTTP queue items sequentially
function sendNextHttpBufferedComment() {
  if (commentBuffer.length === 0 || !monitoringActive) {
    isFlushing = false;
    return;
  }

  const payload = commentBuffer[0];
  const { host, port, path } = connectionSettings;
  const url = buildUrl("http", host, port, path);

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
  .then(response => {
    if (response.ok) {
      commentBuffer.shift();
      sendNextHttpBufferedComment();
    } else {
      console.error(`Offscreen: HTTP POST failed during flush: ${response.status}`);
      isFlushing = false;
      handleDisconnect();
    }
  })
  .catch(error => {
    console.error("Offscreen: HTTP POST error during flush:", error);
    isFlushing = false;
    handleDisconnect();
  });
}

// Sends comment payload via WebSocket
function sendViaWebSocket(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(payload));
      console.log("Offscreen: Sent comment via WebSocket:", payload);
    } catch (error) {
      console.error("Offscreen: Error sending via WebSocket:", error);
      queueComment(payload);
    }
  } else {
    console.warn("Offscreen: WebSocket not open. readyState:", socket ? socket.readyState : "null", "Comment buffered.");
    queueComment(payload);
  }
}

// Sends comment payload via HTTP POST
function sendViaHttpPost(payload) {
  const { host, port, path } = connectionSettings;
  const url = buildUrl("http", host, port, path);

  console.log(`Offscreen: Sending HTTP POST to ${url}`);

  if (connectionStatus === "disconnected") {
    queueComment(payload);
    return;
  }

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })
  .then(response => {
    if (!response.ok) {
      console.error(`Offscreen: HTTP POST failed with status: ${response.status}`);
      queueComment(payload);
      handleDisconnect();
    } else {
      console.log("Offscreen: Sent comment via HTTP POST successfully.");
      if (connectionStatus !== "connected") {
        sendConnectionStatus("connected");
        stopReconnectTimer();
      }
    }
  })
  .catch(error => {
    console.error("Offscreen: HTTP POST error:", error);
    queueComment(payload);
    handleDisconnect();
  });
}

// Handles incoming comments from background relay
function handleChatMessage(payload) {
  console.log("Offscreen handleChatMessage received payload:", payload);

  if (connectionSettings.protocol === "ws") {
    sendViaWebSocket(payload);
  } else if (connectionSettings.protocol === "http") {
    sendViaHttpPost(payload);
  }
}

// Request configuration from Background Script on startup
function requestSettingsFromBackground() {
  console.log("Offscreen: Requesting settings from background script...");
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: "OFFSCREEN_LOADED" }, () => {
      const err = chrome.runtime.lastError;
    });
  }
}

requestSettingsFromBackground();

// Listener for messages
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CHAT_MESSAGE") {
      handleChatMessage(message.payload);
    } else if (message.type === "INIT_OFFSCREEN" || message.type === "UPDATE_OFFSCREEN") {
      console.log(`Offscreen: Received configuration type ${message.type}:`, message);
      if (message.connectionSettings) {
        connectionSettings = { ...connectionSettings, ...message.connectionSettings };
      }
      if (message.monitoringActive !== undefined) {
        monitoringActive = !!message.monitoringActive;
      }
      initializeConnection();
    }
  });
}
