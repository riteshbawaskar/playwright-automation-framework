const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const ProcessManager = require('../scripts/process-manager');
const isDev = process.env.NODE_ENV === 'development';

class TestAutomationApp {
  constructor() {
    this.mainWindow = null;
    this.recordingProcess = null;
    this.testExecutionProcess = null;
    this.setupApp();
  }

  setupApp() {
    app.whenReady().then(() => this.createWindow());
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
    });

    this.setupIpcHandlers();
    this.setupMenu();
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      },
      show: false
    });

    // Load the UI
    this.mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      if (isDev) {
        this.mainWindow.webContents.openDevTools();
      }
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      this.cleanupProcesses();
    });
  }

  setupMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Project',
            accelerator: 'CmdOrCtrl+N',
            click: () => this.mainWindow.webContents.send('menu-action', 'new-project')
          },
          {
            label: 'Open Project',
            accelerator: 'CmdOrCtrl+O',
            click: () => this.handleOpenProject()
          },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' }
        ]
      },
      {
        label: 'Test',
        submenu: [
          {
            label: 'Start Recording',
            accelerator: 'CmdOrCtrl+R',
            click: () => this.mainWindow.webContents.send('menu-action', 'start-recording')
          },
          {
            label: 'Stop Recording',
            accelerator: 'CmdOrCtrl+Shift+R',
            click: () => this.mainWindow.webContents.send('menu-action', 'stop-recording')
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About',
            click: () => this.showAboutDialog()
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  setupIpcHandlers() {
    // Project management
    ipcMain.handle('create-project', async (event, projectData) => {
      try {
        const { filePath } = await dialog.showSaveDialog(this.mainWindow, {
          title: 'Create New Project',
          defaultPath: `${projectData.name}.json`,
          filters: [{ name: 'Project Files', extensions: ['json'] }]
        });

        if (filePath) {
          const project = {
            name: projectData.name,
            description: projectData.description,
            baseUrl: projectData.baseUrl,
            createdAt: new Date().toISOString(),
            pageObjects: [],
            tests: [],
            config: {
              browsers: ['chromium'],
              timeout: 30000,
              retries: 1,
              parallel: 2
            }
          };

          await fs.writeFile(filePath, JSON.stringify(project, null, 2));
          return { success: true, projectPath: filePath, project };
        }
        return { success: false, error: 'Save cancelled' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('load-project', async (event, projectPath) => {
      try {
        const data = await fs.readFile(projectPath, 'utf8');
        const project = JSON.parse(data);
        return { success: true, project, projectPath };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('save-project', async (event, projectPath, projectData) => {
      try {
        await fs.writeFile(projectPath, JSON.stringify(projectData, null, 2));
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // File operations
    ipcMain.handle('read-file', async (event, filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        return { success: true, content };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('write-file', async (event, filePath, content) => {
      try {
        await fs.writeFile(filePath, content);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('delete-file', async (event, filePath) => {
      try {
        await fs.unlink(filePath);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('list-directory', async (event, dirPath) => {
      try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        const files = items.map(item => ({
          name: item.name,
          isDirectory: item.isDirectory(),
          path: path.join(dirPath, item.name)
        }));
        return { success: true, files };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Recording handlers
    ipcMain.handle('start-recording', async (event, options) => {
      try {
        if (this.recordingProcess) {
          throw new Error('Recording already in progress');
        }

        console.log('Starting recording with options:', options);

        // Determine the correct command for Windows vs other platforms
        const isWindows = process.platform === 'win32';
        let command, args;

        if (isWindows) {
          // On Windows, use cmd to run npx
          command = 'cmd';
          args = [
            '/c',
            'npx',
            'playwright',
            'codegen',
            '--target', 'javascript'
          ];
        } else {
          // On Unix-like systems
          command = 'npx';
          args = [
            'playwright',
            'codegen',
            '--target', 'javascript'
          ];
        }

        // Add the URL if provided
        if (options.baseUrl) {
          args.push(options.baseUrl);
        }

        console.log(`Executing: ${command} ${args.join(' ')}`);

        this.recordingProcess = ProcessManager.createManagedProcess(command, args, {
          cwd: process.cwd(),
          shell: ProcessManager.isWindows,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        });

        console.log(`Recording process started with PID: ${this.recordingProcess.pid}`);

        // Set up event handlers
        this.recordingProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log('Recording stdout:', output);
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('recording-output', output);
          }
        });

        this.recordingProcess.stderr.on('data', (data) => {
          const output = data.toString();
          console.log('Recording stderr:', output);
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('recording-error', output);
          }
        });

        this.recordingProcess.on('close', (code, signal) => {
          console.log(`Recording process closed with code: ${code}, signal: ${signal}`);
          this.recordingProcess = null;
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('recording-stopped', code || 0);
          }
        });

        this.recordingProcess.on('exit', (code, signal) => {
          console.log(`Recording process exited with code: ${code}, signal: ${signal}`);
          // Don't set to null here, let 'close' handle it
        });

        this.recordingProcess.on('error', (error) => {
          console.error('Recording process error:', error);
          this.recordingProcess = null;
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('recording-error', `Process error: ${error.message}`);
            this.mainWindow.webContents.send('recording-stopped', -1);
          }
        });

        // Add a startup timeout
        const startupTimeout = setTimeout(() => {
          if (this.recordingProcess) {
            console.log('Recording process startup successful');
          }
        }, 3000);

        return { 
          success: true, 
          message: 'Recording started successfully',
          pid: this.recordingProcess.pid 
        };
      } catch (error) {
        console.error('Failed to start recording:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('stop-recording', async (event) => {
      try {
        if (!this.recordingProcess) {
          return { success: true, message: 'No recording process to stop' };
        }

        console.log('Stopping recording process...');
        
        const success = await this.recordingProcess.cleanup();
        
        // Always clean up our reference
        this.recordingProcess = null;
        
        // Send stopped event to renderer
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('recording-stopped', 0);
        }
        
        if (success) {
          return { success: true, message: 'Recording stopped successfully' };
        } else {
          return { success: true, message: 'Recording stop attempted (may have been forced)' };
        }
        
      } catch (error) {
        console.error('Failed to stop recording:', error);
        // Clean up anyway
        this.recordingProcess = null;
        
        // Send stopped event even on error
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('recording-stopped', -1);
        }
        
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('get-recording-status', async (event) => {
      return {
        isRecording: !!this.recordingProcess,
        processId: this.recordingProcess?.pid || null
      };
    });

    // Add a handler to check if Playwright is available
    ipcMain.handle('check-playwright', async (event) => {
      return new Promise((resolve) => {
        const isWindows = process.platform === 'win32';
        let command, args;

        if (isWindows) {
          command = 'cmd';
          args = ['/c', 'npx', 'playwright', '--version'];
        } else {
          command = 'npx';
          args = ['playwright', '--version'];
        }

        const checkProcess = spawn(command, args, {
          stdio: 'pipe',
          shell: isWindows
        });

        let output = '';
        
        checkProcess.stdout.on('data', (data) => {
          output += data.toString();
        });

        checkProcess.on('close', (code) => {
          if (code === 0) {
            resolve({ 
              success: true, 
              installed: true, 
              version: output.trim(),
              message: 'Playwright is available' 
            });
          } else {
            resolve({ 
              success: false, 
              installed: false, 
              message: 'Playwright not found. Run: npm install @playwright/test' 
            });
          }
        });

        checkProcess.on('error', (error) => {
          resolve({ 
            success: false, 
            installed: false, 
            error: error.message,
            message: 'Error checking Playwright: ' + error.message
          });
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          checkProcess.kill();
          resolve({ 
            success: false, 
            installed: false, 
            message: 'Playwright check timed out' 
          });
        }, 10000);
      });
    });

    // Test execution handlers
    ipcMain.handle('run-tests', async (event, options) => {
      try {
        console.log('Starting test execution with options:', options);

        // Determine the correct command for Windows vs other platforms
        const isWindows = process.platform === 'win32';
        let command, args;

        if (isWindows) {
          // On Windows, use cmd to run npx
          command = 'cmd';
          args = ['/c', 'npx', 'playwright', 'test'];
        } else {
          // On Unix-like systems
          command = 'npx';
          args = ['playwright', 'test'];
        }
        
        if (options.testFile) {
          args.push(options.testFile);
        }
        
        if (options.browser) {
          args.push('--project', options.browser);
        }

        if (options.headed) {
          args.push('--headed');
        }

        console.log(`Executing: ${command} ${args.join(' ')}`);

        this.testExecutionProcess = spawn(command, args, {
          cwd: options.projectPath || process.cwd(),
          env: { ...process.env, ...options.env },
          shell: isWindows,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        this.testExecutionProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log('Test stdout:', output);
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('test-output', output);
          }
        });

        this.testExecutionProcess.stderr.on('data', (data) => {
          const output = data.toString();
          console.log('Test stderr:', output);
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('test-error', output);
          }
        });

        this.testExecutionProcess.on('close', (code) => {
          console.log(`Test execution process closed with code: ${code}`);
          this.testExecutionProcess = null;
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('test-execution-finished', code);
          }
        });

        this.testExecutionProcess.on('error', (error) => {
          console.error('Test execution process error:', error);
          this.testExecutionProcess = null;
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('test-error', `Process error: ${error.message}`);
            this.mainWindow.webContents.send('test-execution-finished', -1);
          }
        });

        return { success: true, message: 'Test execution started successfully' };
      } catch (error) {
        console.error('Failed to start test execution:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('stop-tests', async (event) => {
      try {
        if (this.testExecutionProcess) {
          this.testExecutionProcess.kill();
          this.testExecutionProcess = null;
        }
        return { success: true, message: 'Test execution stopped' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('get-test-results', async (event) => {
      try {
        return {
          success: true,
          results: {
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            tests: []
          }
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Code generation handlers
    ipcMain.handle('generate-page-object', async (event, data) => {
      try {
        return { 
          success: true, 
          message: 'Page object generation feature coming soon',
          filePath: './output/page-objects/generated.page.js'
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('generate-test-file', async (event, data) => {
      try {
        return { 
          success: true, 
          message: 'Test file generation feature coming soon',
          filePath: './output/tests/generated.spec.js'
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Dialog handlers
    ipcMain.handle('show-save-dialog', async (event, options) => {
      const result = await dialog.showSaveDialog(this.mainWindow, options);
      return result;
    });

    ipcMain.handle('show-open-dialog', async (event, options) => {
      const result = await dialog.showOpenDialog(this.mainWindow, options);
      return result;
    });

    ipcMain.handle('show-message-box', async (event, options) => {
      const result = await dialog.showMessageBox(this.mainWindow, options);
      return result;
    });
  }

  async handleOpenProject() {
    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: 'Open Project',
      filters: [{ name: 'Project Files', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      this.mainWindow.webContents.send('load-project', result.filePaths[0]);
    }
  }

  showAboutDialog() {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'About Test Automation Framework',
      message: 'Playwright Test Automation Framework',
      detail: 'Version 1.0.0\nBuilt with Electron and Playwright\n\nA comprehensive test automation solution with recording capabilities and Page Object Model generation.'
    });
  }

  cleanupProcesses() {
    console.log('Cleaning up processes...');
    
    const cleanupPromises = [];
    
    if (this.recordingProcess) {
      console.log('Cleaning up recording process...');
      cleanupPromises.push(this.recordingProcess.cleanup());
    }
    if (this.testExecutionProcess) {
      console.log('Cleaning up test execution process...');
      if (this.testExecutionProcess.cleanup) {
        cleanupPromises.push(this.testExecutionProcess.cleanup());
      } else {
        // Fallback for processes without cleanup method
        try {
          this.testExecutionProcess.kill('SIGTERM');
        } catch (error) {
          console.error('Error killing test process:', error);
        }
      }
    }
    
    // Wait for all cleanup operations to complete (with timeout)
    Promise.allSettled(cleanupPromises).then(() => {
      console.log('Process cleanup completed');
    });
    
    // Clean up references
    this.recordingProcess = null;
    this.testExecutionProcess = null;
    
    // Also clean up any hanging Playwright processes
    ProcessManager.cleanupPlaywrightProcesses();
  }
}

// Create and start the application
const testApp = new TestAutomationApp();

// Handle app errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});