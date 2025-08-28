#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const boxen = require('boxen');

// Import our core framework modules
const PlaywrightRecorder = require('../core/recorder/playwright-recorder');
const CodeGenerator = require('../core/generator/code-generator');
const TestExecutor = require('../core/executor/test-executor');
const ProjectManager = require('../core/project/project-manager');
const ConfigManager = require('../core/config/config-manager');

const program = new Command();
const packageJson = require('../package.json');

program
  .name('test-automation-cli')
  .description('🎭 Advanced Playwright Test Automation Framework CLI')
  .version(packageJson.version);

// Global options
program
  .option('-v, --verbose', 'enable verbose logging')
  .option('-q, --quiet', 'suppress non-essential output')
  .option('--config <path>', 'path to configuration file', './automation.config.js')
  .hook('preAction', async (thisCommand) => {
    // Load configuration
    const configPath = thisCommand.opts().config;
    try {
      const config = await ConfigManager.load(configPath);
      thisCommand.configManager = new ConfigManager(config);
    } catch (error) {
      if (thisCommand.opts().verbose) {
        console.warn(chalk.yellow('⚠️  Could not load config file, using defaults'));
      }
      thisCommand.configManager = new ConfigManager();
    }
  });

// Initialize command
program
  .command('init')
  .description('🚀 Initialize a new test automation project')
  .option('-n, --name <name>', 'project name')
  .option('-d, --directory <dir>', 'project directory', '.')
  .option('-t, --template <template>', 'project template (basic, advanced, enterprise)', 'basic')
  .option('--skip-install', 'skip npm install')
  .option('--git', 'initialize git repository')
  .action(async (options) => {
    const spinner = ora('Initializing project...').start();
    
    try {
      const projectManager = new ProjectManager();
      
      // Interactive prompts if options not provided
      if (!options.name) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Project name:',
            default: path.basename(process.cwd())
          },
          {
            type: 'list',
            name: 'template',
            message: 'Project template:',
            choices: [
              { name: '📦 Basic - Simple setup with essential features', value: 'basic' },
              { name: '⚡ Advanced - Full featured with CI/CD integration', value: 'advanced' },
              { name: '🏢 Enterprise - Complete setup with monitoring', value: 'enterprise' }
            ],
            default: options.template
          },
          {
            type: 'confirm',
            name: 'git',
            message: 'Initialize Git repository?',
            default: true
          }
        ]);
        
        Object.assign(options, answers);
      }
      
      spinner.text = `Creating project "${options.name}"...`;
      
      const projectPath = path.resolve(options.directory, options.name);
      const result = await projectManager.createProject({
        name: options.name,
        path: projectPath,
        template: options.template,
        skipInstall: options.skipInstall,
        initGit: options.git
      });
      
      spinner.succeed('✅ Project created successfully!');
      
      console.log(boxen(
        `🎉 Project "${options.name}" is ready!\n\n` +
        `📁 Location: ${projectPath}\n` +
        `📝 Template: ${options.template}\n\n` +
        `Next steps:\n` +
        `  cd ${options.name}\n` +
        `  ${options.skipInstall ? 'npm install\n  ' : ''}npm run setup\n` +
        `  npm start`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green'
        }
      ));
      
    } catch (error) {
      spinner.fail('❌ Project initialization failed');
      console.error(chalk.red(error.message));
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Record command
program
  .command('record')
  .description('🎬 Record user interactions to generate tests')
  .requiredOption('-u, --url <url>', 'target URL to record')
  .option('-n, --name <name>', 'test name', 'recorded-test')
  .option('-b, --browser <browser>', 'browser to use (chromium, firefox, webkit)', 'chromium')
  .option('-o, --output <dir>', 'output directory', './output')
  .option('--headed', 'run browser in headed mode')
  .option('--device <device>', 'emulate device (iPhone, iPad, etc.)')
  .option('--viewport <size>', 'viewport size (1280x720)', '1280x720')
  .option('--generate-pom', 'generate page object models', true)
  .option('--optimize', 'optimize recorded actions', true)
  .option('--timeout <ms>', 'recording timeout in milliseconds', '300000')
  .action(async (options) => {
    const spinner = ora('🎬 Starting recording session...').start();
    
    try {
      // Parse viewport
      const [width, height] = options.viewport.split('x').map(Number);
      
      const recorderOptions = {
        browser: options.browser,
        headless: !options.headed,
        viewport: { width, height },
        device: options.device,
        generatePageObjects: options.generatePom,
        optimizeActions: options.optimize,
        outputDir: options.output,
        timeout: parseInt(options.timeout)
      };
      
      const recorder = new PlaywrightRecorder(recorderOptions);
      
      // Set up event listeners
      recorder.on('status', (message) => {
        spinner.text = message;
      });
      
      recorder.on('action', (action) => {
        if (program.opts().verbose) {
          console.log(chalk.dim(`  ${action.type}: ${action.description || ''}`));
        }
      });
      
      recorder.on('error', (error) => {
        spinner.fail(`❌ Recording error: ${error.message}`);
        process.exit(1);
      });
      
      // Start recording
      spinner.text = '🔴 Recording in progress... Interact with the browser';
      await recorder.startRecording(options.url, options.name);
      
      // Wait for user to stop recording (Ctrl+C)
      process.on('SIGINT', async () => {
        spinner.text = 'Stopping recording and generating files...';
        try {
          const results = await recorder.stopRecording();
          spinner.succeed('✅ Recording completed successfully!');
          
          console.log(boxen(
            `📹 Recording Summary\n\n` +
            `🎯 Test: ${options.name}\n` +
            `⚡ Actions: ${results.actions}\n` +
            `📄 Page Objects: ${results.pageObjects.length}\n` +
            `⏱️  Duration: ${results.duration}s\n\n` +
            `Generated files:\n` +
            `  📝 Test: ${results.testFile}\n` +
            `${results.pageObjects.map(po => `  📄 POM: ${po.filePath}`).join('\n')}`,
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue'
            }
          ));
          
          process.exit(0);
        } catch (error) {
          spinner.fail('❌ Failed to stop recording');
          console.error(chalk.red(error.message));
          process.exit(1);
        }
      });
      
      // Keep process alive
      await new Promise(() => {});
      
    } catch (error) {
      spinner.fail('❌ Failed to start recording');
      console.error(chalk.red(error.message));
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Generate command
program
  .command('generate')
  .description('🔧 Generate page objects and tests from recordings')
  .option('-r, --recording <path>', 'recording file or directory')
  .option('-t, --type <type>', 'generation type (pom, tests, both)', 'both')
  .option('-o, --output <dir>', 'output directory', './generated')
  .option('--template <template>', 'code template (typescript, javascript)', 'typescript')
  .option('--framework <framework>', 'test framework (playwright, cypress)', 'playwright')
  .option('--optimize', 'optimize generated code', true)
  .option('--dry-run', 'show what would be generated without creating files')
  .action(async (options) => {
    const spinner = ora('🔧 Analyzing recordings...').start();
    
    try {
      const codeGenerator = new CodeGenerator({
        outputDir: options.output,
        template: options.template,
        framework: options.framework,
        optimize: options.optimize
      });
      
      let recordingFiles = [];
      
      // Determine input files
      if (options.recording) {
        const stat = await fs.stat(options.recording);
        if (stat.isDirectory()) {
          const files = await fs.readdir(options.recording);
          recordingFiles = files
            .filter(f => f.endsWith('.json') || f.endsWith('.har'))
            .map(f => path.join(options.recording, f));
        } else {
          recordingFiles = [options.recording];
        }
      } else {
        // Look for recordings in default locations
        const searchPaths = ['./recordings', './output/reports', './test-results'];
        for (const searchPath of searchPaths) {
          try {
            const files = await fs.readdir(searchPath);
            const recordings = files
              .filter(f => f.includes('report.json'))
              .map(f => path.join(searchPath, f));
            recordingFiles.push(...recordings);
          } catch (error) {
            // Directory doesn't exist, continue
          }
        }
      }
      
      if (recordingFiles.length === 0) {
        throw new Error('No recording files found. Use --recording to specify files.');
      }
      
      spinner.text = `Processing ${recordingFiles.length} recording(s)...`;
      
      const results = {
        pageObjects: [],
        tests: [],
        totalFiles: 0
      };
      
      for (const recordingFile of recordingFiles) {
        spinner.text = `Processing ${path.basename(recordingFile)}...`;
        
        const recording = JSON.parse(await fs.readFile(recordingFile, 'utf8'));
        const generated = await codeGenerator.generateFromRecording(recording, {
          type: options.type,
          dryRun: options.dryRun
        });
        
        results.pageObjects.push(...generated.pageObjects);
        results.tests.push(...generated.tests);
        results.totalFiles += generated.totalFiles;
      }
      
      spinner.succeed('✅ Code generation completed!');
      
      if (options.dryRun) {
        console.log(chalk.yellow('📋 Dry run - no files were created'));
      }
      
      console.log(boxen(
        `🔧 Generation Summary\n\n` +
        `📁 Output: ${options.output}\n` +
        `📄 Page Objects: ${results.pageObjects.length}\n` +
        `🧪 Tests: ${results.tests.length}\n` +
        `📝 Total Files: ${results.totalFiles}\n` +
        `💻 Template: ${options.template}\n\n` +
        `${options.dryRun ? 'Would generate:' : 'Generated:'}\n` +
        `${results.pageObjects.map(po => `  📄 ${po}`).join('\n')}\n` +
        `${results.tests.map(test => `  🧪 ${test}`).join('\n')}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan'
        }
      ));
      
    } catch (error) {
      spinner.fail('❌ Code generation failed');
      console.error(chalk.red(error.message));
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('🧪 Execute test suites')
  .option('-f, --files <pattern>', 'test file pattern', '**/*.spec.{js,ts}')
  .option('-t, --tag <tags>', 'filter by tags (comma-separated)')
  .option('-b, --browser <browsers>', 'browsers to test (comma-separated)', 'chromium')
  .option('-e, --env <environment>', 'test environment', 'development')
  .option('-w, --workers <count>', 'parallel worker count', '2')
  .option('--headed', 'run tests in headed mode')
  .option('--debug', 'run tests in debug mode')
  .option('--record', 'record test execution videos')
  .option('--trace', 'enable playwright trace')
  .option('--reporter <reporter>', 'test reporter', 'html')
  .option('--retry <count>', 'retry failed tests', '1')
  .option('--timeout <ms>', 'test timeout', '30000')
  .option('--grep <pattern>', 'filter tests by pattern')
  .option('--bail', 'stop on first failure')
  .option('--update-snapshots', 'update visual snapshots')
  .action(async (options) => {
    const spinner = ora('🧪 Preparing test execution...').start();
    
    try {
      const browsers = options.browser.split(',').map(b => b.trim());
      const tags = options.tag ? options.tag.split(',').map(t => t.trim()) : [];
      
      const executorOptions = {
        files: options.files,
        browsers,
        environment: options.env,
        workers: parseInt(options.workers),
        headed: options.headed,
        debug: options.debug,
        record: options.record,
        trace: options.trace,
        reporter: options.reporter,
        retries: parseInt(options.retry),
        timeout: parseInt(options.timeout),
        grep: options.grep,
        bail: options.bail,
        updateSnapshots: options.updateSnapshots,
        tags
      };
      
      const executor = new TestExecutor(executorOptions);
      
      // Set up event listeners
      executor.on('start', (info) => {
        spinner.succeed('🚀 Test execution started');
        console.log(chalk.blue(`Running ${info.totalTests} tests across ${info.browsers.length} browser(s)`));
      });
      
      executor.on('testStart', (test) => {
        if (program.opts().verbose) {
          console.log(chalk.dim(`  ▶️  ${test.title}`));
        }
      });
      
      executor.on('testEnd', (test) => {
        const status = test.outcome === 'passed' ? '✅' : 
                     test.outcome === 'failed' ? '❌' : 
                     test.outcome === 'skipped' ? '⏭️' : '⚠️';
        
        if (program.opts().verbose || test.outcome === 'failed') {
          console.log(`  ${status} ${test.title} (${test.duration}ms)`);
          
          if (test.outcome === 'failed' && test.error) {
            console.log(chalk.red(`    💥 ${test.error.message}`));
          }
        }
      });
      
      executor.on('progress', (progress) => {
        if (!program.opts().quiet) {
          const percentage = Math.round((progress.completed / progress.total) * 100);
          spinner.text = `🧪 Running tests... ${progress.completed}/${progress.total} (${percentage}%)`;
        }
      });
      
      spinner.text = '🧪 Executing tests...';
      const results = await executor.run();
      
      // Display results
      const statusIcon = results.failed === 0 ? '✅' : '❌';
      const statusColor = results.failed === 0 ? 'green' : 'red';
      
      console.log(boxen(
        `${statusIcon} Test Execution Complete\n\n` +
        `✅ Passed: ${results.passed}\n` +
        `❌ Failed: ${results.failed}\n` +
        `⏭️  Skipped: ${results.skipped}\n` +
        `⏱️  Duration: ${results.duration}ms\n` +
        `👥 Workers: ${options.workers}\n` +
        `🌐 Browsers: ${browsers.join(', ')}\n\n` +
        `📊 Report: ${results.reportPath || 'No report generated'}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: statusColor
        }
      ));
      
      // Exit with appropriate code
      process.exit(results.failed > 0 ? 1 : 0);
      
    } catch (error) {
      spinner.fail('❌ Test execution failed');
      console.error(chalk.red(error.message));
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('⚙️ Manage framework configuration')
  .option('--init', 'create initial configuration file')
  .option('--validate', 'validate existing configuration')
  .option('--show', 'show current configuration')
  .option('--set <key=value>', 'set configuration value')
  .option('--get <key>', 'get configuration value')
  .action(async (options) => {
    try {
      const configManager = program.configManager || new ConfigManager();
      
      if (options.init) {
        const spinner = ora('Creating configuration file...').start();
        await configManager.createDefaultConfig('./automation.config.js');
        spinner.succeed('✅ Configuration file created: automation.config.js');
        return;
      }
      
      if (options.validate) {
        const spinner = ora('Validating configuration...').start();
        const isValid = await configManager.validate();
        if (isValid) {
          spinner.succeed('✅ Configuration is valid');
        } else {
          spinner.fail('❌ Configuration has errors');
          process.exit(1);
        }
        return;
      }
      
      if (options.show) {
        const config = configManager.getAll();
        console.log(chalk.blue('📋 Current Configuration:'));
        console.log(JSON.stringify(config, null, 2));
        return;
      }
      
      if (options.set) {
        const [key, value] = options.set.split('=');
        configManager.set(key, value);
        await configManager.save();
        console.log(chalk.green(`✅ Set ${key} = ${value}`));
        return;
      }
      
      if (options.get) {
        const value = configManager.get(options.get);
        console.log(value !== undefined ? value : chalk.red('Key not found'));
        return;
      }
      
      // Show help if no options provided
      console.log(chalk.yellow('Use --help to see available configuration options'));
      
    } catch (error) {
      console.error(chalk.red('❌ Configuration error:'), error.message);
      process.exit(1);
    }
  });

// Report command
program
  .command('report')
  .description('📊 Generate and manage test reports')
  .option('-i, --input <dir>', 'input directory with test results', './test-results')
// Report command
program
  .command('report')
  .description('📊 Generate and manage test reports')
  .option('-i, --input <dir>', 'input directory with test results', './test-results')
  .option('-o, --output <dir>', 'output directory for reports', './reports')
  .option('-f, --format <format>', 'report format (html, json, junit, allure)', 'html')
  .option('--open', 'open report in browser after generation')
  .option('--merge', 'merge multiple test result files')
  .option('--filter <filter>', 'filter results (passed, failed, skipped)')
  .action(async (options) => {
    const spinner = ora('📊 Generating reports...').start();
    
    try {
      const ReportGenerator = require('../core/reporting/report-generator');
      const reportGenerator = new ReportGenerator({
        inputDir: options.input,
        outputDir: options.output,
        format: options.format,
        merge: options.merge,
        filter: options.filter
      });
      
      const reportPath = await reportGenerator.generate();
      
      spinner.succeed('✅ Report generated successfully!');
      
      console.log(boxen(
        `📊 Report Generated\n\n` +
        `📁 Location: ${reportPath}\n` +
        `📄 Format: ${options.format}\n` +
        `${options.merge ? '🔗 Merged multiple results\n' : ''}` +
        `${options.filter ? `🔍 Filtered: ${options.filter}\n` : ''}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'magenta'
        }
      ));
      
      if (options.open) {
        const open = require('open');
        await open(reportPath);
      }
      
    } catch (error) {
      spinner.fail('❌ Report generation failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Install command
program
  .command('install')
  .description('📦 Install browsers and dependencies')
  .option('--browsers <browsers>', 'specific browsers to install', 'chromium,firefox,webkit')
  .option('--with-deps', 'install system dependencies')
  .option('--force', 'force reinstallation')
  .action(async (options) => {
    const spinner = ora('📦 Installing browsers...').start();
    
    try {
      const { spawn } = require('child_process');
      const browsers = options.browsers.split(',').map(b => b.trim());
      
      for (const browser of browsers) {
        spinner.text = `Installing ${browser}...`;
        
        const args = ['playwright', 'install', browser];
        if (options.withDeps) args.push('--with-deps');
        if (options.force) args.push('--force');
        
        await new Promise((resolve, reject) => {
          const process = spawn('npx', args, { stdio: 'pipe' });
          
          process.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Installation failed for ${browser}`));
            }
          });
          
          process.on('error', reject);
        });
      }
      
      spinner.succeed('✅ Browser installation completed!');
      
      console.log(boxen(
        `📦 Installation Complete\n\n` +
        `🌐 Browsers: ${browsers.join(', ')}\n` +
        `${options.withDeps ? '📋 System dependencies included\n' : ''}` +
        `${options.force ? '🔄 Force reinstallation used\n' : ''}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'yellow'
        }
      ));
      
    } catch (error) {
      spinner.fail('❌ Installation failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Debug command
program
  .command('debug')
  .description('🐛 Debug and troubleshoot tests')
  .option('-f, --file <file>', 'specific test file to debug')
  .option('-t, --test <pattern>', 'specific test pattern to debug')
  .option('--inspect', 'enable Node.js inspector')
  .option('--headed', 'run in headed mode for debugging')
  .option('--slowmo <ms>', 'slow down execution by milliseconds', '100')
  .option('--pause-on-failure', 'pause execution on test failure')
  .action(async (options) => {
    const spinner = ora('🐛 Starting debug session...').start();
    
    try {
      const DebugRunner = require('../core/debug/debug-runner');
      const debugRunner = new DebugRunner({
        file: options.file,
        testPattern: options.test,
        inspect: options.inspect,
        headed: options.headed,
        slowmo: parseInt(options.slowmo),
        pauseOnFailure: options.pauseOnFailure
      });
      
      spinner.succeed('🐛 Debug session started');
      console.log(chalk.blue('Debug controls:'));
      console.log('  • Press SPACE to step through');
      console.log('  • Press ENTER to continue');
      console.log('  • Press Q to quit');
      console.log('  • Press I to inspect element');
      
      await debugRunner.start();
      
    } catch (error) {
      spinner.fail('❌ Debug session failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Analytics command
program
  .command('analytics')
  .description('📈 View test analytics and metrics')
  .option('-d, --days <days>', 'number of days to analyze', '7')
  .option('-f, --format <format>', 'output format (table, json, chart)', 'table')
  .option('--export <file>', 'export analytics to file')
  .action(async (options) => {
    const spinner = ora('📈 Analyzing test data...').start();
    
    try {
      const AnalyticsEngine = require('../core/analytics/analytics-engine');
      const analytics = new AnalyticsEngine();
      
      const data = await analytics.analyze({
        days: parseInt(options.days),
        includeMetrics: ['success-rate', 'duration', 'flakiness', 'coverage']
      });
      
      spinner.succeed('📈 Analytics generated');
      
      if (options.format === 'table') {
        const Table = require('cli-table3');
        const table = new Table({
          head: ['Metric', 'Value', 'Trend', 'Status'],
          colWidths: [20, 15, 10, 10]
        });
        
        table.push(
          ['Success Rate', `${data.successRate}%`, data.successTrend, data.successRate > 90 ? '✅' : '⚠️'],
          ['Avg Duration', `${data.avgDuration}ms`, data.durationTrend, data.avgDuration < 30000 ? '✅' : '⚠️'],
          ['Flaky Tests', data.flakyTests, data.flakinessTrend, data.flakyTests === 0 ? '✅' : '⚠️'],
          ['Coverage', `${data.coverage}%`, data.coverageTrend, data.coverage > 80 ? '✅' : '⚠️']
        );
        
        console.log(table.toString());
      } else if (options.format === 'json') {
        console.log(JSON.stringify(data, null, 2));
      }
      
      if (options.export) {
        await fs.writeFile(options.export, JSON.stringify(data, null, 2));
        console.log(chalk.green(`📄 Analytics exported to ${options.export}`));
      }
      
    } catch (error) {
      spinner.fail('❌ Analytics generation failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Doctor command
program
  .command('doctor')
  .description('🔍 Diagnose environment and configuration issues')
  .option('--fix', 'attempt to fix detected issues')
  .action(async (options) => {
    const spinner = ora('🔍 Running diagnostics...').start();
    
    try {
      const Doctor = require('../core/doctor/doctor');
      const doctor = new Doctor();
      
      const issues = await doctor.diagnose();
      
      if (issues.length === 0) {
        spinner.succeed('✅ No issues detected - everything looks good!');
        return;
      }
      
      spinner.warn(`⚠️ Found ${issues.length} issue(s)`);
      
      for (const issue of issues) {
        const severity = issue.level === 'error' ? '🚨' : 
                        issue.level === 'warning' ? '⚠️' : '💡';
        console.log(`${severity} ${issue.message}`);
        
        if (issue.solution) {
          console.log(chalk.dim(`   💡 Solution: ${issue.solution}`));
        }
        
        if (options.fix && issue.fixable) {
          const fix = ora(`Fixing: ${issue.message}`).start();
          try {
            await doctor.fix(issue.code);
            fix.succeed('✅ Fixed');
          } catch (error) {
            fix.fail(`❌ Fix failed: ${error.message}`);
          }
        }
      }
      
      if (!options.fix) {
        console.log(chalk.blue('\n💡 Run with --fix to attempt automatic fixes'));
      }
      
    } catch (error) {
      spinner.fail('❌ Diagnostics failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Serve command
program
  .command('serve')
  .description('🌐 Start development server with live test monitoring')
  .option('-p, --port <port>', 'server port', '3000')
  .option('--host <host>', 'server host', 'localhost')
  .option('--watch', 'watch for file changes and rerun tests')
  .option('--open', 'open browser automatically')
  .action(async (options) => {
    const spinner = ora('🌐 Starting development server...').start();
    
    try {
      const DevServer = require('../core/server/dev-server');
      const server = new DevServer({
        port: parseInt(options.port),
        host: options.host,
        watch: options.watch,
        autoOpen: options.open
      });
      
      await server.start();
      
      spinner.succeed(`🌐 Server running at http://${options.host}:${options.port}`);
      
      console.log(boxen(
        `🚀 Development Server Active\n\n` +
        `🌐 URL: http://${options.host}:${options.port}\n` +
        `👀 File watching: ${options.watch ? 'enabled' : 'disabled'}\n` +
        `📊 Real-time test monitoring available\n` +
        `🎛️ Interactive test runner included\n\n` +
        `Press Ctrl+C to stop`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green'
        }
      ));
      
      // Keep process alive
      process.on('SIGINT', async () => {
        console.log('\n🛑 Stopping server...');
        await server.stop();
        process.exit(0);
      });
      
    } catch (error) {
      spinner.fail('❌ Failed to start server');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('🎮 Start interactive mode')
  .action(async () => {
    console.log(boxen(
      `🎮 Test Automation Framework - Interactive Mode\n\n` +
      `Select an action to get started:`,
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        title: '🎭 Playwright Test Automation'
      }
    ));
    
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '🚀 Initialize new project', value: 'init' },
          { name: '🎬 Record new test', value: 'record' },
          { name: '🔧 Generate code from recordings', value: 'generate' },
          { name: '🧪 Run tests', value: 'test' },
          { name: '📊 Generate reports', value: 'report' },
          { name: '🔍 Diagnose issues', value: 'doctor' },
          { name: '⚙️ Configure framework', value: 'config' },
          { name: '📈 View analytics', value: 'analytics' },
          { name: '🌐 Start dev server', value: 'serve' },
          { name: '❌ Exit', value: 'exit' }
        ]
      }
    ]);
    
    if (answers.action === 'exit') {
      console.log(chalk.blue('👋 Goodbye!'));
      process.exit(0);
    }
    
    // Execute selected command interactively
    const commandHandlers = {
      init: async () => {
        const initAnswers = await inquirer.prompt([
          { type: 'input', name: 'name', message: 'Project name:', default: 'my-test-project' },
          { type: 'list', name: 'template', message: 'Template:', choices: ['basic', 'advanced', 'enterprise'] },
          { type: 'confirm', name: 'git', message: 'Initialize Git?', default: true }
        ]);
        
        // Execute init command with answers
        program.parse(['node', 'cli.js', 'init', '-n', initAnswers.name, '-t', initAnswers.template]);
      },
      
      record: async () => {
        const recordAnswers = await inquirer.prompt([
          { type: 'input', name: 'url', message: 'Target URL:', validate: (input) => input.startsWith('http') || 'Please enter a valid URL' },
          { type: 'input', name: 'name', message: 'Test name:', default: 'recorded-test' },
          { type: 'list', name: 'browser', message: 'Browser:', choices: ['chromium', 'firefox', 'webkit'] },
          { type: 'confirm', name: 'headed', message: 'Run in headed mode?', default: false }
        ]);
        
        const args = ['node', 'cli.js', 'record', '-u', recordAnswers.url, '-n', recordAnswers.name, '-b', recordAnswers.browser];
        if (recordAnswers.headed) args.push('--headed');
        
        program.parse(args);
      },
      
      test: async () => {
        const testAnswers = await inquirer.prompt([
          { type: 'input', name: 'pattern', message: 'Test file pattern:', default: '**/*.spec.{js,ts}' },
          { type: 'checkbox', name: 'browsers', message: 'Browsers:', choices: ['chromium', 'firefox', 'webkit'], default: ['chromium'] },
          { type: 'number', name: 'workers', message: 'Parallel workers:', default: 2 },
          { type: 'confirm', name: 'headed', message: 'Run in headed mode?', default: false }
        ]);
        
        const args = ['node', 'cli.js', 'test', '-f', testAnswers.pattern, '-b', testAnswers.browsers.join(','), '-w', testAnswers.workers.toString()];
        if (testAnswers.headed) args.push('--headed');
        
        program.parse(args);
      }
    };
    
    if (commandHandlers[answers.action]) {
      await commandHandlers[answers.action]();
    } else {
      program.parse(['node', 'cli.js', answers.action]);
    }
  });

// Global error handling
process.on('uncaughtException', (error) => {
  console.error(chalk.red('💥 Uncaught Exception:'), error.message);
  if (program.opts().verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('💥 Unhandled Rejection:'), reason);
  if (program.opts().verbose) {
    console.error('Promise:', promise);
  }
  process.exit(1);
});

// Add global help examples
program.addHelpText('after', `

Examples:
  ${chalk.cyan('# Initialize new project')}
  $ automation-cli init -n my-project -t advanced

  ${chalk.cyan('# Record a test')}
  $ automation-cli record -u https://example.com -n login-test --headed

  ${chalk.cyan('# Generate page objects from recordings')}
  $ automation-cli generate -r ./recordings -t pom

  ${chalk.cyan('# Run tests with specific configuration')}
  $ automation-cli test -b chromium,firefox -w 4 --headed

  ${chalk.cyan('# Debug a failing test')}
  $ automation-cli debug -f tests/login.spec.js --pause-on-failure

  ${chalk.cyan('# Start interactive mode')}
  $ automation-cli interactive

  ${chalk.cyan('# Check system health')}
  $ automation-cli doctor --fix

For more detailed documentation, visit: https://github.com/your-org/test-automation-framework
`);

// Parse command line arguments
program.parse();