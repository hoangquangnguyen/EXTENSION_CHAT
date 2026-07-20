// background.js

// Dynamic storage initialization for default selectors and connection settings
chrome.runtime.onInstalled.addListener(async () => {
  console.log("TikTok Chat Chrome Extension installed.");
  try {
    // 1. Initialize Default Selectors
    const url = chrome.runtime.getURL("selectors.json");
    const response = await fetch(url);
    const selectors = await response.json();
    await chrome.storage.local.set({ selectors });
    console.log("Default selectors successfully initialized in storage:", selectors);
    
    // 2. Initialize Default Connection Settings
    const storageData = await chrome.storage.local.get(["connection_settings"]);
    if (!storageData.connection_settings) {
      const defaultSettings = {
        host: "127.0.0.1",
        port: "6161",
        protocol: "ws",
        path: "/"
      };
      await chrome.storage.local.set({ connection_settings: defaultSettings });
      console.log("Default connection settings initialized in storage:", defaultSettings);
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

// Watch storage changes to toggle offscreen document and broadcast config updates
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local") {
    if (changes.monitoring_active) {
      const active = !!changes.monitoring_active.newValue;
      console.log(`monitoring_active changed in background: ${active}`);
      await manageOffscreenDocument(active);
    }

    // Broadcast config changes to offscreen if open
    if (changes.connection_settings || changes.monitoring_active) {
      chrome.storage.local.get(["connection_settings", "monitoring_active"], (res) => {
        const settings = res.connection_settings || { host: "127.0.0.1", port: "6161", protocol: "ws", path: "/" };
        const active = !!res.monitoring_active;
        chrome.runtime.sendMessage({
          type: "UPDATE_OFFSCREEN",
          connectionSettings: settings,
          monitoringActive: active
        }, () => {
          const err = chrome.runtime.lastError; // ignore error if offscreen is closed
        });
      });
    }
  }
});

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
    chrome.storage.local.get(["connection_settings", "monitoring_active"], (res) => {
      const settings = res.connection_settings || { host: "127.0.0.1", port: "6161", protocol: "ws", path: "/" };
      const active = !!res.monitoring_active;
      chrome.runtime.sendMessage({
        type: "INIT_OFFSCREEN",
        connectionSettings: settings,
        monitoringActive: active
      }, () => {
        const err = chrome.runtime.lastError;
      });
    });
  }
});

// Check monitoring state and sync offscreen document on Service Worker startup
chrome.storage.local.get(["monitoring_active"], (res) => {
  if (res && res.monitoring_active) {
    console.log("Service Worker startup: Monitoring active. Re-syncing offscreen document...");
    manageOffscreenDocument(true);
  }
});
