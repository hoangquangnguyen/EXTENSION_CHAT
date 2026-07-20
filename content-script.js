// content-script.js
// TikTok Live chat DOM scraper script using MutationObserver.

(() => {
  if (window.hasTikTokChatContentScriptInjected) {
    console.log("TikTok Chat Extension: Content Script already injected, skipping.");
    return;
  }
  window.hasTikTokChatContentScriptInjected = true;

  const DEFAULT_SELECTORS = {
    chatContainer: ".webcast-chatroom___list, .webcast-chatroom___message-list, [data-testid='chatroom-message-list']",
    commentNode: ".webcast-chatroom___item, .webcast-chatroom___message-item, [data-testid='chatroom-message-item']",
    nickname: ".webcast-chatroom___nickname, .webcast-chatroom___author-name, .nickname",
    username: ".webcast-chatroom___username, .webcast-chatroom___author-handle, .username",
    message: ".webcast-chatroom___content, .webcast-chatroom___message-text, .content",
    profilePic: ".webcast-chatroom___avatar img, .avatar img"
  };

  let activeSelectors = { ...DEFAULT_SELECTORS };
  let monitoringActive = false;
  let observer = null;
  let checkerInterval = null;
  let lastObservedElement = null;

  console.log("TikTok Chat Extension: Content Script loaded.");

  // Check if extension context is still valid
  function isContextValid() {
    try {
      return !!chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  // Parse an individual comment DOM node safely
  function parseCommentNode(node) {
    try {
      if (!isContextValid()) {
        stopMonitoring();
        stopCheckerLoop();
        return;
      }
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

      if (node.hasAttribute("data-ext-parsed")) return;
      node.setAttribute("data-ext-parsed", "true");

      const nicknameEl = activeSelectors.nickname ? node.querySelector(activeSelectors.nickname) : null;
      const usernameEl = activeSelectors.username ? node.querySelector(activeSelectors.username) : null;
      const messageEl = activeSelectors.message ? node.querySelector(activeSelectors.message) : null;
      const profilePicEl = activeSelectors.profilePic ? node.querySelector(activeSelectors.profilePic) : null;

      const nickname = nicknameEl ? nicknameEl.textContent.trim() : "";
      const username = usernameEl ? usernameEl.textContent.trim() : "";
      const message = messageEl ? messageEl.textContent.trim() : "";

      let profilePic = "";
      if (profilePicEl) {
        profilePic = profilePicEl.getAttribute("src") || 
                     profilePicEl.getAttribute("data-src") || 
                     profilePicEl.src || "";
        profilePic = profilePic.trim();
      }

      // Avoid processing system notices or empty node structures
      if (!nickname && !username && !message) {
        return;
      }

      const payload = {
        platform: "tiktok",
        nickname,
        username,
        message,
        profilePic,
        timestamp: Date.now()
      };

      // Dispatch chat message frame to extension background
      chrome.runtime.sendMessage({
        type: "CHAT_MESSAGE",
        payload
      }, () => {
        // Catch and ignore expected error when background script goes inactive
        const err = chrome.runtime.lastError;
      });

    } catch (error) {
      console.error("TikTok Chat Extension: Error parsing comment node:", error);
    }
  }

  // Start observing mutations on the chat container
  function startMonitoring() {
    // Teardown any existing observer
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    const container = document.querySelector(activeSelectors.chatContainer);
    if (!container) {
      console.warn("TikTok Chat Extension: Chat container element not found with selector:", activeSelectors.chatContainer);
      lastObservedElement = null;
      return;
    }

    try {
      observer = new MutationObserver((mutations) => {
        if (!isContextValid()) {
          stopMonitoring();
          stopCheckerLoop();
          return;
        }
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Check if the added node itself is the comment item
                if (node.matches && node.matches(activeSelectors.commentNode)) {
                  parseCommentNode(node);
                } else {
                  // Check if any matching comments are nested within the added node sub-tree
                  const childComments = node.querySelectorAll(activeSelectors.commentNode);
                  for (const child of childComments) {
                    parseCommentNode(child);
                  }
                }
              }
            }
          }
        }
      });

      observer.observe(container, { childList: true, subtree: true });
      lastObservedElement = container;
      console.log("TikTok Chat Extension: Monitoring started successfully on container:", container);
    } catch (error) {
      console.error("TikTok Chat Extension: Failed to attach MutationObserver:", error);
      lastObservedElement = null;
    }
  }

  // Stop monitoring and disconnect MutationObserver
  function stopMonitoring() {
    if (observer) {
      observer.disconnect();
      observer = null;
      console.log("TikTok Chat Extension: Monitoring stopped.");
    }
    lastObservedElement = null;
  }

  // Handle periodic heartbeats to reattach the observer if container shifts
  function startCheckerLoop() {
    if (checkerInterval) {
      clearInterval(checkerInterval);
    }
    checkerInterval = setInterval(() => {
      if (!isContextValid()) {
        stopMonitoring();
        stopCheckerLoop();
        return;
      }
      if (!monitoringActive) {
        stopCheckerLoop();
        return;
      }
      const currentContainer = document.querySelector(activeSelectors.chatContainer);
      // Re-bind if observed container is missing, replaced, or detached
      if (!lastObservedElement || currentContainer !== lastObservedElement || !document.body.contains(lastObservedElement)) {
        console.log("TikTok Chat Extension: Chat container shift/detach detected. Re-attaching...");
        startMonitoring();
      }
    }, 2000);
  }

  // Stop the reattachment check interval
  function stopCheckerLoop() {
    if (checkerInterval) {
      clearInterval(checkerInterval);
      checkerInterval = null;
    }
  }

  // Update extension state
  function updateState(monitoring, selectors) {
    monitoringActive = !!monitoring;
    if (selectors) {
      activeSelectors = { ...DEFAULT_SELECTORS, ...selectors };
    }

    if (monitoringActive) {
      startMonitoring();
      startCheckerLoop();
    } else {
      stopMonitoring();
      stopCheckerLoop();
    }
  }

  // Retrieve configuration and initialize
  chrome.storage.local.get(["monitoring_active", "selectors"], (result) => {
    const monitoring = result.monitoring_active || false;
    const selectors = result.selectors || null;
    console.log("TikTok Chat Extension: Initializing settings. Monitoring active:", monitoring);
    updateState(monitoring, selectors);
  });

  // Watch for configuration shifts
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      let stateChanged = false;
      let newMonitoring = monitoringActive;
      let newSelectors = activeSelectors;

      if (changes.monitoring_active) {
        newMonitoring = changes.monitoring_active.newValue;
        stateChanged = true;
      }
      if (changes.selectors) {
        newSelectors = changes.selectors.newValue;
        stateChanged = true;
      }

      if (stateChanged) {
        console.log("TikTok Chat Extension: Settings updated dynamically.");
        updateState(newMonitoring, newSelectors);
      }
    }
  });
})();
