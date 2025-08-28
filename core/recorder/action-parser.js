class ActionParser {
  constructor(options = {}) {
    this.options = {
      optimizeSequences: true,
      groupSimilarActions: true,
      generateWaitStrategies: true,
      minWaitTime: 100,
      maxWaitTime: 5000,
      ...options
    };
  }

  optimizeActions(recordedActions) {
    if (!Array.isArray(recordedActions) || recordedActions.length === 0) {
      return [];
    }

    let optimizedActions = [...recordedActions];

    // Apply optimization strategies
    optimizedActions = this.removeRedundantActions(optimizedActions);
    optimizedActions = this.groupSequentialActions(optimizedActions);
    optimizedActions = this.addWaitStrategies(optimizedActions);
    optimizedActions = this.optimizeFormFilling(optimizedActions);
    optimizedActions = this.optimizeNavigation(optimizedActions);

    return this.convertToTestSteps(optimizedActions);
  }

  removeRedundantActions(actions) {
    const filtered = [];
    
    for (let i = 0; i < actions.length; i++) {
      const current = actions[i];
      const next = actions[i + 1];
      
      // Skip redundant consecutive clicks on same element
      if (current.type === 'click' && next?.type === 'click' && 
          current.selector?.primary === next.selector?.primary) {
        continue;
      }
      
      // Skip redundant input actions (keep only the final value)
      if (current.type === 'input' && next?.type === 'input' &&
          current.selector?.primary === next.selector?.primary) {
        continue;
      }
      
      // Skip hover actions immediately followed by click on same element
      if (current.type === 'hover' && next?.type === 'click' &&
          current.selector?.primary === next.selector?.primary) {
        continue;
      }
      
      filtered.push(current);
    }
    
    return filtered;
  }

  groupSequentialActions(actions) {
    const grouped = [];
    let currentGroup = [];
    let currentGroupType = null;
    
    for (const action of actions) {
      // Group form-related actions
      if (['input', 'select', 'click'].includes(action.type) && this.isFormElement(action.element)) {
        if (currentGroupType !== 'form') {
          if (currentGroup.length > 0) {
            grouped.push(...this.finalizeGroup(currentGroup, currentGroupType));
          }
          currentGroup = [];
          currentGroupType = 'form';
        }
        currentGroup.push(action);
      }
      // Group navigation actions
      else if (action.type === 'navigation') {
        if (currentGroup.length > 0) {
          grouped.push(...this.finalizeGroup(currentGroup, currentGroupType));
        }
        grouped.push(action);
        currentGroup = [];
        currentGroupType = null;
      }
      // Default: add to current group or start new one
      else {
        if (currentGroupType && currentGroupType !== 'general') {
          grouped.push(...this.finalizeGroup(currentGroup, currentGroupType));
          currentGroup = [];
        }
        currentGroup.push(action);
        currentGroupType = 'general';
      }
    }
    
    // Finalize remaining group
    if (currentGroup.length > 0) {
      grouped.push(...this.finalizeGroup(currentGroup, currentGroupType));
    }
    
    return grouped;
  }

  finalizeGroup(group, groupType) {
    if (groupType === 'form' && group.length > 1) {
      // Create a composite form-filling action
      return [{
        type: 'form_sequence',
        actions: group,
        timestamp: group[0].timestamp,
        description: this.generateFormDescription(group)
      }];
    }
    
    return group;
  }

  isFormElement(element) {
    if (!element) return false;
    
    const formTags = ['input', 'select', 'textarea', 'button'];
    return formTags.includes(element.tagName) || element.attributes?.type === 'submit';
  }

  generateFormDescription(formActions) {
    const fieldCount = formActions.filter(a => a.type === 'input').length;
    const hasSubmit = formActions.some(a => a.type === 'click' && 
      (a.element?.attributes?.type === 'submit' || a.element?.tagName === 'button'));
    
    let description = `Fill form with ${fieldCount} field${fieldCount !== 1 ? 's' : ''}`;
    if (hasSubmit) description += ' and submit';
    
    return description;
  }

  addWaitStrategies(actions) {
    const withWaits = [];
    
    for (let i = 0; i < actions.length; i++) {
      const current = actions[i];
      const next = actions[i + 1];
      
      withWaits.push(current);
      
      // Add waits based on action patterns
      const waitStrategy = this.determineWaitStrategy(current, next);
      if (waitStrategy) {
        withWaits.push({
          type: 'wait',
          strategy: waitStrategy.type,
          selector: waitStrategy.selector,
          timeout: waitStrategy.timeout,
          timestamp: current.timestamp + 1
        });
      }
    }
    
    return withWaits;
  }

  determineWaitStrategy(currentAction, nextAction) {
    if (!nextAction) return null;
    
    const timeDiff = nextAction.timestamp - currentAction.timestamp;
    
    // Navigation: wait for page load
    if (currentAction.type === 'navigation') {
      return {
        type: 'networkidle',
        timeout: 5000
      };
    }
    
    // Click: wait for potential page changes
    if (currentAction.type === 'click') {
      // If next action is on different page/URL, wait for navigation
      if (nextAction.type === 'navigation') {
        return {
          type: 'navigation',
          timeout: 10000
        };
      }
      
      // If next action takes time, wait for element
      if (timeDiff > this.options.minWaitTime && nextAction.selector) {
        return {
          type: 'visible',
          selector: nextAction.selector.primary,
          timeout: Math.min(timeDiff * 2, this.options.maxWaitTime)
        };
      }
    }
    
    // Form submission: wait for response
    if (currentAction.type === 'click' && this.isSubmitButton(currentAction.element)) {
      return {
        type: 'networkidle',
        timeout: 10000
      };
    }
    
    // API calls: wait for completion
    if (currentAction.type === 'api_call') {
      return {
        type: 'response',
        url: currentAction.url,
        timeout: 5000
      };
    }
    
    return null;
  }

  isSubmitButton(element) {
    if (!element) return false;
    
    return (
      element.attributes?.type === 'submit' ||
      (element.tagName === 'button' && !element.attributes?.type) ||
      (element.tagName === 'button' && element.attributes?.type === 'submit')
    );
  }

  optimizeFormFilling(actions) {
    const optimized = [];
    
    for (const action of actions) {
      if (action.type === 'form_sequence') {
        // Optimize the form sequence
        const optimizedSequence = this.optimizeFormSequence(action.actions);
        optimized.push({
          ...action,
          actions: optimizedSequence
        });
      } else {
        optimized.push(action);
      }
    }
    
    return optimized;
  }

  optimizeFormSequence(formActions) {
    // Group by form container
    const formGroups = new Map();
    
    for (const action of formActions) {
      const formContainer = this.identifyFormContainer(action);
      if (!formGroups.has(formContainer)) {
        formGroups.set(formContainer, []);
      }
      formGroups.get(formContainer).push(action);
    }
    
    // Optimize each form group
    const optimized = [];
    for (const [container, actions] of formGroups) {
      optimized.push(...this.optimizeFormGroup(actions, container));
    }
    
    return optimized;
  }

  identifyFormContainer(action) {
    // Try to identify the parent form element
    if (action.element?.parent?.tagName === 'form') {
      return action.element.parent.id || action.element.parent.className || 'form';
    }
    return 'default';
  }

  optimizeFormGroup(actions, container) {
    // Sort actions by logical order (labels first, then inputs, then submit)
    const sortedActions = actions.sort((a, b) => {
      const order = { input: 0, select: 1, textarea: 2, click: 3 };
      return (order[a.type] || 0) - (order[b.type] || 0);
    });
    
    return sortedActions;
  }

  optimizeNavigation(actions) {
    const optimized = [];
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      if (action.type === 'navigation') {
        // Look ahead to see if there are immediate actions on the new page
        const subsequentActions = this.getSubsequentActions(actions, i, 3);
        
        optimized.push({
          ...action,
          expectedElements: this.extractExpectedElements(subsequentActions)
        });
      } else {
        optimized.push(action);
      }
    }
    
    return optimized;
  }

  getSubsequentActions(actions, startIndex, count) {
    return actions.slice(startIndex + 1, startIndex + 1 + count);
  }

  extractExpectedElements(actions) {
    return actions
      .filter(action => action.selector)
      .map(action => ({
        selector: action.selector.primary,
        type: action.type
      }));
  }

  convertToTestSteps(optimizedActions) {
    return optimizedActions.map((action, index) => {
      return {
        id: index + 1,
        type: action.type,
        description: this.generateStepDescription(action),
        code: this.generateStepCode(action),
        selector: action.selector,
        data: this.extractStepData(action),
        assertions: this.generateAssertions(action),
        timestamp: action.timestamp
      };
    });
  }

  generateStepDescription(action) {
    switch (action.type) {
      case 'navigation':
        return `Navigate to ${action.url}`;
      
      case 'click':
        if (action.element?.textContent) {
          return `Click "${action.element.textContent.substring(0, 30)}"`;
        }
        return `Click ${action.element?.tagName || 'element'}`;
      
      case 'input':
        const fieldName = action.element?.name || action.element?.id || 'field';
        return `Enter text in ${fieldName}`;
      
      case 'select':
        return `Select option in ${action.element?.name || 'dropdown'}`;
      
      case 'hover':
        return `Hover over ${action.element?.tagName || 'element'}`;
      
      case 'keypress':
        return `Press ${action.key} key`;
      
      case 'wait':
        return `Wait for ${action.strategy}${action.selector ? ` (${action.selector})` : ''}`;
      
      case 'form_sequence':
        return action.description || 'Fill and submit form';
      
      case 'api_call':
        return `API call to ${action.url}`;
      
      default:
        return `Perform ${action.type}`;
    }
  }

  generateStepCode(action) {
    switch (action.type) {
      case 'navigation':
        return `await page.goto('${action.url}');`;
      
      case 'click':
        return `await page.locator('${action.selector?.primary}').click();`;
      
      case 'input':
        const value = action.value || '${data.inputValue}';
        return `await page.locator('${action.selector?.primary}').fill('${value}');`;
      
      case 'select':
        return `await page.locator('${action.selector?.primary}').selectOption('${action.value || '${data.optionValue}'}');`;
      
      case 'hover':
        return `await page.locator('${action.selector?.primary}').hover();`;
      
      case 'keypress':
        return `await page.keyboard.press('${action.key}');`;
      
      case 'wait':
        return this.generateWaitCode(action);
      
      case 'form_sequence':
        return this.generateFormSequenceCode(action);
      
      case 'api_call':
        return `// Wait for API call to ${action.url}\nawait page.waitForResponse('${action.url}');`;
      
      default:
        return `// ${action.type} action`;
    }
  }

  generateWaitCode(waitAction) {
    switch (waitAction.strategy) {
      case 'visible':
        return `await page.locator('${waitAction.selector}').waitFor({ state: 'visible' });`;
      
      case 'networkidle':
        return `await page.waitForLoadState('networkidle');`;
      
      case 'navigation':
        return `await page.waitForURL('**');`;
      
      case 'response':
        return `await page.waitForResponse('${waitAction.url}');`;
      
      default:
        return `await page.waitForTimeout(${waitAction.timeout || 1000});`;
    }
  }

  generateFormSequenceCode(formAction) {
    const codes = formAction.actions.map(action => this.generateStepCode(action));
    return codes.join('\n');
  }

  extractStepData(action) {
    const data = {};
    
    if (action.type === 'input' && action.value) {
      data.inputValue = action.value;
    }
    
    if (action.type === 'select' && action.value) {
      data.optionValue = action.value;
    }
    
    if (action.element) {
      data.elementText = action.element.textContent;
      data.elementType = action.element.tagName;
    }
    
    return Object.keys(data).length > 0 ? data : null;
  }

  generateAssertions(action) {
    const assertions = [];
    
    // Generate automatic assertions based on action type
    switch (action.type) {
      case 'navigation':
        assertions.push({
          type: 'url',
          description: 'Verify page URL',
          code: `await expect(page).toHaveURL('${action.url}');`
        });
        
        if (action.expectedElements && action.expectedElements.length > 0) {
          action.expectedElements.forEach(element => {
            assertions.push({
              type: 'visibility',
              description: `Verify ${element.type} element is visible`,
              code: `await expect(page.locator('${element.selector}')).toBeVisible();`
            });
          });
        }
        break;
      
      case 'click':
        // Add assertion to verify click was successful
        if (action.element?.tagName === 'button' && this.isSubmitButton(action.element)) {
          assertions.push({
            type: 'form_submission',
            description: 'Verify form submission',
            code: `// Verify form submission was successful`
          });
        }
        break;
      
      case 'input':
        assertions.push({
          type: 'input_value',
          description: 'Verify input value',
          code: `await expect(page.locator('${action.selector?.primary}')).toHaveValue('${action.value}');`
        });
        break;
    }
    
    return assertions.length > 0 ? assertions : null;
  }

  // Generate page object methods from actions
  generateMethods(actions, elements) {
    const methods = [];
    const processedSequences = new Set();
    
    // Group actions by functionality
    const actionGroups = this.groupActionsByFunction(actions);
    
    for (const [functionName, groupedActions] of actionGroups) {
      if (processedSequences.has(functionName)) continue;
      
      const method = this.createPageObjectMethod(functionName, groupedActions, elements);
      if (method) {
        methods.push(method);
        processedSequences.add(functionName);
      }
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
    
    return groups;
  }

  inferFunctionName(action) {
    // Try to infer meaningful function names from actions
    if (action.type === 'navigation') {
      const url = new URL(action.url);
      return `navigateTo${this.toPascalCase(url.pathname.replace(/[^a-zA-Z]/g, '') || 'page')}`;
    }
    
    if (action.type === 'form_sequence') {
      return 'fillForm';
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
    
    return `perform${this.toPascalCase(action.type)}`;
  }

  createPageObjectMethod(methodName, actions, elements) {
    // Generate method parameters
    const params = this.generateMethodParameters(actions);
    const paramString = params.map(p => p.name + (p.type ? `: ${p.type}` : '')).join(', ');
    
    // Generate method body
    const methodBody = actions.map(action => {
      const stepCode = this.generateStepCode(action);
      return stepCode.split('\n').map(line => '    ' + line).join('\n');
    }).join('\n');
    
    // Generate JSDoc
    const jsdoc = this.generateMethodJSDoc(methodName, params, actions);
    
    return {
      name: methodName,
      parameters: params,
      body: methodBody,
      jsdoc,
      actions: actions.length,
      isAsync: true
    };
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
      
      if (action.type === 'select' && action.value) {
        const paramName = this.generateParameterName(action, 'option');
        if (!paramNames.has(paramName)) {
          params.push({
            name: paramName,
            type: 'string',
            description: `Option to select`,
            defaultValue: action.value
          });
          paramNames.add(paramName);
        }
      }
    }
    
    return params;
  }

  generateParameterName(action, suffix = '') {
    if (action.element?.name) {
      return this.toCamelCase(action.element.name + suffix);
    }
    if (action.element?.id) {
      return this.toCamelCase(action.element.id + suffix);
    }
    return `value${suffix}`;
  }

  generateMethodJSDoc(methodName, params, actions) {
    const lines = [
      '  /**',
      `   * ${this.generateMethodDescription(methodName, actions)}`,
    ];
    
    // Add parameter documentation
    params.forEach(param => {
      lines.push(`   * @param {${param.type}} ${param.name} - ${param.description}`);
    });
    
    lines.push('   * @returns {Promise<void>}');
    lines.push('   */');
    
    return lines.join('\n');
  }

  generateMethodDescription(methodName, actions) {
    if (actions.length === 1) {
      return this.generateStepDescription(actions[0]);
    }
    
    const actionTypes = [...new Set(actions.map(a => a.type))];
    return `Performs ${actionTypes.join(', ')} actions (${actions.length} steps)`;
  }

  // Utility methods
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

  // Advanced optimization features
  analyzeUserFlow(actions) {
    const flow = {
      pages: new Set(),
      forms: [],
      apiCalls: [],
      interactions: [],
      totalDuration: 0
    };
    
    let currentPage = null;
    let formStart = null;
    
    for (const action of actions) {
      if (action.type === 'navigation') {
        currentPage = action.url;
        flow.pages.add(currentPage);
      }
      
      if (action.type === 'input' && !formStart) {
        formStart = action;
      }
      
      if (action.type === 'click' && this.isSubmitButton(action.element) && formStart) {
        flow.forms.push({
          page: currentPage,
          start: formStart,
          end: action,
          fields: actions.filter(a => a.timestamp >= formStart.timestamp && 
                                   a.timestamp <= action.timestamp && 
                                   a.type === 'input').length
        });
        formStart = null;
      }
      
      if (action.type === 'api_call') {
        flow.apiCalls.push({
          url: action.url,
          method: action.method,
          page: currentPage
        });
      }
      
      flow.interactions.push({
        type: action.type,
        page: currentPage,
        timestamp: action.timestamp
      });
    }
    
    if (actions.length > 0) {
      flow.totalDuration = actions[actions.length - 1].timestamp - actions[0].timestamp;
    }
    
    return flow;
  }

  generateFlowSummary(flow) {
    return {
      pagesVisited: flow.pages.size,
      formsCompleted: flow.forms.length,
      apiCallsMade: flow.apiCalls.length,
      totalInteractions: flow.interactions.length,
      durationSeconds: Math.round(flow.totalDuration / 1000),
      complexity: this.calculateComplexity(flow)
    };
  }

  calculateComplexity(flow) {
    let score = 0;
    
    // Base score from interactions
    score += flow.interactions.length * 0.5;
    
    // Extra score for page navigation
    score += flow.pages.size * 2;
    
    // Extra score for forms
    score += flow.forms.length * 3;
    
    // Extra score for API interactions
    score += flow.apiCalls.length * 1.5;
    
    // Normalize to 1-10 scale
    return Math.min(10, Math.max(1, Math.round(score / 5)));
  }

  // Performance optimization
  optimizeForPerformance(actions) {
    const optimized = [];
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      // Batch similar actions
      if (action.type === 'input') {
        const inputBatch = [action];
        let j = i + 1;
        
        // Look ahead for more input actions
        while (j < actions.length && 
               actions[j].type === 'input' && 
               actions[j].timestamp - inputBatch[inputBatch.length - 1].timestamp < 1000) {
          inputBatch.push(actions[j]);
          j++;
        }
        
        if (inputBatch.length > 1) {
          optimized.push({
            type: 'batch_input',
            actions: inputBatch,
            timestamp: inputBatch[0].timestamp,
            description: `Fill ${inputBatch.length} form fields`
          });
          i = j - 1; // Skip processed actions
        } else {
          optimized.push(action);
        }
      } else {
        optimized.push(action);
      }
    }
    
    return optimized;
  }

  // Error handling and resilience
  addErrorHandling(actions) {
    return actions.map(action => {
      const enhanced = { ...action };
      
      // Add retry logic for flaky actions
      if (['click', 'input', 'select'].includes(action.type)) {
        enhanced.retryConfig = {
          attempts: 3,
          delay: 1000,
          backoff: 'exponential'
        };
      }
      
      // Add error recovery strategies
      if (action.type === 'navigation') {
        enhanced.errorRecovery = {
          strategy: 'retry_with_reload',
          maxAttempts: 2
        };
      }
      
      // Add fallback selectors
      if (action.selector && action.selector.fallbacks) {
        enhanced.selectorFallbacks = action.selector.fallbacks;
      }
      
      return enhanced;
    });
  }

  // Test data extraction
  extractTestData(actions) {
    const testData = {
      urls: new Set(),
      formData: {},
      dynamicValues: [],
      staticValues: []
    };
    
    for (const action of actions) {
      if (action.type === 'navigation') {
        testData.urls.add(action.url);
      }
      
      if (action.type === 'input' && action.value) {
        const fieldName = action.element?.name || action.element?.id || 'unknown';
        testData.formData[fieldName] = action.value;
        
        // Detect if value looks dynamic (email, phone, etc.)
        if (this.isDynamicValue(action.value)) {
          testData.dynamicValues.push({
            field: fieldName,
            value: action.value,
            type: this.detectValueType(action.value)
          });
        } else {
          testData.staticValues.push({
            field: fieldName,
            value: action.value
          });
        }
      }
    }
    
    testData.urls = Array.from(testData.urls);
    return testData;
  }

  isDynamicValue(value) {
    const dynamicPatterns = [
      /@.*\./,  // Email
      /^\d{10,}$/, // Phone number
      /^\d{4}-\d{2}-\d{2}$/, // Date
      /^user\d+$/, // Generated username
      /test.*\d+/i // Test data with numbers
    ];
    
    return dynamicPatterns.some(pattern => pattern.test(value));
  }

  detectValueType(value) {
    if (/@.*\./.test(value)) return 'email';
    if (/^\d{10,}$/.test(value)) return 'phone';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    if (/^user\d+$/i.test(value)) return 'username';
    return 'text';
  }

  // Generate test scenarios
  generateTestScenarios(actions) {
    const scenarios = [];
    
    // Main happy path scenario
    scenarios.push({
      name: 'happy_path',
      description: 'Main user flow',
      actions: actions,
      priority: 'high',
      type: 'positive'
    });
    
    // Generate negative scenarios
    const negativeScenarios = this.generateNegativeScenarios(actions);
    scenarios.push(...negativeScenarios);
    
    // Generate edge case scenarios
    const edgeCaseScenarios = this.generateEdgeCaseScenarios(actions);
    scenarios.push(...edgeCaseScenarios);
    
    return scenarios;
  }

  generateNegativeScenarios(actions) {
    const scenarios = [];
    
    // Find form submissions and create invalid data scenarios
    const formSubmissions = actions.filter(action => 
      action.type === 'click' && this.isSubmitButton(action.element)
    );
    
    for (const submission of formSubmissions) {
      scenarios.push({
        name: 'invalid_form_data',
        description: 'Submit form with invalid data',
        actions: this.modifyActionsForInvalidData(actions),
        priority: 'medium',
        type: 'negative'
      });
    }
    
    return scenarios;
  }

  generateEdgeCaseScenarios(actions) {
    const scenarios = [];
    
    // Empty form scenario
    const hasFormInputs = actions.some(action => action.type === 'input');
    if (hasFormInputs) {
      scenarios.push({
        name: 'empty_form',
        description: 'Submit form with empty fields',
        actions: this.modifyActionsForEmptyForm(actions),
        priority: 'low',
        type: 'edge_case'
      });
    }
    
    return scenarios;
  }

  modifyActionsForInvalidData(actions) {
    return actions.map(action => {
      if (action.type === 'input') {
        return {
          ...action,
          value: this.generateInvalidValue(action.value, action.element)
        };
      }
      return action;
    });
  }

  modifyActionsForEmptyForm(actions) {
    return actions.map(action => {
      if (action.type === 'input') {
        return {
          ...action,
          value: ''
        };
      }
      return action;
    });
  }

  generateInvalidValue(originalValue, element) {
    if (element?.type === 'email' || /@/.test(originalValue)) {
      return 'invalid-email';
    }
    if (element?.type === 'tel' || /^\d{10,}$/.test(originalValue)) {
      return '123';
    }
    if (element?.type === 'password') {
      return '123'; // Too short
    }
    return 'invalid';
  }

  // Export configuration
  exportOptimizationConfig() {
    return {
      options: this.options,
      version: '1.0.0',
      strategies: [
        'removeRedundantActions',
        'groupSequentialActions', 
        'addWaitStrategies',
        'optimizeFormFilling',
        'optimizeNavigation'
      ],
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ActionParser;