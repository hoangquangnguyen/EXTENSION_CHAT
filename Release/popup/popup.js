// popup.js
// Popup UI Controller for the TikTok Live Chat Relayer with Multi-Tab isolation.

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

  const activeTabText = document.getElementById("active-tab-text");
  const monitoringToggle = document.getElementById("monitoring-toggle");
  const statusIndicator = document.getElementById("status-indicator");
  const statusText = document.getElementById("status-text");
  const warningBanner = document.getElementById("warning-banner");
  const errorBanner = document.getElementById("error-banner");
  const btnTestConn = document.getElementById("btn-test-conn");
  const testResult = document.getElementById("test-result");
  const btnTestScrape = document.getElementById("btn-test-scrape");
  const scrapeTestResult = document.getElementById("scrape-test-result");
  
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
  const inputAiId = document.getElementById("input-ai-id");
  const btnFetchAiList = document.getElementById("btn-fetch-ai-list");

  // Selector Inputs
  const selContainer = document.getElementById("sel-container");
  const selNode = document.getElementById("sel-node");
  const selNickname = document.getElementById("sel-nickname");
  const selUsername = document.getElementById("sel-username");
  const selMessage = document.getElementById("sel-message");
  const selProfile = document.getElementById("sel-profile");

  // Selector Presets Elements
  const selPreset = document.getElementById("sel-preset");
  const btnImportJson = document.getElementById("btn-import-json");
  const btnUpdateOnline = document.getElementById("btn-update-online");
  const inputFileSelectors = document.getElementById("input-file-selectors");
  const presetInfoBanner = document.getElementById("preset-info-banner");

  // In-memory array for rolling preview (maximum 20 comments)
  const activeComments = [];

  let currentTab = null;
  let currentTabId = null;
  let isValidTab = false;
  let loadedPresets = {};
  let activePresetKey = "tiktok";

  // Helper to build full URL from protocol, host, port, and path settings
  function buildUrl(protocol, host, port, path) {
    let url = (host || "").trim();
    const safeProtocol = (protocol || "http").trim();
    const safePort = (port || "").trim();
    const safePath = (path || "").trim();
    const formattedPath = safePath ? (safePath.startsWith("/") ? safePath : `/${safePath}`) : "";

    if (/^[a-zA-Z]+:\/\//.test(url)) {
      if (safeProtocol === "ws") {
        url = url.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
      } else if (safeProtocol === "http") {
        url = url.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:");
      }
      
      try {
        const parsed = new URL(url);
        if ((parsed.pathname === "/" || parsed.pathname === "") && formattedPath) {
          url = `${parsed.protocol}//${parsed.host}${formattedPath}${parsed.search}`;
        }
      } catch (e) {}
      
      return url;
    }

    const hostPart = url.split("/")[0];
    const hasPort = hostPart.includes(":") && !hostPart.endsWith("]");
    
    const portStr = (hasPort || !safePort) ? "" : `:${safePort}`;
    const hasPath = url.includes("/");
    const pathStr = hasPath ? "" : formattedPath;
    
    return `${safeProtocol}://${url}${portStr}${pathStr}`;
  }

  // Toggle Accordion Panel helper
  function setupAccordion(trigger, content) {
    if (!trigger || !content) return;
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
      diagTabValid.textContent = `Yes (Tab #${currentTabId || '?'})`;
      diagTabValid.className = "diag-value success";
    } else {
      diagTabValid.textContent = "No (Navigate to Live stream page)";
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
    chrome.storage.local.get(["tab_sessions", "connection_settings", "connection_status", "last_connection_error"], (res) => {
      const sessions = res.tab_sessions || {};
      const tabSession = currentTabId && sessions[currentTabId] ? sessions[currentTabId] : null;
      const settings = (tabSession && tabSession.connection_settings) || res.connection_settings || { host: "127.0.0.1", port: "3003", protocol: "http", path: "/api/chat/tiktok-comment" };
      const monitoring = isValidTab ? !!(tabSession && tabSession.monitoring_active) : false;
      const status = res.connection_status || "disconnected";
      const errorMsg = res.last_connection_error || "";

      diagTargetUrl.textContent = buildUrl(settings.protocol, settings.host, settings.port, settings.path);
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

  // Get active tab info and validate URL
  async function validateActiveTab() {
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
        currentTab = tabs[0];
        currentTabId = currentTab.id;

        if (activeTabText && currentTab) {
          let domainOrTitle = "Tab #" + currentTabId;
          try {
            if (currentTab.url) {
              const u = new URL(currentTab.url);
              domainOrTitle = u.hostname.replace("www.", "");
            }
          } catch (e) {
            domainOrTitle = currentTab.title || ("Tab #" + currentTabId);
          }
          activeTabText.textContent = `Tab #${currentTabId} (${domainOrTitle})`;
          activeTabText.title = currentTab.title || currentTab.url || "";
        }

        const url = currentTab.url;
        if (!url) {
          resolve(false);
          return;
        }

        const generalRegex = /^(https?|file):\/\//i;
        resolve(generalRegex.test(url));
      });
    });
  }

  // Update warnings and active toggles when tab changes
  function updateTabWarningUI(isValid) {
    if (isValid) {
      warningBanner.classList.add("hidden");
      monitoringToggle.disabled = false;
    } else {
      warningBanner.classList.remove("hidden");
      monitoringToggle.disabled = true;
      monitoringToggle.checked = false;
    }
  }

  // Show status indicator banner inside the selector accordion
  function showPresetBanner(message, isError = false) {
    if (!presetInfoBanner) return;
    presetInfoBanner.textContent = message;
    presetInfoBanner.className = isError ? "test-result error" : "test-result success";
    presetInfoBanner.classList.remove("hidden");
    setTimeout(() => {
      presetInfoBanner.classList.add("hidden");
    }, 4000);
  }

  // Dynamically populates the preset dropdown options
  function populatePresetDropdown(presets, selectedKey) {
    if (!selPreset) return;
    selPreset.innerHTML = "";
    for (const key in presets) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = presets[key].name || key;
      selPreset.appendChild(option);
    }
    const customOption = document.createElement("option");
    customOption.value = "custom";
    customOption.textContent = "Custom / Uploaded JSON";
    selPreset.appendChild(customOption);

    selPreset.value = selectedKey;
  }

  // Loads presets list and populates UI options
  function loadPresetsAndInit() {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }
      chrome.storage.local.get(["selector_presets", "active_preset"], async (res) => {
        let presets = res.selector_presets;
        let activeKey = res.active_preset;

        if (!presets) {
          try {
            const url = chrome.runtime.getURL("selectors.json");
            const response = await fetch(url);
            const data = await response.json();
            presets = data.presets;
            activeKey = activeKey || data.default;
            await chrome.storage.local.set({ 
              selector_presets: presets,
              active_preset: activeKey 
            });
          } catch (e) {
            console.error("Failed to load selectors.json", e);
            presets = {};
          }
        } else {
          let updated = false;
          if (presets.shopee) {
            presets.shopee_sh = presets.shopee;
            presets.shopee_sh.name = "Shopee SH";
            delete presets.shopee;
            updated = true;
          } else if (presets.shopee_sh && presets.shopee_sh.name === "Shopee Live") {
            presets.shopee_sh.name = "Shopee SH";
            updated = true;
          }
          
          if (activeKey === "shopee") {
            activeKey = "shopee_sh";
            updated = true;
          }

          if (!presets.shopee_live) {
            presets.shopee_live = {
              name: "Shopee Live",
              selectors: {
                chatContainer: ".ReactVirtualized__Grid__innerScrollContainer, div[role=\"rowgroup\"]",
                commentNode: ".comment-container_7ca29",
                nickname: ".user-name_2fad3",
                username: ".user-name_2fad3",
                message: ".message-content_3bb92",
                profilePic: ""
              }
            };
            updated = true;
          }

          if (updated) {
            await chrome.storage.local.set({ 
              selector_presets: presets,
              active_preset: activeKey
            });
          }
        }

        loadedPresets = presets || {};
        activePresetKey = activeKey || "tiktok";
        populatePresetDropdown(loadedPresets, activePresetKey);
        resolve();
      });
    });
  }

  // Update connection status badge styling
  function updateStatusUI(active, status, errorMsg = "") {
    statusIndicator.className = "status-indicator";
    
    if (!active) {
      statusIndicator.classList.add("disconnected");
      statusText.textContent = "Inactive (Tab)";
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

    if (emptyFeed && !emptyFeed.classList.contains("hidden")) {
      emptyFeed.classList.add("hidden");
    }

    activeComments.push(payload);

    if (activeComments.length > 20) {
      activeComments.shift();
      const oldestCard = commentFeed.querySelector(".comment-card");
      if (oldestCard) {
        commentFeed.removeChild(oldestCard);
      }
    }

    const card = document.createElement("div");
    card.className = "comment-card";

    const avatarContainer = document.createElement("div");
    avatarContainer.className = "avatar-container";

    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = payload.profilePic || "";
    avatar.alt = "Avatar";
    
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

    // AI ID Tag Badge
    if (payload.ai_reply_id) {
      const aiTag = document.createElement("span");
      aiTag.style.fontSize = "0.6rem";
      aiTag.style.background = "rgba(6, 182, 212, 0.15)";
      aiTag.style.color = "var(--accent-cyan)";
      aiTag.style.padding = "1px 4px";
      aiTag.style.borderRadius = "3px";
      aiTag.style.marginLeft = "auto";
      aiTag.textContent = `AI: ${payload.ai_reply_id}`;
      meta.appendChild(aiTag);
    }

    const message = document.createElement("span");
    message.className = "message";
    message.textContent = payload.message || "";

    details.appendChild(meta);
    details.appendChild(message);

    card.appendChild(avatarContainer);
    card.appendChild(details);

    commentFeed.appendChild(card);
    commentCount.textContent = `${activeComments.length} / 20`;
    commentFeed.scrollTop = commentFeed.scrollHeight;
  }

  // Load config & prefill UI form
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    await loadPresetsAndInit();

    isValidTab = await validateActiveTab();
    updateTabWarningUI(isValidTab);

    chrome.storage.local.get(["tab_sessions", "connection_settings", "selectors", "connection_status", "last_connection_error", "active_preset"], (res) => {
      const sessions = res.tab_sessions || {};
      const tabSession = currentTabId && sessions[currentTabId] ? sessions[currentTabId] : null;
      const globalConn = res.connection_settings || { host: "127.0.0.1", port: "3003", protocol: "http", path: "/api/chat/tiktok-comment", ai_reply_id: "default" };
      
      const settings = (tabSession && tabSession.connection_settings) || globalConn;
      const aiId = (tabSession && tabSession.ai_reply_id) || globalConn.ai_reply_id || "default";
      const active = isValidTab ? !!(tabSession && tabSession.monitoring_active) : false;
      const status = res.connection_status || "disconnected";
      const errorMsg = res.last_connection_error || "";
      const activePreset = (tabSession && tabSession.active_preset) || res.active_preset || activePresetKey || "tiktok";
      
      const presetSelectors = (loadedPresets[activePreset] && loadedPresets[activePreset].selectors) || DEFAULT_SELECTORS;
      const selectors = (tabSession && tabSession.selectors) || res.selectors || presetSelectors;

      // Fill connection inputs
      inputProtocol.value = settings.protocol || "http";
      inputHost.value = settings.host || "127.0.0.1";
      inputPort.value = settings.port || "3003";
      inputPath.value = settings.path || "/api/chat/tiktok-comment";
      if (inputAiId) {
        inputAiId.value = aiId;
      }

      // Fill selector inputs
      selContainer.value = selectors.chatContainer || presetSelectors.chatContainer;
      selNode.value = selectors.commentNode || presetSelectors.commentNode;
      selNickname.value = selectors.nickname || presetSelectors.nickname;
      selUsername.value = selectors.username || presetSelectors.username;
      selMessage.value = selectors.message || presetSelectors.message;
      selProfile.value = selectors.profilePic || presetSelectors.profilePic;

      // Sync preset dropdown select
      if (selPreset) {
        selPreset.value = activePreset;
        activePresetKey = activePreset;
      }

      // Sync toggles
      if (isValidTab) {
        monitoringToggle.checked = active;
      }
      
      updateStatusUI(active, status, errorMsg);
      updateDiagnosticsUI();
    });

    // Listen to Storage changes dynamically without clobbering current tab's active form
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        if (changes.connection_status || changes.last_connection_error) {
          chrome.storage.local.get(["tab_sessions", "connection_status", "last_connection_error"], (res) => {
            const sessions = res.tab_sessions || {};
            const tabSession = currentTabId && sessions[currentTabId] ? sessions[currentTabId] : null;
            const active = isValidTab ? !!(tabSession && tabSession.monitoring_active) : false;
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
          appendComment(message.payload);
        }
      }
    });
  }

  // Test Connection handler
  if (btnTestConn && testResult) {
    btnTestConn.addEventListener("click", () => {
      const protocol = inputProtocol.value.trim();
      const host = inputHost.value.trim() || "127.0.0.1";
      const port = inputPort.value.trim() || "3003";
      const path = inputPath.value.trim();
      const url = buildUrl(protocol, host, port, path);

      testResult.className = "test-result testing";
      testResult.textContent = `Testing connection to ${url}...`;
      testResult.classList.remove("hidden");
      btnTestConn.disabled = true;

      let testSocket = null;
      let timeoutId = null;

      const cleanUp = () => {
        btnTestConn.disabled = false;
        if (timeoutId) clearTimeout(timeoutId);
      };

      if (protocol === "ws") {
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

  // Test Scraper DOM handler
  if (btnTestScrape && scrapeTestResult) {
    btnTestScrape.addEventListener("click", () => {
      const selectors = {
        chatContainer: selContainer.value.trim(),
        commentNode: selNode.value.trim(),
        nickname: selNickname.value.trim(),
        username: selUsername.value.trim(),
        message: selMessage.value.trim(),
        profilePic: selProfile.value.trim()
      };

      if (!selectors.chatContainer || !selectors.commentNode) {
        scrapeTestResult.className = "test-result error";
        scrapeTestResult.textContent = "❌ Please input both Chat Container and Comment Node selectors.";
        scrapeTestResult.classList.remove("hidden");
        return;
      }

      scrapeTestResult.className = "test-result testing";
      scrapeTestResult.textContent = "🔍 Scanning page DOM using active selectors...";
      scrapeTestResult.classList.remove("hidden");
      btnTestScrape.disabled = true;

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          scrapeTestResult.className = "test-result error";
          scrapeTestResult.textContent = "❌ No active tab found.";
          btnTestScrape.disabled = false;
          return;
        }

        const activeTab = tabs[0];
        chrome.tabs.sendMessage(activeTab.id, {
          type: "TEST_SCRAPE_DOM",
          selectors: selectors
        }, (response) => {
          btnTestScrape.disabled = false;
          const err = chrome.runtime.lastError;
          if (err) {
            scrapeTestResult.className = "test-result error";
            scrapeTestResult.textContent = `❌ Cannot connect to page. Make sure the page is loaded and reload it if you just installed the extension.`;
            return;
          }

          if (!response || !response.success) {
            scrapeTestResult.className = "test-result error";
            scrapeTestResult.textContent = `❌ Test Failed: ${response ? response.error : "No response from page script."}`;
          } else {
            if (response.commentCount > 0) {
              scrapeTestResult.className = "test-result success";
              scrapeTestResult.textContent = `✅ Success! Found container and ${response.commentCount} comment nodes.`;
              
              if (commentFeed) {
                commentFeed.innerHTML = "";
                activeComments.length = 0;
                
                response.comments.forEach(c => {
                  appendComment({
                    nickname: `${c.nickname || "Anonymous"} [TEST]`,
                    username: c.username,
                    message: c.message,
                    profilePic: c.profilePic,
                    ai_reply_id: inputAiId ? inputAiId.value.trim() : "default"
                  });
                });
              }
            } else {
              scrapeTestResult.className = "test-result warning";
              scrapeTestResult.textContent = `⚠️ Container found, but 0 comments matched selector "${selectors.commentNode}".`;
            }
          }
        });
      });
    });
  }

  // Preset selector dropdown change handler
  if (selPreset) {
    selPreset.addEventListener("change", async (e) => {
      const key = e.target.value;
      activePresetKey = key;
      
      if (key !== "custom" && loadedPresets[key]) {
        const selectors = loadedPresets[key].selectors || {};
        selContainer.value = selectors.chatContainer || "";
        selNode.value = selectors.commentNode || "";
        selNickname.value = selectors.nickname || "";
        selUsername.value = selectors.username || "";
        selMessage.value = selectors.message || "";
        selProfile.value = selectors.profilePic || "";
        
        showPresetBanner(`Loaded preset: ${loadedPresets[key].name || key}`);
      }
      
      isValidTab = await validateActiveTab();
      updateTabWarningUI(isValidTab);
      updateDiagnosticsUI();
    });
  }

  // Load JSON file input triggers
  if (btnImportJson && inputFileSelectors) {
    btnImportJson.addEventListener("click", () => {
      inputFileSelectors.click();
    });

    inputFileSelectors.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target.result);
          
          if (json.chatContainer || json.commentNode || json.nickname || json.username || json.message || json.profilePic) {
            const selectors = {
              chatContainer: json.chatContainer || "",
              commentNode: json.commentNode || "",
              nickname: json.nickname || "",
              username: json.username || "",
              message: json.message || "",
              profilePic: json.profilePic || ""
            };
            selContainer.value = selectors.chatContainer;
            selNode.value = selectors.commentNode;
            selNickname.value = selectors.nickname;
            selUsername.value = selectors.username;
            selMessage.value = selectors.message;
            selProfile.value = selectors.profilePic;
            
            activePresetKey = "custom";
            selPreset.value = "custom";
            showPresetBanner("✅ Custom selectors loaded from JSON!");
          } else if (json.presets) {
            loadedPresets = { ...loadedPresets, ...json.presets };
            const defaultKey = json.default || Object.keys(json.presets)[0];
            activePresetKey = defaultKey;
            
            populatePresetDropdown(loadedPresets, activePresetKey);
            
            const activeSelectors = (loadedPresets[activePresetKey] && loadedPresets[activePresetKey].selectors) || {};
            selContainer.value = activeSelectors.chatContainer || "";
            selNode.value = activeSelectors.commentNode || "";
            selNickname.value = activeSelectors.nickname || "";
            selUsername.value = activeSelectors.username || "";
            selMessage.value = activeSelectors.message || "";
            selProfile.value = activeSelectors.profilePic || "";

            showPresetBanner("✅ Presets successfully imported from JSON!");
          } else {
            showPresetBanner("❌ Invalid JSON format: missing selector keys", true);
          }
          
          isValidTab = await validateActiveTab();
          updateTabWarningUI(isValidTab);
          updateDiagnosticsUI();
        } catch (err) {
          showPresetBanner("❌ Failed to parse JSON: " + err.message, true);
        }
      };
      reader.readAsText(file);
      inputFileSelectors.value = "";
    });
  }

  // Update Online button handler
  if (btnUpdateOnline) {
    btnUpdateOnline.addEventListener("click", async () => {
      const gitHubUrl = "https://raw.githubusercontent.com/hoangquangnguyen/EXTENSION_CHAT/master/selectors.json";
      
      btnUpdateOnline.disabled = true;
      const originalText = btnUpdateOnline.textContent;
      btnUpdateOnline.textContent = "🔄 Updating...";
      showPresetBanner("Fetching selectors from GitHub...");

      try {
        const response = await fetch(gitHubUrl);
        if (!response.ok) {
          throw new Error(`HTTP status ${response.status}`);
        }
        
        const json = await response.json();
        
        if (json && json.presets) {
          loadedPresets = { ...loadedPresets, ...json.presets };
          
          const newDefaultKey = json.default || Object.keys(json.presets)[0];
          if (!loadedPresets[activePresetKey]) {
            activePresetKey = newDefaultKey;
          }
          
          populatePresetDropdown(loadedPresets, activePresetKey);
          
          const activeSelectors = (loadedPresets[activePresetKey] && loadedPresets[activePresetKey].selectors) || {};
          selContainer.value = activeSelectors.chatContainer || "";
          selNode.value = activeSelectors.commentNode || "";
          selNickname.value = activeSelectors.nickname || "";
          selUsername.value = activeSelectors.username || "";
          selMessage.value = activeSelectors.message || "";
          selProfile.value = activeSelectors.profilePic || "";

          if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            await chrome.storage.local.set({ 
              selector_presets: loadedPresets,
              selectors: activeSelectors,
              active_preset: activePresetKey
            });
          }

          showPresetBanner("✅ Selectors updated successfully from GitHub!");
          
          isValidTab = await validateActiveTab();
          updateTabWarningUI(isValidTab);
          updateDiagnosticsUI();
        } else {
          showPresetBanner("❌ Invalid JSON: missing 'presets' object", true);
        }
      } catch (err) {
        console.error("Failed to update selectors online:", err);
        showPresetBanner("❌ Failed to update: " + err.message, true);
      } finally {
        btnUpdateOnline.disabled = false;
        btnUpdateOnline.textContent = originalText;
      }
    });
  }

  // Fetch AI List online from Server handler
  if (btnFetchAiList) {
    btnFetchAiList.addEventListener("click", async () => {
      const host = inputHost.value.trim() || "127.0.0.1";
      const port = inputPort.value.trim() || "3003";
      const fetchUrl = `http://${host}:${port}/api/auto-reply/public`;
      
      btnFetchAiList.disabled = true;
      btnFetchAiList.textContent = "⏳...";

      try {
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = data.instances || [];
        
        if (list.length === 0) {
          alert("Server chưa có AI Auto-Reply nào.");
        } else {
          const names = list.map(i => `• [${i.id}] ${i.name} (${i.is_active ? 'BẬT' : 'TẮT'})`).join('\n');
          const chosen = prompt(`Chọn AI Auto-Reply bằng cách nhập ID:\n\n${names}`, list[0].id);
          if (chosen) {
            inputAiId.value = chosen.trim();
          }
        }
      } catch (err) {
        alert(`Không thể kết nối đến server để lấy danh sách AI: ${err.message}`);
      } finally {
        btnFetchAiList.disabled = false;
        btnFetchAiList.textContent = "🔄 Load AI";
      }
    });
  }

  // Save Config handler (Multi-Tab isolated)
  btnSave.addEventListener("click", async () => {
    const connectionSettings = {
      protocol: inputProtocol.value.trim() || "http",
      host: inputHost.value.trim() || "127.0.0.1",
      port: inputPort.value.trim() || "3003",
      path: inputPath.value.trim() || "/api/chat/tiktok-comment",
      ai_reply_id: inputAiId ? inputAiId.value.trim() || "default" : "default"
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
      const data = await chrome.storage.local.get(["tab_sessions"]);
      const sessions = data.tab_sessions || {};

      if (currentTabId) {
        const tabConfig = {
          tabId: currentTabId,
          ai_reply_id: connectionSettings.ai_reply_id,
          monitoring_active: monitoringToggle.checked,
          connection_settings: connectionSettings,
          selectors: selectors,
          active_preset: activePresetKey,
          updatedAt: Date.now()
        };
        sessions[currentTabId] = tabConfig;

        // Send runtime message to current tab's content script immediately
        chrome.tabs.sendMessage(currentTabId, {
          type: "TAB_CONFIG_UPDATED",
          config: tabConfig
        }, () => {
          const err = chrome.runtime.lastError;
        });
      }

      await chrome.storage.local.set({
        tab_sessions: sessions,
        connection_settings: connectionSettings,
        selectors: selectors,
        active_preset: activePresetKey
      });

      const originalText = btnSave.textContent;
      btnSave.textContent = "Saved Successfully! ✓";
      btnSave.disabled = true;
      setTimeout(() => {
        btnSave.textContent = originalText;
        btnSave.disabled = false;
      }, 1500);
    }
  });

  // Toggle monitoring handler (Multi-Tab isolated)
  monitoringToggle.addEventListener("change", async (e) => {
    const active = e.target.checked;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && currentTabId) {
      const data = await chrome.storage.local.get(["tab_sessions", "connection_settings", "selectors"]);
      const sessions = data.tab_sessions || {};
      const globalConn = data.connection_settings || { host: "127.0.0.1", port: "3003", protocol: "http", path: "/api/chat/tiktok-comment", ai_reply_id: "default" };

      const currentConfig = sessions[currentTabId] || {
        tabId: currentTabId,
        ai_reply_id: inputAiId ? inputAiId.value.trim() || globalConn.ai_reply_id || "default" : "default",
        connection_settings: {
          protocol: inputProtocol.value.trim() || "http",
          host: inputHost.value.trim() || "127.0.0.1",
          port: inputPort.value.trim() || "3003",
          path: inputPath.value.trim() || "/api/chat/tiktok-comment",
          ai_reply_id: inputAiId ? inputAiId.value.trim() || "default" : "default"
        },
        selectors: {
          chatContainer: selContainer.value.trim() || DEFAULT_SELECTORS.chatContainer,
          commentNode: selNode.value.trim() || DEFAULT_SELECTORS.commentNode,
          nickname: selNickname.value.trim() || DEFAULT_SELECTORS.nickname,
          username: selUsername.value.trim() || DEFAULT_SELECTORS.username,
          message: selMessage.value.trim() || DEFAULT_SELECTORS.message,
          profilePic: selProfile.value.trim() || DEFAULT_SELECTORS.profilePic
        },
        active_preset: activePresetKey
      };

      currentConfig.monitoring_active = active;
      sessions[currentTabId] = currentConfig;
      await chrome.storage.local.set({ tab_sessions: sessions });

      // Notify content script
      chrome.tabs.sendMessage(currentTabId, {
        type: "TAB_CONFIG_UPDATED",
        config: currentConfig
      }, () => {
        const err = chrome.runtime.lastError;
      });

      chrome.storage.local.get(["connection_status", "last_connection_error"], (res) => {
        updateStatusUI(active, res.connection_status || "disconnected", res.last_connection_error || "");
        updateDiagnosticsUI();
      });
    }
  });
});
