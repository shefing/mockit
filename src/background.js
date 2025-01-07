let isRecording = false;
let isReplaying = false;
let currentRecordingName = '';
let currentFilter = ['/api'];
let recordedData = {};
let currentTabId = null;
let replayTabId = null;
let fallbackMatchingEnabled = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);

    if (request.action === 'getState') {
        sendResponse({
            isRecording,
            isReplaying,
            currentRecordingName,
            currentFilter
        });
    } else if (request.action === 'startRecording') {
        startRecording(request.name, request.filter, sendResponse);
        return true;
    } else if (request.action === 'stopRecording') {
        stopRecording(sendResponse);
    } else if (request.action === 'startReplaying') {
        startReplaying(request.name, request.fallbackMatching, sendResponse);
        return true;
    } else if (request.action === 'stopReplaying') {
        stopReplaying(sendResponse);
    }
});

function updateState() {
    chrome.storage.local.set({
        isRecording,
        isReplaying,
        currentRecordingName,
        currentFilter,
        replayTabId
    });
    updateExtensionIcon();
}

function updateExtensionIcon() {
    let iconPath;
    if (isRecording) {
        iconPath = "/icons/icon-recording-48.png";
    } else if (isReplaying) {
        iconPath = "/icons/icon-replaying-48.png";
    } else {
        iconPath = "/icons/icon-48.png";
    }

    chrome.action.setIcon({ path: iconPath }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error updating icon:', chrome.runtime.lastError);
        } else {
            console.log('Icon updated successfully');
        }
    });
}

function startRecording(name, filter, sendResponse) {
    isRecording = true;
    currentRecordingName = name || 'Unnamed Recording';
    currentFilter = filter || ['/api'];
    recordedData = {};
    updateState();

    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
            currentTabId = tabs[0].id;
            chrome.debugger.attach({tabId: currentTabId}, "1.0", () => {
                if (chrome.runtime.lastError) {
                    console.error('Debugger attach error:', chrome.runtime.lastError);
                    sendResponse({success: false, error: chrome.runtime.lastError.message});
                    return;
                }
                chrome.debugger.sendCommand({tabId: currentTabId}, "Network.enable", {}, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Network.enable error:', chrome.runtime.lastError);
                        sendResponse({success: false, error: chrome.runtime.lastError.message});
                        return;
                    }
                    chrome.debugger.onEvent.addListener(recordingListener);
                    chrome.tabs.reload(currentTabId, null, () => {
                        console.log('Page reloaded for recording');
                        sendResponse({success: true});
                    });
                });
            });
        } else {
            sendResponse({success: false, error: 'No active tab found'});
        }
    });
}

function stopRecording(sendResponse) {
    isRecording = false;
    updateState();
    if (currentTabId) {
        chrome.debugger.detach({tabId: currentTabId}, () => {
            if (chrome.runtime.lastError) {
                console.error('Debugger detach error:', chrome.runtime.lastError);
            }
        });
        chrome.debugger.onEvent.removeListener(recordingListener);
        currentTabId = null;
    }
    saveRecording();
    sendResponse({success: true});
}

