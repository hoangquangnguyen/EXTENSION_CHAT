// background.js

// Dynamic storage initialization for default selectors
chrome.runtime.onInstalled.addListener(async () => {
  console.log("TikTok Chat Chrome Extension installed.");
  try {
    const url = chrome.runtime.getURL("selectors.json");
    const response = await fetch(url);
    const selectors = await response.json();
    
    // Store defaults in local storage
    await chrome.storage.local.set({ selectors });
    console.log("Default selectors successfully initialized in storage:", selectors);
  } catch (error) {
    console.error("Failed to initialize default selectors:", error);
  }
});
