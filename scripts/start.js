#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

console.log('🚀 Starting Test Automation Framework...');

// Check if we're on Windows
const isWindows = os.platform() === 'win32';

// Function to execute commands properly on Windows
function spawnProcess(command, args, options = {}) {
  if (isWindows) {
    // On Windows, we need to use cmd.exe to run npm/npx commands
    return spawn('cmd', ['/c', command, ...args], {
      ...options,
      shell: true
    });
  } else {
    return spawn(command, args, options);
  }
}

// Function to check if a command exists
async function commandExists(command) {
  return new Promise((resolve) => {
    const checkCommand = isWindows ? 'where' : 'which';
    const process = spawn(checkCommand, [command], { 
      stdio: 'pipe',
      shell: isWindows
    });
    
    process.on('close', (code) => {
      resolve(code === 0);
    });
    
    process.on('error', () => {
      resolve(false);
    });
  });
}

// Check prerequisites
async function checkPrerequisites() {
  console.log('🔍 Checking prerequisites...');
  
  // Check if Node.js exists
  const nodeExists = await commandExists('node');
  if (!nodeExists) {
    console.error('❌ Node.js not found. Please install Node.js from https://nodejs.org/');
    process.exit(1);
  }
  console.log('  ✅ Node.js found');
  
  // Check if npm exists
  const npmExists = await commandExists('npm');
  if (!npmExists) {
    console.error('❌ npm not found. Please ensure npm is properly installed.');
    process.exit(1);
  }
  console.log('  ✅ npm found');
  
  // Check if electron is installed
  const electronExt = isWindows ? '.cmd' : '';
  const electronPath = path.join(process.cwd(), 'node_modules', '.bin', `electron${electronExt}`);
  if (!fs.existsSync(electronPath)) {
    console.log('⚠️  Electron not found in node_modules, attempting to install...');
    await installDependencies();
  } else {
    console.log('  ✅ Electron found');
  }
}

// Install dependencies
async function installDependencies() {
  console.log('📦 Installing dependencies...');
  
  return new Promise((resolve, reject) => {
    const installProcess = spawnProcess('npm', ['install'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    installProcess.on('close', (code) => {
      if (code === 0) {
        console.log('  ✅ Dependencies installed successfully');
        resolve();
      } else {
        console.error('❌ Failed to install dependencies');
        reject(new Error(`npm install failed with code ${code}`));
      }
    });
    
    installProcess.on('error', (error) => {
      console.error('❌ Error during installation:', error.message);
      reject(error);
    });
  });
}

// Ensure all required directories exist
function ensureDirectories() {
  const requiredDirs = [
    'output',
    'output/recordings',
    'output/page-objects', 
    'output/tests',
    'output/reports',
    'output/screenshots',
    'output/videos',
    'test-results',
    'logs',
    'temp'
  ];

  console.log('📁 Creating required directories...');
  requiredDirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`  ✅ Created ${dir}/`);
    }
  });
}

