document.addEventListener('DOMContentLoaded', () => {
    const recordButton = document.getElementById('recordButton');
    const replayButton = document.getElementById('replayButton');
    const exportRecordingBtn = document.getElementById('exportRecording');
    const importRecordingInput = document.getElementById('importRecording');
    const recordingNameInput = document.getElementById('recordingName');
    const filterInput = document.getElementById('filter');
    const recordingSelect = document.getElementById('recordingSelect');
    const deleteRecordBtn = document.getElementById('deleteRecord');
    const apiPreviewDiv = document.getElementById('apiPreview');
    const statusIndicator = document.getElementById('statusIndicator');
    const fallbackMatchingCheckbox = document.getElementById('fallbackMatching');

    let isRecording = false;
    let isReplaying = false;

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
        recordButton.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
        recordButton.className = isRecording ? 'bg-red-500 text-white px-4 py-1 rounded text-sm' : 'bg-blue-500 text-white px-4 py-1 rounded text-sm';
        replayButton.textContent = isReplaying ? 'Stop Replaying' : 'Replay';
        replayButton.className = isReplaying ? 'bg-red-500 text-white px-2 py-1 rounded text-xs animate-pulse' : 'bg-blue-500 text-white px-2 py-1 rounded text-xs';

        recordButton.disabled = isReplaying;
        replayButton.disabled = isRecording;
        recordingSelect.disabled = isRecording || isReplaying;
        exportRecordingBtn.disabled = isRecording || isReplaying;
        deleteRecordBtn.disabled = isRecording || isReplaying;
        importRecordingInput.disabled = isRecording || isReplaying;
        fallbackMatchingCheckbox.disabled = isRecording || isReplaying;

        [recordingSelect, exportRecordingBtn, deleteRecordBtn, importRecordingInput.parentElement, fallbackMatchingCheckbox].forEach(el => {
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
            statusIndicator.className = 'mb-2 p-1 bg-red-200 rounded text-center text-sm font-semibold';
        } else if (isReplaying) {
            statusIndicator.textContent = 'Replaying in progress';
            statusIndicator.className = 'mb-2 p-1 bg-blue-200 rounded text-center text-sm font-semibold';
        } else {
            statusIndicator.textContent = 'Idle';
            statusIndicator.className = 'mb-2 p-1 bg-gray-200 rounded text-center text-sm font-semibold';
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
                recordingSelect.innerHTML = '';
                let lastUsedRecord = '';

                chrome.storage.local.get('lastUsedRecord', (data) => {
                    lastUsedRecord = data.lastUsedRecord || '';

                    for (const key in result) {
                        if (key !== 'lastUsedRecord' && key !== 'isRecording' && key !== 'isReplaying' && key !== 'currentRecordingName' && key !== 'currentFilter') {
                            const option = document.createElement('option');
                            option.value = key;
                            option.textContent = key;
                            recordingSelect.appendChild(option);

                            if (key === lastUsedRecord) {
                                option.selected = true;
                            }
                        }
                    }
                    updateApiPreview();
                });
            }
        });
    }

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
                                return `<div class="mb-1 text-xs">${path}${countDisplay}</div>`;
                            })
                            .join('');
                } else {
                    apiPreviewDiv.textContent = 'No recording found';
                }
            });
        } else {
            apiPreviewDiv.textContent = 'No recording selected';
        }
    }

    // Update lastUsedRecord and API preview when a recording is selected
    recordingSelect.addEventListener('change', (event) => {
        chrome.storage.local.set({ 'lastUsedRecord': event.target.value });
        updateApiPreview();
    });
});

