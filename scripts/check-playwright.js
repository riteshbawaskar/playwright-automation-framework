#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Playwright installation...');

const isWindows = process.platform === 'win32';

function checkPlaywrightInstallation() {
  return new Promise((resolve) => {
    let command, args;

    if (isWindows) {
      command = 'cmd';
      args = ['/c', 'npx', 'playwright', '--version'];
    } else {
      command = 'npx';
      args = ['playwright', '--version'];
    }

    console.log(`Running: ${command} ${args.join(' ')}`);

    const process = spawn(command, args, {
      stdio: 'pipe',
      shell: isWindows
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code
      });
    });

    process.on('error', (error) => {
      resolve({
        success: false,
        error: error.message,
        code: -1
      });
    });
  });
}

function checkPlaywrightFiles() {
  const playwrightPaths = [
    path.join(process.cwd(), 'node_modules', '@playwright', 'test'),
    path.join(process.cwd(), 'node_modules', 'playwright'),
    path.join(process.cwd(), 'node_modules', '.bin', isWindows ? 'playwright.cmd' : 'playwright')
  ];

  console.log('📂 Checking Playwright files...');
  
  playwrightPaths.forEach(playwrightPath => {
    if (fs.existsSync(playwrightPath)) {
      console.log(`  ✅ Found: ${playwrightPath}`);
    } else {
      console.log(`  ❌ Missing: ${playwrightPath}`);
    }
  });
}

function installPlaywright() {
  return new Promise((resolve) => {
    console.log('📦 Installing Playwright...');
    
    let command, args;
    if (isWindows) {
      command = 'cmd';
      args = ['/c', 'npm', 'install', '@playwright/test'];
    } else {
      command = 'npm';
      args = ['install', '@playwright/test'];
    }

    const installProcess = spawn(command, args, {
      stdio: 'inherit',
      shell: isWindows,
      cwd: process.cwd()
    });

    installProcess.on('close', (code) => {
      resolve(code === 0);
    });

    installProcess.on('error', (error) => {
      console.error('Installation error:', error.message);
      resolve(false);
    });
  });
}

function installBrowsers() {
  return new Promise((resolve) => {
    console.log('🌐 Installing Playwright browsers...');
    
    let command, args;
    if (isWindows) {
      command = 'cmd';
      args = ['/c', 'npx', 'playwright', 'install'];
    } else {
      command = 'npx';
      args = ['playwright', 'install'];
    }

    const browserProcess = spawn(command, args, {
      stdio: 'inherit',
      shell: isWindows,
      cwd: process.cwd()
    });

    browserProcess.on('close', (code) => {
      resolve(code === 0);
    });

    browserProcess.on('error', (error) => {
      console.error('Browser installation error:', error.message);
      resolve(false);
    });
  });
}

async function main() {
  try {
    // Check current installation
    checkPlaywrightFiles();
    
    const result = await checkPlaywrightInstallation();
    
    if (result.success) {
      console.log('✅ Playwright is installed and working!');
      console.log(`   Version: ${result.stdout}`);
      
      // Test codegen command
      console.log('🧪 Testing codegen command...');
      let command, args;
      if (isWindows) {
        command = 'cmd';
        args = ['/c', 'npx', 'playwright', 'codegen', '--help'];
      } else {
        command = 'npx';
        args = ['playwright', 'codegen', '--help'];
      }
      
      const codegenTest = spawn(command, args, {
        stdio: 'pipe',
        shell: isWindows
      });
      
      codegenTest.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Codegen command is working!');
          console.log('\n🎉 Playwright setup is complete and ready for recording!');
        } else {
          console.log('⚠️  Codegen command failed, but Playwright is installed');
        }
      });
      
    } else {
      console.log('❌ Playwright not found or not working');
      if (result.stderr) {
        console.log(`   Error: ${result.stderr}`);
      }
      
      console.log('🔧 Attempting to install Playwright...');
      const installSuccess = await installPlaywright();
      
      if (installSuccess) {
        console.log('✅ Playwright installed successfully');
        
        const browsersSuccess = await installBrowsers();
        if (browsersSuccess) {
          console.log('✅ Browsers installed successfully');
          console.log('\n🎉 Playwright setup is complete!');
        } else {
          console.log('⚠️  Browser installation may have failed');
        }
      } else {
        console.log('❌ Failed to install Playwright');
        console.log('\n💡 Manual installation steps:');
        console.log('   1. Run: npm install @playwright/test');
        console.log('   2. Run: npx playwright install');
      }
    }
    
  } catch (error) {
    console.error('❌ Error during check:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkPlaywrightInstallation, installPlaywright, installBrowsers };