// Create missing files
function createMissingFiles() {
  // Check if preload.js exists
  const preloadPath = path.join(process.cwd(), 'electron-app', 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    console.log('⚠️  preload.js not found, creating minimal version...');
    const minimalPreload = `const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Project Management
  createProject: (projectData) => ipcRenderer.invoke('create-project', projectData),
  loadProject: (projectPath) => ipcRenderer.invoke('load-project', projectPath),
  saveProject: (projectPath, projectData) => ipcRenderer.invoke('save-project', projectPath, projectData),

  // Recording
  startRecording: (options) => ipcRenderer.invoke('start-recording', options),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  getRecordingStatus: () => ipcRenderer.invoke('get-recording-status'),

  // Event listeners
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action) => callback(action)),
  onRecordingOutput: (callback) => ipcRenderer.on('recording-output', (event, data) => callback(data)),
  onRecordingError: (callback) => ipcRenderer.on('recording-error', (event, data) => callback(data)),
  onRecordingStopped: (callback) => ipcRenderer.on('recording-stopped', (event, code) => callback(code))
});

contextBridge.exposeInMainWorld('pathAPI', {
  join: (...args) => require('path').join(...args),
  dirname: (filePath) => require('path').dirname(filePath),
  basename: (filePath) => require('path').basename(filePath)
});`;
    
    fs.mkdirSync(path.dirname(preloadPath), { recursive: true });
    fs.writeFileSync(preloadPath, minimalPreload);
    console.log('  ✅ Created minimal preload.js');
  }

  // Check if renderer HTML exists
  const rendererPath = path.join(process.cwd(), 'electron-app', 'renderer', 'index.html');
  if (!fs.existsSync(rendererPath)) {
    console.log('⚠️  index.html not found, creating basic version...');
    const basicHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Automation Framework</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            margin-bottom: 30px;
        }
        .button {
            display: inline-block;
            padding: 12px 24px;
            margin: 10px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            text-decoration: none;
            font-size: 14px;
            transition: background-color 0.2s;
        }
        .button:hover {
            background: #2980b9;
        }
        .button:disabled {
            background: #bdc3c7;
            cursor: not-allowed;
        }
        .status {
            margin: 20px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 5px;
            border-left: 4px solid #3498db;
            min-height: 20px;
        }
        .console {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
            font-family: 'Courier New', monospace;
            height: 200px;
            overflow-y: auto;
            font-size: 12px;
            line-height: 1.4;
        }
        .button-group {
            text-align: center;
            margin: 20px 0;
        }
        .recording-controls {
            display: none;
            background: #e8f5e8;
            padding: 15px;
            border-radius: 5px;
            margin: 15px 0;
            border-left: 4px solid #27ae60;
        }
        .recording-controls.active {
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎭 Test Automation Framework</h1>
        
        <div class="status" id="status">
            Ready to start! Create a new project or load an existing one.
        </div>
        
        <div class="button-group">
            <button class="button" onclick="createProject()" id="createBtn">Create New Project</button>
            <button class="button" onclick="loadProject()" id="loadBtn">Load Project</button>
        </div>
        
        <div class="recording-controls" id="recordingControls">
            <h3>🎬 Recording Controls</h3>
            <button class="button" onclick="startRecording()" id="startRecordingBtn">Start Recording</button>
            <button class="button" onclick="stopRecording()" id="stopRecordingBtn" disabled>Stop Recording</button>
        </div>
        
        <div class="console" id="console">
            Console output will appear here...
        </div>
    </div>

    <script>
        let currentProject = null;
        let isRecording = false;
        
        async function createProject() {
            try {
                updateStatus('Creating project...');
                
                const projectData = {
                    name: prompt('Enter project name:', 'My Test Project') || 'My Test Project',
                    description: 'A new test automation project',
                    baseUrl: prompt('Enter base URL:', 'https://example.com') || 'https://example.com'
                };
                
                if (!projectData.name) {
                    updateStatus('❌ Project creation cancelled');
                    return;
                }
                
                const result = await window.electronAPI.createProject(projectData);
                if (result.success) {
                    currentProject = result.project;
                    updateStatus('✅ Project created successfully!');
                    logToConsole('Project created: ' + result.projectPath);
                    showRecordingControls();
                } else {
                    updateStatus('❌ Failed to create project: ' + result.error);
                    logToConsole('Error: ' + result.error);
                }
            } catch (error) {
                updateStatus('❌ Error: ' + error.message);
                logToConsole('Error: ' + error.message);
            }
        }
        
        async function loadProject() {
            try {
                updateStatus('Loading project...');
                // This would typically open a file dialog
                logToConsole('Load project feature coming soon...');
                updateStatus('💡 Load project feature coming soon');
            } catch (error) {
                updateStatus('❌ Error: ' + error.message);
                logToConsole('Error: ' + error.message);
            }
        }
        
        async function startRecording() {
            if (!currentProject) {
                updateStatus('❌ Please create a project first');
                return;
            }
            
            try {
                updateStatus('Starting recording...');
                
                const baseUrl = prompt('Enter URL to record:', currentProject.baseUrl || 'https://example.com');
                if (!baseUrl) {
                    updateStatus('❌ Recording cancelled - no URL provided');
                    return;
                }
                
                const options = {
                    baseUrl: baseUrl,
                    testName: 'recorded-test-' + Date.now(),
                    browser: 'chromium'
                };
                
                const result = await window.electronAPI.startRecording(options);
                if (result.success) {
                    isRecording = true;
                    updateRecordingUI();
                    updateStatus('🎬 Recording started! Interact with the browser window that opens.');
                    logToConsole('Recording started for: ' + baseUrl);
                } else {
                    updateStatus('❌ Failed to start recording: ' + result.error);
                    logToConsole('Recording error: ' + result.error);
                }
            } catch (error) {
                updateStatus('❌ Error: ' + error.message);
                logToConsole('Error: ' + error.message);
            }
        }
        
        async function stopRecording() {
            try {
                updateStatus('🛑 Stopping recording...');
                document.getElementById('stopRecordingBtn').disabled = true;
                document.getElementById('stopRecordingBtn').textContent = 'Stopping...';
                
                const result = await window.electronAPI.stopRecording();
                if (result.success) {
                    isRecording = false;
                    updateRecordingUI();
                    updateStatus('⏹️ Recording stopped successfully');
                    logToConsole('Recording stopped: ' + result.message);
                } else {
                    updateStatus('❌ Failed to stop recording: ' + result.error);
                    logToConsole('Stop recording error: ' + result.error);
                    // Reset UI anyway
                    isRecording = false;
                    updateRecordingUI();
                }
            } catch (error) {
                updateStatus('❌ Error: ' + error.message);
                logToConsole('Error: ' + error.message);
                // Reset UI anyway
                isRecording = false;
                updateRecordingUI();
            }
        }
        
        function showRecordingControls() {
            document.getElementById('recordingControls').classList.add('active');
        }
        
        function updateRecordingUI() {
            const startBtn = document.getElementById('startRecordingBtn');
            const stopBtn = document.getElementById('stopRecordingBtn');
            
            if (isRecording) {
                startBtn.disabled = true;
                stopBtn.disabled = false;
                startBtn.textContent = 'Recording...';
            } else {
                startBtn.disabled = false;
                stopBtn.disabled = true;
                startBtn.textContent = 'Start Recording';
            }
        }
        
        function updateStatus(message) {
            const statusElement = document.getElementById('status');
            statusElement.textContent = message;
            
            // Add visual feedback based on message type
            statusElement.className = 'status';
            if (message.includes('✅')) {
                statusElement.style.borderLeftColor = '#27ae60';
                statusElement.style.backgroundColor = '#d5f4e6';
            } else if (message.includes('❌')) {
                statusElement.style.borderLeftColor = '#e74c3c';
                statusElement.style.backgroundColor = '#fdeaea';
            } else if (message.includes('⚠️') || message.includes('💡')) {
                statusElement.style.borderLeftColor = '#f39c12';
                statusElement.style.backgroundColor = '#fef9e7';
            } else {
                statusElement.style.borderLeftColor = '#3498db';
                statusElement.style.backgroundColor = '#f8f9fa';
            }
        }
        
        function logToConsole(message) {
            const consoleElement = document.getElementById('console');
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = '[' + timestamp + '] ' + message + '\\n';
            
            consoleElement.textContent += logEntry;
            consoleElement.scrollTop = consoleElement.scrollHeight;
        }
        
        function clearConsole() {
            document.getElementById('console').textContent = '';
        }
        
        // Set up event listeners if electronAPI is available
        if (window.electronAPI) {
            window.electronAPI.onRecordingOutput((data) => {
                logToConsole('Recording: ' + data.trim());
            });
            
            window.electronAPI.onRecordingError((data) => {
                logToConsole('Recording Error: ' + data.trim());
            });
            
            window.electronAPI.onRecordingStopped((code) => {
                isRecording = false;
                updateRecordingUI();
                logToConsole('Recording finished with exit code: ' + code);
                if (code === 0) {
                    updateStatus('✅ Recording completed successfully');
                } else {
                    updateStatus('⚠️ Recording stopped (exit code: ' + code + ')');
                }
            });
            
            window.electronAPI.onMenuAction((action) => {
                logToConsole('Menu action: ' + action);
                if (action === 'new-project') {
                    createProject();
                } else if (action === 'start-recording') {
                    startRecording();
                } else if (action === 'stop-recording') {
                    stopRecording();
                }
            });
            
            // Initialize
            logToConsole('Test Automation Framework started');
            logToConsole('Electron API connected successfully');
            updateStatus('🎭 Ready! Click "Create New Project" to begin.');
        } else {
            logToConsole('WARNING: Electron API not available');
            updateStatus('⚠️ Electron API not connected - some features may not work');
        }
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'n':
                        e.preventDefault();
                        createProject();
                        break;
                    case 'r':
                        e.preventDefault();
                        if (e.shiftKey) {
                            stopRecording();
                        } else {
                            startRecording();
                        }
                        break;
                    case 'l':
                        e.preventDefault();
                        clearConsole();
                        logToConsole('Console cleared');
                        break;
                }
            }
        });
        
        // Add helpful keyboard shortcuts info
        logToConsole('Keyboard shortcuts:');
        logToConsole('  Ctrl+N: Create new project');
        logToConsole('  Ctrl+R: Start recording');
        logToConsole('  Ctrl+Shift+R: Stop recording');
        logToConsole('  Ctrl+L: Clear console');
        logToConsole('');
    </script>
