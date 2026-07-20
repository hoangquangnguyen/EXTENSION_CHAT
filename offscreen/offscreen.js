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

// Send connection status updates to other extension contexts (e.g. background, popup)
function sendConnectionStatus(status) {
  chrome.runtime.sendMessage({
    type: "CONNECTION_STATUS",
    status
  }, () => {
    // Suppress errors about closed listeners (e.g. if popup is not open)
    const err = chrome.runtime.lastError;
  });
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
    };

    socket.onmessage = (event) => {
      console.log("Offscreen: WebSocket message received from server:", event.data);
    };

    socket.onerror = (error) => {
      console.error("Offscreen: WebSocket error:", error);
    };

    socket.onclose = (event) => {
      console.log(`Offscreen: WebSocket connection closed: ${event.reason}`);
      sendConnectionStatus("disconnected");
      socket = null;
    };
  } catch (error) {
    console.error("Offscreen: Failed to create WebSocket connection:", error);
    sendConnectionStatus("disconnected");
  }
}

// Disconnects existing WebSocket connection
function disconnectWebSocket() {
  if (socket) {
    console.log("Offscreen: Disconnecting WebSocket...");
    socket.close();
    socket = null;
  }
}

// Initialize active connections depending on monitoring state and protocol
function initializeConnection() {
  if (monitoringActive) {
    if (connectionSettings.protocol === "ws") {
      connectWebSocket();
    } else if (connectionSettings.protocol === "http") {
      sendConnectionStatus("connected"); // HTTP has no persistent link, consider connected if active
    }
  } else {
    disconnectWebSocket();
    sendConnectionStatus("disconnected");
  }
}

// Sends comment payload via WebSocket
function sendViaWebSocket(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(payload));
      console.log("Offscreen: Sent comment via WebSocket:", payload.message);
    } catch (error) {
      console.error("Offscreen: Error sending via WebSocket:", error);
    }
  } else {
    console.warn("Offscreen: WebSocket not open. Message dropped.");
  }
}

// Sends comment payload via HTTP POST
function sendViaHttpPost(payload) {
  const { host, port, path } = connectionSettings;
  const formattedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `http://${host}:${port}${formattedPath}`;

  console.log(`Offscreen: Sending HTTP POST to ${url}`);
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
    } else {
      console.log("Offscreen: Sent comment via HTTP POST successfully.");
    }
  })
  .catch(error => {
    console.error("Offscreen: HTTP POST error:", error);
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
