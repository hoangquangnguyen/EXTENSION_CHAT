const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert').strict;

// Mock Chrome Storage
const mockStorage = {
  data: {},
  listeners: [],
  get(keys, callback) {
    let result = {};
    if (typeof keys === 'string') {
      result[keys] = this.data[keys];
    } else if (Array.isArray(keys)) {
      keys.forEach(k => result[k] = this.data[k]);
    } else if (keys === null || typeof keys === 'object') {
      result = { ...this.data };
    }
    if (callback) callback(result);
    return Promise.resolve(result);
  },
  async set(items, callback) {
    const changes = {};
    for (const [k, v] of Object.entries(items)) {
      changes[k] = { oldValue: this.data[k], newValue: v };
      this.data[k] = v;
    }
    if (callback) callback();
    this.listeners.forEach(l => l(changes, 'local'));
  },
  onChanged: {
    addListener(callback) {
      mockStorage.listeners.push(callback);
    }
  }
};

// Mock Runtime
const mockRuntime = {
  messageListeners: [],
  onMessage: {
    addListener(callback) {
      mockRuntime.messageListeners.push(callback);
    }
  },
  sendMessage(message, callback) {
    // Relayed status updates
    if (message.type === 'CONNECTION_STATUS') {
      mockRuntime.lastStatus = message.status;
    }
    if (callback) callback();
  }
};

// Controllable Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];
  
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.sentData = [];
    MockWebSocket.instances.push(this);
    
    // Simulate auto-open if test allows it
    if (MockWebSocket.autoOpen) {
      setTimeout(() => {
        if (this.readyState === 0) {
          this.readyState = 1; // OPEN
          if (this.onopen) this.onopen();
        }
      }, 5);
    }
  }
  
  send(data) {
    this.sentData.push(data);
  }
  
  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose({ reason: 'normal' });
  }

  triggerOpen() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }

  triggerClose(reason = 'abnormal') {
    this.readyState = 3;
    if (this.onclose) this.onclose({ reason });
  }
}
MockWebSocket.autoOpen = true;

// Controllable Mock Fetch
let fetchFail = false;
let fetchCount = 0;
const lastFetchCalls = [];
const mockFetch = (url, options) => {
  fetchCount++;
  lastFetchCalls.push({ url, options });
  if (fetchFail) {
    return Promise.reject(new TypeError('Failed to fetch'));
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true })
  });
};

const originalConsole = { ...console };
const logs = [];
global.console = {
  log(...args) { logs.push({ type: 'log', args }); originalConsole.log(...args); },
  warn(...args) { logs.push({ type: 'warn', args }); originalConsole.warn(...args); },
  error(...args) { logs.push({ type: 'error', args }); originalConsole.error(...args); }
};

let intervalCallback = null;
let intervalDelay = null;
const mockSetInterval = (callback, delay) => {
  intervalCallback = callback;
  intervalDelay = delay;
  return 123;
};
const mockClearInterval = (id) => {
  intervalCallback = null;
  intervalDelay = null;
};

const offscreenContext = {
  chrome: {
    runtime: mockRuntime,
    storage: {
      local: mockStorage,
      onChanged: mockStorage.onChanged
    }
  },
  console: global.console,
  WebSocket: MockWebSocket,
  fetch: mockFetch,
  setInterval: mockSetInterval,
  clearInterval: mockClearInterval,
  setTimeout
};
vm.createContext(offscreenContext);

