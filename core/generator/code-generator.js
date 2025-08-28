const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');

class CodeGenerator {
  constructor(options = {}) {
    this.options = {
      outputDir: './generated',
      template: 'typescript',
      framework: 'playwright',
      optimize: true,
      overwrite: false,
      ...options
    };

    this.templates = new Map();
    this.helpers = new Map();
    this.setupHandlebarsHelpers();
  }

  setupHandlebarsHelpers() {
    // Register custom Handlebars helpers
    Handlebars.registerHelper('formatDate', (date) => {
      return new Date(date || Date.now()).toLocaleString();
    });

    Handlebars.registerHelper('now', () => {
      return new Date();
    });

    Handlebars.registerHelper('toCamelCase', (str) => {
      return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
      }).replace(/\s+/g, '');
    });

    Handlebars.registerHelper('toPascalCase', (str) => {
      return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
        return word.toUpperCase();
      }).replace(/\s+/g, '');
    });

    Handlebars.registerHelper('toUpperCase', (str) => {
      return str.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    });

    Handlebars.registerHelper('toKebabCase', (str) => {
      return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    });

    Handlebars.registerHelper('capitalize', (str) => {
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('ne', (a, b) => a !== b);
    Handlebars.registerHelper('gt', (a, b) => a > b);
    Handlebars.registerHelper('lt', (a, b) => a < b);

    Handlebars.registerHelper('hasFormElements', (elements) => {
      return elements.some(el => ['input', 'select', 'textarea'].includes(el.type));
    });

    Handlebars.registerHelper('hasClickableElements', (elements) => {
      return elements.some(el => ['button', 'a', 'div'].includes(el.type));
    });

    Handlebars.registerHelper('isFormElement', (element) => {
      return ['input', 'select', 'textarea'].includes(element.type);
    });

    Handlebars.registerHelper('isRequiredFormElement', (element) => {
      return ['input', 'select', 'textarea'].includes(element.type) && 
             element.attributes && element.attributes.required;
    });

    Handlebars.registerHelper('isTextElement', (element) => {
      return ['span', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label'].includes(element.type);
    });

    Handlebars.registerHelper('generateTestValue', (element) => {
      if (element.type === 'email') return 'test@example.com';
      if (element.type === 'password') return 'Test123!';
      if (element.type === 'tel') return '+1234567890';
      if (element.type === 'url') return 'https://example.com';
      if (element.name && element.name.includes('name')) return 'John Doe';
      return 'test value';
    });

    Handlebars.registerHelper('generateRandomTestValue', (element) => {
      const timestamp = Date.now();
      if (element.type === 'email') return `test${timestamp}@example.com`;
      if (element.type === 'password') return `Test${timestamp}!`;
      if (element.type === 'tel') return `+1${timestamp.toString().slice(-10)}`;
      if (element.name && element.name.includes('name')) return `User${timestamp}`;
      return `test${timestamp}`;
    });

    Handlebars.registerHelper('hasFormInputs', (steps) => {
      return steps.some(step => step.type === 'input');
    });

    Handlebars.registerHelper('isSubmitAction', (step) => {
      return step.type === 'click' && 
             step.element && 
             (step.element.tagName === 'button' || 
              step.element.attributes?.type === 'submit');
    });

    Handlebars.registerHelper('isLastStep', (index, steps) => {
      return index === steps.length - 1;
    });

    Handlebars.registerHelper('needsMobileAdjustment', (step) => {
      return step.type === 'click' || step.type === 'input';
    });

    Handlebars.registerHelper('isNetworkIntensive', (step) => {
      return step.type === 'navigation' || step.type === 'api_call';
    });

    Handlebars.registerHelper('hasApiCalls', (steps) => {
      return steps.some(step => step.type === 'api_call');
    });

    Handlebars.registerHelper('isVisualCheckpoint', (step) => {
      return step.type === 'navigation' || step.type === 'click';
    });

    Handlebars.registerHelper('generateScreenshotName', (step) => {
      return step.description?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'step';
    });

    Handlebars.registerHelper('generateFieldName', (step) => {
      return step.element?.name || step.element?.id || 'field';
    });

    Handlebars.registerHelper('generateValidTestData', (step) => {
      if (step.element?.type === 'email') return 'user@example.com';
      if (step.element?.type === 'password') return 'SecurePass123!';
      if (step.element?.name?.includes('phone')) return '+1-555-123-4567';
      return step.value || 'test data';
    });

    Handlebars.registerHelper('generateEdgeCaseData', (step) => {
      if (step.element?.type === 'email') return 'test+edge@example-domain.co.uk';
      if (step.element?.type === 'password') return 'Veryy_L0ng_P@ssw0rd_With_Special_Ch@rs!';
      if (step.element?.name?.includes('phone')) return '+44-20-7946-0958';
      return 'edge case test data with special characters: @#$%^&*()';
    });

    Handlebars.registerHelper('generateInvalidTestData', (step) => {
      if (step.element?.type === 'email') return 'invalid-email';
      if (step.element?.type === 'password') return '123';
      if (step.element?.name?.includes('phone')) return 'not-a-phone';
      return '';
    });

    Handlebars.registerHelper('generateRandomTestData', (step) => {
      const rand = Math.random().toString(36).substring(7);
      if (step.element?.type === 'email') return `test${rand}@example.com`;
      if (step.element?.type === 'password') return `Pass${rand}123!`;
      return `test-${rand}`;
    });
  }

  async generateFromRecording(recordingData, options = {}) {
    const generateOptions = {
      type: 'both', // 'pom', 'tests', 'both'
      dryRun: false,
      ...options
    };

    const results = {
      pageObjects: [],
      tests: [],
      totalFiles: 0
    };

    try {
      await this.ensureOutputDirectories();

      if (generateOptions.type === 'pom' || generateOptions.type === 'both') {
        const pageObjects = await this.generatePageObjects(recordingData, generateOptions);
        results.pageObjects.push(...pageObjects);
        results.totalFiles += pageObjects.length;
      }

      if (generateOptions.type === 'tests' || generateOptions.type === 'both') {
        const tests = await this.generateTests(recordingData, generateOptions);
        results.tests.push(...tests);
        results.totalFiles += tests.length;
      }

      return results;
    } catch (error) {
      throw new Error(`Code generation failed: ${error.message}`);
    }
  }

  async ensureOutputDirectories() {
    const dirs = [
      this.options.outputDir,
      path.join(this.options.outputDir, 'page-objects'),
      path.join(this.options.outputDir, 'tests'),
      path.join(this.options.outputDir, 'types'),
      path.join(this.options.outputDir, 'utils')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async generatePageObjects(recordingData, options) {
    const pageObjects = [];
    
    // Extract page objects from recording data
    const pageObjectsData = this.extractPageObjectsFromRecording(recordingData);

    for (const pageObjectData of pageObjectsData) {
      if (this.options.optimize) {
        pageObjectData = this.optimizePageObject(pageObjectData);
      }

      const fileName = this.generateFileName(pageObjectData.name, 'page-object');
      const filePath = path.join(this.options.outputDir, 'page-objects', fileName);

      if (!options.dryRun) {
        const content = await this.generatePageObjectCode(pageObjectData);
        
        if (!this.options.overwrite && await this.fileExists(filePath)) {
          console.warn(`File ${filePath} already exists, skipping...`);
          continue;
        }

        await fs.writeFile(filePath, content);
      }

      pageObjects.push(filePath);
    }

    return pageObjects;
  }

  async generateTests(recordingData, options) {
    const tests = [];
    
    const testData = this.extractTestDataFromRecording(recordingData);

    if (this.options.optimize) {
      testData = this.optimizeTestData(testData);
    }

    const fileName = this.generateFileName(testData.testName, 'test');
    const filePath = path.join(this.options.outputDir, 'tests', fileName);

    if (!options.dryRun) {
      const content = await this.generateTestCode(testData);
      
      if (!this.options.overwrite && await this.fileExists(filePath)) {
        console.warn(`File ${filePath} already exists, skipping...`);
        return tests;
      }

      await fs.writeFile(filePath, content);

      // Generate additional test utilities if needed
      await this.generateTestUtilities(testData, options);
    }

    tests.push(filePath);
    return tests;
  }

  extractPageObjectsFromRecording(recordingData) {
    const pageObjectsMap = new Map();

    // Group actions by page/URL
    for (const action of recordingData.actions || []) {
      const pageKey = this.getPageKey(action);
      
      if (!pageObjectsMap.has(pageKey)) {
        pageObjectsMap.set(pageKey, {
          name: this.generatePageObjectName(pageKey),
          url: action.url || recordingData.startUrl,
          elements: new Map(),
          methods: [],
          actions: []
        });
      }

      const pageObject = pageObjectsMap.get(pageKey);
      
      // Add elements
      if (action.selector && action.element) {
        const elementName = this.generateElementName(action.element, action.type);
        pageObject.elements.set(elementName, {
          name: elementName,
          selector: action.selector,
          type: action.element.tagName,
          description: this.generateElementDescription(action.element, action.type),
          attributes: action.element.attributes
        });
      }

      pageObject.actions.push(action);
    }

    // Generate methods for each page object
    for (const [key, pageObject] of pageObjectsMap) {
      pageObject.methods = this.generatePageObjectMethods(pageObject.actions, pageObject.elements);
    }

    return Array.from(pageObjectsMap.values());
  }

  extractTestDataFromRecording(recordingData) {
    return {
      testName: recordingData.testName || 'RecordedTest',
      startUrl: recordingData.url || recordingData.startUrl,
      steps: recordingData.actions || [],
      pageObjects: this.extractPageObjectsFromRecording(recordingData),
      imports: this.generateImports(recordingData)
    };
  }

  generatePageObjectMethods(actions, elements) {
    const methods = [];
    const processedSequences = new Set();

    // Group related actions into methods
    const actionGroups = this.groupActionsByFunction(actions);

    for (const [functionName, groupedActions] of actionGroups) {
      if (processedSequences.has(functionName)) continue;

      const method = {
        name: functionName,
        parameters: this.generateMethodParameters(groupedActions),
        body: this.generateMethodBody(groupedActions),
        jsdoc: this.generateMethodJSDoc(functionName, groupedActions),
        actions: groupedActions.length,
        isAsync: true
      };

      methods.push(method);
      processedSequences.add(functionName);
    }

    return methods;
  }

  groupActionsByFunction(actions) {
    const groups = new Map();
    
    for (const action of actions) {
      let functionName = this.inferFunctionName(action);
      
      if (!groups.has(functionName)) {
        groups.set(functionName, []);
      }
      groups.get(functionName).push(action);
    }

    // Merge similar groups
    const mergedGroups = new Map();
    for (const [name, actions] of groups) {
      const baseName = this.getBaseFunctionName(name);
      if (!mergedGroups.has(baseName)) {
        mergedGroups.set(baseName, []);
      }
      mergedGroups.get(baseName).push(...actions);
    }

    return mergedGroups;
  }

  inferFunctionName(action) {
    if (action.type === 'navigation') {
      return 'navigateToPage';
    }
    
    if (action.type === 'click' && action.element) {
      if (this.isSubmitButton(action.element)) {
        return 'submitForm';
      }
      
      if (action.element.textContent) {
        const cleanText = action.element.textContent.replace(/[^a-zA-Z]/g, '');
        return `click${this.toPascalCase(cleanText)}`;
      }
    }
    
    if (action.type === 'input') {
      const fieldName = action.element?.name || action.element?.id || 'field';
      return `enter${this.toPascalCase(fieldName)}`;
    }

    if (action.type === 'select') {
      const fieldName = action.element?.name || action.element?.id || 'dropdown';
      return `select${this.toPascalCase(fieldName)}`;
    }
    
    return `perform${this.toPascalCase(action.type)}`;
  }

  getBaseFunctionName(name) {
    // Remove numbers and suffixes to group similar functions
    return name.replace(/\d+$/, '').replace(/(Button|Link|Field)$/, '');
  }

  generateMethodParameters(actions) {
    const params = [];
    const paramNames = new Set();
    
    for (const action of actions) {
      if (action.type === 'input' && action.value) {
        const paramName = this.generateParameterName(action);
        if (!paramNames.has(paramName)) {
          params.push({
            name: paramName,
            type: 'string',
            description: `Text to enter in ${action.element?.name || 'field'}`,
            defaultValue: action.value
          });
          paramNames.add(paramName);
        }
      }
    }
    
    return params;
  }

  generateParameterName(action) {
    if (action.element?.name) {
      return this.toCamelCase(action.element.name);
    }
    if (action.element?.id) {
      return this.toCamelCase(action.element.id);
    }
    return 'value';
  }

  generateMethodBody(actions) {
    const lines = [];
    
    for (const action of actions) {
      const code = this.generateActionCode(action);
      if (code) {
        lines.push(`    ${code}`);
      }
    }
    
    return lines.join('\n');
  }

  generateActionCode(action) {
    switch (action.type) {
      case 'navigation':
        return `await this.page.goto('${action.url}');`;
      
      case 'click':
        return `await this.${this.getElementName(action)}.click();`;
      
      case 'input':
        const value = action.value ? `'${action.value}'` : `\${${this.generateParameterName(action)}}`;
        return `await this.${this.getElementName(action)}.fill(${value});`;
      
      case 'select':
        return `await this.${this.getElementName(action)}.selectOption('${action.value}');`;
      
      case 'hover':
        return `await this.${this.getElementName(action)}.hover();`;
      
      case 'wait':
        return this.generateWaitCode(action);
      
      default:
        return `// ${action.type} action`;
    }
  }

  getElementName(action) {
    if (action.element?.name) {
      return this.toCamelCase(action.element.name);
    }
    if (action.element?.id) {
      return this.toCamelCase(action.element.id);
    }
    return 'element';
  }

  generateWaitCode(action) {
    switch (action.strategy) {
      case 'visible':
        return `await this.${this.getElementName(action)}.waitFor({ state: 'visible' });`;
      case 'networkidle':
        return `await this.page.waitForLoadState('networkidle');`;
      default:
        return `await this.page.waitForTimeout(${action.timeout || 1000});`;
    }
  }

  generateMethodJSDoc(methodName, actions) {
    const lines = [
      '  /**',
      `   * ${this.generateMethodDescription(methodName, actions)}`,
    ];
    
    // Add parameter documentation
    const params = this.generateMethodParameters(actions);
    params.forEach(param => {
      lines.push(`   * @param {${param.type}} ${param.name} - ${param.description}`);
    });
    
    lines.push('   * @returns {Promise<void>}');
    lines.push('   */');
    
    return lines.join('\n');
  }

  generateMethodDescription(methodName, actions) {
    if (actions.length === 1) {
      return this.generateActionDescription(actions[0]);
    }
    
    const actionTypes = [...new Set(actions.map(a => a.type))];
    return `Performs ${actionTypes.join(', ')} actions (${actions.length} steps)`;
  }

  generateActionDescription(action) {
    switch (action.type) {
      case 'navigation':
        return `Navigate to ${action.url}`;
      case 'click':
        return `Click ${action.element?.textContent || 'element'}`;
      case 'input':
        return `Enter text in ${action.element?.name || 'field'}`;
      default:
        return `Perform ${action.type}`;
    }
  }

  async generatePageObjectCode(pageObjectData) {
    const templatePath = this.getTemplatePath('page-objects', 'page-object.hbs');
    const template = await this.loadTemplate(templatePath);
    
    const context = {
      pageObject: pageObjectData,
      elements: Array.from(pageObjectData.elements.values()),
      methods: pageObjectData.methods,
      imports: ['Page', 'Locator', 'expect']
    };
    
    return template(context);
  }

  async generateTestCode(testData) {
    const templatePath = this.getTemplatePath('tests', 'test-file.hbs');
    const template = await this.loadTemplate(templatePath);
    
    const context = {
      testName: testData.testName,
      startUrl: testData.startUrl,
      steps: testData.steps,
      pageObjects: testData.pageObjects,
      imports: testData.imports
    };
    
    return template(context);
  }

  async generateTestUtilities(testData, options) {
    // Generate test data factory
    const dataFactoryPath = path.join(this.options.outputDir, 'utils', 'test-data-factory.js');
    if (!await this.fileExists(dataFactoryPath) || this.options.overwrite) {
      const dataFactory = this.generateTestDataFactory(testData);
      await fs.writeFile(dataFactoryPath, dataFactory);
    }

    // Generate test helpers
    const helpersPath = path.join(this.options.outputDir, 'utils', 'test-helpers.js');
    if (!await this.fileExists(helpersPath) || this.options.overwrite) {
      const helpers = this.generateTestHelpers(testData);
      await fs.writeFile(helpersPath, helpers);
    }

    // Generate configuration files
    await this.generateConfigFiles(testData);
  }

  generateTestDataFactory(testData) {
    const formFields = this.extractFormFields(testData.steps);
    
    return `/**
 * Test Data Factory
 * Generated from recorded interactions
 */

export class TestDataFactory {
  static generateValid() {
    return {
${formFields.map(field => `      ${field.name}: '${field.validValue}',`).join('\n')}
    };
  }

  static generateInvalid() {
    return {
${formFields.map(field => `      ${field.name}: '${field.invalidValue}',`).join('\n')}
    };
  }

  static generateRandom() {
    const timestamp = Date.now();
    return {
${formFields.map(field => `      ${field.name}: '${field.randomValue}' + timestamp,`).join('\n')}
    };
  }

  static generateEdgeCase() {
    return {
${formFields.map(field => `      ${field.name}: '${field.edgeCaseValue}',`).join('\n')}
    };
  }
}`;
  }

  generateTestHelpers(testData) {
    return `/**
 * Test Helpers
 * Common utilities for test execution
 */

import { Page, expect } from '@playwright/test';

export class TestHelpers {
  static async waitForPageLoad(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // Additional buffer
  }

  static async handleUnexpectedPopups(page: Page): Promise<void> {
    const closeSelectors = [
      '[data-dismiss="modal"]',
      '.modal-close',
      '.popup-close',
      '[aria-label="Close"]'
    ];
    
    for (const selector of closeSelectors) {
      const element = page.locator(selector);
      if (await element.isVisible()) {
        await element.click();
        await page.waitForTimeout(500);
      }
    }
  }

  static async takeDebugScreenshot(page: Page, name: string): Promise<void> {
    await page.screenshot({ 
      path: \`./debug-screenshots/\${name}-\${Date.now()}.png\`,
      fullPage: true 
    });
  }

  static async logPerformanceMetrics(page: Page): Promise<void> {
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      return {
        loadTime: navigation.loadEventEnd - navigation.loadEventStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        firstPaint: performance.getEntriesByType('paint')[0]?.startTime
      };
    });
    
    console.log('Performance Metrics:', metrics);
  }

  static async validateFormErrors(page: Page): Promise<string[]> {
    const errorSelectors = [
      '.error',
      '.field-error',
      '[role="alert"]',
      '.validation-error'
    ];
    
    const errors: string[] = [];
    
    for (const selector of errorSelectors) {
      const elements = await page.locator(selector).all();
      for (const element of elements) {
        if (await element.isVisible()) {
          const text = await element.textContent();
          if (text) errors.push(text.trim());
        }
      }
    }
    
    return errors;
  }
}`;
  }

  async generateConfigFiles(testData) {
    // Generate playwright.config.js
    const configPath = path.join(this.options.outputDir, 'playwright.config.js');
    if (!await this.fileExists(configPath) || this.options.overwrite) {
      const config = this.generatePlaywrightConfig(testData);
      await fs.writeFile(configPath, config);
    }

    // Generate .env.example
    const envPath = path.join(this.options.outputDir, '.env.example');
    if (!await this.fileExists(envPath) || this.options.overwrite) {
      const envExample = this.generateEnvExample(testData);
      await fs.writeFile(envPath, envExample);
    }
  }

  generatePlaywrightConfig(testData) {
    return `import { defineConfig, devices } from '@playwright/test';

/**
 * Generated Playwright Configuration
 * Customize as needed for your testing requirements
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit-results.xml' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || '${testData.startUrl}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 30000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});`;
  }

  generateEnvExample(testData) {
    return `# Environment Configuration
# Copy this file to .env and update values as needed

# Base URL for tests
BASE_URL=${testData.startUrl}

# Test Environment
TEST_ENVIRONMENT=development

# Test User Credentials (for authentication tests)
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=TestPassword123!

# API Configuration
API_BASE_URL=https://api.example.com
API_KEY=your-api-key-here

# Database Configuration (if needed)
DATABASE_URL=postgresql://user:password@localhost:5432/testdb

# External Service Configuration
THIRD_PARTY_SERVICE_URL=https://external-service.com
THIRD_PARTY_API_KEY=your-external-api-key

# Feature Flags
ENABLE_FEATURE_X=true
ENABLE_BETA_FEATURES=false

# Timeouts (in milliseconds)
DEFAULT_TIMEOUT=30000
NAVIGATION_TIMEOUT=60000
ACTION_TIMEOUT=10000

# Parallel Execution
MAX_WORKERS=4
BROWSER_INSTANCES=chromium,firefox,webkit`;
  }

  extractFormFields(steps) {
    const fields = [];
    
    for (const step of steps) {
      if (step.type === 'input' && step.element) {
        const fieldName = step.element.name || step.element.id || 'field';
        const fieldType = step.element.type || 'text';
        
        fields.push({
          name: this.toCamelCase(fieldName),
          type: fieldType,
          validValue: this.generateValidValue(fieldType, step.value),
          invalidValue: this.generateInvalidValue(fieldType),
          randomValue: this.generateRandomValue(fieldType),
          edgeCaseValue: this.generateEdgeCaseValue(fieldType)
        });
      }
    }
    
    return fields;
  }

  generateValidValue(fieldType, originalValue) {
    if (originalValue) return originalValue;
    
    switch (fieldType) {
      case 'email': return 'test@example.com';
      case 'password': return 'SecurePass123!';
      case 'tel': return '+1-555-123-4567';
      case 'url': return 'https://example.com';
      case 'number': return '42';
      case 'date': return '2024-01-01';
      default: return 'test value';
    }
  }

  generateInvalidValue(fieldType) {
    switch (fieldType) {
      case 'email': return 'invalid-email';
      case 'password': return '123';
      case 'tel': return 'not-a-phone';
      case 'url': return 'invalid-url';
      case 'number': return 'not-a-number';
      case 'date': return 'invalid-date';
      default: return '';
    }
  }

  generateRandomValue(fieldType) {
    const rand = Math.random().toString(36).substring(7);
    switch (fieldType) {
      case 'email': return `test${rand}@example.com`;
      case 'password': return `Pass${rand}123!`;
      case 'tel': return `+1-555-${rand}`;
      case 'url': return `https://example-${rand}.com`;
      case 'number': return Math.floor(Math.random() * 1000).toString();
      default: return `test-${rand}`;
    }
  }

  generateEdgeCaseValue(fieldType) {
    switch (fieldType) {
      case 'email': return 'very.long.email.address+with+special+characters@example-domain.co.uk';
      case 'password': return 'Extremely_Long_Password_With_Special_Characters_123!@#$%^&*()';
      case 'tel': return '+1-800-VERY-LONG-PHONE-NUMBER-123';
      case 'url': return 'https://very-long-subdomain.example-domain.co.uk/very/long/path/with/many/segments';
      case 'number': return '999999999';
      default: return 'Edge case with special characters: !@#$%^&*()_+{}|:"<>?[]\\;\',./ and unicode: 🎭🎪🎨';
    }
  }

  // Optimization methods
  optimizePageObject(pageObjectData) {
    // Remove duplicate elements
    const uniqueElements = new Map();
    for (const [key, element] of pageObjectData.elements) {
      const elementKey = `${element.selector.primary}-${element.type}`;
      if (!uniqueElements.has(elementKey)) {
        uniqueElements.set(key, element);
      }
    }
    pageObjectData.elements = uniqueElements;

    // Merge similar methods
    pageObjectData.methods = this.mergeSimilarMethods(pageObjectData.methods);

    return pageObjectData;
  }

  optimizeTestData(testData) {
    // Remove redundant steps
    testData.steps = this.removeRedundantSteps(testData.steps);
    
    // Group related steps
    testData.steps = this.groupRelatedSteps(testData.steps);
    
    return testData;
  }

  mergeSimilarMethods(methods) {
    const mergedMethods = [];
    const processedMethods = new Set();

    for (const method of methods) {
      if (processedMethods.has(method.name)) continue;

      const similarMethods = methods.filter(m => 
        m.name !== method.name && 
        this.areMethodsSimilar(method, m) &&
        !processedMethods.has(m.name)
      );

      if (similarMethods.length > 0) {
        const mergedMethod = this.createMergedMethod(method, similarMethods);
        mergedMethods.push(mergedMethod);
        
        processedMethods.add(method.name);
        similarMethods.forEach(m => processedMethods.add(m.name));
      } else {
        mergedMethods.push(method);
        processedMethods.add(method.name);
      }
    }

    return mergedMethods;
  }

  areMethodsSimilar(method1, method2) {
    // Check if methods perform similar actions
    const similarity = this.calculateMethodSimilarity(method1, method2);
    return similarity > 0.7; // 70% similarity threshold
  }

  calculateMethodSimilarity(method1, method2) {
    // Simple similarity calculation based on method body
    const body1 = method1.body.toLowerCase();
    const body2 = method2.body.toLowerCase();
    
    const words1 = new Set(body1.split(/\s+/));
    const words2 = new Set(body2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  createMergedMethod(mainMethod, similarMethods) {
    // Create a more generic method that combines similar functionality
    const allMethods = [mainMethod, ...similarMethods];
    
    return {
      name: this.generateGenericMethodName(allMethods),
      parameters: this.mergeParameters(allMethods),
      body: this.generateGenericMethodBody(allMethods),
      jsdoc: this.generateGenericJSDoc(allMethods),
      actions: allMethods.reduce((sum, m) => sum + m.actions, 0),
      isAsync: true
    };
  }

  generateGenericMethodName(methods) {
    const commonWords = this.findCommonWords(methods.map(m => m.name));
    return commonWords.length > 0 ? commonWords.join('') + 'Action' : 'performAction';
  }

  findCommonWords(names) {
    const wordSets = names.map(name => 
      name.replace(/([A-Z])/g, ' $1').trim().toLowerCase().split(/\s+/)
    );
    
    if (wordSets.length === 0) return [];
    
    return wordSets[0].filter(word => 
      wordSets.every(wordSet => wordSet.includes(word))
    );
  }

  removeRedundantSteps(steps) {
    const filtered = [];
    
    for (let i = 0; i < steps.length; i++) {
      const current = steps[i];
      const next = steps[i + 1];
      
      // Skip redundant consecutive actions
      if (next && this.areStepsRedundant(current, next)) {
        continue;
      }
      
      filtered.push(current);
    }
    
    return filtered;
  }

  areStepsRedundant(step1, step2) {
    return step1.type === step2.type && 
           step1.selector?.primary === step2.selector?.primary &&
           (step1.type === 'click' || step1.type === 'hover');
  }

  groupRelatedSteps(steps) {
    // Group form-related steps together
    const grouped = [];
    let currentGroup = [];
    
    for (const step of steps) {
      if (this.isFormStep(step)) {
        currentGroup.push(step);
      } else {
        if (currentGroup.length > 0) {
          grouped.push(...currentGroup);
          currentGroup = [];
        }
        grouped.push(step);
      }
    }
    
    if (currentGroup.length > 0) {
      grouped.push(...currentGroup);
    }
    
    return grouped;
  }

  isFormStep(step) {
    return ['input', 'select', 'click'].includes(step.type) && 
           step.element && 
           ['input', 'select', 'textarea', 'button'].includes(step.element.tagName);
  }

  // Utility methods
  getTemplatePath(category, templateName) {
    return path.join(__dirname, '../../templates', category, templateName);
  }

  async loadTemplate(templatePath) {
    if (this.templates.has(templatePath)) {
      return this.templates.get(templatePath);
    }
    
    const templateContent = await fs.readFile(templatePath, 'utf8');
    const compiledTemplate = Handlebars.compile(templateContent);
    
    this.templates.set(templatePath, compiledTemplate);
    return compiledTemplate;
  }

  generateFileName(baseName, type) {
    const kebabCase = this.toKebabCase(baseName);
    const extension = this.options.template === 'typescript' ? '.ts' : '.js';
    
    switch (type) {
      case 'page-object':
        return `${kebabCase}.page${extension}`;
      case 'test':
        return `${kebabCase}.spec${extension}`;
      default:
        return `${kebabCase}${extension}`;
    }
  }

  generatePageObjectName(pageKey) {
    return pageKey.charAt(0).toUpperCase() + 
           pageKey.slice(1).replace(/[^a-zA-Z0-9]/g, '') + 'Page';
  }

  generateElementName(element, actionType) {
    if (element.id) {
      return this.toCamelCase(element.id);
    }
    
    if (element.name) {
      return this.toCamelCase(element.name);
    }
    
    if (element.textContent) {
      const text = element.textContent.replace(/[^a-zA-Z0-9]/g, '');
      return this.toCamelCase(text) + this.capitalize(element.tagName);
    }
    
    return `${actionType}${this.capitalize(element.tagName)}`;
  }

  generateElementDescription(element, actionType) {
    if (element.textContent) {
      return `${this.capitalize(actionType)} "${element.textContent.substring(0, 30)}"`;
    }
    
    return `${this.capitalize(element.tagName)} for ${actionType}`;
  }

  getPageKey(action) {
    if (action.url) {
      try {
        const url = new URL(action.url);
        return url.pathname.replace(/[^a-zA-Z0-9]/g, '') || 'home';
      } catch (error) {
        return 'page';
      }
    }
    return 'page';
  }

  generateImports(recordingData) {
    const pageObjects = this.extractPageObjectsFromRecording(recordingData);
    return pageObjects.map(po => ({
      name: po.name,
      path: `../page-objects/${this.toKebabCase(po.name)}.page`
    }));
  }

  isSubmitButton(element) {
    return element.attributes?.type === 'submit' ||
           (element.tagName === 'button' && !element.attributes?.type) ||
           element.textContent?.toLowerCase().includes('submit');
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  // String utility methods
  toCamelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  toPascalCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
      return word.toUpperCase();
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

module.exports = CodeGenerator;