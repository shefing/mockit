# Network Traffic Recorder and Replayer Chrome Extension
![image](https://github.com/user-attachments/assets/21855769-dcd5-447e-9ec0-f5f3668d308a)

## Introduction

The Network Traffic Recorder and Replayer is a powerful Chrome extension designed to capture and replay network requests. It's an invaluable tool for developers, QA engineers, and anyone who needs to debug, test, or demonstrate web applications with consistent network behavior.

## Features

- Record network traffic for specific API endpoints
- Replay recorded network traffic
- Filter requests by URL patterns
- Export and import recordings
- Fallback matching for flexible request replaying
- Visual indication of recording/replaying status

## Installation

1. Download the latest release of the extension from the GitHub releases page.
2. Unzip the downloaded file.
3. Open Google Chrome and navigate to `chrome://extensions/`.
4. Enable "Developer mode" in the top right corner.
5. Click "Load unpacked" and select the unzipped extension folder.
6. The extension icon should now appear in your Chrome toolbar.

## Usage

### Recording Network Traffic

1. Click on the extension icon to open the popup.
2. Enter a name for your recording in the "Recording Name" field.
3. (Optional) Modify the filter in the "Filter" field. By default, it captures requests containing "/api" in the URL. You can add multiple filters separated by commas (e.g., "/api, /graphql").
4. Click the "Start Recording" button.
5. Navigate to the website you want to record traffic from.
6. When finished, click "Stop Recording" in the extension popup.

### Replaying Network Traffic

1. Open the extension popup.
2. Select a recording from the dropdown menu.
3. (Optional) Check the "Enable fallback matching for similar paths" checkbox for more flexible request matching.
4. Click the "Replay" button.
5. Navigate to the website where you want to replay the traffic.
6. The extension will intercept and respond to matching requests with the recorded data.
7. Click "Stop Replaying" when you're done.

### Managing Recordings

- **Export**: Select a recording and click the "Export" button to save it as a JSON file.
- **Import**: Click the "Import" button and select a previously exported JSON file to add it to your recordings.
- **Delete**: Select a recording and click the "Delete" button to remove it from the extension.

### API Preview

The extension provides an API preview that shows all captured API paths for the selected recording. It also displays the number of times each path has been replayed in the current session.

## Troubleshooting

- If the extension isn't working, make sure it has the necessary permissions to access the websites you're trying to record or replay.
- Check the browser console for any error messages related to the extension.
- If you encounter issues with specific websites, try disabling other extensions that might interfere with network requests.

## Contributing

We welcome contributions to improve the Network Traffic Recorder and Replayer! Here's how you can contribute:

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them with clear, descriptive messages.
4. Push your changes to your fork.
5. Submit a pull request to the main repository.

Please ensure your code adheres to the existing style and includes appropriate tests and documentation.

## License

This project is licensed under the Apache 2 License. See the LICENSE file for details.

## Support

If you encounter any issues or have questions, please file an issue on the GitHub repository.

Happy recording and replaying!

