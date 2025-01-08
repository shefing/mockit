document.addEventListener('DOMContentLoaded', () => {
    const recordButton = document.getElementById('recordButton');
    const replayButton = document.getElementById('replayButton');
    const exportRecordingBtn = document.getElementById('exportRecording');
    const importRecordingInput = document.getElementById('importRecording');
    const recordingNameInput = document.getElementById('recordingName');
    const filterInput = document.getElementById('filter');
    const recordingSelect = document.getElementById('recordingSelect');
    const recordingOptions = document.getElementById('recordingOptions');
    const deleteRecordBtn = document.getElementById('deleteRecord');
    const removeAllRecordingsBtn = document.getElementById('removeAllRecordings');
    const apiPreviewDiv = document.getElementById('apiPreview');
    const statusIndicator = document.getElementById('statusIndicator');
    const fallbackMatchingCheckbox = document.getElementById('fallbackMatching');
    const apiCallModal = document.getElementById('apiCallModal');
    const apiCallDetails = document.getElementById('apiCallDetails');
    const closeModalBtn = document.getElementById('closeModal');
    const darkModeToggle = document.getElementById('darkModeToggle');

    let isRecording = false;
    let isReplaying = false;
    let allRecordings = [];

    // Set default filter
    filterInput.value = '/api';

    // Get the current tab's title and set it as the default recording name along with the current date and time
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const now = new Date();
        const dateString = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        const timeString = now.toTimeString().split(' ')[0].slice(0, 5); // Format: HH:MM
        const dateTimeString = `${dateString} ${timeString}`;

        if (tabs[0] && tabs[0].title) {
            recordingNameInput.value = `${tabs[0].title} - ${dateTimeString}`;
        } else {
            recordingNameInput.value = `Unnamed Recording - ${dateTimeString}`;
        }
    });

    // Retrieve the current state from the background script
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
        isRecording = response.isRecording;
        isReplaying = response.isReplaying;
        updateButtonStates();
        updateStatusIndicator();

        if (isRecording) {
            recordingNameInput.value = response.currentRecordingName || 'Unnamed Recording';
            filterInput.value = response.currentFilter ? response.currentFilter.join(', ') : '/api';
        }

        if (isReplaying) {
            recordingSelect.value = response.currentRecordingName;
        }
    });

    loadRecordings();

    recordButton.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    replayButton.addEventListener('click', () => {
        if (isReplaying) {
            stopReplaying();
        } else {
            startReplaying();
        }
    });

    removeAllRecordingsBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to remove all recordings? This action cannot be undone.')) {
            chrome.storage.local.clear(() => {
                if (chrome.runtime.lastError) {
                    console.error('Clear storage error:', chrome.runtime.lastError);
                    alert('Failed to remove all recordings. Please check the console for errors.');
                } else {
                    console.log('All recordings removed');
                    loadRecordings();
                    recordingSelect.value = '';
                    updateButtonStates();
                    alert('All recordings have been removed successfully.');
                }
            });
        }
    });

    function startRecording() {
        const now = new Date();
        const dateString = now.toISOString().split('T')[0];
        const timeString = now.toTimeString().split(' ')[0].slice(0, 5);
        const dateTimeString = `${dateString} ${timeString}`;
        const name = recordingNameInput.value || `Unnamed Recording - ${dateTimeString}`;
        const filter = filterInput.value.split(',').map(f => f.trim()).filter(f => f);
        if (filter.length === 0) {
            filter.push('/api');
        }
        chrome.runtime.sendMessage({ action: 'startRecording', name, filter }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Start recording error:', chrome.runtime.lastError);
                alert('Failed to start recording. Please check the console for errors.');
            } else if (response && response.success) {
                isRecording = true;
                updateButtonStates();
                updateStatusIndicator();
                alert('Recording started. The page will refresh to begin capturing network traffic.');
            } else {
                alert('Failed to start recording: ' + (response ? response.error : 'Unknown error'));
            }
        });
    }

    function stopRecording() {
        chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Stop recording error:', chrome.runtime.lastError);
                alert('Failed to stop recording. Please check the console for errors.');
            } else if (response && response.success) {
                isRecording = false;
                updateButtonStates();
                updateStatusIndicator();
                loadRecordings();
            } else {
                alert('Failed to stop recording: ' + (response ? response.error : 'Unknown error'));
            }
        });
    }

    function startReplaying() {
        const name = recordingSelect.value;
        const fallbackMatching = fallbackMatchingCheckbox.checked;
        chrome.runtime.sendMessage({ action: 'startReplaying', name, fallbackMatching }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Start replaying error:', chrome.runtime.lastError);
                alert('Failed to start replaying. Please check the console for errors.');
            } else if (response && response.success) {
                isReplaying = true;
                updateButtonStates();
                updateStatusIndicator();
            } else {
                alert('Failed to start replaying: ' + (response ? response.error : 'Unknown error'));
            }
        });
    }

    function stopReplaying() {
        chrome.runtime.sendMessage({ action: 'stopReplaying' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Stop replaying error:', chrome.runtime.lastError);
                alert('Failed to stop replaying. Please check the console for errors.');
            } else if (response && response.success) {
                isReplaying = false;
                updateButtonStates();
                updateStatusIndicator();
                console.log('Replaying stopped successfully');
            } else {
                console.error('Unexpected response when stopping replay:', response);
                alert('An unexpected error occurred while stopping the replay. Please check the console for details.');
            }
        });
    }

    function updateButtonStates() {
        const isRecordingSelected = recordingSelect.value !== '';

        recordButton.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
        recordButton.className = isRecording ? 'bg-red-500 text-white px-4 py-1 rounded text-sm' : 'bg-blue-500 text-white px-4 py-1 rounded text-sm';
        replayButton.textContent = isReplaying ? 'Stop Replaying' : 'Replay';
        replayButton.className = isReplaying ? 'bg-red-500 text-white px-2 py-1 rounded text-xs animate-pulse' : 'bg-blue-500 text-white px-2 py-1 rounded text-xs';

        recordButton.disabled = isReplaying;
        replayButton.disabled = isRecording || !isRecordingSelected;
        recordingSelect.disabled = isRecording || isReplaying;
        exportRecordingBtn.disabled = isRecording || isReplaying || !isRecordingSelected;
        deleteRecordBtn.disabled = isRecording || isReplaying || !isRecordingSelected;
        importRecordingInput.disabled = isRecording || isReplaying;
        removeAllRecordingsBtn.disabled = isRecording || isReplaying;

        [recordingSelect, exportRecordingBtn, deleteRecordBtn, importRecordingInput.parentElement, removeAllRecordingsBtn, replayButton].forEach(el => {
            if (el.disabled) {
                el.classList.add('disabled');
            } else {
                el.classList.remove('disabled');
            }
        });
    }

    function updateStatusIndicator() {
        if (isRecording) {
            statusIndicator.textContent = 'Recording in progress';
            statusIndicator.className = 'mb-2 p-1 bg-red-200 dark:bg-red-800 rounded text-center text-sm font-semibold animate-pulse';
        } else if (isReplaying) {
            statusIndicator.textContent = 'Replaying in progress';
            statusIndicator.className = 'mb-2 p-1 bg-blue-200 dark:bg-blue-800 rounded text-center text-sm font-semibold animate-pulse';
        } else {
            statusIndicator.textContent = 'Idle';
            statusIndicator.className = 'mb-2 p-1 bg-gray-200 dark:bg-gray-700 rounded text-center text-sm font-semibold';
        }
    }

    exportRecordingBtn.addEventListener('click', () => {
        const name = recordingSelect.value;
        chrome.storage.local.get(name, (result) => {
            if (chrome.runtime.lastError) {
                console.error('Export recording error:', chrome.runtime.lastError);
                alert('Failed to export recording. Please check the console for errors.');
            } else if (result[name]) {
                const blob = new Blob([JSON.stringify(result[name])], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${name}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                alert('No recording found with the name: ' + name);
            }
        });
    });

    importRecordingInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    chrome.storage.local.set({ [data.name]: data }, () => {
                        if (chrome.runtime.lastError) {
                            console.error('Import recording error:', chrome.runtime.lastError);
                            alert('Failed to import recording. Please check the console for errors.');
                        } else {
                            console.log('Recording imported');
                            loadRecordings();
                            recordingSelect.value = data.name;
                            updateApiPreview();
                            chrome.storage.local.set({ 'lastUsedRecord': data.name });
                            alert(`Recording imported successfully as "${data.name}"`);
                        }
                    });
                } catch (error) {
                    console.error('Import recording parse error:', error);
                    alert('Failed to parse the imported file. Please make sure it\'s a valid JSON file.');
                }
            };
            reader.readAsText(file);
        }
    });

    deleteRecordBtn.addEventListener('click', () => {
        const name = recordingSelect.value;
        if (name) {
            if (confirm(`Are you sure you want to delete the recording "${name}"?`)) {
                chrome.storage.local.remove(name, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Delete recording error:', chrome.runtime.lastError);
                        alert('Failed to delete recording. Please check the console for errors.');
                    } else {
                        console.log('Recording deleted');
                        loadRecordings();
                        alert(`Recording "${name}" deleted successfully`);
                    }
                });
            }
        } else {
            alert('Please select a recording to delete.');
        }
    });

    function loadRecordings() {
        chrome.storage.local.get(null, (result) => {
            if (chrome.runtime.lastError) {
                console.error('Load recordings error:', chrome.runtime.lastError);
                alert('Failed to load recordings. Please check the console for errors.');
            } else {
                allRecordings = [];
                let lastUsedRecord = '';

                chrome.storage.local.get('lastUsedRecord', (data) => {
                    lastUsedRecord = data.lastUsedRecord || '';

                    for (const key in result) {
                        if (key !== 'lastUsedRecord' && key !== 'isRecording' && key !== 'isReplaying' && key !== 'currentRecordingName' && key !== 'currentFilter') {
                            allRecordings.push(key);
                        }
                    }

                    updateRecordingOptions(lastUsedRecord);
                });
            }
        });
    }

    function updateRecordingOptions(lastUsedRecord = '') {
        const selectItems = document.querySelector('.select-items');
        selectItems.innerHTML = '';
        allRecordings.forEach(recording => {
            const div = document.createElement('div');
            div.textContent = recording;
            div.addEventListener('click', function() {
                document.getElementById('recordingSelect').value = this.textContent;
                selectItems.classList.add('select-hide');
                updateApiPreview();
                chrome.storage.local.set({ 'lastUsedRecord': this.textContent });
            });
            selectItems.appendChild(div);
        });

        const recordingSelect = document.getElementById('recordingSelect');
        if (lastUsedRecord && allRecordings.includes(lastUsedRecord)) {
            recordingSelect.value = lastUsedRecord;
        } else if (allRecordings.length > 0) {
            recordingSelect.value = allRecordings[0];
        }

        updateApiPreview();
    }

    function initCustomSelect() {
        const selectElement = document.getElementById('recordingSelect');
        const selectItems = document.querySelector('.select-items');

        selectElement.addEventListener('input', function() {
            const filter = this.value.toUpperCase();
            const options = selectItems.getElementsByTagName('div');
            for (let i = 0; i < options.length; i++) {
                const txtValue = options[i].textContent || options[i].innerText;
                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    options[i].style.display = '';
                } else {
                    options[i].style.display = 'none';
                }
            }
            selectItems.classList.remove('select-hide');
        });

        selectElement.addEventListener('focus', function() {
            selectItems.classList.remove('select-hide');
        });

        document.addEventListener('click', function(e) {
            if (!selectElement.contains(e.target) && !selectItems.contains(e.target)) {
                selectItems.classList.add('select-hide');
            }
        });
    }

    recordingSelect.addEventListener('input', () => {
        updateApiPreview();
        chrome.storage.local.set({ 'lastUsedRecord': recordingSelect.value });
    });

    function updateApiPreview() {
        const name = recordingSelect.value;
        if (name) {
            chrome.storage.local.get(['replayedRequests', name], (result) => {
                if (chrome.runtime.lastError) {
                    console.error('Load recording error:', chrome.runtime.lastError);
                    apiPreviewDiv.textContent = 'Error loading API preview';
                } else if (result[name]) {
                    const requests = result[name].requests;
                    const replayedRequests = result.replayedRequests || {};
                    const paths = new Set();

                    // First, collect all unique paths with query parameters
                    for (const key in requests) {
                        const url = new URL(requests[key].url);
                        paths.add(url.pathname + url.search);
                    }

                    // Create the preview HTML
                    apiPreviewDiv.innerHTML = '<h4 class="font-semibold mb-1 text-xs">API Paths:</h4>' +
                        Array.from(paths)
                            .map(path => {
                                const pathWithoutQuery = path.split('?')[0];
                                const replayCount = (replayedRequests[pathWithoutQuery] || 0);
                                const countDisplay = replayCount > 0 ? ` <span class="text-gray-500 text-xs">(${replayCount})</span>` : '';
                                return `<div class="mb-1 text-xs cursor-pointer hover:text-blue-500" data-path="${path}">${path}${countDisplay}</div>`;
                            })
                            .join('');

                    // Add click event listeners to API paths
                    apiPreviewDiv.querySelectorAll('[data-path]').forEach(el => {
                        el.addEventListener('click', () => showApiCallDetails(name, el.getAttribute('data-path')));
                    });
                } else {
                    apiPreviewDiv.textContent = 'No recording found';
                }
            });
        } else {
            apiPreviewDiv.textContent = 'No recording selected';
        }
    }

    function showApiCallDetails(recordingName, path) {
        chrome.storage.local.get(recordingName, (result) => {
            if (chrome.runtime.lastError) {
                console.error('Load API call details error:', chrome.runtime.lastError);
                alert('Failed to load API call details. Please check the console for errors.');
            } else if (result[recordingName]) {
                const requests = result[recordingName].requests;
                const matchingRequest = Object.values(requests).find(req => {
                    const url = new URL(req.url);
                    return url.pathname + url.search === path;
                });

                console.log('Matching request:', matchingRequest);

                if (matchingRequest) {
                    console.log('Response:', matchingRequest.response);
                    console.log('Response type:', typeof matchingRequest.response);

                    let responseBody = '';
                    if (typeof matchingRequest.responseBody === 'string') {
                        try {
                            responseBody = JSON.stringify(JSON.parse(matchingRequest.responseBody), null, 2);
                        } catch (e) {
                            responseBody = matchingRequest.responseBody;
                        }
                    } else if (typeof matchingRequest.responseBody === 'object') {
                        responseBody = JSON.stringify(matchingRequest.responseBody, null, 2);
                    } else {
                        responseBody = String(matchingRequest.responseBody);
                    }

                    apiCallDetails.innerHTML = `
            <div class="mb-2">
              <strong class="dark:text-gray-300">URL:</strong> <span class="dark:text-gray-400">${matchingRequest.url}</span>
            </div>
            <div class="mb-2">
              <strong class="dark:text-gray-300">Method:</strong> <span class="dark:text-gray-400">${matchingRequest.method}</span>
            </div>
            <div class="mb-2">
              <strong class="dark:text-gray-300">Status:</strong> <span class="dark:text-gray-400">${matchingRequest.status}</span>
            </div>
            <div class="mb-2">
              <strong class="dark:text-gray-300">Response Headers:</strong>
              <pre class="text-xs bg-gray-100 dark:bg-gray-600 p-2 rounded mt-1 dark:text-gray-300">${JSON.stringify(matchingRequest.responseHeaders, null, 2)}</pre>
            </div>
          `;

                    const responseBodyTextarea = document.getElementById('responseBody');
                    responseBodyTextarea.value = responseBody;

                    // Adjust textarea height
                    responseBodyTextarea.style.height = 'auto';
                    responseBodyTextarea.style.height = `${responseBodyTextarea.scrollHeight}px`;

                    const saveChangesBtn = document.getElementById('saveChanges');
                    const requestKey = Object.keys(requests).find(key => requests[key] === matchingRequest);
                    saveChangesBtn.addEventListener('click', () => saveApiCallChanges(recordingName, requestKey));

                    apiCallModal.classList.remove('hidden');
                } else {
                    alert('No matching API call found for the selected path.');
                }
            } else {
                alert('No recording found with the name: ' + recordingName);
            }
        });
    }

    function saveApiCallChanges(recordingName, requestKey) {
        const updatedResponse = document.getElementById('responseBody').value;

        chrome.storage.local.get(recordingName, (result) => {
            if (chrome.runtime.lastError) {
                console.error('Load recording error:', chrome.runtime.lastError);
                alert('Failed to load recording. Please check the console for errors.');
            } else if (result[recordingName]) {
                const updatedRecording = result[recordingName];
                if (!updatedRecording.requests[requestKey]) {
                    console.error('Request not found:', requestKey);
                    alert('Failed to save changes. The specified request was not found.');
                    return;
                }
                try {
                    // Try to parse the updated response as JSON
                    const parsedResponse = JSON.stringify(JSON.parse(updatedResponse));
                    updatedRecording.requests[requestKey].responseBody = parsedResponse;
                } catch (error) {
                    // If parsing fails, store it as a string
                    console.warn('Failed to parse updated response as JSON. Storing as string:', error);
                    updatedRecording.requests[requestKey].responseBody = updatedResponse;
                }

                chrome.storage.local.set({ [recordingName]: updatedRecording }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Save changes error:', chrome.runtime.lastError);
                        alert('Failed to save changes. Please check the console for errors.');
                    } else {
                        alert('Changes saved successfully.');
                        apiCallModal.classList.add('hidden');
                        updateApiPreview();
                    }
                });
            } else {
                alert('No recording found with the name: ' + recordingName);
            }
        });
    }

    closeModalBtn.addEventListener('click', () => {
        apiCallModal.classList.add('hidden');
    });

    // Close modal when clicking outside
    apiCallModal.addEventListener('click', (e) => {
        if (e.target === apiCallModal) {
            apiCallModal.classList.add('hidden');
        }
    });

    // Dark mode toggle
    darkModeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        document.getElementById('apiCallModal').classList.toggle('dark');
        localStorage.setItem('darkMode', document.body.classList.contains('dark') ? 'enabled' : 'disabled');
    });

    // Initialize dark mode
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark');
        document.getElementById('apiCallModal').classList.add('dark');
    }

    initCustomSelect();
});

