// popup.js
// Popup UI Controller for the TikTok Live Chat Relayer.

document.addEventListener("DOMContentLoaded", async () => {
  // DOM References
  const DEFAULT_SELECTORS = {
    chatContainer: "[data-e2e=\"live-chat-container\"], .webcast-chatroom___list, .webcast-chatroom___message-list, [data-testid='chatroom-message-list']",
    commentNode: "[data-e2e=\"chat-message\"], .webcast-chatroom___item, .webcast-chatroom___message-item, [data-testid='chatroom-message-item']",
    nickname: "[data-e2e=\"message-owner-name\"], .webcast-chatroom___nickname, .webcast-chatroom___author-name, .nickname",
    username: "[data-e2e=\"message-owner-name\"], .webcast-chatroom___username, .webcast-chatroom___author-handle, .username",
    message: "div:nth-child(2) > div:nth-child(2), .webcast-chatroom___content, .webcast-chatroom___message-text, .content",
    profilePic: "div:first-child img, .webcast-chatroom___avatar img, .avatar img"
  };

  const monitoringToggle = document.getElementById("monitoring-toggle");
  const statusIndicator = document.getElementById("status-indicator");
  const statusText = document.getElementById("status-text");
  const warningBanner = document.getElementById("warning-banner");
  const errorBanner = document.getElementById("error-banner");
  const btnTestConn = document.getElementById("btn-test-conn");
  const testResult = document.getElementById("test-result");
  
  const btnConfig = document.getElementById("btn-config");
  const panelConfig = document.getElementById("panel-config");
  const btnSelectors = document.getElementById("btn-selectors");
  const panelSelectors = document.getElementById("panel-selectors");
  const btnSave = document.getElementById("btn-save");

  // Diagnostics DOM References
  const btnDiagnostics = document.getElementById("btn-diagnostics");
  const panelDiagnostics = document.getElementById("panel-diagnostics");
  const diagTabValid = document.getElementById("diag-tab-valid");
  const diagOffscreenRunning = document.getElementById("diag-offscreen-running");
  const diagTargetUrl = document.getElementById("diag-target-url");
  const diagMonitoringState = document.getElementById("diag-monitoring-state");
  const diagSocketState = document.getElementById("diag-socket-state");
  
  const commentFeed = document.getElementById("comment-feed");
  const commentCount = document.getElementById("comment-count");
  const emptyFeed = document.getElementById("empty-feed");
  
  // Settings Inputs
  const inputProtocol = document.getElementById("input-protocol");
  const inputHost = document.getElementById("input-host");
  const inputPort = document.getElementById("input-port");
  const inputPath = document.getElementById("input-path");
  
  // Selector Inputs
  const selContainer = document.getElementById("sel-container");
  const selNode = document.getElementById("sel-node");
  const selNickname = document.getElementById("sel-nickname");
  const selUsername = document.getElementById("sel-username");
  const selMessage = document.getElementById("sel-message");
  const selProfile = document.getElementById("sel-profile");

  // In-memory array for rolling preview (maximum 20 comments)
  const activeComments = [];

  // Toggle Accordion Panel helper
  function setupAccordion(trigger, content) {
    trigger.addEventListener("click", () => {
      const isActive = trigger.classList.toggle("active");
      content.classList.toggle("active", isActive);
    });
  }
  setupAccordion(btnConfig, panelConfig);
  setupAccordion(btnSelectors, panelSelectors);
  setupAccordion(btnDiagnostics, panelDiagnostics);

  // Update system diagnostics values
  function updateDiagnosticsUI() {
    if (!diagTabValid || !diagOffscreenRunning) return;

    // 1. Tab Valid
    if (isValidTab) {
      diagTabValid.textContent = "Yes (TikTok Live Stream)";
      diagTabValid.className = "diag-value success";
    } else {
      diagTabValid.textContent = "No (Navigate to TikTok Live page)";
      diagTabValid.className = "diag-value error";
    }

    // 2. Offscreen running
    let offscreenRunning = false;
    if (chrome.extension && typeof chrome.extension.getViews === "function") {
      const views = chrome.extension.getViews();
      for (const view of views) {
        if (view.location.pathname.includes("offscreen.html")) {
          offscreenRunning = true;
          break;
        }
      }
    }
    if (offscreenRunning) {
      diagOffscreenRunning.textContent = "Yes (Active)";
      diagOffscreenRunning.className = "diag-value success";
    } else {
      diagOffscreenRunning.textContent = "No (Not Started)";
      diagOffscreenRunning.className = "diag-value error";
    }

    // 3. Storage connection details
    chrome.storage.local.get(["connection_settings", "monitoring_active", "connection_status", "last_connection_error"], (res) => {
      const settings = res.connection_settings || { host: "127.0.0.1", port: "6161", protocol: "ws", path: "/" };
      const monitoring = !!res.monitoring_active;
      const status = res.connection_status || "disconnected";
      const errorMsg = res.last_connection_error || "";

      const formattedPath = settings.path.startsWith("/") ? settings.path : `/${settings.path}`;
      diagTargetUrl.textContent = `${settings.protocol}://${settings.host}:${settings.port}${formattedPath}`;
      diagTargetUrl.className = "diag-value";

      diagMonitoringState.textContent = monitoring ? "Active (On)" : "Inactive (Off)";
      diagMonitoringState.className = monitoring ? "diag-value success" : "diag-value error";

      if (status === "connected") {
        diagSocketState.textContent = "Connected (OK)";
        diagSocketState.className = "diag-value success";
      } else if (status === "connecting") {
        diagSocketState.textContent = "Connecting...";
        diagSocketState.className = "diag-value warning";
      } else {
        diagSocketState.textContent = errorMsg ? `Error (${errorMsg})` : "Disconnected";
        diagSocketState.className = "diag-value error";
      }
    });
  }

  // Validate active tab URL
  function validateActiveTab() {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) {
        resolve(false);
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          resolve(false);
          return;
        }
        const activeTab = tabs[0];
        const url = activeTab.url;
        if (!url) {
          resolve(false);
          return;
        }
        // Match patterns: *://*.tiktok.com/*/live* or *://*.tiktok.com/live*
        const tiktokLiveRegex = /^https?:\/\/(?:[a-z0-9-]+\.)?tiktok\.com\/(?:[^/]+\/live|live)/i;
        resolve(tiktokLiveRegex.test(url));
      });
    });
  }

  // Update connection status badge styling
  function updateStatusUI(active, status, errorMsg = "") {
    statusIndicator.className = "status-indicator";
    
    if (!active) {
      statusIndicator.classList.add("disconnected");
      statusText.textContent = "Disconnected";
      if (errorBanner) errorBanner.classList.add("hidden");
      return;
    }

    if (status === "connected") {
      statusIndicator.classList.add("connected");
      statusText.textContent = "Connected";
      if (errorBanner) errorBanner.classList.add("hidden");
    } else if (status === "connecting") {
      statusIndicator.classList.add("connecting");
      statusText.textContent = "Connecting";
      if (errorBanner) errorBanner.classList.add("hidden");
    } else {
      statusIndicator.classList.add("disconnected");
      statusText.textContent = "Disconnected";
      if (errorBanner) {
        if (errorMsg) {
          errorBanner.textContent = `❌ Connection Error: ${errorMsg}`;
          errorBanner.classList.remove("hidden");
        } else {
          errorBanner.classList.add("hidden");
        }
      }
    }
  }

  // Append new comment card to UI, keeping maximum of 20
  function appendComment(payload) {
    if (!payload || (!payload.nickname && !payload.username && !payload.message)) {
      return;
    }

    // Hide empty placeholder
    if (emptyFeed && !emptyFeed.classList.contains("hidden")) {
      emptyFeed.classList.add("hidden");
    }

    activeComments.push(payload);

    // Limit to last 20
    if (activeComments.length > 20) {
      activeComments.shift(); // Remove oldest from array
      const oldestCard = commentFeed.querySelector(".comment-card");
      if (oldestCard) {
        commentFeed.removeChild(oldestCard); // Remove oldest from DOM
      }
    }

    // Create Comment Card Elements
    const card = document.createElement("div");
    card.className = "comment-card";

    const avatarContainer = document.createElement("div");
    avatarContainer.className = "avatar-container";

    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = payload.profilePic || "";
    avatar.alt = "Avatar";
    
    // SVG base64 fallback avatar on image load failure or missing url
    const svgFallback = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' fill='%234b5563'><circle cx='12' cy='12' r='10'/><path d='M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
    if (!payload.profilePic) {
      avatar.src = svgFallback;
    }
    avatar.onerror = () => {
      avatar.src = svgFallback;
    };
    avatarContainer.appendChild(avatar);

    const details = document.createElement("div");
    details.className = "comment-details";

    const meta = document.createElement("div");
    meta.className = "comment-meta";

    const nickname = document.createElement("span");
    nickname.className = "nickname";
    nickname.textContent = payload.nickname || "Anonymous";

    meta.appendChild(nickname);

    if (payload.username) {
      const username = document.createElement("span");
      username.className = "username";
      username.textContent = `@${payload.username}`;
      meta.appendChild(username);
    }

    const message = document.createElement("span");
    message.className = "message";
    message.textContent = payload.message || "";

    details.appendChild(meta);
    details.appendChild(message);

    card.appendChild(avatarContainer);
    card.appendChild(details);

    commentFeed.appendChild(card);

    // Update Counter text
    commentCount.textContent = `${activeComments.length} / 20`;

    // Auto-scroll to bottom of comment feed
    commentFeed.scrollTop = commentFeed.scrollHeight;
  }

  // Check tab URL validation first
  const isValidTab = await validateActiveTab();
  if (!isValidTab) {
    warningBanner.classList.remove("hidden");
    monitoringToggle.disabled = true;
    monitoringToggle.checked = false;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ monitoring_active: false });
    }
  }

  // Load config & prefill UI form
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["connection_settings", "selectors", "monitoring_active", "connection_status", "last_connection_error"], (res) => {
      const settings = res.connection_settings || { host: "127.0.0.1", port: "6161", protocol: "ws", path: "/" };
      const selectors = res.selectors || {};
      const active = isValidTab ? !!res.monitoring_active : false;
      const status = res.connection_status || "disconnected";
      const errorMsg = res.last_connection_error || "";

      // Fill connection inputs
      inputProtocol.value = settings.protocol || "ws";
      inputHost.value = settings.host || "127.0.0.1";
      inputPort.value = settings.port || "6161";
      inputPath.value = settings.path || "/";

      // Fill selector inputs
      selContainer.value = selectors.chatContainer || DEFAULT_SELECTORS.chatContainer;
      selNode.value = selectors.commentNode || DEFAULT_SELECTORS.commentNode;
      selNickname.value = selectors.nickname || DEFAULT_SELECTORS.nickname;
      selUsername.value = selectors.username || DEFAULT_SELECTORS.username;
      selMessage.value = selectors.message || DEFAULT_SELECTORS.message;
      selProfile.value = selectors.profilePic || DEFAULT_SELECTORS.profilePic;

      // Sync toggles
      if (isValidTab) {
        monitoringToggle.checked = active;
      }
      
      updateStatusUI(active, status, errorMsg);
      updateDiagnosticsUI();
    });

    // Listen to Storage changes dynamically
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        if (changes.connection_status || changes.monitoring_active || changes.last_connection_error || changes.connection_settings) {
          chrome.storage.local.get(["monitoring_active", "connection_status", "last_connection_error"], (res) => {
            const active = isValidTab ? !!res.monitoring_active : false;
            updateStatusUI(active, res.connection_status || "disconnected", res.last_connection_error || "");
            updateDiagnosticsUI();
          });
        }
      }
    });

    // Listen to incoming runtime messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "CONNECTION_STATUS") {
        const active = isValidTab ? monitoringToggle.checked : false;
        chrome.storage.local.get(["last_connection_error"], (res) => {
          updateStatusUI(active, message.status, res.last_connection_error || "");
          updateDiagnosticsUI();
        });
      } else if (message.type === "CHAT_MESSAGE") {
        console.log("Popup received CHAT_MESSAGE:", message.payload);
        if (monitoringToggle.checked && isValidTab) {
          console.log("Popup appending comment to feed.");
          appendComment(message.payload);
        } else {
          console.warn("Popup did not append comment. monitoringToggle:", monitoringToggle.checked, "isValidTab:", isValidTab);
        }
      }
    });
  }

  // Test Connection handler
  if (btnTestConn && testResult) {
    btnTestConn.addEventListener("click", () => {
      const protocol = inputProtocol.value.trim();
      const host = inputHost.value.trim() || "127.0.0.1";
      const port = inputPort.value.trim() || "6161";
      const path = inputPath.value.trim();
      const formattedPath = path.startsWith("/") ? path : `/${path}`;

      // Reset UI feedback states
      testResult.className = "test-result testing";
      testResult.textContent = `Testing connection to ${protocol}://${host}:${port}${formattedPath}...`;
      testResult.classList.remove("hidden");
      btnTestConn.disabled = true;

      let testSocket = null;
      let timeoutId = null;

      const cleanUp = () => {
        btnTestConn.disabled = false;
        if (timeoutId) clearTimeout(timeoutId);
      };

      if (protocol === "ws") {
        const url = `ws://${host}:${port}${formattedPath}`;
        try {
          testSocket = new WebSocket(url);
          
          timeoutId = setTimeout(() => {
            testResult.className = "test-result error";
            testResult.textContent = `❌ Connection Timeout. Host is unreachable or took too long to respond.`;
            if (testSocket) {
              testSocket.onopen = null;
              testSocket.onerror = null;
              testSocket.close();
            }
            cleanUp();
          }, 5000);

          testSocket.onopen = () => {
            testResult.className = "test-result success";
            testResult.textContent = `✅ Connection Success! WebSocket server is running at ${url}.`;
            testSocket.close();
            cleanUp();
          };

          testSocket.onerror = (e) => {
            testResult.className = "test-result error";
            testResult.textContent = `❌ Connection Failed! Server is offline, port is blocked, or WebSocket is not reachable at ${url}.`;
            cleanUp();
          };
        } catch (err) {
          testResult.className = "test-result error";
          testResult.textContent = `❌ WebSocket Initialization Error: ${err.message || err}`;
          cleanUp();
        }
      } else {
        // HTTP protocol
        const url = `http://${host}:${port}${formattedPath}`;
        
        timeoutId = setTimeout(() => {
          testResult.className = "test-result error";
          testResult.textContent = `❌ HTTP Connection Timeout at ${url}`;
          cleanUp();
        }, 5000);

        fetch(url, { method: "GET", mode: "cors" })
          .then(res => {
            testResult.className = "test-result success";
            testResult.textContent = `✅ Connection Success! HTTP server returned status ${res.status}.`;
            cleanUp();
          })
          .catch(err => {
            testResult.className = "test-result error";
            testResult.textContent = `❌ HTTP Connection Failed: ${err.message || "Failed to fetch. Server might be offline or CORS blocked."}`;
            cleanUp();
          });
      }
    });
  }

  // Save Config handler
  btnSave.addEventListener("click", () => {
    const connectionSettings = {
      protocol: inputProtocol.value.trim(),
      host: inputHost.value.trim(),
      port: inputPort.value.trim(),
      path: inputPath.value.trim()
    };

    const selectors = {
      chatContainer: selContainer.value.trim() || DEFAULT_SELECTORS.chatContainer,
      commentNode: selNode.value.trim() || DEFAULT_SELECTORS.commentNode,
      nickname: selNickname.value.trim() || DEFAULT_SELECTORS.nickname,
      username: selUsername.value.trim() || DEFAULT_SELECTORS.username,
      message: selMessage.value.trim() || DEFAULT_SELECTORS.message,
      profilePic: selProfile.value.trim() || DEFAULT_SELECTORS.profilePic
    };

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        connection_settings: connectionSettings,
        selectors: selectors
      }, () => {
        // Simple micro-animation on save button
        const originalText = btnSave.textContent;
        btnSave.textContent = "Saved Successfully! ✓";
        btnSave.disabled = true;
        setTimeout(() => {
          btnSave.textContent = originalText;
          btnSave.disabled = false;
        }, 1500);
      });
    }
  });

  // Toggle monitoring handler
  monitoringToggle.addEventListener("change", (e) => {
    const active = e.target.checked;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ monitoring_active: active });
    }
  });
});
