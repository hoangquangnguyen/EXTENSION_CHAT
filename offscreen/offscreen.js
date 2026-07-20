// offscreen.js
// Localhost WebSocket and HTTP client coordinator for the TikTok Live Chat Extension.

console.log("TikTok Chat Extension: Offscreen Script loaded.");

let socket = null;
let connectionSettings = {
  host: "localhost",
  port: "3000",
  protocol: "ws",
  path: "/"
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
  // Update storage so that the popup can immediately read current state on open
  chrome.storage.local.set({ connection_status: status }, () => {
    const err = chrome.runtime.lastError;
  });
  chrome.runtime.sendMessage({
    type: "CONNECTION_STATUS",
    status
  }, () => {
    // Suppress errors about closed listeners (e.g. if popup is not open)
    const err = chrome.runtime.lastError;
  });
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

// Establishes a connection based on protocol setting
function connectWebSocket() {
  disconnectWebSocket();

  const { host, port, path } = connectionSettings;
  const formattedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `ws://${host}:${port}${formattedPath}`;

  console.log(`Offscreen: Connecting to WebSocket at ${url}`);
  sendConnectionStatus("connecting");

  try {
    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log("Offscreen: WebSocket connection established.");
      sendConnectionStatus("connected");
      stopReconnectTimer();
      flushBuffer();
    };

    socket.onmessage = (event) => {
      console.log("Offscreen: WebSocket message received from server:", event.data);
    };

    socket.onerror = (error) => {
      console.error("Offscreen: WebSocket error:", error);
    };

    socket.onclose = (event) => {
      console.log(`Offscreen: WebSocket connection closed: ${event.reason}`);
      socket = null;
      handleDisconnect();
    };
  } catch (error) {
    console.error("Offscreen: Failed to create WebSocket connection:", error);
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
  const formattedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `http://${host}:${port}${formattedPath}`;

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
        stopReconnectTimer();
        flushBuffer();
      } else {
        console.error(`Offscreen: HTTP poll failed with status: ${response.status}`);
        sendConnectionStatus("disconnected");
      }
    })
    .catch(error => {
      console.error("Offscreen: HTTP poll failed:", error);
      sendConnectionStatus("disconnected");
    });
  } else {
    // Otherwise do a simple GET request
    fetch(url, { method: "GET" })
    .then(() => {
      console.log("Offscreen: HTTP server is back online.");
      sendConnectionStatus("connected");
      stopReconnectTimer();
    })
    .catch(error => {
      console.error("Offscreen: HTTP poll failed:", error);
      sendConnectionStatus("disconnected");
    });
  }
}

// Initialize active connections depending on monitoring state and protocol
function initializeConnection() {
  if (monitoringActive) {
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
  const formattedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `http://${host}:${port}${formattedPath}`;

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
      console.log("Offscreen: Sent comment via WebSocket:", payload.message);
    } catch (error) {
      console.error("Offscreen: Error sending via WebSocket:", error);
      queueComment(payload);
    }
  } else {
    console.warn("Offscreen: WebSocket not open. Comment buffered.");
    queueComment(payload);
  }
}

// Sends comment payload via HTTP POST
function sendViaHttpPost(payload) {
  const { host, port, path } = connectionSettings;
  const formattedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `http://${host}:${port}${formattedPath}`;

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
  if (!monitoringActive) return;

  if (connectionSettings.protocol === "ws") {
    sendViaWebSocket(payload);
  } else if (connectionSettings.protocol === "http") {
    sendViaHttpPost(payload);
  }
}

// Fetch configuration from local storage on start
chrome.storage.local.get(["connection_settings", "monitoring_active"], (result) => {
  if (result.connection_settings) {
    connectionSettings = { ...connectionSettings, ...result.connection_settings };
  }
  monitoringActive = !!result.monitoring_active;
  initializeConnection();
});

// Watch storage changes for dynamic configuration updates
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    let settingsChanged = false;

    if (changes.connection_settings) {
      connectionSettings = { ...connectionSettings, ...changes.connection_settings.newValue };
      settingsChanged = true;
    }

    if (changes.monitoring_active) {
      monitoringActive = !!changes.monitoring_active.newValue;
      settingsChanged = true;
    }

    if (settingsChanged) {
      console.log("Offscreen: Settings or state changed. Re-initializing...");
      initializeConnection();
    }
  }
});

// Listener for relayed messages from Background Service Worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHAT_MESSAGE") {
    // Only process comments relayed by the background Service Worker (where sender.tab is undefined)
    if (!sender.tab) {
      handleChatMessage(message.payload);
    }
  }
});
