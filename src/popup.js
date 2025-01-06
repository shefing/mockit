document.addEventListener('DOMContentLoaded', () => {
    const startRecordingBtn = document.getElementById('startRecording');
    const stopRecordingBtn = document.getElementById('stopRecording');
    const startReplayingBtn = document.getElementById('startReplaying');
    const stopReplayingBtn = document.getElementById('stopReplaying');
    const exportRecordingBtn = document.getElementById('exportRecording');
    const importRecordingInput = document.getElementById('importRecording');
    const recordingNameInput = document.getElementById('recordingName');
    const filterInput = document.getElementById('filter');
    const recordingSelect = document.getElementById('recordingSelect');
    const replaySelect = document.getElementById('replaySelect');

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
        if (response.isRecording) {
            startRecordingBtn.disabled = true;
            stopRecordingBtn.disabled = false;
            recordingNameInput.value = response.currentRecordingName || 'Unnamed Recording';
            filterInput.value = response.currentFilter || '/api';
        } else {
            startRecordingBtn.disabled = false;
            stopRecordingBtn.disabled = true;
        }

        if (response.isReplaying) {
            startReplayingBtn.disabled = true;
            stopReplayingBtn.disabled = false;
            replaySelect.value = response.currentRecordingName;
        } else {
            startReplayingBtn.disabled = false;
            stopReplayingBtn.disabled = true;
        }
    });

    loadRecordings();

    startRecordingBtn.addEventListener('click', () => {
        const now = new Date();
        const dateString = now.toISOString().split('T')[0];
        const timeString = now.toTimeString().split(' ')[0].slice(0, 5);
        const dateTimeString = `${dateString} ${timeString}`;
        const name = recordingNameInput.value || `Unnamed Recording - ${dateTimeString}`;
        const filter = filterInput.value || '/api';
        chrome.runtime.sendMessage({ action: 'startRecording', name, filter }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Start recording error:', chrome.runtime.lastError);
                alert('Failed to start recording. Please check the console for errors.');
            } else if (response && response.success) {
                startRecordingBtn.disabled = true;
                stopRecordingBtn.disabled = false;
                alert('Recording started. The page will refresh to begin capturing network traffic.');
            } else {
                alert('Failed to start recording: ' + (response ? response.error : 'Unknown error'));
            }
        });
    });

    stopRecordingBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Stop recording error:', chrome.runtime.lastError);
                alert('Failed to stop recording. Please check the console for errors.');
            } else if (response && response.success) {
                startRecordingBtn.disabled = false;
                stopRecordingBtn.disabled = true;
                loadRecordings();
            } else {
                alert('Failed to stop recording: ' + (response ? response.error : 'Unknown error'));
            }
        });
    });

    startReplayingBtn.addEventListener('click', () => {
        const name = replaySelect.value;
        chrome.runtime.sendMessage({ action: 'startReplaying', name }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Start replaying error:', chrome.runtime.lastError);
                alert('Failed to start replaying. Please check the console for errors.');
            } else if (response && response.success) {
                startReplayingBtn.disabled = true;
                stopReplayingBtn.disabled = false;
            } else {
                alert('Failed to start replaying: ' + (response ? response.error : 'Unknown error'));
            }
        });
    });

    stopReplayingBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stopReplaying' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Stop replaying error:', chrome.runtime.lastError);
                alert('Failed to stop replaying. Please check the console for errors.');
            } else if (response && response.success) {
                startReplayingBtn.disabled = false;
                stopReplayingBtn.disabled = true;
            } else {
                alert('Failed to stop replaying: ' + (response ? response.error : 'Unknown error'));
            }
        });
    });

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
                            alert('Recording imported successfully');
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

    function loadRecordings() {
        chrome.storage.local.get(null, (result) => {
            if (chrome.runtime.lastError) {
                console.error('Load recordings error:', chrome.runtime.lastError);
                alert('Failed to load recordings. Please check the console for errors.');
            } else {
                recordingSelect.innerHTML = '';
                replaySelect.innerHTML = '';
                let lastUsedRecord = '';

                chrome.storage.local.get('lastUsedRecord', (data) => {
                    lastUsedRecord = data.lastUsedRecord || '';

                    for (const key in result) {
                        if (key !== 'lastUsedRecord' && key !== 'isRecording' && key !== 'isReplaying' && key !== 'currentRecordingName' && key !== 'currentFilter') {
                            const option1 = document.createElement('option');
                            option1.value = key;
                            option1.textContent = key;
                            recordingSelect.appendChild(option1);

                            const option2 = document.createElement('option');
                            option2.value = key;
                            option2.textContent = key;
                            replaySelect.appendChild(option2);

                            if (key === lastUsedRecord) {
                                option1.selected = true;
                                option2.selected = true;
                            }
                        }
                    }
                });
            }
        });
    }

    // Update lastUsedRecord when a recording is selected
    recordingSelect.addEventListener('change', (event) => {
        chrome.storage.local.set({ 'lastUsedRecord': event.target.value });
    });

    replaySelect.addEventListener('change', (event) => {
        chrome.storage.local.set({ 'lastUsedRecord': event.target.value });
    });
});

