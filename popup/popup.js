// popup.js
// Popup UI Controller for the TikTok Live Chat Relayer.

document.addEventListener("DOMContentLoaded", async () => {
  // DOM References
  const monitoringToggle = document.getElementById("monitoring-toggle");
  const statusIndicator = document.getElementById("status-indicator");
  const statusText = document.getElementById("status-text");
  const warningBanner = document.getElementById("warning-banner");
  
  const btnConfig = document.getElementById("btn-config");
  const panelConfig = document.getElementById("panel-config");
  const btnSelectors = document.getElementById("btn-selectors");
  const panelSelectors = document.getElementById("panel-selectors");
  const btnSave = document.getElementById("btn-save");
  
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
  function updateStatusUI(active, status) {
    statusIndicator.className = "status-indicator";
    
    if (!active) {
      statusIndicator.classList.add("disconnected");
      statusText.textContent = "Disconnected";
      return;
    }

    if (status === "connected") {
      statusIndicator.classList.add("connected");
      statusText.textContent = "Connected";
    } else if (status === "connecting") {
      statusIndicator.classList.add("connecting");
      statusText.textContent = "Connecting";
    } else {
      statusIndicator.classList.add("disconnected");
      statusText.textContent = "Disconnected";
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
    chrome.storage.local.get(["connection_settings", "selectors", "monitoring_active", "connection_status"], (res) => {
      const settings = res.connection_settings || { host: "localhost", port: "3000", protocol: "ws", path: "/" };
      const selectors = res.selectors || {};
      const active = isValidTab ? !!res.monitoring_active : false;
      const status = res.connection_status || "disconnected";

      // Fill connection inputs
      inputProtocol.value = settings.protocol || "ws";
      inputHost.value = settings.host || "localhost";
      inputPort.value = settings.port || "3000";
      inputPath.value = settings.path || "/";

      // Fill selector inputs
      selContainer.value = selectors.chatContainer || "";
      selNode.value = selectors.commentNode || "";
      selNickname.value = selectors.nickname || "";
      selUsername.value = selectors.username || "";
      selMessage.value = selectors.message || "";
      selProfile.value = selectors.profilePic || "";

      // Sync toggles
      if (isValidTab) {
        monitoringToggle.checked = active;
      }
      
      updateStatusUI(active, status);
    });

    // Listen to Storage changes dynamically
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        if (changes.connection_status || changes.monitoring_active) {
          chrome.storage.local.get(["monitoring_active", "connection_status"], (res) => {
            const active = isValidTab ? !!res.monitoring_active : false;
            updateStatusUI(active, res.connection_status || "disconnected");
          });
        }
      }
    });

    // Listen to incoming runtime messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "CONNECTION_STATUS") {
        const active = isValidTab ? monitoringToggle.checked : false;
        updateStatusUI(active, message.status);
      } else if (message.type === "CHAT_MESSAGE") {
        // Only render comments if monitoring is active
        if (monitoringToggle.checked && isValidTab) {
          appendComment(message.payload);
        }
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
      chatContainer: selContainer.value.trim(),
      commentNode: selNode.value.trim(),
      nickname: selNickname.value.trim(),
      username: selUsername.value.trim(),
      message: selMessage.value.trim(),
      profilePic: selProfile.value.trim()
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
