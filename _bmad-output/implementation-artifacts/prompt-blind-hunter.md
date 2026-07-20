Invoke the `bmad-review-adversarial-general` skill on this diff:

```diff
# Unified Diff for EXTENSION_CHAT changes (Story 1.4)
# Target Files: offscreen/offscreen.js, _bmad-output/scratch/test-story-1-4.js

diff --git a/offscreen/offscreen.js b/offscreen/offscreen.js
index 0a8b384..33ffac5 100644
--- a/offscreen/offscreen.js
+++ b/offscreen/offscreen.js
@@ -12,8 +12,23 @@ let connectionSettings = {
 };
 let monitoringActive = false;
 
+// Buffer and connection states
+const commentBuffer = [];
+const MAX_BUFFER_SIZE = 100;
+if (typeof globalThis !== "undefined") {
+  globalThis.commentBuffer = commentBuffer;
+}
+let connectionStatus = "disconnected";
+let reconnectIntervalId = null;
+let isFlushing = false;
+
 // Send connection status updates to other extension contexts (e.g. background, popup)
 function sendConnectionStatus(status) {
+  connectionStatus = status;
+  // Update storage so that the popup can immediately read current state on open
+  chrome.storage.local.set({ connection_status: status }, () => {
+    const err = chrome.runtime.lastError;
+  });
   chrome.runtime.sendMessage({
     type: "CONNECTION_STATUS",
     status
@@ -23,6 +38,37 @@ function sendConnectionStatus(status) {
   });
 }
 
+// Schedules a reconnection attempt if monitoring is active
+function handleDisconnect() {
+  sendConnectionStatus("disconnected");
+  if (monitoringActive && !reconnectIntervalId) {
+    console.log("Offscreen: Scheduling reconnection attempt in 5 seconds...");
+    reconnectIntervalId = setInterval(() => {
+      if (monitoringActive) {
+        if (!socket && connectionStatus !== "connected" && connectionStatus !== "connecting") {
+          console.log("Offscreen: Reconnection timer triggered. Attempting to connect...");
+          if (connectionSettings.protocol === "ws") {
+            connectWebSocket();
+          } else if (connectionSettings.protocol === "http") {
+            checkHttpConnection();
+          }
+        }
+      } else {
+        stopReconnectTimer();
+      }
+    }, 5000);
+  }
+}
+
+// Clears the reconnection timer
+function stopReconnectTimer() {
+  if (reconnectIntervalId) {
+    clearInterval(reconnectIntervalId);
+    reconnectIntervalId = null;
+    console.log("Offscreen: Reconnection timer stopped.");
+  }
+}
+
 // Establishes a connection based on protocol setting
 function connectWebSocket() {
   disconnectWebSocket();
@@ -40,6 +86,8 @@ function connectWebSocket() {
     socket.onopen = () => {
       console.log("Offscreen: WebSocket connection established.");
       sendConnectionStatus("connected");
+      stopReconnectTimer();
+      flushBuffer();
     };
 
     socket.onmessage = (event) => {
@@ -52,12 +100,13 @@ function connectWebSocket() {
 
     socket.onclose = (event) => {
       console.log(`Offscreen: WebSocket connection closed: ${event.reason}`);
-      sendConnectionStatus("disconnected");
       socket = null;
+      handleDisconnect();
     };
   } catch (error) {
     console.error("Offscreen: Failed to create WebSocket connection:", error);
-    sendConnectionStatus("disconnected");
+    socket = null;
+    handleDisconnect();
   }
 }
 
@@ -65,25 +114,155 @@ function connectWebSocket() {
 function disconnectWebSocket() {
   if (socket) {
     console.log("Offscreen: Disconnecting WebSocket...");
+    socket.onclose = null; // Remove listener to prevent triggering handleDisconnect on manual close
     socket.close();
     socket = null;
   }
 }
 
+// Polls the HTTP server to check availability and recover
+function checkHttpConnection() {
+  const { host, port, path } = connectionSettings;
+  const formattedPath = path.startsWith("/") ? path : `/${path}`;
+  const url = `http://${host}:${port}${formattedPath}`;
+
+  console.log(`Offscreen: Polling HTTP server at ${url}...`);
+  sendConnectionStatus("connecting");
+
+  if (commentBuffer.length > 0) {
+    // If we have comments, use the first comment as a probe
+    const nextPayload = commentBuffer[0];
+    fetch(url, {
+      method: "POST",
+      headers: {
+        "Content-Type": "application/json"
+      },
+      body: JSON.stringify(nextPayload)
+    })
+    .then(response => {
+      if (response.ok) {
+        console.log("Offscreen: HTTP server is back online. Flushed first buffered comment.");
+        commentBuffer.shift();
+        sendConnectionStatus("connected");
+        stopReconnectTimer();
+        flushBuffer();
+      } else {
+        console.error(`Offscreen: HTTP poll failed with status: ${response.status}`);
+        sendConnectionStatus("disconnected");
+      }
+    })
+    .catch(error => {
+      console.error("Offscreen: HTTP poll failed:", error);
+      sendConnectionStatus("disconnected");
+    });
+  } else {
+    // Otherwise do a simple GET request
+    fetch(url, { method: "GET" })
+    .then(() => {
+      console.log("Offscreen: HTTP server is back online.");
+      sendConnectionStatus("connected");
+      stopReconnectTimer();
+    })
+    .catch(error => {
+      console.error("Offscreen: HTTP poll failed:", error);
+      sendConnectionStatus("disconnected");
+    });
+  }
+}
+
 // Initialize active connections depending on monitoring state and protocol
 function initializeConnection() {
   if (monitoringActive) {
     if (connectionSettings.protocol === "ws") {
       connectWebSocket();
     } else if (connectionSettings.protocol === "http") {
-      sendConnectionStatus("connected"); // HTTP has no persistent link, consider connected if active
+      disconnectWebSocket();
+      // For HTTP, default to connected state unless we hit a failure
+      sendConnectionStatus("connected");
+      stopReconnectTimer();
     }
   } else {
     disconnectWebSocket();
+    stopReconnectTimer();
+    commentBuffer.length = 0; // Clear queue on stop
     sendConnectionStatus("disconnected");
   }
 }
 
