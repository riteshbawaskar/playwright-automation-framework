const EventEmitter = require('events');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');

class TestExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      files: '**/*.spec.{js,ts}',
      browsers: ['chromium'],
      environment: 'test',
      workers: 2,
      headed: false,
      debug: false,
      record: false,
      trace: false,
      reporter: 'html',
      retries: 1,
      timeout: 30000,
      grep: null,
      bail: false,
      updateSnapshots: false,
      tags: [],
      outputDir: './test-results',
      configFile: './playwright.config.js',
      ...options
    };

    this.isRunning = false;
    this.currentProcess = null;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      tests: [],
      reportPath: null
    };
  }

  async run() {
    if (this.isRunning) {
      throw new Error('Test execution already in progress');
    }

    try {
      this.isRunning = true;
      
      // Validate environment
      await this.validateEnvironment();
      
      // Discover test files
      const testFiles = await this.discoverTestFiles();
      
      if (testFiles.length === 0) {
        throw new Error(`No test files found matching pattern: ${this.options.files}`);
      }

      // Prepare execution environment
      await this.prepareExecution();
      
      // Build command arguments
      const args = await this.buildCommandArgs(testFiles);
      
      // Execute tests
      const startTime = Date.now();
      
      this.emit('start', {
        totalTests: testFiles.length,
        browsers: this.options.browsers,
        workers: this.options.workers
      });

      const exitCode = await this.executePlaywright(args);
      
      const endTime = Date.now();
      this.results.duration = endTime - startTime;

      // Parse results
      await this.parseResults();
      
      this.emit('end', this.results);
      
      return this.results;
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.currentProcess = null;
    }
  }

  async stop() {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      
      // Force kill after 10 seconds
      setTimeout(() => {
        if (this.currentProcess) {
          this.currentProcess.kill('SIGKILL');
        }
      }, 10000);
      
      this.emit('stopped');
    }
  }

  async validateEnvironment() {
    // Check if Playwright is installed
    try {
      await this.executeCommand('npx', ['playwright', '--version'], { timeout: 5000 });
    } catch (error) {
      throw new Error('Playwright not found. Run "npm install @playwright/test" first.');
    }

    // Check browser installations
    for (const browser of this.options.browsers) {
      try {
        await this.executeCommand('npx', ['playwright', 'install-deps', browser], { timeout: 30000 });
      } catch (error) {
        console.warn(`Warning: ${browser} dependencies may not be installed`);
      }
    }

    // Validate configuration file
    if (this.options.configFile && !(await this.fileExists(this.options.configFile))) {
      console.warn(`Warning: Config file ${this.options.configFile} not found, using defaults`);
    }
  }

  async discoverTestFiles() {
    return new Promise((resolve, reject) => {
      glob(this.options.files, { 
        cwd: process.cwd(),
        ignore: ['node_modules/**', '**/node_modules/**']
      }, (error, files) => {
        if (error) {
          reject(error);
        } else {
          resolve(files.filter(file => file.includes('.spec.') || file.includes('.test.')));
        }
      });
    });
  }

  async prepareExecution() {
    // Ensure output directory exists
    await fs.mkdir(this.options.outputDir, { recursive: true });
    
    // Clear previous results if needed
    const resultsDir = path.join(this.options.outputDir, 'playwright-report');
    try {
      await fs.rm(resultsDir, { recursive: true, force: true });
    } catch (error) {
      // Directory doesn't exist, ignore
    }

    // Set environment variables
    process.env.PLAYWRIGHT_TEST_BASE_URL = this.getBaseUrl();
    process.env.TEST_ENVIRONMENT = this.options.environment;
    
    if (this.options.debug) {
      process.env.PWDEBUG = '1';
    }
  }

  getBaseUrl() {
    const envUrls = {
      development: 'http://localhost:3000',
      staging: 'https://staging.example.com',
      production: 'https://example.com'
    };
    
    return process.env.BASE_URL || envUrls[this.options.environment] || envUrls.development;
  }

  async buildCommandArgs(testFiles) {
    const args = ['playwright', 'test'];
    
    // Add test files
    if (testFiles.length < 50) { // Avoid command line length limits
      args.push(...testFiles);
    }
    
    // Browser configuration
    if (this.options.browsers.length === 1 && this.options.browsers[0] !== 'all') {
      args.push('--project', this.options.browsers[0]);
    }
    
    // Parallel execution
    args.push('--workers', this.options.workers.toString());
    
    // UI mode
    if (this.options.headed) {
      args.push('--headed');
    }
    
    // Debug mode
    if (this.options.debug) {
      args.push('--debug');
    }
    
    // Recording
    if (this.options.record) {
      args.push('--video=on');
    }
    
    // Tracing
    if (this.options.trace) {
      args.push('--trace=on');
    }
    
    // Reporter
    args.push('--reporter', this.options.reporter);
    
    // Retries
    if (this.options.retries > 0) {
      args.push('--retries', this.options.retries.toString());
    }
    
    // Timeout
    args.push('--timeout', this.options.timeout.toString());
    
    // Grep pattern
    if (this.options.grep) {
      args.push('--grep', this.options.grep);
    }
    
    // Bail on first failure
    if (this.options.bail) {
      args.push('--max-failures=1');
    }
    
    // Update snapshots
    if (this.options.updateSnapshots) {
      args.push('--update-snapshots');
    }
    
    // Configuration file
    if (this.options.configFile && await this.fileExists(this.options.configFile)) {
      args.push('--config', this.options.configFile);
    }
    
    // Output directory
    args.push('--output-dir', this.options.outputDir);
    
    return args;
  }

  async executePlaywright(args) {
    return new Promise((resolve, reject) => {
      this.currentProcess = spawn('npx', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      this.currentProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        this.parseRealTimeOutput(output);
      });

      this.currentProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        this.emit('stderr', output);
      });

      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;
        
        if (code === 0 || code === 1) { // 0 = success, 1 = test failures (but execution succeeded)
          resolve(code);
        } else {
          reject(new Error(`Playwright execution failed with code ${code}\nStderr: ${stderr}`));
        }
      });

      this.currentProcess.on('error', (error) => {
        this.currentProcess = null;
        reject(error);
      });
    });
  }

  parseRealTimeOutput(output) {
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Parse test start
      const testStartMatch = line.match(/Running (\d+) test/);
      if (testStartMatch) {
        this.emit('testStart', {
          title: line.trim(),
          totalTests: parseInt(testStartMatch[1])
        });
        continue;
      }

      // Parse individual test results
      const testResultMatch = line.match(/\s*(✓|✗|⊘)\s*(.+?)\s*\((\d+)ms\)/);
      if (testResultMatch) {
        const [, status, title, duration] = testResultMatch;
        const outcome = status === '✓' ? 'passed' : status === '✗' ? 'failed' : 'skipped';
        
        const testResult = {
          title: title.trim(),
          outcome,
          duration: parseInt(duration)
        };

        this.emit('testEnd', testResult);
        continue;
      }

      // Parse progress
      const progressMatch = line.match(/(\d+) passed.*?(\d+) failed.*?(\d+) skipped/);
      if (progressMatch) {
        const [, passed, failed, skipped] = progressMatch;
        this.emit('progress', {
          passed: parseInt(passed),
          failed: parseInt(failed),
          skipped: parseInt(skipped),
          total: parseInt(passed) + parseInt(failed) + parseInt(skipped),
          completed: parseInt(passed) + parseInt(failed) + parseInt(skipped)
        });
        continue;
      }

      // Parse errors
      if (line.includes('Error:') || line.includes('TimeoutError:')) {
        this.emit('testEnd', {
          title: 'Unknown test',
          outcome: 'failed',
          error: { message: line.trim() }
        });
      }
    }
  }

  async parseResults() {
    try {
      // Try to read Playwright JSON report
      const jsonReportPath = path.join(this.options.outputDir, 'results.json');
      
      if (await this.fileExists(jsonReportPath)) {
        const reportData = JSON.parse(await fs.readFile(jsonReportPath, 'utf8'));
        this.results = this.parsePlaywrightReport(reportData);
      } else {
        // Fallback to parsing HTML report or other formats
        await this.parseAlternativeReports();
      }

      // Set report path
      const htmlReportPath = path.join(this.options.outputDir, 'playwright-report', 'index.html');
      if (await this.fileExists(htmlReportPath)) {
        this.results.reportPath = htmlReportPath;
      }

    } catch (error) {
      console.warn('Could not parse test results:', error.message);
    }
  }

  parsePlaywrightReport(reportData) {
    const results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      tests: [],
      reportPath: null
    };

    if (reportData.suites) {
      this.parseTestSuites(reportData.suites, results);
    }

    return results;
  }

  parseTestSuites(suites, results) {
    for (const suite of suites) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          for (const test of spec.tests) {
            const testResult = {
              title: test.title,
              file: spec.title,
              outcome: this.mapTestStatus(test.outcome),
              duration: test.results?.[0]?.duration || 0,
              error: test.results?.[0]?.error || null,
              retry: test.results?.length > 1
            };

            results.tests.push(testResult);
            results.duration += testResult.duration;

            switch (testResult.outcome) {
              case 'passed':
                results.passed++;
                break;
              case 'failed':
                results.failed++;
                break;
              case 'skipped':
                results.skipped++;
                break;
            }
          }
        }
      }

      // Recursively parse nested suites
      if (suite.suites) {
        this.parseTestSuites(suite.suites, results);
      }
    }
  }

  mapTestStatus(outcome) {
    const statusMap = {
      'expected': 'passed',
      'unexpected': 'failed',
      'flaky': 'passed', // Flaky but eventually passed
      'skipped': 'skipped'
    };
    
    return statusMap[outcome] || 'failed';
  }

  async parseAlternativeReports() {
    // Try to find and parse JUnit XML reports
    const junitPath = path.join(this.options.outputDir, 'junit-results.xml');
    if (await this.fileExists(junitPath)) {
      await this.parseJUnitReport(junitPath);
      return;
    }

    // Try to parse from stdout/stderr logs
    const logPath = path.join(this.options.outputDir, 'execution.log');
    if (await this.fileExists(logPath)) {
      await this.parseLogFile(logPath);
    }
  }

  async parseJUnitReport(filePath) {
    try {
      const xml = await fs.readFile(filePath, 'utf8');
      const xmlParser = require('xml2js').parseString;
      
      xmlParser(xml, (err, result) => {
        if (err) throw err;
        
        const testsuites = result.testsuites || result.testsuite;
        if (testsuites) {
          this.parseJUnitTestSuites(testsuites);
        }
      });
    } catch (error) {
      console.warn('Failed to parse JUnit report:', error.message);
    }
  }

  parseJUnitTestSuites(testsuites) {
    const suites = Array.isArray(testsuites) ? testsuites : [testsuites];
    
    for (const suite of suites) {
      if (suite.testcase) {
        const testcases = Array.isArray(suite.testcase) ? suite.testcase : [suite.testcase];
        
        for (const testcase of testcases) {
          const test = {
            title: testcase.$.name,
            file: testcase.$.classname,
            duration: parseFloat(testcase.$.time) * 1000, // Convert to ms
            outcome: 'passed'
          };

          if (testcase.failure) {
            test.outcome = 'failed';
            test.error = { message: testcase.failure[0]._ || testcase.failure[0] };
            this.results.failed++;
          } else if (testcase.skipped) {
            test.outcome = 'skipped';
            this.results.skipped++;
          } else {
            this.results.passed++;
          }

          this.results.tests.push(test);
          this.results.duration += test.duration;
        }
      }
    }
  }

  async parseLogFile(filePath) {
    try {
      const logContent = await fs.readFile(filePath, 'utf8');
      const lines = logContent.split('\n');
      
      let currentTest = null;
      
      for (const line of lines) {
        // Simple log parsing - can be enhanced based on actual log format
        if (line.includes('Running test:')) {
          const testName = line.split('Running test:')[1].trim();
          currentTest = {
            title: testName,
            startTime: Date.now()
          };
        } else if (line.includes('Test passed:')) {
          if (currentTest) {
            currentTest.outcome = 'passed';
            currentTest.duration = Date.now() - currentTest.startTime;
            this.results.tests.push(currentTest);
            this.results.passed++;
            currentTest = null;
          }
        } else if (line.includes('Test failed:')) {
          if (currentTest) {
            currentTest.outcome = 'failed';
            currentTest.duration = Date.now() - currentTest.startTime;
            currentTest.error = { message: line };
            this.results.tests.push(currentTest);
            this.results.failed++;
            currentTest = null;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to parse log file:', error.message);
    }
  }

  async executeCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 30000;
      
      const process = spawn(command, args, {
        stdio: 'pipe',
        ...options
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      process.on('close', (code) => {
        clearTimeout(timer);
        
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Test filtering and selection methods
  async filterTestsByTags(testFiles) {
    if (this.options.tags.length === 0) {
      return testFiles;
    }

    const filteredFiles = [];
    
    for (const file of testFiles) {
      const content = await fs.readFile(file, 'utf8');
      const hasRequiredTags = this.options.tags.every(tag => 
        content.includes(`@${tag}`) || content.includes(`tag: '${tag}'`)
      );
      
      if (hasRequiredTags) {
        filteredFiles.push(file);
      }
    }
    
    return filteredFiles;
  }

  async getTestMetadata(testFile) {
    try {
      const content = await fs.readFile(testFile, 'utf8');
      
      const metadata = {
        file: testFile,
        tags: this.extractTags(content),
        description: this.extractDescription(content),
        testCount: this.countTests(content),
        dependencies: this.extractDependencies(content)
      };
      
      return metadata;
    } catch (error) {
      return { file: testFile, error: error.message };
    }
  }

  extractTags(content) {
    const tagPattern = /@(\w+)/g;
    const tags = [];
    let match;
    
    while ((match = tagPattern.exec(content)) !== null) {
      tags.push(match[1]);
    }
    
    return [...new Set(tags)]; // Remove duplicates
  }

  extractDescription(content) {
    const descMatch = content.match(/test\.describe\(['"`]([^'"`]+)['"`]/);
    return descMatch ? descMatch[1] : null;
  }

  countTests(content) {
    const testPattern = /test\(['"`][^'"`]+['"`]/g;
    return (content.match(testPattern) || []).length;
  }

  extractDependencies(content) {
    const importPattern = /import.*from ['"`]([^'"`]+)['"`]/g;
    const dependencies = [];
    let match;
    
    while ((match = importPattern.exec(content)) !== null) {
      if (!match[1].startsWith('.') && !match[1].startsWith('/')) {
        dependencies.push(match[1]);
      }
    }
    
    return dependencies;
  }

  // Performance monitoring
  async monitorPerformance() {
    const performanceData = {
      startTime: Date.now(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      testTiming: []
    };

    this.on('testStart', (test) => {
      performanceData.testTiming.push({
        test: test.title,
        startTime: Date.now()
      });
    });

    this.on('testEnd', (test) => {
      const timing = performanceData.testTiming.find(t => t.test === test.title);
      if (timing) {
        timing.endTime = Date.now();
        timing.duration = timing.endTime - timing.startTime;
      }
    });

    return performanceData;
  }

  // Retry logic for flaky tests
  async retryFlakyTests() {
    const flakyTests = this.results.tests.filter(test => 
      test.outcome === 'failed' && this.isFlakyTest(test)
    );

    if (flakyTests.length === 0) {
      return;
    }

    console.log(`Retrying ${flakyTests.length} potentially flaky test(s)...`);

    for (const test of flakyTests) {
      try {
        const retryResult = await this.runSingleTest(test);
        if (retryResult.outcome === 'passed') {
          test.outcome = 'passed';
          test.wasFlaky = true;
          this.results.passed++;
          this.results.failed--;
        }
      } catch (error) {
        console.warn(`Retry failed for ${test.title}:`, error.message);
      }
    }
  }

  isFlakyTest(test) {
    // Heuristics to detect flaky tests
    const flakyIndicators = [
      'timeout',
      'network',
      'connection',
      'element not found',
      'waiting for selector'
    ];

    if (test.error && test.error.message) {
      return flakyIndicators.some(indicator => 
        test.error.message.toLowerCase().includes(indicator)
      );
    }

    return false;
  }

  async runSingleTest(test) {
    const args = [
      'playwright', 'test',
      '--grep', test.title,
      '--retries', '0', // No retries for this specific run
      '--workers', '1'
    ];

    try {
      const { stdout } = await this.executeCommand('npx', args, { timeout: 60000 });
      
      if (stdout.includes('1 passed')) {
        return { outcome: 'passed' };
      } else {
        return { outcome: 'failed' };
      }
    } catch (error) {
      return { outcome: 'failed', error };
    }
  }

  // Parallel execution optimization
  optimizeParallelExecution() {
    const testCount = this.results.tests.length;
    const optimalWorkers = Math.min(
      Math.max(1, Math.ceil(testCount / 10)), // At least 1, max testCount/10
      require('os').cpus().length, // Don't exceed CPU cores
      this.options.workers // Don't exceed user setting
    );

    return optimalWorkers;
  }

  // Generate execution summary
  generateSummary() {
    const summary = {
      overview: {
        total: this.results.tests.length,
        passed: this.results.passed,
        failed: this.results.failed,
        skipped: this.results.skipped,
        successRate: this.results.tests.length > 0 ? 
          Math.round((this.results.passed / this.results.tests.length) * 100) : 0,
        duration: this.results.duration
      },
      performance: {
        averageTestDuration: this.results.tests.length > 0 ? 
          Math.round(this.results.duration / this.results.tests.length) : 0,
        slowestTests: this.results.tests
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 5),
        fastestTests: this.results.tests
          .sort((a, b) => a.duration - b.duration)
          .slice(0, 5)
      },
      failures: this.results.tests
        .filter(test => test.outcome === 'failed')
        .map(test => ({
          title: test.title,
          file: test.file,
          error: test.error?.message || 'Unknown error',
          duration: test.duration
        })),
      environment: {
        browsers: this.options.browsers,
        workers: this.options.workers,
        environment: this.options.environment,
        baseUrl: this.getBaseUrl()
      }
    };

    return summary;
  }
}

module.exports = TestExecutor;