const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert').strict;

// Mock environment
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

const mockRuntime = {
  installedListeners: [],
  messageListeners: [],
  onInstalled: {
    addListener(callback) {
      mockRuntime.installedListeners.push(callback);
    }
  },
  onMessage: {
    addListener(callback) {
      mockRuntime.messageListeners.push(callback);
    }
  },
  sendMessage(message, callback) {
    // Broadcast to message listeners
    mockRuntime.messageListeners.forEach(l => {
      l(message, { id: 'some-sender' }, () => {});
    });
    if (callback) callback();
  },
  getURL(filePath) {
    return 'chrome-extension://mock-id/' + filePath;
  },
  getContexts(query) {
    if (mockOffscreen.documentOpen) {
      return Promise.resolve([{ contextType: 'OFFSCREEN_DOCUMENT' }]);
    }
    return Promise.resolve([]);
  }
};

const mockOffscreen = {
  documentOpen: false,
  createdOptions: null,
  Reason: {
    WEBSOCKETS: 'WEBSOCKETS'
  },
  createDocument(options) {
    if (this.documentOpen) {
      return Promise.reject(new Error('Only a single offscreen document may be created.'));
    }
    this.documentOpen = true;
    this.createdOptions = options;
    return Promise.resolve();
  },
  closeDocument() {
    this.documentOpen = false;
    this.createdOptions = null;
    return Promise.resolve();
  }
};

// Mock WebSocket
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
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();
    }, 10);
  }
  send(data) {
    this.sentData.push(data);
  }
  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose({ reason: 'normal' });
  }
}

// Mock Fetch
let lastFetch = null;
const mockFetch = (url, options) => {
  lastFetch = { url, options };
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true })
  });
};

// Capture console logs
const originalConsole = { ...console };
const logs = [];
global.console = {
  log(...args) { logs.push({ type: 'log', args }); originalConsole.log(...args); },
  warn(...args) { logs.push({ type: 'warn', args }); originalConsole.warn(...args); },
  error(...args) { logs.push({ type: 'error', args }); originalConsole.error(...args); }
};

// Setup global context for VM
const bgContext = {
  chrome: {
    runtime: mockRuntime,
    storage: {
      local: mockStorage,
      onChanged: mockStorage.onChanged
    },
    offscreen: mockOffscreen
  },
  console: global.console,
  fetch: mockFetch,
  setInterval,
  clearInterval,
  setTimeout
};
vm.createContext(bgContext);

const offscreenContext = {
  chrome: {
    runtime: mockRuntime,
    storage: {
      local: mockStorage,
      onChanged: mockStorage.onChanged
    },
    offscreen: mockOffscreen
  },
  console: global.console,
  WebSocket: MockWebSocket,
  fetch: mockFetch,
  setInterval,
  clearInterval,
  setTimeout
};
vm.createContext(offscreenContext);

// Test suite
async function runTests() {
  console.log('--- RUNNING TEST SUITE ---');
  
  // 1. Load files
  const bgCode = fs.readFileSync(path.join(__dirname, '../../background.js'), 'utf8');
  const osCode = fs.readFileSync(path.join(__dirname, '../../offscreen/offscreen.js'), 'utf8');

  // 2. Execute files
  vm.runInContext(bgCode, bgContext);
  vm.runInContext(osCode, offscreenContext);

  // 3. Test onInstalled default initialization
  console.log('Testing installation defaults initialization...');
  for (const listener of mockRuntime.installedListeners) {
    await listener();
  }
  
  assert.ok(mockStorage.data.connection_settings, 'connection_settings should be set in storage');
  assert.equal(mockStorage.data.connection_settings.host, 'localhost');
  assert.equal(mockStorage.data.connection_settings.protocol, 'ws');
  
  // 4. Test offscreen creation when monitoring_active = true
  console.log('Testing offscreen creation on monitoring active...');
  await mockStorage.set({ monitoring_active: true });
  await new Promise(r => setTimeout(r, 10));
  assert.ok(mockOffscreen.documentOpen, 'Offscreen document should be open');
  assert.equal(mockOffscreen.createdOptions.reasons[0], 'WEBSOCKETS');

  // 5. Test offscreen websocket connection and message relay
  console.log('Testing WebSocket message forwarding...');
  await new Promise(r => setTimeout(r, 20));
  
  const samplePayload = {
    platform: 'tiktok',
    nickname: 'Alice',
    username: '@alice',
    message: 'Hello!',
    profilePic: 'http://pic.jpg',
    timestamp: Date.now()
  };
  
  const sampleMessage = {
    type: 'CHAT_MESSAGE',
    payload: samplePayload
  };
  
  // Simulate content script message sending (relayed by bg to offscreen)
  let foundListener = false;
  mockRuntime.messageListeners.forEach(l => {
    // Message from content script has sender.tab
    l(sampleMessage, { tab: { id: 1 } }, () => {});
    foundListener = true;
  });
  
  assert.ok(foundListener, 'Should have message listener registered');
  
  const wsInstance = MockWebSocket.instances[0];
  assert.ok(wsInstance, 'WebSocket instance should be created');
  assert.equal(wsInstance.sentData.length, 1);
  const sentPayload = JSON.parse(wsInstance.sentData[0]);
  assert.equal(sentPayload.nickname, 'Alice');

  // 6. Test switching to HTTP POST protocol
  console.log('Testing switching to HTTP POST...');
  await mockStorage.set({
    connection_settings: {
      host: 'localhost',
      port: '3000',
      protocol: 'http',
      path: '/api/chat'
    }
  });
  await new Promise(r => setTimeout(r, 10));
  
  mockRuntime.messageListeners.forEach(l => {
    l(sampleMessage, { tab: { id: 1 } }, () => {});
  });
  
  assert.ok(lastFetch, 'Fetch should be called for HTTP protocol');
  assert.equal(lastFetch.url, 'http://localhost:3000/api/chat');
  const fetchBody = JSON.parse(lastFetch.options.body);
  assert.equal(fetchBody.nickname, 'Alice');

  // 7. Test offscreen teardown when monitoring_active = false
  console.log('Testing offscreen teardown...');
  await mockStorage.set({ monitoring_active: false });
  await new Promise(r => setTimeout(r, 10));
  assert.ok(!mockOffscreen.documentOpen, 'Offscreen document should be closed');

  console.log('🎉 ALL TESTS PASSED!');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
