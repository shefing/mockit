let isRecording = false;
let isReplaying = false;
let currentRecordingName = '';
let currentFilter = ['/api'];
let recordedData = {};
let currentTabId = null;
let replayTabId = null;
let fallbackMatchingEnabled = false;

const pendingRequests = new Map();

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
        return true;
    } else if (request.action === 'startReplaying') {
        startReplaying(request.name, request.fallbackMatching, sendResponse);
        return true;
    } else if (request.action === 'stopReplaying') {
        stopReplaying(sendResponse);
    } else if (request.action === 'popupOpened') {
        chrome.storage.local.get(['recordings', 'lastUsedRecord'], (result) => {
            sendResponse({
                recordings: result.recordings || [],
                lastUsedRecord: result.lastUsedRecord || ''
            });
        });
        return true; // Indicates that the response is sent asynchronously
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

    chrome.action.setIcon({ path: iconPath });
}

async function startRecording(name, filter, sendResponse) {
    isRecording = true;
    currentRecordingName = name || 'Unnamed Recording';
    currentFilter = filter || ['/api'];
    recordedData = {requests:{},metadata:{}};
    updateState();

    // Store the new recording and make it current
    chrome.storage.local.set({ [currentRecordingName]: recordedData }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error storing new recording:', chrome.runtime.lastError);
        } else {
            console.log('New recording stored:', currentRecordingName);
        }
    });

    try {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs[0]) {
            currentTabId = tabs[0].id;
            await chrome.debugger.attach({tabId: currentTabId}, "1.0");
            await chrome.debugger.sendCommand({tabId: currentTabId}, "Network.enable");
            await chrome.debugger.sendCommand({tabId: currentTabId}, "Fetch.enable", {
                patterns: [{ urlPattern: "*", requestStage: "Response" }]
            });

                    chrome.debugger.onEvent.addListener(recordingListener);
                    await chrome.tabs.reload(currentTabId);
                    console.log('Page reloaded for recording');
                     sendResponse({success: true});
        } else {
            sendResponse({success: false, error: 'No active tab found'});
        }
    } catch (err) {
        console.error('Error starting recording:', err);
        sendResponse({success: false, error: err.message});
    }
}

async function stopRecording(sendResponse) {
    isRecording = false;
    updateState();

    console.log(`Attempting to fetch ${pendingRequests.size} pending requests...`);

    try {
        await fetchPendingRequests();
        console.log('All pending requests processed');
    } catch (err) {
        console.error('Error processing pending requests:', err);
    }

    if (currentTabId) {
        try {
            await chrome.debugger.detach({tabId: currentTabId});
        } catch (err) {
            console.error('Debugger detach error:', err);
        }
        chrome.debugger.onEvent.removeListener(recordingListener);
        currentTabId = null;
    }
    saveRecording();
    sendResponse({success: true, message: 'Recording stopped and data saved'});
}

async function fetchPendingRequests() {
    const fetchPromises = Array.from(pendingRequests.values()).map(async (request) => {
        try {
            const response = await chrome.debugger.sendCommand(
                {tabId: currentTabId},
                "Fetch.getResponseBody",
                {requestId: request.requestId}
            );

            request.responseBody = response.base64Encoded ?
                atob(response.body) : response.body;

            recordedData.requests[getRequestKey(request)] = request;
            recordedData.metadata.responsesWithBody++;
            console.log(`Response body fetched for ${request.requestId}`);
            updateRecording();
        } catch (err) {
            console.warn(`Failed to fetch response body for ${request.requestId}:`, err);
            request.responseBody = '';
            request.error = 'Failed to fetch response body';
            recordedData.requests[getRequestKey(request)] = request;
            updateRecording();
        } finally {
            pendingRequests.delete(request.requestId);
        }
    });

    await Promise.all(fetchPromises);
}

async function recordingListener(debuggeeId, message, params) {
    if (!isRecording) return;

    console.log('Recording event:', message, params);

    try {
        switch (message) {
            case "Network.requestWillBeSent":
                handleRequestWillBeSent(params);
                break;
            case "Network.responseReceived":
                handleResponseReceived(params);
                break;
            case "Fetch.requestPaused":
                await handleRequestPaused(debuggeeId.tabId, params);
                break;
            case "Network.loadingFinished":
                handleLoadingFinished(params);
                break;
            case "Network.loadingFailed":
                handleLoadingFailed(params);
                break;
        }
    } catch (err) {
        console.error('Error in recording listener:', err);
    }
}

function handleRequestWillBeSent(params) {
    const url = new URL(params.request.url);
    if (currentFilter.some(filter => url.pathname.includes(filter))) {
        pendingRequests.set(params.requestId, {
                requestId: params.requestId,
            url: params.request.url,
            method: params.request.method,
            requestHeaders: params.request.headers,
            timestamp: new Date(params.timestamp * 1000).toISOString()
    });
        recordedData.metadata.totalRequests++;
        console.log('Request tracked:', params.requestId);
        updateRecording();
    }
}

function handleResponseReceived(params) {
    const request = pendingRequests.get(params.requestId);
    if (request) {
        request.responseHeaders = params.response.headers;
        request.status = params.response.status;
        request.statusText = params.response.statusText;
        console.log('Response received for:', params.requestId);
        updateRecording();
    }
}

async function handleRequestPaused(tabId, params) {
    const request = pendingRequests.get(params.networkId);
    if (request) {
            try {
                const response = await chrome.debugger.sendCommand(
                {tabId: tabId},
                "Fetch.getResponseBody",
                {requestId: params.requestId}
                );

            request.responseBody = response.base64Encoded ?
                atob(response.body) : response.body;

            recordedData.metadata.responsesWithBody++;
            console.log(`Response body saved for ${params.networkId}`);
            updateRecording();
    } catch (err) {
            console.warn(`Failed to get response body for ${params.networkId}:`, err);
            request.responseBody = '';
            request.error = 'Failed to fetch response body';
            updateRecording();
        }
        }

    // Continue the request
    await chrome.debugger.sendCommand(
        {tabId: tabId},
        "Fetch.continueRequest",
        {requestId: params.requestId}
    );
}

function handleLoadingFinished(params) {
    const request = pendingRequests.get(params.requestId);
    if (request) {
        recordedData.requests[getRequestKey(request)] = request;
        pendingRequests.delete(params.requestId);
        console.log('Request completed:', params.requestId);
        updateRecording();
    }
}

function handleLoadingFailed(params) {
    console.warn('Loading failed for:', params.requestId);
    pendingRequests.delete(params.requestId);
    updateRecording();
}

function updateRecording() {
    chrome.storage.local.set({ [currentRecordingName]: recordedData }, () => {
        if (chrome.runtime.lastError) {
            console.error('Update recording error:', chrome.runtime.lastError);
        } else {
            console.log('Recording updated:', currentRecordingName);
            chrome.runtime.sendMessage({ action: 'recordingUpdated', name: currentRecordingName });
        }
    });
}

function saveRecording() {
    const data = {
        name: currentRecordingName,
        filter: currentFilter,
        requests: recordedData.requests,
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

            const responseHeaders = recordedResponse.responseHeaders || {};
            const headerString = Object.entries(responseHeaders)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\r\n');

                await chrome.debugger.sendCommand(
                    {tabId: debuggeeId.tabId},
                    "Network.continueInterceptedRequest",
                    {
                        interceptionId: params.interceptionId,
                        rawResponse: btoa(unescape(encodeURIComponent(
                            `HTTP/1.1 ${recordedResponse.status} OK\r\n` +
                        headerString +
                            '\r\n\r\n' +
                        (recordedResponse.responseBody || '')
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
