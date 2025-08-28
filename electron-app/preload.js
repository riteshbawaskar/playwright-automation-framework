const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Project Management
  createProject: (projectData) => ipcRenderer.invoke('create-project', projectData),
  loadProject: (projectPath) => ipcRenderer.invoke('load-project', projectPath),
  saveProject: (projectPath, projectData) => ipcRenderer.invoke('save-project', projectPath, projectData),

  // File Operations
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),

  // Test Recording
  startRecording: (options) => ipcRenderer.invoke('start-recording', options),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  getRecordingStatus: () => ipcRenderer.invoke('get-recording-status'),
  checkPlaywright: () => ipcRenderer.invoke('check-playwright'),

  // Test Execution
  runTests: (options) => ipcRenderer.invoke('run-tests', options),
  stopTests: () => ipcRenderer.invoke('stop-tests'),
  getTestResults: () => ipcRenderer.invoke('get-test-results'),

  // Code Generation
  generatePageObject: (data) => ipcRenderer.invoke('generate-page-object', data),
  generateTestFile: (data) => ipcRenderer.invoke('generate-test-file', data),

  // Dialog Operations
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),

  // Event Listeners for main process communications
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (event, action) => callback(action));
  },

  onLoadProject: (callback) => {
    ipcRenderer.on('load-project', (event, projectPath) => callback(projectPath));
  },

  onRecordingOutput: (callback) => {
    ipcRenderer.on('recording-output', (event, data) => callback(data));
  },

  onRecordingError: (callback) => {
    ipcRenderer.on('recording-error', (event, data) => callback(data));
  },

  onRecordingStopped: (callback) => {
    ipcRenderer.on('recording-stopped', (event, code) => callback(code));
  },

  onTestOutput: (callback) => {
    ipcRenderer.on('test-output', (event, data) => callback(data));
  },

  onTestError: (callback) => {
    ipcRenderer.on('test-error', (event, data) => callback(data));
  },

  onTestExecutionFinished: (callback) => {
    ipcRenderer.on('test-execution-finished', (event, code) => callback(code));
  },

  // Remove event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Expose Node.js path utilities for the renderer
contextBridge.exposeInMainWorld('pathAPI', {
  join: (...args) => require('path').join(...args),
  dirname: (filePath) => require('path').dirname(filePath),
  basename: (filePath) => require('path').basename(filePath),
  extname: (filePath) => require('path').extname(filePath)
});