async function runTests() {
  console.log('--- STARTING STORY 1.4 TESTS ---');
  
  const codePath = path.join(__dirname, '../../offscreen/offscreen.js');
  const code = fs.readFileSync(codePath, 'utf8');
  
  // Set initial settings: WS protocol, monitoring inactive
  mockStorage.data = {
    connection_settings: {
      host: 'localhost',
      port: '3000',
      protocol: 'ws',
      path: '/'
    },
    monitoring_active: false
  };

  // Run the offscreen script in context
  vm.runInContext(code, offscreenContext);

  // 1. Check inactive start state
  assert.equal(mockRuntime.lastStatus, 'disconnected', 'Should start as disconnected');
  
  // 2. Enable monitoring (WebSocket mode)
  console.log('Testing WebSocket connection initiation...');
  MockWebSocket.autoOpen = false; // We will manually open it to check states
  await mockStorage.set({ monitoring_active: true });
  await new Promise(r => setTimeout(r, 10));
  
  assert.equal(mockRuntime.lastStatus, 'connecting', 'Should transition to connecting state');
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  assert.ok(ws, 'WebSocket client should be created');
  
  // Trigger open
  console.log('Testing successful WebSocket connection open...');
  ws.triggerOpen();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(mockRuntime.lastStatus, 'connected', 'Should transition to connected state');

  // 3. Test message delivery while connected
  console.log('Testing real-time message delivery...');
  const chatListener = mockRuntime.messageListeners[0];
  const payload1 = { message: 'Hello 1', timestamp: Date.now() };
  chatListener({ type: 'CHAT_MESSAGE', payload: payload1 }, {}, () => {});
  
  assert.equal(ws.sentData.length, 1, 'Message should be sent immediately');
  assert.equal(JSON.parse(ws.sentData[0]).message, 'Hello 1');

  // 4. Test connection drop and reconnect loop
  console.log('Testing connection drop...');
  ws.triggerClose();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(mockRuntime.lastStatus, 'disconnected', 'Should update status to disconnected');
  
  // Send comments during disconnection (should buffer)
  console.log('Buffering comments during disconnection...');
  for (let i = 2; i <= 106; i++) {
    chatListener({ type: 'CHAT_MESSAGE', payload: { message: `Comment ${i}`, timestamp: Date.now() } }, {}, () => {});
  }
  
  // Buffer size check (should cap at 100, dropping oldest comment 2-6)
  // Let's inspect the buffer inside context
  const buf = offscreenContext.commentBuffer;
  assert.equal(buf.length, 100, 'Buffer should cap at 100 comments');
  assert.equal(buf[0].message, 'Comment 7', 'Oldest comments should be discarded (FIFO)');
  assert.equal(buf[99].message, 'Comment 106', 'Newest comments should be appended');

  // 5. Test recovery and buffer flushing
  console.log('Testing WebSocket reconnection and buffer flush...');
  assert.ok(intervalCallback, 'Reconnect interval should be scheduled');
  assert.equal(intervalDelay, 5000, 'Delay should be 5 seconds');
  
  // Trigger reconnect attempt callback
  intervalCallback();
  await new Promise(r => setTimeout(r, 10));
  
  const nextWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  assert.notEqual(nextWs, ws, 'A new WebSocket connection should be initiated');
  assert.equal(mockRuntime.lastStatus, 'connecting', 'Should transition to connecting state');
  
  // Trigger open on the new socket
  nextWs.triggerOpen();
  await new Promise(r => setTimeout(r, 20));
  
  assert.equal(mockRuntime.lastStatus, 'connected', 'Should transition back to connected');
  assert.equal(nextWs.sentData.length, 100, 'All 100 buffered comments should be flushed upon reconnect');
  assert.equal(JSON.parse(nextWs.sentData[0]).message, 'Comment 7', 'First flushed comment should be Comment 7');
  assert.equal(JSON.parse(nextWs.sentData[99]).message, 'Comment 106', 'Last flushed comment should be Comment 106');
  assert.equal(buf.length, 0, 'Buffer should be empty after flush');

  // 6. Test HTTP protocol implementation
  console.log('Switching to HTTP protocol...');
  // Initialize HTTP mode
  await mockStorage.set({
    connection_settings: {
      host: 'localhost',
      port: '3000',
      protocol: 'http',
      path: '/api/comments'
    }
  });
  await new Promise(r => setTimeout(r, 10));
  
  assert.equal(mockRuntime.lastStatus, 'connected', 'HTTP mode starts as connected');
  
  // Send message over HTTP
  console.log('Testing HTTP message delivery...');
  fetchCount = 0;
  lastFetchCalls.length = 0;
  chatListener({ type: 'CHAT_MESSAGE', payload: { message: 'HTTP Msg 1', timestamp: Date.now() } }, {}, () => {});
  await new Promise(r => setTimeout(r, 10));
  
  assert.equal(fetchCount, 1, 'Fetch should be called once');
  assert.equal(lastFetchCalls[0].url, 'http://localhost:3000/api/comments');
  assert.equal(JSON.parse(lastFetchCalls[0].options.body).message, 'HTTP Msg 1');

  // 7. Test HTTP failure and recovery
  console.log('Testing HTTP failures...');
  fetchFail = true;
  chatListener({ type: 'CHAT_MESSAGE', payload: { message: 'Failed HTTP Msg 1', timestamp: Date.now() } }, {}, () => {});
  await new Promise(r => setTimeout(r, 10));
  
  assert.equal(mockRuntime.lastStatus, 'disconnected', 'HTTP failure should trigger disconnected state');
  assert.equal(buf.length, 1, 'Failed message should be buffered');
  assert.equal(buf[0].message, 'Failed HTTP Msg 1');

  // Send more comments while HTTP disconnected
  chatListener({ type: 'CHAT_MESSAGE', payload: { message: 'Failed HTTP Msg 2', timestamp: Date.now() } }, {}, () => {});
  assert.equal(buf.length, 2, 'Comments sent during HTTP disconnect should be buffered immediately');

  // Recover HTTP server
  console.log('Testing HTTP recovery...');
  fetchFail = false;
  fetchCount = 0;
  lastFetchCalls.length = 0;
  
  assert.ok(intervalCallback, 'Reconnect interval should be scheduled for HTTP');
  intervalCallback();
  await new Promise(r => setTimeout(r, 20));
  
  assert.equal(mockRuntime.lastStatus, 'connected', 'HTTP status should recover to connected');
  assert.equal(fetchCount, 2, 'Both buffered comments should be sent via fetch');
  assert.equal(JSON.parse(lastFetchCalls[0].options.body).message, 'Failed HTTP Msg 1', 'Flushed in correct FIFO order');
  assert.equal(JSON.parse(lastFetchCalls[1].options.body).message, 'Failed HTTP Msg 2', 'Flushed in correct FIFO order');
  assert.equal(buf.length, 0, 'Buffer should be completely cleared after successful HTTP flush');

  // 8. Test monitoring stop cleanup
  console.log('Testing monitoring inactivation cleanup...');
  await mockStorage.set({ monitoring_active: false });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(mockRuntime.lastStatus, 'disconnected', 'Status should be disconnected after stopping');
  assert.equal(intervalCallback, null, 'Reconnect timer callback should be cleared');
  
  console.log('🎉 ALL STORY 1.4 TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