async function recordingListener(debuggeeId, message, params) {
    if (!isRecording) return;

    console.log('Recording event:', message, params);

    if (message === "Network.requestWillBeSent") {
        const url = new URL(params.request.url);
        if (currentFilter.some(filter => url.pathname.includes(filter))) {
            const key = getRequestKey(params.request);
            console.log('Request will be sent:', key);
            recordedData[key] = {
                url: params.request.url,
                method: params.request.method,
                requestHeaders: params.request.headers,
                requestId: params.requestId,
                timeStamp: params.timestamp
            };

            if (params.request.hasPostData) {
                try {
                    const postData = await chrome.debugger.sendCommand(
                        {tabId: debuggeeId.tabId},
                        "Network.getRequestPostData",
                        {requestId: params.requestId}
                    );

                    if (postData && postData.postData) {
                        recordedData[key].requestBody = postData.postData;
                        console.log('Post data captured for:', key);
                    }
                } catch (e) {
                    console.warn("Failed to get post data:", e);
                }
            }
        }
    } else if (message === "Network.responseReceived") {
        const key = Object.keys(recordedData).find(k => recordedData[k].requestId === params.requestId);
        if (key) {
            console.log('Response received:', key);
            recordedData[key].responseHeaders = params.response.headers;
            recordedData[key].status = params.response.status;

            try {
                const response = await chrome.debugger.sendCommand(
                    {tabId: debuggeeId.tabId},
                    "Network.getResponseBody",
                    {requestId: params.requestId}
                );

                if (response) {
                    recordedData[key].responseBody = response.base64Encoded ?
                        atob(response.body) :
                        response.body;

                    console.log(`Response body saved for ${key}, size: ${recordedData[key].responseBody.length}`);
                }
            } catch (e) {
                console.warn(`Failed to get response body for ${recordedData[key].url}:`, e);
            }
        }
    }
}

function getRequestKey(request) {
    const url = new URL(request.url);
    const relativePath = url.pathname + url.search;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (request.method === 'GET') {
        return `GET_${relativePath}_${timestamp}`;
    } else {
        return `${request.method}_${relativePath}_${JSON.stringify(request.postData || {})}_${timestamp}`;
    }
}

function saveRecording() {
    const data = {
        name: currentRecordingName,
        filter: currentFilter,
        requests: recordedData,
        timestamp: Date.now(),
        metadata: {
            totalRequests: Object.keys(recordedData).length,
            responsesWithBody: Object.values(recordedData).filter(r => r.responseBody).length
        }
    };

    chrome.storage.local.set({ [currentRecordingName]: data }, () => {
        if (chrome.runtime.lastError) {
            console.error('Save recording error:', chrome.runtime.lastError);
        } else {
            console.log('Recording saved:', data);
            updateLastUsedRecord(currentRecordingName);
        }
    });
}

function startReplaying(name, fallbackMatching, sendResponse) {
    isReplaying = true;
    currentRecordingName = name;
    fallbackMatchingEnabled = fallbackMatching;

    // Reset replay counters
    chrome.storage.local.set({ replayedRequests: {} }, () => {
        loadRecording(name);
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                replayTabId = tabs[0].id;
                updateState();
                chrome.debugger.attach({tabId: replayTabId}, "1.0", () => {
                    if (chrome.runtime.lastError) {
                        console.error('Debugger attach error:', chrome.runtime.lastError);
                        sendResponse({success: false, error: chrome.runtime.lastError.message});
                        return;
                    }
                    chrome.debugger.sendCommand({tabId: replayTabId}, "Network.enable", {}, () => {
                        if (chrome.runtime.lastError) {
                            console.error('Network.enable error:', chrome.runtime.lastError);
                            sendResponse({success: false, error: chrome.runtime.lastError.message});
                            return;
                        }
                        chrome.debugger.onEvent.addListener(replayingListener);
                        chrome.debugger.sendCommand({tabId: replayTabId}, "Network.setRequestInterception", {patterns: [{urlPattern: '*'}]}, () => {
                            if (chrome.runtime.lastError) {
                                console.error('Set request interception error:', chrome.runtime.lastError);
                                sendResponse({success: false, error: chrome.runtime.lastError.message});
                                return;
                            }
                            chrome.tabs.reload(replayTabId, null, () => {
                                console.log('Page reloaded for replaying');
                                sendResponse({success: true});
                            });
                        });
                    });
                });
            } else {
                sendResponse({success: false, error: 'No active tab found'});
            }
        });
    });
}