+// Pushes comments to the FIFO buffer
+function queueComment(payload) {
+  if (commentBuffer.length >= MAX_BUFFER_SIZE) {
+    const discarded = commentBuffer.shift();
+    console.warn("Offscreen: Buffer full. Discarded oldest comment:", discarded);
+  }
+  commentBuffer.push(payload);
+  console.log(`Offscreen: Buffered comment. Current buffer size: ${commentBuffer.length}`);
+}
+
+// Flushes the memory buffer
+function flushBuffer() {
+  if (isFlushing || commentBuffer.length === 0) return;
+  isFlushing = true;
+  console.log(`Offscreen: Flushing ${commentBuffer.length} comments from buffer...`);
+
+  if (connectionSettings.protocol === "ws") {
+    while (commentBuffer.length > 0) {
+      if (socket && socket.readyState === WebSocket.OPEN) {
+        const payload = commentBuffer[0];
+        try {
+          socket.send(JSON.stringify(payload));
+          commentBuffer.shift();
+        } catch (error) {
+          console.error("Offscreen: WebSocket send error during flush:", error);
+          break;
+        }
+      } else {
+        console.warn("Offscreen: WebSocket closed during flush.");
+        break;
+      }
+    }
+    isFlushing = false;
+  } else if (connectionSettings.protocol === "http") {
+    sendNextHttpBufferedComment();
+  }
+}
+
+// Recursively flushes HTTP queue items sequentially
+function sendNextHttpBufferedComment() {
+  if (commentBuffer.length === 0 || !monitoringActive) {
+    isFlushing = false;
+    return;
+  }
+
+  const payload = commentBuffer[0];
+  const { host, port, path } = connectionSettings;
+  const formattedPath = path.startsWith("/") ? path : `/${path}`;
+  const url = `http://${host}:${port}${formattedPath}`;
+
+  fetch(url, {
+    method: "POST",
+    headers: {
+      "Content-Type": "application/json"
+    },
+    body: JSON.stringify(payload)
+  })
+  .then(response => {
+    if (response.ok) {
+      commentBuffer.shift();
+      sendNextHttpBufferedComment();
+    } else {
+      console.error(`Offscreen: HTTP POST failed during flush: ${response.status}`);
+      isFlushing = false;
+      handleDisconnect();
+    }
+  })
+  .catch(error => {
+    console.error("Offscreen: HTTP POST error during flush:", error);
+    isFlushing = false;
+    handleDisconnect();
+  });
+}
+
 // Sends comment payload via WebSocket
 function sendViaWebSocket(payload) {
   if (socket && socket.readyState === WebSocket.OPEN) {
@@ -92,9 +271,11 @@ function sendViaWebSocket(payload) {
       console.log("Offscreen: Sent comment via WebSocket:", payload.message);
     } catch (error) {
       console.error("Offscreen: Error sending via WebSocket:", error);
+      queueComment(payload);
     }
   } else {
-    console.warn("Offscreen: WebSocket not open. Message dropped.");
+    console.warn("Offscreen: WebSocket not open. Comment buffered.");
+    queueComment(payload);
   }
 }
 
