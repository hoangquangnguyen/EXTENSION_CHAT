// content-script.js
// TikTok Live chat DOM scraper script using MutationObserver with Multi-Tab isolation.

(() => {
  if (window.hasTikTokChatContentScriptInjected) {
    console.log("TikTok Chat Extension: Content Script already injected, skipping.");
    return;
  }
  window.hasTikTokChatContentScriptInjected = true;

  const DEFAULT_SELECTORS = {
    chatContainer: "[data-e2e=\"live-chat-container\"], .webcast-chatroom___list, .webcast-chatroom___message-list, [data-testid='chatroom-message-list']",
    commentNode: "[data-e2e=\"chat-message\"], .webcast-chatroom___item, .webcast-chatroom___message-item, [data-testid='chatroom-message-item']",
    nickname: "[data-e2e=\"message-owner-name\"], .webcast-chatroom___nickname, .webcast-chatroom___author-name, .nickname",
    username: "[data-e2e=\"message-owner-name\"], .webcast-chatroom___username, .webcast-chatroom___author-handle, .username",
    message: "div:nth-child(2) > div:nth-child(2), .webcast-chatroom___content, .webcast-chatroom___message-text, .content",
    profilePic: "div:first-child img, .webcast-chatroom___avatar img, .avatar img"
  };

  let myTabConfig = {
    tabId: null,
    ai_reply_id: "default",
    monitoring_active: false,
    selectors: { ...DEFAULT_SELECTORS }
  };

  let activeSelectors = { ...DEFAULT_SELECTORS };
  let monitoringActive = false;
  let observer = null;
  let checkerInterval = null;
  let lastObservedElement = null;

  console.log("TikTok Chat Extension: Multi-Tab Content Script loaded.");

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

      // Avoid processing system notices (messages without nickname & username) or empty/invalid structures
      if (!nickname && !username) {
        return;
      }

      if (!message) {
        return;
      }

      const payload = {
        nickname,
        username,
        message,
        profilePic,
        timestamp: Date.now(),
        ai_reply_id: myTabConfig.ai_reply_id || "default",
        tabId: myTabConfig.tabId
      };

      console.log(`TikTok Chat Extension [Tab:${myTabConfig.tabId} | AI:${payload.ai_reply_id}] sending message:`, payload.nickname, payload.message);

      // Dispatch chat message frame to extension background
      chrome.runtime.sendMessage({
        type: "CHAT_MESSAGE",
        payload
      }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn("TikTok Chat Extension: error during sendMessage:", err);
        }
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
      const cleanedSelectors = {};
      for (const key in selectors) {
        if (selectors[key] && selectors[key].trim() !== "") {
          cleanedSelectors[key] = selectors[key];
        }
      }
      activeSelectors = { ...DEFAULT_SELECTORS, ...cleanedSelectors };
    }

    if (monitoringActive) {
      startMonitoring();
      startCheckerLoop();
    } else {
      stopMonitoring();
      stopCheckerLoop();
    }
  }

  // Retrieve tab configuration from background on startup
  function initTabConfig() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return;
    chrome.runtime.sendMessage({ type: "GET_MY_TAB_CONFIG" }, (response) => {
      const err = chrome.runtime.lastError;
      if (!err && response && response.success && response.config) {
        myTabConfig = { ...myTabConfig, ...response.config };
        console.log("TikTok Chat Extension: Initialized tab config:", myTabConfig);
        updateState(myTabConfig.monitoring_active, myTabConfig.selectors);
      }
    });
  }

  initTabConfig();

  // Watch for configuration shifts in tab_sessions storage
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && myTabConfig.tabId) {
      if (changes.tab_sessions && changes.tab_sessions.newValue) {
        const sessions = changes.tab_sessions.newValue;
        const currentConfig = sessions[myTabConfig.tabId];
        if (currentConfig) {
          myTabConfig = { ...myTabConfig, ...currentConfig };
          updateState(myTabConfig.monitoring_active, myTabConfig.selectors);
        }
      }
    }
  });

  // Handle direct runtime messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "TAB_CONFIG_UPDATED") {
      if (message.config) {
        myTabConfig = { ...myTabConfig, ...message.config };
        console.log("TikTok Chat Extension: Tab config updated via direct message:", myTabConfig);
        updateState(myTabConfig.monitoring_active, myTabConfig.selectors);
        sendResponse({ success: true });
      }
    } else if (message.type === "TEST_SCRAPE_DOM") {
      try {
        const selectors = message.selectors || activeSelectors;
        const container = document.querySelector(selectors.chatContainer);
        if (!container) {
          sendResponse({
            success: false,
            error: `Chat container not found with selector: "${selectors.chatContainer}"`
          });
          return true;
        }

        const commentNodes = container.querySelectorAll(selectors.commentNode);
        if (commentNodes.length === 0) {
          sendResponse({
            success: true,
            commentCount: 0,
            comments: []
          });
          return true;
        }

        const sampleComments = [];
        let validCommentCount = 0;
        for (let i = 0; i < commentNodes.length; i++) {
          const node = commentNodes[i];
          const nicknameEl = selectors.nickname ? node.querySelector(selectors.nickname) : null;
          const usernameEl = selectors.username ? node.querySelector(selectors.username) : null;
          const messageEl = selectors.message ? node.querySelector(selectors.message) : null;
          const profilePicEl = selectors.profilePic ? node.querySelector(selectors.profilePic) : null;

          const nickname = nicknameEl ? nicknameEl.textContent.trim() : "";
          const username = usernameEl ? usernameEl.textContent.trim() : "";
          
          if (!nickname && !username) continue;

          const msgContent = messageEl ? messageEl.textContent.trim() : "";
          if (!msgContent) continue;

          let profilePic = "";
          if (profilePicEl) {
            profilePic = profilePicEl.getAttribute("src") || 
                         profilePicEl.getAttribute("data-src") || 
                         profilePicEl.src || "";
            profilePic = profilePic.trim();
          }

          if (sampleComments.length < 5) {
            sampleComments.push({
              nickname,
              username,
              message: msgContent,
              profilePic
            });
          }
          validCommentCount++;
        }

        sendResponse({
          success: true,
          commentCount: validCommentCount,
          comments: sampleComments
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message
        });
      }
      return true;
    }
  });
})();