</body>
</html>`;
    
    fs.mkdirSync(path.dirname(rendererPath), { recursive: true });
    fs.writeFileSync(rendererPath, basicHtml);
    console.log('  ✅ Created basic index.html');
  }
}

// Start Electron with proper Windows handling
function startElectron() {
  console.log('✅ Setup complete! Starting Electron...');
  console.log('');

  // Determine the correct electron command
  let electronCommand;
  let electronArgs = ['.'];

  if (isWindows) {
    // On Windows, try to use the local electron first
    const localElectron = path.join(process.cwd(), 'node_modules', '.bin', 'electron.cmd');
    if (fs.existsSync(localElectron)) {
      electronCommand = localElectron;
      electronArgs = ['.'];
    } else {
      // Fallback to npx
      electronCommand = 'npx';
      electronArgs = ['electron', '.'];
    }
  } else {
    electronCommand = 'npx';
    electronArgs = ['electron', '.'];
  }

  console.log(`🚀 Starting: ${electronCommand} ${electronArgs.join(' ')}`);

  const electronProcess = spawnProcess(electronCommand, electronArgs, {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  electronProcess.on('close', (code) => {
    console.log(`\n🛑 Electron exited with code ${code}`);
    process.exit(code);
  });

  electronProcess.on('error', (error) => {
    console.error('❌ Failed to start Electron:', error.message);
    console.log('\n💡 Troubleshooting steps:');
    console.log('   1. Run: npm install electron');
    console.log('   2. Try: npm run electron');
    console.log('   3. Check if PATH includes node_modules/.bin');
    console.log('   4. Try: npx electron . --no-sandbox');
    process.exit(1);
  });
}

// Main execution
async function main() {
  try {
    await checkPrerequisites();
    ensureDirectories();
    createMissingFiles();
    startElectron();
  } catch (error) {
    console.error('❌ Startup failed:', error.message);
    console.log('\n💡 Try running: npm install');
    console.log('💡 Or try: npm run start:win');
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received termination signal...');
  process.exit(0);
});

main();