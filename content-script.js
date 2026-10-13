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
    selectors: { ...DEFAULT_SELECTORS },
    dedup_enabled: true,
    dedup_window_seconds: 30
  };

  let activeSelectors = { ...DEFAULT_SELECTORS };
  let monitoringActive = false;
  let observer = null;
  let checkerInterval = null;
  let lastObservedElement = null;

  // Deduplication state and cache
  let dedupEnabled = true;
  let dedupWindowSeconds = 30;
  const dedupCache = new Map(); // fingerprint -> timestamp (ms)
  const MAX_DEDUP_CACHE_SIZE = 500;

  console.log("TikTok Chat Extension: Multi-Tab Content Script loaded.");

  // Check if extension context is still valid
  function isContextValid() {
    try {
      return !!chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  // Generate deterministic fingerprint for user and message
  function getCommentFingerprint(author, message) {
    const safeAuthor = (author || "").trim().toLowerCase();
    const safeMessage = (message || "").trim().toLowerCase();
    return `${safeAuthor}:::${safeMessage}`;
  }

  // Evict expired entries and enforce max capacity bounds
  function cleanDedupCache(now, windowMs) {
    for (const [key, timestamp] of dedupCache.entries()) {
      if (now - timestamp >= windowMs) {
        dedupCache.delete(key);
      }
    }
    while (dedupCache.size >= MAX_DEDUP_CACHE_SIZE) {
      const oldestKey = dedupCache.keys().next().value;
      if (oldestKey !== undefined) {
        dedupCache.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  // Check if a comment is a duplicate within cooldown window
  function isDuplicateComment(author, message) {
    if (!dedupEnabled) return false;
    const now = Date.now();
    const windowMs = Math.max(1, dedupWindowSeconds || 30) * 1000;
    const fingerprint = getCommentFingerprint(author, message);

    cleanDedupCache(now, windowMs);

    const lastSeen = dedupCache.get(fingerprint);
    if (lastSeen !== undefined && (now - lastSeen) < windowMs) {
      return true;
    }

    dedupCache.set(fingerprint, now);
    return false;
  }

  // Session-wide seen history cache (prevents re-scraping historical comments when scrolling)
  const seenHistoryCache = new Set();
  const MAX_SEEN_HISTORY_SIZE = 3000;

  function addSeenHistory(fingerprint) {
    if (!fingerprint) return;
    if (seenHistoryCache.size >= MAX_SEEN_HISTORY_SIZE) {
      const oldestKey = seenHistoryCache.values().next().value;
      if (oldestKey !== undefined) {
        seenHistoryCache.delete(oldestKey);
      }
    }
    seenHistoryCache.add(fingerprint);
  }

  // Pre-mark all existing comment nodes in container when monitoring starts
  function premarkExistingComments(container) {
    if (!container || !activeSelectors.commentNode) return;
    try {
      const existingNodes = container.querySelectorAll(activeSelectors.commentNode);
      let premarkedCount = 0;
      for (const node of existingNodes) {
        if (!node.hasAttribute("data-ext-parsed")) {
          node.setAttribute("data-ext-parsed", "true");
        }
        const nicknameEl = activeSelectors.nickname ? node.querySelector(activeSelectors.nickname) : null;
        const usernameEl = activeSelectors.username ? node.querySelector(activeSelectors.username) : null;
        const messageEl = activeSelectors.message ? node.querySelector(activeSelectors.message) : null;

        const nickname = nicknameEl ? nicknameEl.textContent.trim() : "";
        const username = usernameEl ? usernameEl.textContent.trim() : "";
        const message = messageEl ? messageEl.textContent.trim() : "";
        const author = username || nickname;

        if (author && message) {
          const fp = getCommentFingerprint(author, message);
          addSeenHistory(fp);
          premarkedCount++;
        }
      }
      console.log(`TikTok Chat Extension: Pre-marked ${premarkedCount} existing comment nodes in container.`);
    } catch (e) {
      console.warn("TikTok Chat Extension: Error pre-marking existing comments:", e);
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

      // Check user-comment deduplication
      const authorIdentifier = username || nickname;
      const fingerprint = getCommentFingerprint(authorIdentifier, message);

      // 1. Check session-wide seen history (suppresses old comments re-mounted when scrolling)
      if (seenHistoryCache.has(fingerprint)) {
        console.log(`TikTok Chat Extension [Tab:${myTabConfig.tabId}] Suppressed historical comment re-mounted by scroll from "${authorIdentifier}": "${message}"`);
        return;
      }

      // 2. Check user-comment deduplication within cooldown window
      if (isDuplicateComment(authorIdentifier, message)) {
        console.log(`TikTok Chat Extension [Tab:${myTabConfig.tabId}] Suppressed duplicate comment from "${authorIdentifier}": "${message}"`);
        return;
      }

      // 3. Record in session-wide seen history
      addSeenHistory(fingerprint);

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
      // Pre-mark all existing comment nodes in container to freeze history
      premarkExistingComments(container);

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
    dedupCache.clear();
    seenHistoryCache.clear();
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
  function updateState(monitoring, selectors, dedupConfig) {
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

    if (dedupConfig) {
      if (dedupConfig.dedup_enabled !== undefined) {
        dedupEnabled = !!dedupConfig.dedup_enabled;
      }
      if (dedupConfig.dedup_window_seconds !== undefined) {
        dedupWindowSeconds = Number(dedupConfig.dedup_window_seconds) || 30;
      }
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
        updateState(myTabConfig.monitoring_active, myTabConfig.selectors, {
          dedup_enabled: myTabConfig.dedup_enabled,
          dedup_window_seconds: myTabConfig.dedup_window_seconds
        });
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
          updateState(myTabConfig.monitoring_active, myTabConfig.selectors, {
            dedup_enabled: myTabConfig.dedup_enabled,
            dedup_window_seconds: myTabConfig.dedup_window_seconds
          });
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
        updateState(myTabConfig.monitoring_active, myTabConfig.selectors, {
          dedup_enabled: myTabConfig.dedup_enabled,
          dedup_window_seconds: myTabConfig.dedup_window_seconds
        });
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