@@ -105,6 +286,12 @@ function sendViaHttpPost(payload) {
   const url = `http://${host}:${port}${formattedPath}`;
 
   console.log(`Offscreen: Sending HTTP POST to ${url}`);
+
+  if (connectionStatus === "disconnected") {
+    queueComment(payload);
+    return;
+  }
+
   fetch(url, {
     method: "POST",
     headers: {
@@ -115,12 +302,20 @@ function sendViaHttpPost(payload) {
   .then(response => {
     if (!response.ok) {
       console.error(`Offscreen: HTTP POST failed with status: ${response.status}`);
+      queueComment(payload);
+      handleDisconnect();
     } else {
       console.log("Offscreen: Sent comment via HTTP POST successfully.");
+      if (connectionStatus !== "connected") {
+        sendConnectionStatus("connected");
+        stopReconnectTimer();
+      }
     }
   })
   .catch(error => {
     console.error("Offscreen: HTTP POST error:", error);
+    queueComment(payload);
+    handleDisconnect();
   });
 }
 
diff --git a/_bmad-output/scratch/test-story-1-4.js b/_bmad-output/scratch/test-story-1-4.js
new file mode 100644
index 0000000..2bf98c2
--- /dev/null
+++ b/_bmad-output/scratch/test-story-1-4.js
@@ -0,0 +1,314 @@
+const fs = require('fs');
+const path = require('path');
+const vm = require('vm');
+const assert = require('assert').strict;
+
+// Mock Chrome Storage
+const mockStorage = {
+  data: {},
+  listeners: [],
+  get(keys, callback) {
+    let result = {};
+    if (typeof keys === 'string') {
+      result[keys] = this.data[keys];
+    } else if (Array.isArray(keys)) {
+      keys.forEach(k => result[k] = this.data[k]);
+    } else if (keys === null || typeof keys === 'object') {
+      result = { ...this.data };
+    }
+    if (callback) callback(result);
+    return Promise.resolve(result);
+  },
+  async set(items, callback) {
+    const changes = {};
+    for (const [k, v] of Object.entries(items)) {
+      changes[k] = { oldValue: this.data[k], newValue: v };
+      this.data[k] = v;
+    }
+    if (callback) callback();
+    this.listeners.forEach(l => l(changes, 'local'));
+  },
+  onChanged: {
+    addListener(callback) {
+      mockStorage.listeners.push(callback);
+    }
+  }
+};
+
+// Mock Runtime
+const mockRuntime = {
+  messageListeners: [],
+  onMessage: {
+    addListener(callback) {
+      mockRuntime.messageListeners.push(callback);
+    }
+  },
+  sendMessage(message, callback) {
+    // Relayed status updates
+    if (message.type === 'CONNECTION_STATUS') {
+      mockRuntime.lastStatus = message.status;
+    }
+    if (callback) callback();
+  }
+};
+
+// Controllable Mock WebSocket
+class MockWebSocket {
+  static CONNECTING = 0;
+  static OPEN = 1;
+  static CLOSING = 2;
+  static CLOSED = 3;
+  static instances = [];
+  
+  constructor(url) {
+    this.url = url;
+    this.readyState = 0; // CONNECTING
+    this.sentData = [];
+    MockWebSocket.instances.push(this);
+    
+    // Simulate auto-open if test allows it
+    if (MockWebSocket.autoOpen) {
+      setTimeout(() => {
+        if (this.readyState === 0) {
+          this.readyState = 1; // OPEN
+          if (this.onopen) this.onopen();
+        }
+      }, 5);
+    }
+  }
+  
+  send(data) {
+    this.sentData.push(data);
+  }
+  
+  close() {
+    this.readyState = 3; // CLOSED
+    if (this.onclose) this.onclose({ reason: 'normal' });
+  }
+
+  triggerOpen() {
+    this.readyState = 1;
+    if (this.onopen) this.onopen();
+  }
+
+  triggerClose(reason = 'abnormal') {
+    this.readyState = 3;
+    if (this.onclose) this.onclose({ reason });
+  }
+}
+MockWebSocket.autoOpen = true;
+
+// Controllable Mock Fetch
+let fetchFail = false;
+let fetchCount = 0;
+const lastFetchCalls = [];
+const mockFetch = (url, options) => {
+  fetchCount++;
+  lastFetchCalls.push({ url, options });
+  if (fetchFail) {
+    return Promise.reject(new TypeError('Failed to fetch'));
+  }
+  return Promise.resolve({
+    ok: true,
+    status: 200,
+    json: () => Promise.resolve({ success: true })
+  });
+};
+
+const originalConsole = { ...console };
+const logs = [];
+global.console = {
+  log(...args) { logs.push({ type: 'log', args }); originalConsole.log(...args); },
+  warn(...args) { logs.push({ type: 'warn', args }); originalConsole.warn(...args); },
+  error(...args) { logs.push({ type: 'error', args }); originalConsole.error(...args); }
+};
+
+let intervalCallback = null;
+let intervalDelay = null;
+const mockSetInterval = (callback, delay) => {
+  intervalCallback = callback;
+  intervalDelay = delay;
+  return 123;
+};
+const mockClearInterval = (id) => {
+  intervalCallback = null;
+  intervalDelay = null;
+};
+
+const offscreenContext = {
+  chrome: {
+    runtime: mockRuntime,
+    storage: {
+      local: mockStorage,
+      onChanged: mockStorage.onChanged
+    }
+  },
+  console: global.console,
+  WebSocket: MockWebSocket,
+  fetch: mockFetch,
+  setInterval: mockSetInterval,
+  clearInterval: mockClearInterval,
+  setTimeout
+};
+vm.createContext(offscreenContext);
+
+async function runTests() {
+  console.log('--- STARTING STORY 1.4 TESTS ---');
+  
+  const codePath = path.join(__dirname, '../../offscreen/offscreen.js');
+  const code = fs.readFileSync(codePath, 'utf8');
+  
+  // Set initial settings: WS protocol, monitoring inactive
+  mockStorage.data = {
+    connection_settings: {
+      host: 'localhost',
+      port: '3000',
+      protocol: 'ws',
+      path: '/'
+    },
+    monitoring_active: false
+  };
+
+  // Run the offscreen script in context
+  vm.runInContext(code, offscreenContext);
+
+  // 1. Check inactive start state
+  assert.equal(mockRuntime.lastStatus, 'disconnected', 'Should start as disconnected');
+  
+  // 2. Enable monitoring (WebSocket mode)
+  console.log('Testing WebSocket connection initiation...');
+  MockWebSocket.autoOpen = false; // We will manually open it to check states
+  await mockStorage.set({ monitoring_active: true });
+  await new Promise(r => setTimeout(r, 10));
+  
+  assert.equal(mockRuntime.lastStatus, 'connecting', 'Should transition to connecting state');
+  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
+  assert.ok(ws, 'WebSocket client should be created');
+  
+  // Trigger open
+  console.log('Testing successful WebSocket connection open...');
+  ws.triggerOpen();
+  await new Promise(r => setTimeout(r, 10));
+  assert.equal(mockRuntime.lastStatus, 'connected', 'Should transition to connected state');
+
+  // 3. Test message delivery while connected
+  console.log('Testing real-time message delivery...');
+  const chatListener = mockRuntime.messageListeners[0];
+  const payload1 = { message: 'Hello 1', timestamp: Date.now() };
+  chatListener({ type: 'CHAT_MESSAGE', payload: payload1 }, {}, () => {});
+  
+  assert.equal(ws.sentData.length, 1, 'Message should be sent immediately');
+  assert.equal(JSON.parse(ws.sentData[0]).message, 'Hello 1');
+
+  // 4. Test connection drop and reconnect loop
+  console.log('Testing connection drop...');
+  ws.triggerClose();
+  await new Promise(r => setTimeout(r, 10));
+  assert.equal(mockRuntime.lastStatus, 'disconnected', 'Should update status to disconnected');
+  
+  // Send comments during disconnection (should buffer)
+  console.log('Buffering comments during disconnection...');
+  for (let i = 2; i <= 106; i++) {
+    chatListener({ type: 'CHAT_MESSAGE', payload: { message: `Comment ${i}`, timestamp: Date.now() } }, {}, () => {});
+  }
+  
+  // Buffer size check (should cap at 100, dropping oldest comment 2-6)
+  // Let's inspect the buffer inside context
+  const buf = offscreenContext.commentBuffer;
+  assert.equal(buf.length, 100, 'Buffer should cap at 100 comments');
+  assert.equal(buf[0].message, 'Comment 7', 'Oldest comments should be discarded (FIFO)');
+  assert.equal(buf[99].message, 'Comment 106', 'Newest comments should be appended');
+
+  // 5. Test recovery and buffer flushing
+  console.log('Testing WebSocket reconnection and buffer flush...');
+  assert.ok(intervalCallback, 'Reconnect interval should be scheduled');
+  assert.equal(intervalDelay, 5000, 'Delay should be 5 seconds');
+  
+  // Trigger reconnect attempt callback
+  intervalCallback();
+  await new Promise(r => setTimeout(r, 10));
+  
+  const nextWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
+  assert.notEqual(nextWs, ws, 'A new WebSocket connection should be initiated');
+  assert.equal(mockRuntime.lastStatus, 'connecting', 'Should transition to connecting state');
+  
+  // Trigger open on the new socket
+  nextWs.triggerOpen();
+  await new Promise(r => setTimeout(r, 20));
+  
+  assert.equal(mockRuntime.lastStatus, 'connected', 'Should transition back to connected');
+  assert.equal(nextWs.sentData.length, 100, 'All 100 buffered comments should be flushed upon reconnect');
+  assert.equal(JSON.parse(nextWs.sentData[0]).message, 'Comment 7', 'First flushed comment should be Comment 7');
+  assert.equal(JSON.parse(nextWs.sentData[99]).message, 'Comment 106', 'Last flushed comment should be Comment 106');
+  assert.equal(buf.length, 0, 'Buffer should be empty after flush');
+
+  // 6. Test HTTP protocol implementation
+  console.log('Switching to HTTP protocol...');
+  // Initialize HTTP mode
+  await mockStorage.set({
+    connection_settings: {
+      host: 'localhost',
+      port: '3000',
+      protocol: 'http',
+      path: '/api/comments'
+    }
+  });
+  await new Promise(r => setTimeout(r, 10));
+  
+  assert.equal(mockRuntime.lastStatus, 'connected', 'HTTP mode starts as connected');
+  
+  // Send message over HTTP
+  console.log('Testing HTTP message delivery...');
+  fetchCount = 0;
+  lastFetchCalls.length = 0;
+  chatListener({ type: 'CHAT_MESSAGE', payload: { message: 'HTTP Msg 1', timestamp: Date.now() } }, {}, () => {});
+  await new Promise(r => setTimeout(r, 10));
+  
+  assert.equal(fetchCount, 1, 'Fetch should be called once');
+  assert.equal(lastFetchCalls[0].url, 'http://localhost:3000/api/comments');
+  assert.equal(JSON.parse(lastFetchCalls[0].options.body).message, 'HTTP Msg 1');
+
+  // 7. Test HTTP failure and recovery
+  console.log('Testing HTTP failures...');
+  fetchFail = true;
+  chatListener({ type: 'CHAT_MESSAGE', payload: { message: 'Failed HTTP Msg 1', timestamp: Date.now() } }, {}, () => {});
+  await new Promise(r => setTimeout(r, 10));
+  
+  assert.equal(mockRuntime.lastStatus, 'disconnected', 'HTTP failure should trigger disconnected state');
+  assert.equal(buf.length, 1, 'Failed message should be buffered');
+  assert.equal(buf[0].message, 'Failed HTTP Msg 1');
+
+  // Send more comments while HTTP disconnected
+  chatListener({ type: 'CHAT_MESSAGE', payload: { message: 'Failed HTTP Msg 2', timestamp: Date.now() } }, {}, () => {});
+  assert.equal(buf.length, 2, 'Comments sent during HTTP disconnect should be buffered immediately');
+
+  // Recover HTTP server
+  console.log('Testing HTTP recovery...');
+  fetchFail = false;
+  fetchCount = 0;
+  lastFetchCalls.length = 0;
+  
+  assert.ok(intervalCallback, 'Reconnect interval should be scheduled for HTTP');
+  intervalCallback();
+  await new Promise(r => setTimeout(r, 20));
+  
+  assert.equal(mockRuntime.lastStatus, 'connected', 'HTTP status should recover to connected');
+  assert.equal(fetchCount, 2, 'Both buffered comments should be sent via fetch');
+  assert.equal(JSON.parse(lastFetchCalls[0].options.body).message, 'Failed HTTP Msg 1', 'Flushed in correct FIFO order');
+  assert.equal(JSON.parse(lastFetchCalls[1].options.body).message, 'Failed HTTP Msg 2', 'Flushed in correct FIFO order');
+  assert.equal(buf.length, 0, 'Buffer should be completely cleared after successful HTTP flush');
+
+  // 8. Test monitoring stop cleanup
+  console.log('Testing monitoring inactivation cleanup...');
+  await mockStorage.set({ monitoring_active: false });
+  await new Promise(r => setTimeout(r, 10));
+  assert.equal(mockRuntime.lastStatus, 'disconnected', 'Status should be disconnected after stopping');
+  assert.equal(intervalCallback, null, 'Reconnect timer callback should be cleared');
+  
+  console.log('🎉 ALL STORY 1.4 TESTS PASSED SUCCESSFULLY!');
+}
+
+runTests().catch(err => {
+  console.error('❌ TEST FAILED:', err);
+  process.exit(1);
+});
```
