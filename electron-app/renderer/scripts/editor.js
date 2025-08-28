// Monaco Editor Setup and Management
class MonacoEditorManager {
  constructor() {
    this.editors = {};
    this.isLoaded = false;
    this.initPromise = this.init();
  }

  async init() {
    if (this.isLoaded) return;

    return new Promise((resolve, reject) => {
      // Configure Monaco's loader
      require.config({ 
        paths: { 
          'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.1/min/vs' 
        } 
      });

      // Load Monaco
      require(['vs/editor/editor.main'], () => {
        this.isLoaded = true;
        this.setupEditors();
        resolve();
      }, (error) => {
        console.error('Failed to load Monaco Editor:', error);
        reject(error);
      });
    });
  }

  setupEditors() {
    // Setup Page Object Editor
    this.createEditor('pageObjectEditor', {
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      readOnly: false,
      value: '// Select a page object to edit'
    });

    // Setup Test Editor
    this.createEditor('testEditor', {
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      readOnly: false,
      value: '// Select a test to edit'
    });

    // Store editors globally for access from main app
    window.monacoEditors = this.editors;
    window.monaco = monaco;
  }

  createEditor(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Editor container ${containerId} not found`);
      return null;
    }

    const defaultOptions = {
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: 'Fira Code, Consolas, Monaco, "Courier New", monospace',
      lineNumbers: 'on',
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: true,
      formatOnPaste: true,
      formatOnType: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions: 'top'
    };

    const editorOptions = { ...defaultOptions, ...options };
    
    try {
      const editor = monaco.editor.create(container, editorOptions);
      
      // Add custom key bindings
      this.addCustomKeyBindings(editor);
      
      // Add editor event listeners
      this.addEditorListeners(editor, containerId);
      
      this.editors[containerId] = editor;
      return editor;
    } catch (error) {
      console.error(`Failed to create editor ${containerId}:`, error);
      return null;
    }
  }

  addCustomKeyBindings(editor) {
    // Save file - Ctrl+S
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      this.saveCurrentFile(editor);
    });

    // Format document - Shift+Alt+F
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      editor.getAction('editor.action.formatDocument').run();
    });

    // Comment/uncomment - Ctrl+/
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
      editor.getAction('editor.action.commentLine').run();
    });
  }

  addEditorListeners(editor, editorId) {
    // Content change listener
    editor.onDidChangeModelContent(() => {
      this.onEditorContentChanged(editorId, editor);
    });

    // Focus listener
    editor.onDidFocusEditorText(() => {
      this.onEditorFocused(editorId, editor);
    });

    // Cursor position change listener
    editor.onDidChangeCursorPosition((e) => {
      this.onCursorPositionChanged(editorId, editor, e);
    });
  }

  onEditorContentChanged(editorId, editor) {
    // Mark file as modified
    const fileName = this.getFileNameForEditor(editorId);
    if (fileName) {
      this.markFileAsModified(fileName, true);
    }

    // Auto-save after 2 seconds of inactivity
    this.scheduleAutoSave(editorId, editor);
  }

  onEditorFocused(editorId, editor) {
    // Update UI to show which editor is active
    document.querySelectorAll('.monaco-editor-container').forEach(container => {
      container.classList.remove('active');
    });
    document.getElementById(editorId).parentElement.classList.add('active');
  }

  onCursorPositionChanged(editorId, editor, event) {
    // Update status bar with cursor position (if exists)
    const statusBar = document.querySelector('.editor-status-bar');
    if (statusBar) {
      statusBar.textContent = `Line ${event.position.lineNumber}, Column ${event.position.column}`;
    }
  }

  getFileNameForEditor(editorId) {
    switch (editorId) {
      case 'pageObjectEditor':
        return document.getElementById('currentFileName')?.textContent;
      case 'testEditor':
        return document.getElementById('currentTestFileName')?.textContent;
      default:
        return null;
    }
  }

  markFileAsModified(fileName, isModified) {
    const fileNameElement = document.querySelector('.file-name');
    if (fileNameElement && fileNameElement.textContent.includes(fileName)) {
      if (isModified && !fileName.endsWith(' *')) {
        fileNameElement.textContent = fileName + ' *';
      } else if (!isModified && fileName.endsWith(' *')) {
        fileNameElement.textContent = fileName.replace(' *', '');
      }
    }
  }

  scheduleAutoSave(editorId, editor) {
    // Clear existing auto-save timer
    if (this.autoSaveTimers && this.autoSaveTimers[editorId]) {
      clearTimeout(this.autoSaveTimers[editorId]);
    }

    // Initialize auto-save timers object
    if (!this.autoSaveTimers) {
      this.autoSaveTimers = {};
    }

    // Schedule new auto-save
    this.autoSaveTimers[editorId] = setTimeout(() => {
      this.autoSaveFile(editorId, editor);
    }, 2000);
  }

  async autoSaveFile(editorId, editor) {
    const content = editor.getValue();
    const fileName = this.getFileNameForEditor(editorId);
    
    if (fileName && content) {
      try {
        // In a real implementation, this would save to the actual file
        console.log(`Auto-saving ${fileName}...`);
        this.markFileAsModified(fileName, false);
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }
  }

  saveCurrentFile(editor) {
    const content = editor.getValue();
    // Trigger save through the main app
    if (window.app && typeof window.app.saveCurrentFile === 'function') {
      window.app.saveCurrentFile();
    }
  }

  // Public API methods
  async getEditor(editorId) {
    await this.initPromise;
    return this.editors[editorId];
  }

  async setEditorContent(editorId, content, language = 'javascript') {
    await this.initPromise;
    const editor = this.editors[editorId];
    if (editor) {
      editor.setValue(content);
      if (language) {
        monaco.editor.setModelLanguage(editor.getModel(), language);
      }
    }
  }

  async getEditorContent(editorId) {
    await this.initPromise;
    const editor = this.editors[editorId];
    return editor ? editor.getValue() : '';
  }

  async formatEditor(editorId) {
    await this.initPromise;
    const editor = this.editors[editorId];
    if (editor) {
      await editor.getAction('editor.action.formatDocument').run();
    }
  }

  async insertSnippet(editorId, snippet) {
    await this.initPromise;
    const editor = this.editors[editorId];
    if (editor) {
      const selection = editor.getSelection();
      const range = new monaco.Range(
        selection.startLineNumber,
        selection.startColumn,
        selection.endLineNumber,
        selection.endColumn
      );
      editor.executeEdits('insert-snippet', [{
        range: range,
        text: snippet,
        forceMoveMarkers: true
      }]);
    }
  }

  async addCompletionProvider(language, provider) {
    await this.initPromise;
    monaco.languages.registerCompletionItemProvider(language, provider);
  }

  setupPlaywrightCompletions() {
    // Add Playwright-specific autocompletion
    this.addCompletionProvider('javascript', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };

        const suggestions = [
          {
            label: 'page.locator',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'page.locator(\'${1:selector}\')',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
            documentation: 'Create a locator for an element'
          },
          {
            label: 'page.goto',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'await page.goto(\'${1:url}\')',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
            documentation: 'Navigate to a URL'
          },
          {
            label: 'expect.toBeVisible',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'await expect(${1:locator}).toBeVisible()',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
            documentation: 'Assert element is visible'
          },
          {
            label: 'click',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'await ${1:locator}.click()',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
            documentation: 'Click an element'
          },
          {
            label: 'fill',
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: 'await ${1:locator}.fill(\'${2:text}\')',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
            documentation: 'Fill an input field'
          },
          {
            label: 'test',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'test(\'${1:test name}\', async ({ page }) => {\n\t${2:// Test implementation}\n});',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
            documentation: 'Create a new test'
          },
          {
            label: 'test.describe',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'test.describe(\'${1:description}\', () => {\n\t${2:// Tests go here}\n});',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
            documentation: 'Group tests together'
          }
        ];

        return { suggestions };
      }
    });
  }

  setupThemes() {
    // Define custom dark theme for better code visibility
    monaco.editor.defineTheme('playwright-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'regexp', foreground: 'D16969' },
        { token: 'operator', foreground: 'D4D4D4' },
        { token: 'namespace', foreground: '4EC9B0' },
        { token: 'type', foreground: '4EC9B0' },
        { token: 'struct', foreground: '4EC9B0' },
        { token: 'class', foreground: '4EC9B0' },
        { token: 'interface', foreground: '4EC9B0' },
        { token: 'parameter', foreground: '9CDCFE' },
        { token: 'variable', foreground: '9CDCFE' },
        { token: 'function', foreground: 'DCDCAA' }
      ],
      colors: {
        'editor.background': '#1E1E1E',
        'editor.foreground': '#D4D4D4',
        'editor.selectionBackground': '#264F78',
        'editor.lineHighlightBackground': '#2A2D2E',
        'editorCursor.foreground': '#AEAFAD',
        'editor.selectionHighlightBackground': '#ADD6FF26'
      }
    });

    // Define light theme
    monaco.editor.defineTheme('playwright-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '008000' },
        { token: 'keyword', foreground: '0000FF' },
        { token: 'string', foreground: 'A31515' },
        { token: 'number', foreground: '098658' },
        { token: 'regexp', foreground: 'D16969' }
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#000000'
      }
    });
  }

  async switchTheme(themeName) {
    await this.initPromise;
    monaco.editor.setTheme(themeName);
  }

  dispose() {
    Object.values(this.editors).forEach(editor => {
      if (editor) {
        editor.dispose();
      }
    });
    this.editors = {};

    if (this.autoSaveTimers) {
      Object.values(this.autoSaveTimers).forEach(timer => {
        clearTimeout(timer);
      });
      this.autoSaveTimers = {};
    }
  }

  // Utility methods for common editor operations
  async insertPageObjectTemplate(editorId) {
    const template = `import { Page } from '@playwright/test';

export class \${1:PageName} {
  constructor(page: Page) {
    this.page = page;
  }

  // Locators
  readonly \${2:elementName} = this.page.locator('\${3:selector}');

  // Actions
  async \${4:methodName}() {
    \${5:// Implementation}
  }

  // Assertions
  async assert\${6:Something}() {
    await expect(this.\${2:elementName}).toBeVisible();
  }
}`;
    
    await this.setEditorContent(editorId, template);
  }

  async insertTestTemplate(editorId) {
    const template = `import { test, expect } from '@playwright/test';
import { \${1:PageObjectName} } from '../page-objects/\${2:page-object-file}';

test.describe('\${3:Feature Name}', () => {
  test('\${4:should do something}', async ({ page }) => {
    const \${5:pageObject} = new \${1:PageObjectName}(page);
    
    // Arrange
    await page.goto('\${6:url}');
    
    // Act
    \${7:// Perform actions}
    
    // Assert
    \${8:// Add assertions}
  });
});`;
    
    await this.setEditorContent(editorId, template);
  }
}

// Initialize Monaco Editor Manager when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  window.monacoManager = new MonacoEditorManager();
  
  // Setup Playwright completions and themes after initialization
  await window.monacoManager.initPromise;
  window.monacoManager.setupPlaywrightCompletions();
  window.monacoManager.setupThemes();
  
  // Set default theme
  monaco.editor.setTheme('playwright-dark');
});