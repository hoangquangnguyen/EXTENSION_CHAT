const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert').strict;

// Simple Document Element Mock
class MockElement {
  constructor(id, tag = 'div') {
    this.id = id;
    this.tag = tag;
    this.classList = {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      toggle(c, force) {
        if (force !== undefined) {
          if (force) this.classes.add(c);
          else this.classes.delete(c);
          return force;
        }
        const has = this.classes.has(c);
        if (has) this.classes.delete(c);
        else this.classes.add(c);
        return !has;
      },
      contains(c) { return this.classes.has(c); }
    };
    this.children = [];
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.textContent = '';
    this.src = '';
    this.alt = '';
    this.scrollTop = 0;
    this.scrollHeight = 0;
  }

  get className() {
    return Array.from(this.classList.classes).join(' ');
  }

  set className(val) {
    this.classList.classes = new Set(val.split(' ').filter(Boolean));
  }

  appendChild(child) {
    this.children.push(child);
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
    }
  }

  querySelector(selector) {
    // Basic mock selector matching
    if (selector === '.comment-card') {
      return this.children.find(c => c.classList.contains('comment-card')) || null;
    }
    return null;
  }

  addEventListener(event, callback) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  trigger(event, data) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}

// Mock Document Object
const elements = {};
const mockDocument = {
  DOMContentLoadedListeners: [],
  addEventListener(event, callback) {
    if (event === 'DOMContentLoaded') {
      this.DOMContentLoadedListeners.push(callback);
    }
  },
  getElementById(id) {
    if (!elements[id]) {
      const el = new MockElement(id);
      if (id === 'warning-banner') {
        el.classList.add('hidden');
      }
      elements[id] = el;
    }
    return elements[id];
  },
  createElement(tag) {
    return new MockElement('', tag);
  },
  triggerLoad() {
    this.DOMContentLoadedListeners.forEach(cb => cb());
  }
};

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
  set(items, callback) {
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

// Mock Chrome Tabs
let activeTabUrl = 'https://www.tiktok.com/@someone/live';
const mockTabs = {
  query(queryInfo, callback) {
    callback([{ url: activeTabUrl }]);
  }
};

// Mock Chrome Runtime
const mockRuntime = {
  listeners: [],
  onMessage: {
    addListener(callback) {
      mockRuntime.listeners.push(callback);
    }
  },
  triggerMessage(message, sender = {}) {
    mockRuntime.listeners.forEach(cb => cb(message, sender, () => {}));
  }
};

// VM Context
const popupContext = {
  document: mockDocument,
  chrome: {
    tabs: mockTabs,
    storage: {
      local: mockStorage,
      onChanged: mockStorage.onChanged
    },
    runtime: mockRuntime
  },
  setTimeout,
  console: {
    log: () => {},
    error: () => {},
    warn: () => {}
  }
};
vm.createContext(popupContext);

async function runTests() {
  console.log('--- STARTING STORY 1.5 POPUP TESTS ---');

  // Load code
  const codePath = path.join(__dirname, '../../popup/popup.js');
  const code = fs.readFileSync(codePath, 'utf8');

  // 1. Regex test for URL patterns matching
  console.log('Testing URL pattern checks...');
  const tiktokLiveRegex = /^https?:\/\/(?:[a-z0-9-]+\.)?tiktok\.com\/(?:[^/]+\/live|live)/i;
  
  assert.ok(tiktokLiveRegex.test('https://www.tiktok.com/@some_user/live'), 'Standard user live pattern should match');
  assert.ok(tiktokLiveRegex.test('https://tiktok.com/live'), 'Basic live page should match');
  assert.ok(tiktokLiveRegex.test('https://www.tiktok.com/live?enter_from=...'), 'Live page with query string should match');
  assert.ok(tiktokLiveRegex.test('http://tiktok.com/@user/live/subpath'), 'Http protocol and path variants should match');
  assert.ok(!tiktokLiveRegex.test('https://www.tiktok.com/@some_user'), 'Normal profile page should NOT match');
  assert.ok(!tiktokLiveRegex.test('https://www.google.com'), 'External pages should NOT match');

  // Initialize elements
  const toggle = mockDocument.getElementById('monitoring-toggle');
  const banner = mockDocument.getElementById('warning-banner');
  const indicator = mockDocument.getElementById('status-indicator');
  const statusText = mockDocument.getElementById('status-text');
  const saveBtn = mockDocument.getElementById('btn-save');
  const feed = mockDocument.getElementById('comment-feed');
  const counter = mockDocument.getElementById('comment-count');
  
  // Set default storage values
  mockStorage.data = {
    connection_settings: {
      host: 'localhost',
      port: '3000',
      protocol: 'ws',
      path: '/'
    },
    selectors: {
      chatContainer: '.webcast-chatroom___list',
      commentNode: '.webcast-chatroom___item',
      nickname: '.nickname',
      username: '.username',
      message: '.content',
      profilePic: 'img'
    },
    monitoring_active: true,
    connection_status: 'connected'
  };

  // 2. Validate behavior on invalid URL
  console.log('Testing invalid URL tab behavior...');
  activeTabUrl = 'https://www.tiktok.com/@user'; // invalid live URL
  
  // Execute the popup.js in the context
  vm.runInContext(code, popupContext);
  mockDocument.triggerLoad();
  await new Promise(r => setTimeout(r, 10));

  assert.ok(!banner.classList.contains('hidden'), 'Banner should show warning for invalid URL');
  assert.ok(toggle.disabled, 'Toggle switch should be disabled');
  assert.ok(!toggle.checked, 'Toggle switch should be unchecked');
  assert.equal(mockStorage.data.monitoring_active, false, 'Monitoring should turn off in storage on invalid page');

  // Clear context and elements for valid page testing
  for (const k of Object.keys(elements)) {
    delete elements[k];
  }
  mockDocument.DOMContentLoadedListeners = [];
  mockRuntime.listeners = [];
  mockStorage.listeners = [];

  // Re-establish valid URL
  activeTabUrl = 'https://www.tiktok.com/@user/live';
  mockStorage.data.monitoring_active = true;
  mockStorage.data.connection_status = 'connecting';

  console.log('Testing valid URL tab initialization...');
  vm.runInContext(code, popupContext);
  mockDocument.triggerLoad();
  await new Promise(r => setTimeout(r, 10));

  const validToggle = mockDocument.getElementById('monitoring-toggle');
  const validBanner = mockDocument.getElementById('warning-banner');
  const validIndicator = mockDocument.getElementById('status-indicator');
  const validText = mockDocument.getElementById('status-text');

  assert.ok(validBanner.classList.contains('hidden') || validBanner.className.includes('hidden'), 'Warning banner should remain hidden');
  assert.ok(!validToggle.disabled, 'Toggle switch should be enabled');
  assert.ok(validToggle.checked, 'Toggle switch should load correct checkbox value');
  assert.ok(validIndicator.className.includes('connecting'), 'Badge indicator should reflect connecting status');
  assert.equal(validText.textContent, 'Connecting', 'Status label should display Connecting');

  // Test dynamic status change in storage
  console.log('Testing connection status changes in storage...');
  await mockStorage.set({ connection_status: 'connected' });
  await new Promise(r => setTimeout(r, 10));
  assert.ok(validIndicator.className.includes('connected'), 'Indicator should update to connected class');
  assert.equal(validText.textContent, 'Connected', 'Status text should update to Connected');

  // Test dynamic status change via message
  mockRuntime.triggerMessage({ type: 'CONNECTION_STATUS', status: 'disconnected' });
  assert.ok(validIndicator.className.includes('disconnected'), 'Indicator should update to disconnected');
  assert.equal(validText.textContent, 'Disconnected', 'Status text should update to Disconnected');

  // 3. Test Save Configuration Hook
  console.log('Testing save configurations...');
  const hostInput = mockDocument.getElementById('input-host');
  const portInput = mockDocument.getElementById('input-port');
  const selectorNickname = mockDocument.getElementById('sel-nickname');
  const validSaveBtn = mockDocument.getElementById('btn-save');

  // Modify form inputs
  hostInput.value = '127.0.0.1';
  portInput.value = '8080';
  selectorNickname.value = '.custom-nick';

  // Trigger Save click
  validSaveBtn.trigger('click');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(mockStorage.data.connection_settings.host, '127.0.0.1', 'Host should save to local storage');
  assert.equal(mockStorage.data.connection_settings.port, '8080', 'Port should save to local storage');
  assert.equal(mockStorage.data.selectors.nickname, '.custom-nick', 'Selectors should save to local storage');
  assert.ok(validSaveBtn.disabled, 'Save button should be disabled temporarily on save animation');

  // 4. Test Rolling comments preview feed (max 20)
  console.log('Testing live rolling feed append and pruning...');
  const validFeed = mockDocument.getElementById('comment-feed');
  const validCounter = mockDocument.getElementById('comment-count');
  validToggle.checked = true; // ensure checked is active

  // Push 25 messages
  for (let i = 1; i <= 25; i++) {
    mockRuntime.triggerMessage({
      type: 'CHAT_MESSAGE',
      payload: {
        nickname: `User ${i}`,
        username: `handle_${i}`,
        message: `Chat content ${i}`,
        profilePic: ''
      }
    });
  }

  // Children count inside feed container should be capped at 20
  assert.equal(validFeed.children.length, 20, 'Feed DOM should cap at 20 items');
  assert.equal(validCounter.textContent, '20 / 20', 'Comment counter should read 20 / 20');
  
  // The first item currently inside the feed should be Chat content 6 (oldest 1-5 pruned)
  const firstDetail = validFeed.children[0].children[1]; // comment-details element
  const firstMsgSpan = firstDetail.children[1]; // message span
  assert.equal(firstMsgSpan.textContent, 'Chat content 6', 'Oldest comments should be trimmed from the DOM');

  console.log('🎉 ALL STORY 1.5 POPUP TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
