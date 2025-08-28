const { chromium, firefox, webkit } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const SelectorGenerator = require('./selector-generator');
const ActionParser = require('./action-parser');

class PlaywrightRecorder extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      browser: 'chromium',
      headless: false,
      viewport: { width: 1280, height: 720 },
      timeout: 30000,
      generatePageObjects: true,
      optimizeActions: true,
      outputDir: './output',
      ...options
    };
    
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isRecording = false;
    this.recordedActions = [];
    this.pageObjects = new Map();
    this.currentPageObject = null;
    
    this.selectorGenerator = new SelectorGenerator();
    this.actionParser = new ActionParser();
  }

  async startRecording(url, testName) {
    try {
      this.emit('status', 'Starting browser...');
      
      // Launch browser
      const browserType = this.getBrowserType();
      this.browser = await browserType.launch({
        headless: this.options.headless,
        args: ['--disable-web-security', '--disable-features=VizDisplayCompositor']
      });

      // Create context with recording capabilities
      this.context = await this.browser.newContext({
        viewport: this.options.viewport,
        recordVideo: {
          dir: path.join(this.options.outputDir, 'videos'),
          size: this.options.viewport
        },
        recordHar: {
          path: path.join(this.options.outputDir, 'network', `${testName}.har`)
        }
      });

      // Create page and setup recording
      this.page = await this.context.newPage();
      this.setupPageRecording();
      
      this.isRecording = true;
      this.recordedActions = [];
      this.testName = testName;
      this.startUrl = url;
      
      this.emit('status', `Recording started for ${url}`);
      this.emit('started', { url, testName });
      
      // Navigate to initial URL
      await this.page.goto(url);
      this.recordAction({
        type: 'navigation',
        url,
        timestamp: Date.now()
      });
      
      return true;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  setupPageRecording() {
    // Record navigation events
    this.page.on('framenavigated', (frame) => {
      if (frame === this.page.mainFrame()) {
        this.recordAction({
          type: 'navigation',
          url: frame.url(),
          timestamp: Date.now()
        });
      }
    });

    // Record console logs for debugging
    this.page.on('console', (msg) => {
      this.emit('console', {
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now()
      });
    });

    // Record network requests (optional)
    this.page.on('request', (request) => {
      if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
        this.recordAction({
          type: 'api_call',
          url: request.url(),
          method: request.method(),
          timestamp: Date.now()
        });
      }
    });

    // Record user interactions
    this.setupInteractionRecording();
  }

  setupInteractionRecording() {
    // Click events
    this.page.on('click', async (event) => {
      if (!this.isRecording) return;
      
      const element = await this.getElementInfo(event.target);
      const selector = await this.selectorGenerator.generateSelector(this.page, event.target);
      
      this.recordAction({
        type: 'click',
        selector,
        element,
        coordinates: { x: event.x, y: event.y },
        timestamp: Date.now()
      });
    });

    // Input events
    this.page.on('input', async (event) => {
      if (!this.isRecording) return;
      
      const element = await this.getElementInfo(event.target);
      const selector = await this.selectorGenerator.generateSelector(this.page, event.target);
      
      this.recordAction({
        type: 'input',
        selector,
        element,
        value: await event.target.inputValue(),
        timestamp: Date.now()
      });
    });

    // Form submission
    this.page.on('submit', async (event) => {
      if (!this.isRecording) return;
      
      const element = await this.getElementInfo(event.target);
      const selector = await this.selectorGenerator.generateSelector(this.page, event.target);
      
      this.recordAction({
        type: 'submit',
        selector,
        element,
        timestamp: Date.now()
      });
    });

    // Keyboard events
    this.page.on('keydown', async (event) => {
      if (!this.isRecording) return;
      
      // Only record special keys
      if (['Enter', 'Escape', 'Tab'].includes(event.key)) {
        this.recordAction({
          type: 'keypress',
          key: event.key,
          timestamp: Date.now()
        });
      }
    });

    // Hover events (for tooltips, dropdowns, etc.)
    this.page.on('hover', async (event) => {
      if (!this.isRecording) return;
      
      const element = await this.getElementInfo(event.target);
      const selector = await this.selectorGenerator.generateSelector(this.page, event.target);
      
      this.recordAction({
        type: 'hover',
        selector,
        element,
        timestamp: Date.now()
      });
    });
  }

  async getElementInfo(elementHandle) {
    try {
      const info = await elementHandle.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id,
          className: el.className,
          textContent: el.textContent?.trim().substring(0, 50) || '',
          attributes: Array.from(el.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
          }, {}),
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        };
      });
      
      return info;
    } catch (error) {
      return { tagName: 'unknown', error: error.message };
    }
  }

  recordAction(action) {
    this.recordedActions.push(action);
    this.emit('action', action);
    
    // Update current page object
    if (this.options.generatePageObjects) {
      this.updatePageObject(action);
    }
  }

  updatePageObject(action) {
    const currentUrl = this.page?.url() || this.startUrl;
    const pageObjectName = this.getPageObjectName(currentUrl);
    
    if (!this.pageObjects.has(pageObjectName)) {
      this.pageObjects.set(pageObjectName, {
        name: pageObjectName,
        url: currentUrl,
        elements: new Map(),
        methods: [],
        actions: []
      });
    }
    
    const pageObject = this.pageObjects.get(pageObjectName);
    
    // Add element if it has a selector
    if (action.selector && action.element) {
      const elementName = this.generateElementName(action.element, action.type);
      pageObject.elements.set(elementName, {
        name: elementName,
        selector: action.selector,
        type: action.element.tagName,
        description: this.generateElementDescription(action.element, action.type)
      });
    }
    
    // Add action to page object
    pageObject.actions.push(action);
    
    this.currentPageObject = pageObject;
  }

  getPageObjectName(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      
      // Remove leading/trailing slashes and convert to camelCase
      pathname = pathname.replace(/^\/+|\/+$/g, '');
      if (!pathname) pathname = 'home';
      
      // Convert to PascalCase
      const name = pathname
        .split(/[-_\/]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
      
      return `${name}Page`;
    } catch (error) {
      return 'HomePage';
    }
  }

  generateElementName(element, actionType) {
    // Generate meaningful element names
    if (element.id) {
      return this.toCamelCase(element.id);
    }
    
    if (element.attributes?.name) {
      return this.toCamelCase(element.attributes.name);
    }
    
    if (element.attributes?.['data-testid']) {
      return this.toCamelCase(element.attributes['data-testid']);
    }
    
    // Use text content for buttons, links
    if (['button', 'a'].includes(element.tagName) && element.textContent) {
      const text = element.textContent.replace(/[^a-zA-Z0-9]/g, '');
      return this.toCamelCase(text) + this.capitalize(element.tagName);
    }
    
    // Use type + action
    const typeMap = {
      input: 'Input',
      button: 'Button',
      a: 'Link',
      select: 'Select',
      textarea: 'TextArea'
    };
    
    const elementType = typeMap[element.tagName] || 'Element';
    const actionPrefix = actionType === 'click' ? 'clickable' : '';
    
    return `${actionPrefix}${elementType}${Date.now()}`.substring(0, 30);
  }

  generateElementDescription(element, actionType) {
    if (element.textContent) {
      return `${this.capitalize(actionType)} "${element.textContent.substring(0, 30)}"`;
    }
    
    if (element.attributes?.placeholder) {
      return `${this.capitalize(element.tagName)} with placeholder "${element.attributes.placeholder}"`;
    }
    
    return `${this.capitalize(element.tagName)} element`;
  }

  async stopRecording() {
    if (!this.isRecording) {
      throw new Error('No recording in progress');
    }
    
    try {
      this.isRecording = false;
      this.emit('status', 'Processing recording...');
      
      // Generate output files
      const results = await this.generateOutputFiles();
      
      // Close browser
      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
      
      this.emit('status', 'Recording stopped');
      this.emit('stopped', results);
      
      return results;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async generateOutputFiles() {
    const results = {
      testFile: null,
      pageObjects: [],
      actions: this.recordedActions.length,
      duration: this.getDuration()
    };
    
    try {
      // Ensure output directories exist
      await this.ensureDirectories();
      
      // Generate page objects
      if (this.options.generatePageObjects && this.pageObjects.size > 0) {
        for (const [name, pageObject] of this.pageObjects) {
          const filePath = await this.generatePageObjectFile(pageObject);
          results.pageObjects.push({ name, filePath });
        }
      }
      
      // Generate test file
      const testFilePath = await this.generateTestFile();
      results.testFile = testFilePath;
      
      // Generate summary report
      await this.generateSummaryReport(results);
      
      return results;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async ensureDirectories() {
    const dirs = [
      path.join(this.options.outputDir, 'tests'),
      path.join(this.options.outputDir, 'page-objects'),
      path.join(this.options.outputDir, 'videos'),
      path.join(this.options.outputDir, 'network'),
      path.join(this.options.outputDir, 'reports')
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async generatePageObjectFile(pageObject) {
    const optimizedMethods = this.actionParser.generateMethods(pageObject.actions, pageObject.elements);
    pageObject.methods = optimizedMethods;
    
    // Use Handlebars template
    const templatePath = path.join(__dirname, '../../templates/page-objects/page-object.hbs');
    const template = await fs.readFile(templatePath, 'utf8');
    const Handlebars = require('handlebars');
    
    const compiledTemplate = Handlebars.compile(template);
    const content = compiledTemplate({
      pageObject,
      elements: Array.from(pageObject.elements.values()),
      methods: pageObject.methods,
      imports: ['Page', 'Locator', 'expect']
    });
    
    const filePath = path.join(
      this.options.outputDir,
      'page-objects',
      `${this.toKebabCase(pageObject.name)}.js`
    );
    
    await fs.writeFile(filePath, content);
    return filePath;
  }

  async generateTestFile() {
    // Optimize actions into test steps
    const optimizedSteps = this.actionParser.optimizeActions(this.recordedActions);
    
    const templatePath = path.join(__dirname, '../../templates/tests/test-file.hbs');
    const template = await fs.readFile(templatePath, 'utf8');
    const Handlebars = require('handlebars');
    
    const compiledTemplate = Handlebars.compile(template);
    const content = compiledTemplate({
      testName: this.testName,
      startUrl: this.startUrl,
      steps: optimizedSteps,
      pageObjects: Array.from(this.pageObjects.values()),
      imports: this.generateImports()
    });
    
    const filePath = path.join(
      this.options.outputDir,
      'tests',
      `${this.toKebabCase(this.testName)}.spec.js`
    );
    
    await fs.writeFile(filePath, content);
    return filePath;
  }

  generateImports() {
    const imports = [];
    for (const [name, pageObject] of this.pageObjects) {
      imports.push({
        name: pageObject.name,
        path: `../page-objects/${this.toKebabCase(pageObject.name)}.js`
      });
    }
    return imports;
  }

  async generateSummaryReport(results) {
    const report = {
      testName: this.testName,
      url: this.startUrl,
      timestamp: new Date().toISOString(),
      duration: this.getDuration(),
      actions: this.recordedActions.length,
      pageObjects: results.pageObjects.length,
      files: {
        testFile: results.testFile,
        pageObjects: results.pageObjects
      },
      browser: this.options.browser,
      viewport: this.options.viewport
    };
    
    const reportPath = path.join(
      this.options.outputDir,
      'reports',
      `${this.toKebabCase(this.testName)}-report.json`
    );
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
  }

  getBrowserType() {
    switch (this.options.browser.toLowerCase()) {
      case 'firefox':
        return firefox;
      case 'webkit':
      case 'safari':
        return webkit;
      case 'chromium':
      case 'chrome':
      default:
        return chromium;
    }
  }

  getDuration() {
    if (this.recordedActions.length === 0) return 0;
    const start = this.recordedActions[0].timestamp;
    const end = this.recordedActions[this.recordedActions.length - 1].timestamp;
    return Math.round((end - start) / 1000); // seconds
  }

  // Utility methods
  toCamelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  toKebabCase(str) {
    return str
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

module.exports = PlaywrightRecorder;