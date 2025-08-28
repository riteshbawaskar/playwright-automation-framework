const { spawn, exec } = require('child_process');
const os = require('os');

class ProcessManager {
  static isWindows = os.platform() === 'win32';

  /**
   * Kill a process and its children on Windows
   */
  static async killProcessTree(pid, signal = 'SIGTERM') {
    return new Promise((resolve) => {
      if (!pid) {
        resolve(false);
        return;
      }

      console.log(`Attempting to kill process tree for PID: ${pid}`);

      if (this.isWindows) {
        // On Windows, use taskkill to kill the process tree
        const killCommand = `taskkill /pid ${pid} /t /f`;
        
        exec(killCommand, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error killing process tree: ${error.message}`);
            console.error(`stderr: ${stderr}`);
            
            // Try alternative method
            this.killProcessAlternative(pid).then(resolve);
          } else {
            console.log(`Successfully killed process tree for PID: ${pid}`);
            console.log(`stdout: ${stdout}`);
            resolve(true);
          }
        });
      } else {
        // On Unix-like systems
        try {
          process.kill(-pid, signal); // Negative PID kills the process group
          resolve(true);
        } catch (error) {
          console.error(`Error killing process group: ${error.message}`);
          try {
            process.kill(pid, signal);
            resolve(true);
          } catch (fallbackError) {
            console.error(`Error killing single process: ${fallbackError.message}`);
            resolve(false);
          }
        }
      }
    });
  }

  /**
   * Alternative Windows process killing method
   */
  static async killProcessAlternative(pid) {
    return new Promise((resolve) => {
      // Try using wmic command as fallback
      const wmicCommand = `wmic process where processid=${pid} delete`;
      
      exec(wmicCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`WMIC kill failed: ${error.message}`);
          resolve(false);
        } else {
          console.log(`WMIC kill successful for PID: ${pid}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Get child processes of a given PID (Windows only)
   */
  static async getChildProcesses(pid) {
    return new Promise((resolve) => {
      if (!this.isWindows) {
        resolve([]);
        return;
      }

      const wmicCommand = `wmic process where parentprocessid=${pid} get processid /value`;
      
      exec(wmicCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error getting child processes: ${error.message}`);
          resolve([]);
        } else {
          const pids = stdout
            .split('\n')
            .filter(line => line.includes('ProcessId='))
            .map(line => parseInt(line.split('=')[1]))
            .filter(id => !isNaN(id));
          
          resolve(pids);
        }
      });
    });
  }

  /**
   * Check if a process is still running
   */
  static async isProcessRunning(pid) {
    return new Promise((resolve) => {
      if (!pid) {
        resolve(false);
        return;
      }

      if (this.isWindows) {
        exec(`tasklist /fi "pid eq ${pid}"`, (error, stdout) => {
          if (error) {
            resolve(false);
          } else {
            resolve(stdout.toLowerCase().includes(pid.toString()));
          }
        });
      } else {
        try {
          process.kill(pid, 0); // Signal 0 just checks if process exists
          resolve(true);
        } catch (error) {
          resolve(false);
        }
      }
    });
  }

  /**
   * Create a process with proper cleanup handling
   */
  static createManagedProcess(command, args, options = {}) {
    const defaultOptions = {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: this.isWindows,
      windowsHide: true,
      ...options
    };

    // On Unix systems, create a new process group for easier cleanup
    if (!this.isWindows) {
      defaultOptions.detached = true;
    }

    const childProcess = spawn(command, args, defaultOptions);
    
    // Add cleanup method to the process
    childProcess.cleanup = async () => {
      if (childProcess.killed) return true;
      
      console.log(`Cleaning up process PID: ${childProcess.pid}`);
      
      // First try graceful shutdown
      try {
        childProcess.kill('SIGTERM');
        
        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if still running
        const isRunning = await this.isProcessRunning(childProcess.pid);
        if (!isRunning) {
          return true;
        }
        
        // If still running, force kill
        return await this.killProcessTree(childProcess.pid, 'SIGKILL');
      } catch (error) {
        console.error(`Error during process cleanup: ${error.message}`);
        return false;
      }
    };

    return childProcess;
  }

  /**
   * Find processes by name (useful for finding hanging Playwright processes)
   */
  static async findProcessesByName(processName) {
    return new Promise((resolve) => {
      if (this.isWindows) {
        exec(`tasklist /fi "imagename eq ${processName}"`, (error, stdout) => {
          if (error) {
            resolve([]);
          } else {
            const lines = stdout.split('\n');
            const processes = lines
              .filter(line => line.includes(processName))
              .map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                  name: parts[0],
                  pid: parseInt(parts[1]),
                  memory: parts[4]
                };
              })
              .filter(proc => !isNaN(proc.pid));
            
            resolve(processes);
          }
        });
      } else {
        exec(`pgrep -f ${processName}`, (error, stdout) => {
          if (error) {
            resolve([]);
          } else {
            const pids = stdout
              .trim()
              .split('\n')
              .map(pid => parseInt(pid))
              .filter(pid => !isNaN(pid))
              .map(pid => ({ pid, name: processName }));
            
            resolve(pids);
          }
        });
      }
    });
  }

  /**
   * Clean up any hanging Playwright processes
   */
  static async cleanupPlaywrightProcesses() {
    console.log('🧹 Cleaning up any hanging Playwright processes...');
    
    const processNames = ['chrome.exe', 'firefox.exe', 'playwright.exe', 'node.exe'];
    
    for (const processName of processNames) {
      const processes = await this.findProcessesByName(processName);
      
      for (const proc of processes) {
        // Only kill if it seems to be a Playwright process
        // This is a basic check - in a real implementation you'd want more sophisticated detection
        console.log(`Found process: ${proc.name} (PID: ${proc.pid})`);
        
        // For safety, we won't automatically kill all processes
        // Just log them so the user knows what might be hanging
      }
    }
  }
}

module.exports = ProcessManager;