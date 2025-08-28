# 🎭 Playwright Test Automation Framework

A comprehensive test automation framework with visual recording, Page Object Model generation, and enterprise-grade features.

## 🚀 Quick Start

### Prerequisites

- **Node.js** (18.0.0 or higher)
- **npm** (9.0.0 or higher)
- **Git**

### 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/your-org/test-automation-framework.git
cd test-automation-framework

# Install dependencies and setup environment
npm run setup
```

### 2. Start the Application

```bash
# Launch Electron GUI
npm start

# Or start in development mode
npm run dev
```

### 3. Use CLI (Alternative)

```bash
# Make CLI globally available
npm link

# Use the CLI
automation-cli --help
automation-cli interactive
```

## 📦 Installation Options

### Option A: Full Setup (Recommended)
```bash
npm run setup
```
This will:
- Install all Node.js dependencies
- Download Playwright browsers
- Set up environment configuration
- Verify system requirements

### Option B: Manual Setup
```bash
# Install dependencies
npm install

# Install Playwright browsers
npm run install:browsers

# Install system dependencies (Linux only)
npm run install:browsers:deps

# Setup environment
npm run setup:env
```

### Option C: Development Setup
```bash
# Install with dev dependencies
npm install --include=dev

# Install pre-commit hooks
npm run prepare

# Start in watch mode
npm run watch
```

## 🛠️ Build Instructions

### Development Build
```bash
npm run build
```

### Production Builds

#### Desktop Applications
```bash
# Build for current platform
npm run dist

# Build for specific platforms
npm run build:win    # Windows
npm run build:mac    # macOS  
npm run build:linux  # Linux

# Build portable version
npm run pack
```

#### Distribution Files
The built applications will be in the `dist/` directory:
- **Windows**: `.exe` installer and portable `.exe`
- **macOS**: `.dmg` installer and `.zip` archive
- **Linux**: `.AppImage` and `.deb` packages

## 🎮 Usage Guide

### Electron GUI Application

#### Starting the Application
```bash
# Production mode
npm start

# Development mode (with DevTools)
npm run dev
```

#### Key Features
- **Visual Test Recording**: Record user interactions in browser
- **Page Object Generation**: Automatic POM creation
- **Test Management**: Create, edit, and organize tests
- **Live Test Execution**: Real-time test running with progress
- **Results Dashboard**: Comprehensive test reporting

### Command Line Interface

#### Basic Commands
```bash
# Initialize new project
automation-cli init -n my-project -t advanced

# Record test interactions
automation-cli record -u https://example.com -n login-test --headed

# Generate code from recordings  
automation-cli generate -r ./recordings --optimize

# Run tests
automation-cli test -b chromium,firefox -w 4

# Interactive mode
automation-cli interactive
```

#### Advanced Commands
```bash
# Debug failing tests
automation-cli debug -f tests/login.spec.js --pause-on-failure

# System health check
automation-cli doctor --fix

# Start development server
automation-cli serve -p 3000 --watch

# Generate reports
automation-cli report -f html --open

# View analytics
automation-cli analytics -d 30 --export analytics.json
```

## 📋 Project Structure

```
test-automation-framework/
├── electron-app/           # Electron desktop application
│   ├── main.js            # Main electron process
│   ├── preload.js         # Security bridge
│   └── renderer/          # UI components
├── core/                  # Core framework modules
│   ├── recorder/          # Test recording engine
│   ├── generator/         # Code generation
│   ├── executor/          # Test execution
│   └── analytics/         # Test analytics
├── cli/                   # Command line interface
│   └── cli.js            # Main CLI entry point
├── templates/             # Code generation templates
│   ├── page-objects/      # POM templates
│   └── tests/            # Test templates
├── scripts/              # Build and utility scripts
├── tests/                # Framework tests
└── docs/                 # Documentation
```

## 🧪 Testing the Framework

### Run Framework Tests
```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e
```

### Test Your Own Applications
```bash
# Using the GUI
npm start
# Then use the recording interface

# Using CLI
automation-cli record -u https://your-app.com -n your-test
automation-cli generate -r ./recordings
automation-cli test
```

## ⚙️ Configuration

### Environment Variables
Create a `.env` file in the root directory:
```env
# Application Settings
NODE_ENV=development
DEBUG=automation:*

