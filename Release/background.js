// background.js
// Multi-Tab Session & Relayer Background Service Worker

// Dynamic storage initialization for default selectors and connection settings
chrome.runtime.onInstalled.addListener(async () => {
  console.log("LIVE Relayer Extension installed.");
  try {
    // 1. Initialize Default Selectors and Presets
    const url = chrome.runtime.getURL("selectors.json");
    const response = await fetch(url);
    const data = await response.json();
    
    // Save presets and default active selectors
    await chrome.storage.local.set({ 
      selector_presets: data.presets,
      selectors: data.presets[data.default].selectors,
      active_preset: data.default
    });
    console.log("Default selectors and presets successfully initialized in storage:", data);
    
    // 2. Initialize Default Connection Settings
    const storageData = await chrome.storage.local.get(["connection_settings", "tab_sessions"]);
    if (!storageData.connection_settings) {
      const defaultSettings = {
        host: "127.0.0.1",
        port: "3003",
        protocol: "http",
        path: "/api/chat/tiktok-comment",
        ai_reply_id: "default"
      };
      await chrome.storage.local.set({ connection_settings: defaultSettings });
      console.log("Default connection settings initialized in storage:", defaultSettings);
    }
    if (!storageData.tab_sessions) {
      await chrome.storage.local.set({ tab_sessions: {} });
    }
  } catch (error) {
    console.error("Failed to initialize default configuration:", error);
  }
});

// Helper to check if the offscreen document is already open
async function hasOffscreenDocument() {
  if (typeof chrome.runtime.getContexts === "function") {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"]
      });
      return contexts.length > 0;
    } catch (error) {
      console.error("Error in getContexts:", error);
    }
  }
  
  // Fallback check
  if (chrome.extension && typeof chrome.extension.getViews === "function") {
    try {
      const views = chrome.extension.getViews();
      for (const view of views) {
        if (view.location.pathname.includes("offscreen.html")) {
          return true;
        }
      }
    } catch (error) {
      console.error("Error in getViews:", error);
    }
  }
  return false;
}

// Spawns or tears down the offscreen document
async function manageOffscreenDocument(active) {
  try {
    const hasDoc = await hasOffscreenDocument();
    if (active) {
      if (!hasDoc) {
        console.log("Creating offscreen document...");
        await chrome.offscreen.createDocument({
          url: chrome.runtime.getURL("offscreen/offscreen.html"),
          reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
          justification: "Forward TikTok Live comment payloads to local WebSocket/HTTP server"
        });
        console.log("Offscreen document created.");
      }
    } else {
      if (hasDoc) {
        console.log("Closing offscreen document...");
        await chrome.offscreen.closeDocument();
        console.log("Offscreen document closed.");
      }
    }
  } catch (error) {
    console.error("Failed to manage offscreen document:", error);
  }
}

// Helper to check if any tab is actively monitoring
async function isAnyTabMonitoring() {
  const data = await chrome.storage.local.get(["tab_sessions", "monitoring_active"]);
  const sessions = data.tab_sessions || {};
  for (const tid in sessions) {
    if (sessions[tid] && sessions[tid].monitoring_active) {
      return true;
    }
  }
  return !!data.monitoring_active;
}

// Watch storage changes to toggle offscreen document and broadcast config updates
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local") {
    if (changes.tab_sessions || changes.monitoring_active) {
      const active = await isAnyTabMonitoring();
      console.log(`Monitoring state check in background. Any tab active: ${active}`);
      await manageOffscreenDocument(active);
    }

    // Broadcast config changes to offscreen if open
    if (changes.connection_settings || changes.tab_sessions || changes.monitoring_active) {
      chrome.storage.local.get(["connection_settings", "tab_sessions", "monitoring_active"], async (res) => {
        const settings = res.connection_settings || { host: "127.0.0.1", port: "3003", protocol: "http", path: "/api/chat/tiktok-comment" };
        const anyActive = await isAnyTabMonitoring();
        chrome.runtime.sendMessage({
          type: "UPDATE_OFFSCREEN",
          connectionSettings: settings,
          monitoringActive: anyActive
        }, () => {
          const err = chrome.runtime.lastError; // ignore error if offscreen is closed
        });
      });
    }
  }
});

// Clean up tab session when a browser tab is closed
if (chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    try {
      const data = await chrome.storage.local.get(["tab_sessions"]);
      const sessions = data.tab_sessions || {};
      if (sessions[tabId]) {
        console.log(`Cleaning up session for closed Tab #${tabId}`);
        delete sessions[tabId];
        await chrome.storage.local.set({ tab_sessions: sessions });
        const anyActive = await isAnyTabMonitoring();
        if (!anyActive) {
          await manageOffscreenDocument(false);
        }
      }
    } catch (e) {
      console.error("Error cleaning tab session on tab close:", e);
    }
  });
}

// Listen for runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CONNECTION_STATUS") {
    console.log(`Connection status update received in background: ${message.status}`);
    chrome.storage.local.set({ connection_status: message.status });
  } else if (message.type === "CONNECTION_ERROR") {
    console.log(`Connection error update received in background: ${message.error}`);
    chrome.storage.local.set({ last_connection_error: message.error });
  } else if (message.type === "OFFSCREEN_LOADED") {
    console.log("Background: Offscreen document loaded. Syncing settings...");
    chrome.storage.local.get(["connection_settings"], async (res) => {
      const settings = res.connection_settings || { host: "127.0.0.1", port: "3003", protocol: "http", path: "/api/chat/tiktok-comment" };
      const anyActive = await isAnyTabMonitoring();
      chrome.runtime.sendMessage({
        type: "INIT_OFFSCREEN",
        connectionSettings: settings,
        monitoringActive: anyActive
      }, () => {
        const err = chrome.runtime.lastError;
      });
    });
  } else if (message.type === "GET_MY_TAB_CONFIG") {
    // Content script requesting its tab-specific configuration
    const tabId = sender.tab ? sender.tab.id : null;
    chrome.storage.local.get(["tab_sessions", "connection_settings", "selectors"], (res) => {
      const sessions = res.tab_sessions || {};
      const globalConn = res.connection_settings || { host: "127.0.0.1", port: "3003", protocol: "http", path: "/api/chat/tiktok-comment", ai_reply_id: "default" };
      const globalSelectors = res.selectors || null;

      let tabConfig = null;
      if (tabId && sessions[tabId]) {
        tabConfig = { ...sessions[tabId], tabId };
      } else {
        tabConfig = {
          tabId: tabId,
          ai_reply_id: globalConn.ai_reply_id || "default",
          monitoring_active: false,
          selectors: globalSelectors,
          connection_settings: globalConn
        };
      }
      sendResponse({ success: true, config: tabConfig });
    });
    return true; // Keep channel open for async response
  }
});

// Check monitoring state and sync offscreen document on Service Worker startup
isAnyTabMonitoring().then((anyActive) => {
  if (anyActive) {
    console.log("Service Worker startup: Monitoring active. Re-syncing offscreen document...");
    manageOffscreenDocument(true);
  }
});
