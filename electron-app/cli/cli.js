#!/usr/bin/env node

const { Command } = require('commander');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const program = new Command();

program
  .name('test-automation-cli')
  .description('CLI for Playwright Test Automation Framework')
  .version('1.0.0');

// Record command
program
  .command('record')
  .description('Record a new test')
  .option('-u, --url <url>', 'target URL to record')
  .option('-n, --name <name>', 'test name')
  .option('-b, --browser <browser>', 'browser to use (chromium, firefox, webkit)', 'chromium')
  .option('-o, --output <path>', 'output file path')
  .option('--headed', 'run in headed mode')
  .action(async (options) => {
    console.log('🎬 Starting test recording...');
    
    if (!options.url) {
      console.error('❌ URL is required. Use --url to specify target URL');
      process.exit(1);
    }

    if (!options.name) {
      console.error('❌ Test name is required. Use --name to specify test name');
      process.exit(1);
    }

    const outputPath = options.output || `./tests/${options.name}.spec.js`;
    
    const args = [
      'codegen',
      '--target', 'javascript',
      '--output', outputPath
    ];

    if (!options.headed) {
      args.push('--browser', options.browser);
    }

    args.push(options.url);

    try {
      const recordingProcess = spawn('npx', ['playwright', ...args], {
        stdio: 'inherit',
        shell: true
      });

      recordingProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Recording saved to: ${outputPath}`);
        } else {
          console.error(`❌ Recording failed with exit code ${code}`);
          process.exit(code);
        }
      });

      recordingProcess.on('error', (error) => {
        console.error('❌ Failed to start recording:', error.message);
        process.exit(1);
      });

    } catch (error) {
      console.error('❌ Error during recording:', error.message);
      process.exit(1);
    }
  });

// Generate command
program
  .command('generate')
  .description('Generate page objects and tests from recordings')
  .option('-r, --recording <path>', 'path to recorded test file')
  .option('-t, --type <type>', 'generation type (page-object, test, both)', 'both')
  .option('-o, --output <path>', 'output directory', './generated')
  .action(async (options) => {
    console.log('🔧 Generating code from recording...');
    
    if (!options.recording) {
      console.error('❌ Recording file is required. Use --recording to specify file path');
      process.exit(1);
    }

    try {
      // Check if recording file exists
      await fs.access(options.recording);
      
      // Read the recording file
      const recordingContent = await fs.readFile(options.recording, 'utf8');
      
      // Parse and generate code (simplified version)
      if (options.type === 'page-object' || options.type === 'both') {
        await generatePageObject(recordingContent, options.output);
      }
      
      if (options.type === 'test' || options.type === 'both') {
        await generateTestFile(recordingContent, options.output);
      }
      
      console.log(`✅ Code generation completed in: ${options.output}`);
      
    } catch (error) {
      console.error('❌ Generation failed:', error.message);
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Run tests')
  .option('-f, --file <file>', 'specific test file to run')
  .option('-b, --browser <browser>', 'browser to use (chromium, firefox, webkit, all)', 'chromium')
  .option('-w, --workers <number>', 'number of parallel workers', '2')
  .option('--headed', 'run tests in headed mode')
  .option('--debug', 'run tests in debug mode')
  .option('--reporter <reporter>', 'test reporter (html, json, junit)', 'html')
  .action(async (options) => {
    console.log('🧪 Running tests...');
    
    const args = ['test'];
    
    if (options.file) {
      args.push(options.file);
    }
    
    if (options.browser && options.browser !== 'all') {
      args.push('--project', options.browser);
    }
    
    if (options.workers) {
      args.push('--workers', options.workers);
    }
    
    if (options.headed) {
      args.push('--headed');
    }
    
    if (options.debug) {
      args.push('--debug');
    }
    
    args.push('--reporter', options.reporter);
    
    try {
      const testProcess = spawn('npx', ['playwright', ...args], {
        stdio: 'inherit',
        shell: true
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ All tests completed successfully');
        } else {
          console.log(`⚠️  Tests completed with exit code ${code}`);
        }
        process.exit(code);
      });

      testProcess.on('error', (error) => {
        console.error('❌ Failed to run tests:', error.message);
        process.exit(1);
      });

    } catch (error) {
      console.error('❌ Error running tests:', error.message);
      process.exit(1);
    }
  });

// Install command
program
  .command('install')
  .description('Install Playwright browsers and dependencies')
  .option('--with-deps', 'install system dependencies')
  .action(async (options) => {
    console.log('📦 Installing Playwright browsers...');
    
    const args = ['playwright', 'install'];
    
    if (options.withDeps) {
      args.push('--with-deps');
    }
    
    try {
      const installProcess = spawn('npx', args, {
        stdio: 'inherit',
        shell: true
      });

      installProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Installation completed successfully');
        } else {
          console.error(`❌ Installation failed with exit code ${code}`);
          process.exit(code);
        }
      });

      installProcess.on('error', (error) => {
        console.error('❌ Installation error:', error.message);
        process.exit(1);
      });

    } catch (error) {
      console.error('❌ Error during installation:', error.message);
      process.exit(1);
    }
  });

// Init command
program
  .command('init')
  .description('Initialize a new test automation project')
  .option('-n, --name <name>', 'project name', 'my-test-project')
  .option('-d, --dir <directory>', 'project directory', '.')
  .action(async (options) => {
    console.log('🚀 Initializing test automation project...');
    
    const projectDir = path.resolve(options.dir);
    const projectName = options.name;
    
    try {
      // Create project structure
      await createProjectStructure(projectDir, projectName);
      
      console.log('✅ Project initialized successfully!');
      console.log('\nNext steps:');
      console.log(`  cd ${projectDir}`);
      console.log('  npm install');
      console.log('  npm run install-browsers');
      console.log('  npm start');
      
    } catch (error) {
      console.error('❌ Project initialization failed:', error.message);
      process.exit(1);
    }
  });

// Helper functions
async function generatePageObject(recordingContent, outputDir) {
  console.log('📄 Generating page object...');
  
  // Simplified page object generation
  // In a real implementation, this would parse the recording and extract elements/actions
  const pageObjectContent = `import { Page } from '@playwright/test';

export class GeneratedPage {
  constructor(page: Page) {
    this.page = page;
  }

  // Generated from recording
  // TODO: Parse actual elements and actions from recording
  
  async navigateToPage(url: string) {
    await this.page.goto(url);
  }
}`;

  const outputPath = path.join(outputDir, 'page-objects', 'generated-page.js');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, pageObjectContent);
  
  console.log(`✅ Page object created: ${outputPath}`);
}

async function generateTestFile(recordingContent, outputDir) {
  console.log('🧪 Generating test file...');
  
  // Simplified test generation
  const testContent = `import { test, expect } from '@playwright/test';
import { GeneratedPage } from '../page-objects/generated-page.js';

test.describe('Generated Tests', () => {
  test('generated test from recording', async ({ page }) => {
    const generatedPage = new GeneratedPage(page);
    
    // Generated from recording
    // TODO: Parse actual test steps from recording
    
    await generatedPage.navigateToPage('https://example.com');
    await expect(page).toHaveTitle(/Example/);
  });
});`;

  const outputPath = path.join(outputDir, 'tests', 'generated.spec.js');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, testContent);
  
  console.log(`✅ Test file created: ${outputPath}`);
}

async function createProjectStructure(projectDir, projectName) {
  // Create directories
  const dirs = [
    'tests',
    'page-objects',
    'test-data',
    'reports',
    'screenshots',
    'videos'
  ];
  
  for (const dir of dirs) {
    await fs.mkdir(path.join(projectDir, dir), { recursive: true });
  }
  
  // Create package.json
  const packageJson = {
    name: projectName,
    version: '1.0.0',
    description: 'Test automation project',
    scripts: {
      'test': 'playwright test',
      'test:headed': 'playwright test --headed',
      'test:debug': 'playwright test --debug',
      'record': 'test-automation-cli record',
      'generate': 'test-automation-cli generate',
      'install-browsers': 'playwright install'
    },
    dependencies: {
      '@playwright/test': '^1.40.0'
    },
    devDependencies: {
      'test-automation-framework': '^1.0.0'
    }
  };
  
  await fs.writeFile(
    path.join(projectDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Create playwright.config.js
  const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
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
  ],
});`;
  
  await fs.writeFile(
    path.join(projectDir, 'playwright.config.js'),
    playwrightConfig
  );
  
  // Create example test
  const exampleTest = `import { test, expect } from '@playwright/test';

test('example test', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await expect(page).toHaveTitle(/Playwright/);
});`;
  
  await fs.writeFile(
    path.join(projectDir, 'tests', 'example.spec.js'),
    exampleTest
  );
  
  // Create README
  const readme = `# ${projectName}

Test automation project using Playwright and the Test Automation Framework.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Install Playwright browsers:
   \`\`\`bash
   npm run install-browsers
   \`\`\`

3. Run tests:
   \`\`\`bash
   npm test
   \`\`\`

## Commands

- \`npm test\` - Run all tests
- \`npm run test:headed\` - Run tests in headed mode
- \`npm run test:debug\` - Run tests in debug mode
- \`npm run record -- --url <URL> --name <TEST_NAME>\` - Record a new test

## Project Structure

- \`tests/\` - Test files
- \`page-objects/\` - Page object model files
- \`test-data/\` - Test data files
- \`reports/\` - Test reports
- \`screenshots/\` - Screenshots on failure
- \`videos/\` - Videos on failure
`;
  
  await fs.writeFile(
    path.join(projectDir, 'README.md'),
    readme
  );
}

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}