# Default URLs
BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:3001/api

# Browser Settings
DEFAULT_BROWSER=chromium
HEADLESS=false
VIEWPORT_WIDTH=1280
VIEWPORT_HEIGHT=720

# Test Settings
DEFAULT_TIMEOUT=30000
RETRY_COUNT=1
PARALLEL_WORKERS=2

# Recording Settings
RECORDING_OUTPUT_DIR=./recordings
GENERATE_PAGE_OBJECTS=true
OPTIMIZE_ACTIONS=true

# Reporting
REPORT_OUTPUT_DIR=./reports
REPORT_FORMAT=html
OPEN_REPORT=true
```

### Framework Configuration
Edit `automation.config.js`:
```javascript
module.exports = {
  // Recording options
  recording: {
    browser: 'chromium',
    headless: false,
    generatePageObjects: true,
    optimizeActions: true,
    outputDir: './output'
  },
  
  // Code generation
  codeGeneration: {
    template: 'typescript',
    framework: 'playwright',
    optimize: true
  },
  
  // Test execution
  testExecution: {
    browsers: ['chromium', 'firefox'],
    workers: 2,
    timeout: 30000,
    retries: 1
  }
};
```

## 🔧 Development

### Setting up Development Environment
```bash
# Clone and setup
git clone <repo-url>
cd test-automation-framework
npm run setup

# Start development mode
npm run dev

# In another terminal, run tests in watch mode
npm run watch
```

### Code Quality
```bash
# Linting
npm run lint
npm run lint:check

# Formatting
npm run format
npm run format:check

# Full validation
npm run validate
```

### Contributing
1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes and add tests
4. Run validation: `npm run validate`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Create Pull Request

## 🚨 Troubleshooting

### Common Issues

#### 1. Playwright Browsers Not Installed
```bash
# Solution
npm run install:browsers
# or for system dependencies
npm run install:browsers:deps
```

#### 2. Electron Won't Start
```bash
# Check Node version
node --version  # Should be >= 18.0.0

# Clear cache and reinstall
npm run clean:all
npm install
```

#### 3. CLI Command Not Found
```bash
# Make CLI globally available
npm link

# Or run directly
npx automation-cli --help
```

#### 4. Recording Fails to Start
```bash
# Check system diagnostics
automation-cli doctor

# Try with different browser
automation-cli record -u https://example.com -b firefox
```

#### 5. Permission Errors (Linux/macOS)
```bash
# Fix permissions
chmod +x cli/cli.js
chmod +x scripts/*.js
```

### Advanced Debugging

#### Enable Debug Logging
```bash
# Electron app
DEBUG=automation:* npm run dev

# CLI
DEBUG=automation:* automation-cli test
```

#### System Diagnostics
```bash
# Full system check
automation-cli doctor --fix

# Check browser installations
npx playwright --version
npx playwright install --dry-run
```

#### Performance Issues
```bash
# Run benchmark tests
npm run benchmark

# Analyze bundle size
npm run analyze

# Check memory usage
node --max-old-space-size=4096 cli/cli.js test
```

## 📖 Documentation

### Generate Documentation
```bash
npm run docs
npm run docs:serve  # View at http://localhost:8080
```

### Additional Resources
- [Playwright Documentation](https://playwright.dev/)
- [Electron Documentation](https://electronjs.org/docs)
- [Framework Architecture Guide](docs/architecture.md)
- [API Reference](docs/api.md)
- [Examples and Tutorials](docs/examples.md)

## 🔒 Security

### Security Audit
```bash
npm run security:audit
npm run security:check
```

### Best Practices
- Never commit sensitive data (`.env` files)
- Use environment variables for configuration
- Regularly update dependencies
- Enable security scanning in CI/CD

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Support

- **GitHub Issues**: [Report bugs](https://github.com/your-org/test-automation-framework/issues)
- **Discussions**: [Community forum](https://github.com/your-org/test-automation-framework/discussions)
- **Documentation**: [Full documentation](https://your-org.github.io/test-automation-framework)

## 🎉 Contributors

Thanks to all contributors who have helped build this framework!

---

**Happy Testing! 🎭✨**