function stopReplaying(sendResponse) {
    isReplaying = false;
    updateState();

    if (replayTabId) {
        chrome.debugger.sendCommand({tabId: replayTabId}, "Network.setRequestInterception", {patterns: []}, () => {
            chrome.debugger.detach({tabId: replayTabId}, () => {
                if (chrome.runtime.lastError) {
                    console.error('Debugger detach error:', chrome.runtime.lastError);
                }
                chrome.debugger.onEvent.removeListener(replayingListener);
                replayTabId = null;
                console.log('Replaying stopped successfully');
            });
        });
    }

    // Send response immediately
    sendResponse({success: true});
}

async function replayingListener(debuggeeId, message, params) {
    if (!isReplaying) return;

    console.log('Replaying event:', message, params);

    if (message === "Network.requestIntercepted") {
        const interceptedUrl = new URL(params.request.url);
        let key = Object.keys(recordedData).find(k => {
            const recordedUrl = new URL(recordedData[k].url);
            return recordedUrl.pathname === interceptedUrl.pathname;
        });

        if (!key && fallbackMatchingEnabled) {
            // Fallback matching: find a similar path without query parameters
            key = Object.keys(recordedData).find(k => {
                const recordedUrl = new URL(recordedData[k].url);
                return recordedUrl.pathname === interceptedUrl.pathname.split('?')[0];
            });
        }

        if (key) {
            console.log('Intercepted request:', key);
            const recordedResponse = recordedData[key];

            try {
                await chrome.debugger.sendCommand(
                    {tabId: debuggeeId.tabId},
                    "Network.continueInterceptedRequest",
                    {
                        interceptionId: params.interceptionId,
                        rawResponse: btoa(unescape(encodeURIComponent(
                            `HTTP/1.1 ${recordedResponse.status} OK\r\n` +
                            Object.entries(recordedResponse.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
                            '\r\n\r\n' +
                            recordedResponse.responseBody
                        )))
                    }
                );

                // Update replay counter for this path
                chrome.storage.local.get('replayedRequests', (result) => {
                    const replayedRequests = result.replayedRequests || {};
                    const path = interceptedUrl.pathname;
                    replayedRequests[path] = (replayedRequests[path] || 0) + 1;
                    chrome.storage.local.set({ replayedRequests });
                });

                console.log('Replayed response for:', key);
            } catch (e) {
                console.error('Failed to replay response:', e);
                await chrome.debugger.sendCommand(
                    {tabId: debuggeeId.tabId},
                    "Network.continueInterceptedRequest",
                    {
                        interceptionId: params.interceptionId
                    }
                );
            }
        } else {
            await chrome.debugger.sendCommand(
                {tabId: debuggeeId.tabId},
                "Network.continueInterceptedRequest",
                {
                    interceptionId: params.interceptionId
                }
            );
        }
    }
}

function loadRecording(name) {
    chrome.storage.local.get(name, (result) => {
        if (chrome.runtime.lastError) {
            console.error('Load recording error:', chrome.runtime.lastError);
        } else if (result[name]) {
            recordedData = result[name].requests;
            currentFilter = result[name].filter;
            updateLastUsedRecord(name);
            console.log('Recording loaded:', name, recordedData);
        }
    });
}

function updateLastUsedRecord(name) {
    chrome.storage.local.set({ 'lastUsedRecord': name });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if ((isRecording && tabId === currentTabId) || (isReplaying && tabId === replayTabId)) {
        if (changeInfo.status === 'loading') {
            console.log('Tab is reloading, re-enabling debugger');
            chrome.debugger.sendCommand({tabId: tabId}, "Network.enable", {}, () => {
                if (chrome.runtime.lastError) {
                    console.error('Network.enable error:', chrome.runtime.lastError);
                }
            });
            if (isReplaying) {
                chrome.debugger.sendCommand({tabId: tabId}, "Network.setRequestInterception", {patterns: [{urlPattern: '*'}]}, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Set request interception error:', chrome.runtime.lastError);
                    }
                });
            }
        }
    }
});

