class TestAutomationApp {
  constructor() {
    this.currentProject = null;
    this.currentProjectPath = null;
    this.activeTab = 'dashboard';
    this.isRecording = false;
    this.isTestRunning = false;
    
    this.init();
  }

  init() {
    this.setupTabNavigation();
    this.setupEventListeners();
    this.setupElectronAPI();
    this.loadInitialState();
    this.showToast('Welcome to Test Automation Framework', 'Ready to start automating!', 'info');
  }

  setupTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tabId = item.dataset.tab;
        this.switchTab(tabId);
      });
    });
  }

  switchTab(tabId) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');

    this.activeTab = tabId;
    this.onTabChanged(tabId);
  }

  onTabChanged(tabId) {
    switch (tabId) {
      case 'dashboard':
        this.updateDashboard();
        break;
      case 'recorder':
        this.updateRecorderStatus();
        break;
      case 'page-objects':
        this.loadPageObjects();
        break;
      case 'tests':
        this.loadTests();
        break;
      case 'runner':
        this.loadTestSelection();
        break;
      case 'results':
        this.loadResults();
        break;
      case 'settings':
        this.loadSettings();
        break;
    }
  }

  setupEventListeners() {
    // Dashboard actions
    document.getElementById('newProjectBtn').addEventListener('click', () => this.showNewProjectModal());
    document.getElementById('openProjectBtn').addEventListener('click', () => this.openProject());

    // Quick action buttons
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        this.handleQuickAction(action);
      });
    });

    // New project modal
    document.getElementById('closeNewProjectModal').addEventListener('click', () => this.hideNewProjectModal());
    document.getElementById('cancelNewProject').addEventListener('click', () => this.hideNewProjectModal());
    document.getElementById('newProjectForm').addEventListener('submit', (e) => this.handleCreateProject(e));

    // Recording controls
    document.getElementById('startRecordingBtn').addEventListener('click', () => this.startRecording());
    document.getElementById('stopRecordingBtn').addEventListener('click', () => this.stopRecording());

    // Test execution controls
    document.getElementById('runAllTestsBtn').addEventListener('click', () => this.runAllTests());
    document.getElementById('stopTestsBtn').addEventListener('click', () => this.stopTests());

    // Settings
    document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
    
    // Settings navigation
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const setting = e.target.dataset.setting;
        this.switchSettingPanel(setting);
      });
    });

    // Modal close on background click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideNewProjectModal();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'n':
            e.preventDefault();
            this.showNewProjectModal();
            break;
          case 'o':
            e.preventDefault();
            this.openProject();
            break;
          case 'r':
            e.preventDefault();
            if (e.shiftKey) {
              this.stopRecording();
            } else {
              this.startRecording();
            }
            break;
          case 's':
            e.preventDefault();
            this.saveCurrentFile();
            break;
        }
      }
    });
  }

  setupElectronAPI() {
    // Listen for menu actions
    window.electronAPI.onMenuAction((action) => {
      this.handleMenuAction(action);
    });

    // Listen for project loading
    window.electronAPI.onLoadProject((projectPath) => {
      this.loadProject(projectPath);
    });

    // Listen for recording events
    window.electronAPI.onRecordingOutput((data) => {
      this.appendToConsole('recordingConsole', data);
    });

    window.electronAPI.onRecordingError((data) => {
      this.appendToConsole('recordingConsole', data, 'error');
    });

    window.electronAPI.onRecordingStopped((code) => {
      this.isRecording = false;
      this.updateRecordingUI();
      const message = code === 0 ? 'Recording completed successfully' : 'Recording stopped with errors';
      this.showToast('Recording Stopped', message, code === 0 ? 'success' : 'warning');
    });

    // Listen for test execution events
    window.electronAPI.onTestOutput((data) => {
      this.appendToConsole('executionConsole', data);
      this.parseTestOutput(data);
    });

    window.electronAPI.onTestError((data) => {
      this.appendToConsole('executionConsole', data, 'error');
    });

    window.electronAPI.onTestExecutionFinished((code) => {
      this.isTestRunning = false;
      this.updateTestExecutionUI();
      const message = code === 0 ? 'Tests completed successfully' : 'Tests completed with failures';
      this.showToast('Test Execution Finished', message, code === 0 ? 'success' : 'warning');
      this.loadResults();
    });
  }

  handleMenuAction(action) {
    switch (action) {
      case 'new-project':
        this.showNewProjectModal();
        break;
      case 'start-recording':
        this.switchTab('recorder');
        this.startRecording();
        break;
      case 'stop-recording':
        this.stopRecording();
        break;
      case 'run-all-tests':
        this.switchTab('runner');
        this.runAllTests();
        break;
      case 'run-selected-test':
        this.runSelectedTest();
        break;
    }
  }

  handleQuickAction(action) {
    switch (action) {
      case 'start-recording':
        this.switchTab('recorder');
        break;
      case 'run-tests':
        this.switchTab('runner');
        break;
      case 'view-results':
        this.switchTab('results');
        break;
    }
  }

  // Project Management
  showNewProjectModal() {
    document.getElementById('newProjectModal').classList.add('active');
    document.getElementById('projectName').focus();
  }

  hideNewProjectModal() {
    document.getElementById('newProjectModal').classList.remove('active');
    document.getElementById('newProjectForm').reset();
  }

  async handleCreateProject(e) {
    e.preventDefault();
    
    const projectData = {
      name: document.getElementById('projectName').value,
      description: document.getElementById('projectDescription').value,
      baseUrl: document.getElementById('projectBaseUrl').value
    };

    this.showLoading('Creating project...');

    try {
      const result = await window.electronAPI.createProject(projectData);
      
      if (result.success) {
        this.currentProject = result.project;
        this.currentProjectPath = result.projectPath;
        this.updateProjectInfo();
        this.hideNewProjectModal();
        this.showToast('Success', 'Project created successfully!', 'success');
        this.updateDashboard();
      } else {
        this.showToast('Error', result.error || 'Failed to create project', 'error');
      }
    } catch (error) {
      this.showToast('Error', 'Failed to create project: ' + error.message, 'error');
    }

    this.hideLoading();
  }

  async openProject() {
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: 'Open Project',
        filters: [{ name: 'Project Files', extensions: ['json'] }],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        await this.loadProject(result.filePaths[0]);
      }
    } catch (error) {
      this.showToast('Error', 'Failed to open project: ' + error.message, 'error');
    }
  }

  async loadProject(projectPath) {
    this.showLoading('Loading project...');

    try {
      const result = await window.electronAPI.loadProject(projectPath);
      
      if (result.success) {
        this.currentProject = result.project;
        this.currentProjectPath = result.projectPath;
        this.updateProjectInfo();
        this.showToast('Success', 'Project loaded successfully!', 'success');
        this.updateDashboard();
        
        // Enable recording button now that we have a project
        document.getElementById('startRecordingBtn').disabled = false;
      } else {
        this.showToast('Error', result.error || 'Failed to load project', 'error');
      }
    } catch (error) {
      this.showToast('Error', 'Failed to load project: ' + error.message, 'error');
    }

    this.hideLoading();
  }

  async saveProject() {
    if (!this.currentProject || !this.currentProjectPath) {
      return;
    }

    try {
      const result = await window.electronAPI.saveProject(this.currentProjectPath, this.currentProject);
      
      if (result.success) {
        this.showToast('Success', 'Project saved successfully!', 'success');
      } else {
        this.showToast('Error', result.error || 'Failed to save project', 'error');
      }
    } catch (error) {
      this.showToast('Error', 'Failed to save project: ' + error.message, 'error');
    }
  }

  updateProjectInfo() {
    const projectName = document.getElementById('currentProject');
    const projectStatus = document.getElementById('projectStatus');
    
    if (this.currentProject) {
      projectName.textContent = this.currentProject.name;
      projectStatus.textContent = 'Loaded';
    } else {
      projectName.textContent = 'No Project';
      projectStatus.textContent = 'Ready';
    }
  }

  // Dashboard
  updateDashboard() {
    if (!this.currentProject) {
      document.getElementById('pageObjectCount').textContent = '0';
      document.getElementById('testCount').textContent = '0';
      document.getElementById('lastRunDate').textContent = 'Never';
      return;
    }

    document.getElementById('pageObjectCount').textContent = this.currentProject.pageObjects?.length || 0;
    document.getElementById('testCount').textContent = this.currentProject.tests?.length || 0;
    document.getElementById('lastRunDate').textContent = this.currentProject.lastRun || 'Never';

    this.addActivity(`Project "${this.currentProject.name}" loaded`);
  }

  addActivity(message) {
    const activityList = document.getElementById('activityList');
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    activityItem.innerHTML = `
      <i class="fas fa-info-circle"></i>
      <span>${message}</span>
      <time>Just now</time>
    `;
    
    activityList.insertBefore(activityItem, activityList.firstChild);
    
    // Keep only last 10 activities
    while (activityList.children.length > 10) {
      activityList.removeChild(activityList.lastChild);
    }
  }

  // Recording
  async updateRecorderStatus() {
    try {
      const status = await window.electronAPI.getRecordingStatus();
      this.isRecording = status.isRecording;
      this.updateRecordingUI();
    } catch (error) {
      console.error('Failed to get recording status:', error);
    }
  }

  updateRecordingUI() {
    const startBtn = document.getElementById('startRecordingBtn');
    const stopBtn = document.getElementById('stopRecordingBtn');
    const status = document.getElementById('recordingStatus');
    const statusDot = status.querySelector('.status-dot');
    const statusText = status.querySelector('.status-text');

    if (this.isRecording) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      statusDot.classList.add('recording');
      statusText.textContent = 'Recording';
    } else {
      startBtn.disabled = !this.currentProject;
      stopBtn.disabled = true;
      statusDot.classList.remove('recording');
      statusDot.classList.add('ready');
      statusText.textContent = this.currentProject ? 'Ready' : 'No Project';
    }
  }

  async startRecording() {
    if (!this.currentProject) {
      this.showToast('Error', 'Please load or create a project first', 'error');
      return;
    }

    const targetUrl = document.getElementById('targetUrl').value;
    const testName = document.getElementById('testName').value;
    const browser = document.getElementById('browser').value;
    const generatePageObjects = document.getElementById('generatePageObjects').checked;

    if (!targetUrl) {
      this.showToast('Error', 'Please enter a target URL', 'error');
      document.getElementById('targetUrl').focus();
      return;
    }

    if (!testName) {
      this.showToast('Error', 'Please enter a test name', 'error');
      document.getElementById('testName').focus();
      return;
    }

    const options = {
      baseUrl: targetUrl,
      testName: testName,
      browser: browser,
      generatePageObjects: generatePageObjects,
      outputPath: `./output/tests/${testName}.spec.js`
    };

    try {
      this.clearConsole('recordingConsole');
      this.appendToConsole('recordingConsole', `Starting recording for ${targetUrl}...`);
      
      const result = await window.electronAPI.startRecording(options);
      
      if (result.success) {
        this.isRecording = true;
        this.updateRecordingUI();
        this.showToast('Recording Started', 'Browser will open shortly', 'success');
        this.addActivity(`Started recording test "${testName}"`);
      } else {
        this.showToast('Error', result.error || 'Failed to start recording', 'error');
      }
    } catch (error) {
      this.showToast('Error', 'Failed to start recording: ' + error.message, 'error');
    }
  }

  async stopRecording() {
    try {
      const result = await window.electronAPI.stopRecording();
      
      if (result.success) {
        this.appendToConsole('recordingConsole', 'Stopping recording...');
      } else {
        this.showToast('Error', result.error || 'Failed to stop recording', 'error');
      }
    } catch (error) {
      this.showToast('Error', 'Failed to stop recording: ' + error.message, 'error');
    }
  }

  // Test Execution
  loadTestSelection() {
    const testSelection = document.getElementById('testSelection');
    testSelection.innerHTML = '';

    if (!this.currentProject || !this.currentProject.tests) {
      testSelection.innerHTML = '<p class="text-muted">No tests available</p>';
      return;
    }

    this.currentProject.tests.forEach(test => {
      const checkbox = document.createElement('div');
      checkbox.className = 'test-checkbox';
      checkbox.innerHTML = `
        <input type="checkbox" id="test-${test.id}" value="${test.id}" checked>
        <label for="test-${test.id}">${test.name}</label>
      `;
      testSelection.appendChild(checkbox);
    });
  }

  async runAllTests() {
    if (!this.currentProject) {
      this.showToast('Error', 'Please load or create a project first', 'error');
      return;
    }

    const browser = document.getElementById('executionBrowser').value;
    const workers = document.getElementById('workers').value;
    const headed = document.getElementById('headedMode').checked;
    const recordVideo = document.getElementById('recordVideo').checked;

    const options = {
      projectPath: window.pathAPI.dirname(this.currentProjectPath),
      browser: browser === 'all' ? undefined : browser,
      workers: parseInt(workers),
      headed: headed,
      recordVideo: recordVideo
    };

    try {
      this.clearConsole('executionConsole');
      this.appendToConsole('executionConsole', 'Starting test execution...');
      this.resetTestProgress();
      
      const result = await window.electronAPI.runTests(options);
      
      if (result.success) {
        this.isTestRunning = true;
        this.updateTestExecutionUI();
        this.showToast('Test Execution Started', 'Tests are now running', 'success');
        this.addActivity('Started test execution');
      } else {
        this.showToast('Error', result.error || 'Failed to start test execution', 'error');
      }
    } catch (error) {
      this.showToast('Error', 'Failed to start tests: ' + error.message, 'error');
    }
  }

  async stopTests() {
    try {
      const result = await window.electronAPI.stopTests();
      
      if (result.success) {
        this.appendToConsole('executionConsole', 'Stopping test execution...');
      } else {
        this.showToast('Error', result.error || 'Failed to stop tests', 'error');
      }
    } catch (error) {
      this.showToast('Error', 'Failed to stop tests: ' + error.message, 'error');
    }
  }

  updateTestExecutionUI() {
    const runBtn = document.getElementById('runAllTestsBtn');
    const stopBtn = document.getElementById('stopTestsBtn');
    const status = document.getElementById('executionStatus');
    const statusDot = status.querySelector('.status-dot');
    const statusText = status.querySelector('.status-text');

    if (this.isTestRunning) {
      runBtn.disabled = true;
      stopBtn.disabled = false;
      statusDot.classList.add('recording');
      statusText.textContent = 'Running Tests';
    } else {
      runBtn.disabled = false;
      stopBtn.disabled = true;
      statusDot.classList.remove('recording');
      statusDot.classList.add('ready');
      statusText.textContent = 'Ready';
    }
  }

  parseTestOutput(output) {
    // Simple test output parsing - in a real implementation, this would be more sophisticated
    const lines = output.split('\n');
    let testsRun = 0;
    let totalTests = 0;

    lines.forEach(line => {
      if (line.includes('Running') && line.includes('tests')) {
        const match = line.match(/(\d+)/g);
        if (match && match.length > 0) {
          totalTests = parseInt(match[match.length - 1]);
        }
      }
      if (line.includes('✓') || line.includes('✗')) {
        testsRun++;
      }
    });

    if (totalTests > 0) {
      this.updateTestProgress(testsRun, totalTests);
    }
  }

  updateTestProgress(completed, total) {
    const progressFill = document.getElementById('progressFill');
    const testsRunSpan = document.getElementById('testsRun');
    const totalTestsSpan = document.getElementById('totalTests');

    const percentage = (completed / total) * 100;
    progressFill.style.width = `${percentage}%`;
    testsRunSpan.textContent = completed;
    totalTestsSpan.textContent = total;
  }

  resetTestProgress() {
    this.updateTestProgress(0, 0);
    const testStatusGrid = document.getElementById('testStatusGrid');
    testStatusGrid.innerHTML = '';
  }

  // Page Objects and Tests
  loadPageObjects() {
    const pageObjectsList = document.getElementById('pageObjectsList');
    pageObjectsList.innerHTML = '';

    if (!this.currentProject || !this.currentProject.pageObjects) {
      pageObjectsList.innerHTML = '<p class="text-muted">No page objects found</p>';
      return;
    }

    this.currentProject.pageObjects.forEach(pageObject => {
      const item = document.createElement('div');
      item.className = 'page-object-item';
      item.innerHTML = `
        <i class="fas fa-file-code"></i>
        <div class="item-info">
          <div class="item-name">${pageObject.name}</div>
          <div class="item-meta">${pageObject.elements?.length || 0} elements</div>
        </div>
      `;
      
      item.addEventListener('click', () => this.selectPageObject(pageObject));
      pageObjectsList.appendChild(item);
    });
  }

  loadTests() {
    const testsList = document.getElementById('testsList');
    testsList.innerHTML = '';

    if (!this.currentProject || !this.currentProject.tests) {
      testsList.innerHTML = '<p class="text-muted">No tests found</p>';
      return;
    }

    this.currentProject.tests.forEach(test => {
      const item = document.createElement('div');
      item.className = 'test-item';
      item.innerHTML = `
        <i class="fas fa-flask"></i>
        <div class="item-info">
          <div class="item-name">${test.name}</div>
          <div class="item-meta">${test.steps?.length || 0} steps</div>
        </div>
      `;
      
      item.addEventListener('click', () => this.selectTest(test));
      testsList.appendChild(item);
    });
  }

  selectPageObject(pageObject) {
    // Remove previous selection
    document.querySelectorAll('.page-object-item').forEach(item => {
      item.classList.remove('selected');
    });

    // Add selection to current item
    event.currentTarget.classList.add('selected');

    // Update editor
    document.getElementById('currentFileName').textContent = pageObject.name + '.js';
    
    // In a real implementation, we would load the actual file content
    // For now, we'll show a placeholder
    const editorContent = this.generatePageObjectCode(pageObject);
    this.updateMonacoEditor('pageObjectEditor', editorContent, 'javascript');
    
    document.getElementById('savePageObjectBtn').disabled = false;
  }

  selectTest(test) {
    // Remove previous selection
    document.querySelectorAll('.test-item').forEach(item => {
      item.classList.remove('selected');
    });

    // Add selection to current item
    event.currentTarget.classList.add('selected');

    // Update editor
    document.getElementById('currentTestFileName').textContent = test.name + '.spec.js';
    
    // Generate test content
    const testContent = this.generateTestCode(test);
    this.updateMonacoEditor('testEditor', testContent, 'javascript');
    
    document.getElementById('saveTestBtn').disabled = false;
    document.getElementById('runSingleTestBtn').disabled = false;
  }

  generatePageObjectCode(pageObject) {
    return `import { Page } from '@playwright/test';

export class ${this.toPascalCase(pageObject.name)} {
  constructor(page: Page) {
    this.page = page;
  }

  // Page elements
${pageObject.elements?.map(element => 
  `  readonly ${element.name} = this.page.locator('${element.selector}');`
).join('\n') || '  // No elements defined'}

  // Page actions
${pageObject.methods?.map(method => 
  `  async ${method.name}(${method.params?.join(', ') || ''}) {
    ${method.code || '// Method implementation'}
  }`
).join('\n\n') || '  // No methods defined'}
}`;
  }

  generateTestCode(test) {
    return `import { test, expect } from '@playwright/test';
${test.pageObjects?.map(po => 
  `import { ${this.toPascalCase(po)} } from '../page-objects/${po}.js';`
).join('\n') || ''}

test.describe('${test.name}', () => {
  test('${test.description || test.name}', async ({ page }) => {
${test.steps?.map(step => 
  `    // ${step.description}
    ${step.code}`
).join('\n') || '    // No steps defined'}
  });
});`;
  }

  // Results
  loadResults() {
    // In a real implementation, this would load actual test results
    // For now, we'll show placeholder data
    this.updateResultsSummary({
      passed: 12,
      failed: 2,
      skipped: 1,
      duration: '2m 34s'
    });

    this.updateResultsTable([
      { name: 'Login Test', status: 'passed', duration: '15s', browser: 'chromium' },
      { name: 'Checkout Test', status: 'failed', duration: '45s', browser: 'firefox' },
      { name: 'Search Test', status: 'passed', duration: '8s', browser: 'webkit' }
    ]);
  }

  updateResultsSummary(results) {
    document.getElementById('passedCount').textContent = results.passed;
    document.getElementById('failedCount').textContent = results.failed;
    document.getElementById('skippedCount').textContent = results.skipped;
    document.getElementById('executionDuration').textContent = results.duration;
  }

  updateResultsTable(results) {
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = '';

    results.forEach(result => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${result.name}</td>
        <td><span class="status-badge ${result.status}">${result.status}</span></td>
        <td>${result.duration}</td>
        <td>${result.browser}</td>
        <td>
          <div class="action-buttons-table">
            <button class="btn btn-sm btn-secondary">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-secondary">
              <i class="fas fa-redo"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  // Settings
  loadSettings() {
    if (!this.currentProject) return;

    const config = this.currentProject.config || {};
    
    document.getElementById('defaultTimeout').value = config.timeout || 30000;
    document.getElementById('retries').value = config.retries || 1;
    document.getElementById('maxWorkers').value = config.parallel || 2;
    document.getElementById('viewportWidth').value = config.viewport?.width || 1280;
    document.getElementById('viewportHeight').value = config.viewport?.height || 720;
    
    // Browser checkboxes
    document.getElementById('chromiumEnabled').checked = config.browsers?.includes('chromium') ?? true;
    document.getElementById('firefoxEnabled').checked = config.browsers?.includes('firefox') ?? true;
    document.getElementById('webkitEnabled').checked = config.browsers?.includes('webkit') ?? true;
  }

  switchSettingPanel(settingId) {
    // Update navigation
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-setting="${settingId}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.setting-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    document.getElementById(`${settingId}-settings`).classList.add('active');
  }

  async saveSettings() {
    if (!this.currentProject) return;

    const browsers = [];
    if (document.getElementById('chromiumEnabled').checked) browsers.push('chromium');
    if (document.getElementById('firefoxEnabled').checked) browsers.push('firefox');
    if (document.getElementById('webkitEnabled').checked) browsers.push('webkit');

    this.currentProject.config = {
      ...this.currentProject.config,
      timeout: parseInt(document.getElementById('defaultTimeout').value),
      retries: parseInt(document.getElementById('retries').value),
      parallel: parseInt(document.getElementById('maxWorkers').value),
      browsers: browsers,
      viewport: {
        width: parseInt(document.getElementById('viewportWidth').value),
        height: parseInt(document.getElementById('viewportHeight').value)
      }
    };

    await this.saveProject();
  }

  // Utility methods
  showLoading(message = 'Loading...') {
    document.getElementById('loadingText').textContent = message;
    document.getElementById('loadingOverlay').classList.add('active');
  }

  hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
  }

  showToast(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconMap = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };

    toast.innerHTML = `
      <div class="toast-icon">
        <i class="fas ${iconMap[type]}"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close">
        <i class="fas fa-times"></i>
      </button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    document.getElementById('toastContainer').appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  }

  appendToConsole(consoleId, text, type = 'normal') {
    const console = document.getElementById(consoleId);
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = text;
    console.appendChild(line);
    console.scrollTop = console.scrollHeight;
  }

  clearConsole(consoleId) {
    document.getElementById(consoleId).innerHTML = '';
  }

  updateMonacoEditor(editorId, content, language) {
    // This will be implemented when Monaco editor is initialized
    if (window.monacoEditors && window.monacoEditors[editorId]) {
      window.monacoEditors[editorId].setValue(content);
      window.monaco.editor.setModelLanguage(
        window.monacoEditors[editorId].getModel(), 
        language
      );
    }
  }

  saveCurrentFile() {
    // Implementation depends on which editor is active
    if (this.activeTab === 'page-objects') {
      // Save page object
      this.showToast('Success', 'Page object saved', 'success');
    } else if (this.activeTab === 'tests') {
      // Save test
      this.showToast('Success', 'Test saved', 'success');
    }
  }

  loadInitialState() {
    this.updateProjectInfo();
    this.updateDashboard();
    this.updateRecordingUI();
    this.updateTestExecutionUI();
  }

  toPascalCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new TestAutomationApp();
});