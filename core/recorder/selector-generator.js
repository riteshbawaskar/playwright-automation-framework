class SelectorGenerator {
  constructor(options = {}) {
    this.options = {
      preferredAttributes: ['data-testid', 'data-test', 'data-cy', 'id'],
      fallbackStrategies: ['css', 'xpath', 'text'],
      avoidAttributes: ['style', 'class'],
      maxTextLength: 30,
      useStableSelectors: true,
      ...options
    };
  }

  async generateSelector(page, elementHandle) {
    try {
      // Get element information
      const elementInfo = await this.getElementInfo(page, elementHandle);
      
      // Try different selector strategies in order of preference
      const strategies = [
        () => this.generateTestIdSelector(elementInfo),
        () => this.generateIdSelector(elementInfo),
        () => this.generateNameSelector(elementInfo),
        () => this.generateRoleSelector(elementInfo),
        () => this.generateTextSelector(elementInfo),
        () => this.generateCssSelector(elementInfo),
        () => this.generateXPathSelector(elementInfo)
      ];

      for (const strategy of strategies) {
        const selector = await strategy();
        if (selector) {
          // Validate selector uniqueness
          if (await this.validateSelector(page, selector, elementHandle)) {
            return {
              primary: selector.selector,
              type: selector.type,
              confidence: selector.confidence,
              fallbacks: await this.generateFallbacks(page, elementHandle, selector)
            };
          }
        }
      }

      // If all else fails, use a combination approach
      return await this.generateCompositeSelector(page, elementHandle, elementInfo);
    } catch (error) {
      console.error('Error generating selector:', error);
      return {
        primary: `xpath=//body//*[position()=${await this.getElementIndex(page, elementHandle)}]`,
        type: 'xpath',
        confidence: 0.1,
        fallbacks: []
      };
    }
  }

  async getElementInfo(page, elementHandle) {
    return await page.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      
      return {
        tagName: element.tagName.toLowerCase(),
        id: element.id,
        className: element.className,
        textContent: element.textContent?.trim() || '',
        innerText: element.innerText?.trim() || '',
        value: element.value || '',
        placeholder: element.placeholder || '',
        title: element.title || '',
        alt: element.alt || '',
        href: element.href || '',
        src: element.src || '',
        type: element.type || '',
        name: element.name || '',
        role: element.getAttribute('role') || '',
        ariaLabel: element.getAttribute('aria-label') || '',
        attributes: Array.from(element.attributes).reduce((acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {}),
        parent: {
          tagName: element.parentElement?.tagName.toLowerCase() || '',
          className: element.parentElement?.className || '',
          id: element.parentElement?.id || ''
        },
        position: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        isVisible: styles.display !== 'none' && styles.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
        index: Array.from(element.parentElement?.children || []).indexOf(element)
      };
    }, elementHandle);
  }

  generateTestIdSelector(elementInfo) {
    for (const attr of this.options.preferredAttributes) {
      if (elementInfo.attributes[attr]) {
        return {
          selector: `[${attr}="${elementInfo.attributes[attr]}"]`,
          type: 'data-attribute',
          confidence: 0.9,
          attribute: attr,
          value: elementInfo.attributes[attr]
        };
      }
    }
    return null;
  }

  generateIdSelector(elementInfo) {
    if (elementInfo.id && this.isStableId(elementInfo.id)) {
      return {
        selector: `#${CSS.escape(elementInfo.id)}`,
        type: 'id',
        confidence: 0.8,
        value: elementInfo.id
      };
    }
    return null;
  }

  generateNameSelector(elementInfo) {
    if (elementInfo.name && ['input', 'select', 'textarea'].includes(elementInfo.tagName)) {
      return {
        selector: `${elementInfo.tagName}[name="${elementInfo.name}"]`,
        type: 'name',
        confidence: 0.7,
        value: elementInfo.name
      };
    }
    return null;
  }

  generateRoleSelector(elementInfo) {
    if (elementInfo.role) {
      let selector = `[role="${elementInfo.role}"]`;
      
      // Add accessible name if available
      if (elementInfo.ariaLabel) {
        selector += `[aria-label="${elementInfo.ariaLabel}"]`;
      } else if (elementInfo.textContent && elementInfo.textContent.length <= this.options.maxTextLength) {
        // Role + text combination for better specificity
        return {
          selector: `${selector}:has-text("${this.escapeText(elementInfo.textContent)}")`,
          type: 'role-text',
          confidence: 0.75,
          role: elementInfo.role,
          text: elementInfo.textContent
        };
      }
      
      return {
        selector,
        type: 'role',
        confidence: 0.6,
        role: elementInfo.role
      };
    }
    return null;
  }

  generateTextSelector(elementInfo) {
    const text = elementInfo.textContent || elementInfo.innerText || elementInfo.value;
    
    if (text && text.length > 0 && text.length <= this.options.maxTextLength) {
      // Prefer specific element types with text
      if (['button', 'a', 'label', 'span'].includes(elementInfo.tagName)) {
        return {
          selector: `${elementInfo.tagName}:has-text("${this.escapeText(text)}")`,
          type: 'text',
          confidence: 0.65,
          text: text
        };
      }
      
      // Generic text selector
      return {
        selector: `:has-text("${this.escapeText(text)}")`,
        type: 'text',
        confidence: 0.5,
        text: text
      };
    }
    
    // Try placeholder text for inputs
    if (elementInfo.placeholder && ['input', 'textarea'].includes(elementInfo.tagName)) {
      return {
        selector: `${elementInfo.tagName}[placeholder="${elementInfo.placeholder}"]`,
        type: 'placeholder',
        confidence: 0.6,
        placeholder: elementInfo.placeholder
      };
    }
    
    return null;
  }

  generateCssSelector(elementInfo) {
    const parts = [];
    
    // Start with tag name
    parts.push(elementInfo.tagName);
    
    // Add stable classes (avoid generated/random classes)
    if (elementInfo.className) {
      const stableClasses = this.getStableClasses(elementInfo.className);
      if (stableClasses.length > 0) {
        parts.push('.' + stableClasses.join('.'));
      }
    }
    
    // Add type for inputs
    if (elementInfo.type && elementInfo.tagName === 'input') {
      parts.push(`[type="${elementInfo.type}"]`);
    }
    
    // Add position if needed for disambiguation
    const selector = parts.join('');
    
    return {
      selector,
      type: 'css',
      confidence: 0.4,
      classes: elementInfo.className
    };
  }

  generateXPathSelector(elementInfo) {
    const parts = [`//${elementInfo.tagName}`];
    
    // Add attributes for specificity
    const conditions = [];
    
    if (elementInfo.id) {
      conditions.push(`@id="${elementInfo.id}"`);
    }
    
    if (elementInfo.className) {
      conditions.push(`contains(@class, "${elementInfo.className.split(' ')[0]}")`);
    }
    
    if (elementInfo.textContent && elementInfo.textContent.length <= this.options.maxTextLength) {
      conditions.push(`contains(text(), "${this.escapeText(elementInfo.textContent)}")`);
    }
    
    if (conditions.length > 0) {
      parts.push(`[${conditions.join(' and ')}]`);
    }
    
    return {
      selector: `xpath=${parts.join('')}`,
      type: 'xpath',
      confidence: 0.3
    };
  }

  async generateCompositeSelector(page, elementHandle, elementInfo) {
    // Try to create a unique selector by combining multiple attributes
    const attributes = [];
    
    if (elementInfo.tagName) attributes.push(elementInfo.tagName);
    if (elementInfo.type) attributes.push(`[type="${elementInfo.type}"]`);
    if (elementInfo.name) attributes.push(`[name="${elementInfo.name}"]`);
    
    // Add position as last resort
    const selector = attributes.join('') + `:nth-of-type(${elementInfo.index + 1})`;
    
    return {
      primary: selector,
      type: 'composite',
      confidence: 0.2,
      fallbacks: []
    };
  }

  async generateFallbacks(page, elementHandle, primarySelector) {
    const fallbacks = [];
    const elementInfo = await this.getElementInfo(page, elementHandle);
    
    // Generate different types of fallbacks
    const fallbackStrategies = [
      () => this.generateXPathSelector(elementInfo),
      () => this.generateCssSelector(elementInfo),
      () => this.generateTextSelector(elementInfo)
    ];
    
    for (const strategy of fallbackStrategies) {
      const fallback = await strategy();
      if (fallback && fallback.selector !== primarySelector.selector) {
        if (await this.validateSelector(page, fallback, elementHandle)) {
          fallbacks.push(fallback);
          if (fallbacks.length >= 2) break; // Limit fallbacks
        }
      }
    }
    
    return fallbacks;
  }

  async validateSelector(page, selectorInfo, originalElement) {
    try {
      const elements = await page.locator(selectorInfo.selector).all();
      
      // Check if selector finds exactly one element
      if (elements.length !== 1) {
        return false;
      }
      
      // Verify it's the same element
      const foundElement = elements[0];
      const isSame = await page.evaluate(
        ([original, found]) => original === found,
        [originalElement, foundElement]
      );
      
      return isSame;
    } catch (error) {
      return false;
    }
  }

  async getElementIndex(page, elementHandle) {
    return await page.evaluate((element) => {
      const siblings = Array.from(element.parentElement?.children || []);
      return siblings.indexOf(element);
    }, elementHandle);
  }

  isStableId(id) {
    // Avoid auto-generated IDs that might change
    const unstablePatterns = [
      /^[a-f0-9]{8,}$/i,  // Long hex strings
      /^\d+$/,            // Pure numbers
      /^(react|vue|ng)-/i, // Framework-generated
      /_\d+$/,            // Ending with underscore + number
      /^generated/i       // Starting with 'generated'
    ];
    
    return !unstablePatterns.some(pattern => pattern.test(id));
  }

  getStableClasses(classString) {
    const classes = classString.split(' ').filter(Boolean);
    
    return classes.filter(className => {
      // Filter out likely generated/unstable classes
      const unstablePatterns = [
        /^[a-f0-9]{8,}$/i,      // Long hex strings
        /^\w+_\w+_[a-f0-9]+$/i, // CSS modules pattern
        /^css-[a-f0-9]+$/i,     // Emotion/styled-components
        /^[A-Z][a-zA-Z0-9]{10,}$/, // Long PascalCase (likely generated)
        /^\d/                    // Starting with number
      ];
      
      return !unstablePatterns.some(pattern => pattern.test(className));
    });
  }

  escapeText(text) {
    // Escape special characters for selector strings
    return text.replace(/"/g, '\\"').replace(/\n/g, '\\n').trim();
  }

  // Advanced selector generation for complex scenarios
  async generateAdvancedSelector(page, elementHandle, context = {}) {
    const elementInfo = await this.getElementInfo(page, elementHandle);
    
    // For form fields, consider label association
    if (['input', 'select', 'textarea'].includes(elementInfo.tagName)) {
      const labelSelector = await this.findAssociatedLabel(page, elementHandle);
      if (labelSelector) {
        return {
          primary: labelSelector,
          type: 'label-association',
          confidence: 0.85,
          fallbacks: []
        };
      }
    }
    
    // For buttons in toolbars or specific containers
    if (context.containerSelector) {
      return {
        primary: `${context.containerSelector} ${elementInfo.tagName}:has-text("${this.escapeText(elementInfo.textContent)}")`,
        type: 'contextual',
        confidence: 0.7,
        context: context.containerSelector
      };
    }
    
    // For table cells
    if (await this.isInTable(page, elementHandle)) {
      return await this.generateTableCellSelector(page, elementHandle);
    }
    
    // For list items
    if (await this.isInList(page, elementHandle)) {
      return await this.generateListItemSelector(page, elementHandle);
    }
    
    // Default fallback
    return await this.generateSelector(page, elementHandle);
  }

  async findAssociatedLabel(page, inputElement) {
    try {
      const labelText = await page.evaluate((input) => {
        // Check for explicit label association
        if (input.id) {
          const label = document.querySelector(`label[for="${input.id}"]`);
          if (label) return label.textContent.trim();
        }
        
        // Check for implicit label association (input inside label)
        const parentLabel = input.closest('label');
        if (parentLabel) return parentLabel.textContent.trim();
        
        // Check for aria-label
        if (input.getAttribute('aria-label')) {
          return input.getAttribute('aria-label');
        }
        
        // Check for preceding label-like element
        const prevElement = input.previousElementSibling;
        if (prevElement && ['label', 'span', 'div'].includes(prevElement.tagName.toLowerCase())) {
          return prevElement.textContent.trim();
        }
        
        return null;
      }, inputElement);
      
      if (labelText) {
        return `input:near(:text("${this.escapeText(labelText)}"))`;
      }
    } catch (error) {
      console.warn('Error finding associated label:', error);
    }
    
    return null;
  }

  async isInTable(page, elementHandle) {
    return await page.evaluate((element) => {
      return !!element.closest('table');
    }, elementHandle);
  }

  async generateTableCellSelector(page, elementHandle) {
    const cellInfo = await page.evaluate((cell) => {
      const table = cell.closest('table');
      const row = cell.closest('tr');
      const rows = Array.from(table.querySelectorAll('tr'));
      const cells = Array.from(row.querySelectorAll('td, th'));
      
      return {
        rowIndex: rows.indexOf(row),
        cellIndex: cells.indexOf(cell),
        rowText: row.textContent.trim(),
        cellText: cell.textContent.trim(),
        hasHeader: !!table.querySelector('th')
      };
    }, elementHandle);
    
    // Try to use header information if available
    if (cellInfo.hasHeader) {
      return {
        primary: `table >> tr:nth-child(${cellInfo.rowIndex + 1}) >> td:nth-child(${cellInfo.cellIndex + 1})`,
        type: 'table-cell',
        confidence: 0.6,
        position: { row: cellInfo.rowIndex, cell: cellInfo.cellIndex }
      };
    }
    
    return {
      primary: `table >> :text("${this.escapeText(cellInfo.cellText)}")`,
      type: 'table-text',
      confidence: 0.5,
      text: cellInfo.cellText
    };
  }

  async isInList(page, elementHandle) {
    return await page.evaluate((element) => {
      return !!element.closest('ul, ol, [role="list"]');
    }, elementHandle);
  }

  async generateListItemSelector(page, elementHandle) {
    const listInfo = await page.evaluate((item) => {
      const list = item.closest('ul, ol, [role="list"]');
      const items = Array.from(list.querySelectorAll('li, [role="listitem"]'));
      
      return {
        index: items.indexOf(item),
        text: item.textContent.trim(),
        listType: list.tagName.toLowerCase()
      };
    }, elementHandle);
    
    return {
      primary: `${listInfo.listType} >> li:nth-child(${listInfo.index + 1})`,
      type: 'list-item',
      confidence: 0.5,
      position: listInfo.index,
      text: listInfo.text
    };
  }

  // Generate selector for shadow DOM elements
  async generateShadowDOMSelector(page, elementHandle) {
    try {
      const shadowInfo = await page.evaluate((element) => {
        const path = [];
        let current = element;
        
        while (current) {
          if (current.host) {
            // We're in a shadow root
            path.unshift({ type: 'shadow', selector: this.getElementSelector(current.host) });
            current = current.host;
          } else {
            path.unshift({ type: 'regular', selector: this.getElementSelector(current) });
            current = current.parentElement;
          }
        }
        
        return path;
      }, elementHandle);
      
      // Build selector path for shadow DOM
      const selectorParts = shadowInfo.map(part => {
        if (part.type === 'shadow') {
          return `${part.selector} >> shadow`;
        }
        return part.selector;
      });
      
      return {
        primary: selectorParts.join(' >> '),
        type: 'shadow-dom',
        confidence: 0.6,
        path: shadowInfo
      };
    } catch (error) {
      console.warn('Error generating shadow DOM selector:', error);
      return null;
    }
  }

  // Generate relative selectors (useful for complex layouts)
  async generateRelativeSelector(page, elementHandle, anchorElement) {
    try {
      const elementInfo = await this.getElementInfo(page, elementHandle);
      const anchorInfo = await this.getElementInfo(page, anchorElement);
      
      // Calculate spatial relationship
      const relationship = this.calculateSpatialRelationship(elementInfo.position, anchorInfo.position);
      
      const anchorSelector = await this.generateSelector(page, anchorElement);
      
      return {
        primary: `${anchorSelector.primary} >> ${relationship} >> ${elementInfo.tagName}`,
        type: 'relative',
        confidence: 0.4,
        anchor: anchorSelector.primary,
        relationship
      };
    } catch (error) {
      console.warn('Error generating relative selector:', error);
      return null;
    }
  }

  calculateSpatialRelationship(targetPos, anchorPos) {
    const deltaX = targetPos.x - anchorPos.x;
    const deltaY = targetPos.y - anchorPos.y;
    
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX > 0 ? 'right-of' : 'left-of';
    } else {
      return deltaY > 0 ? 'below' : 'above';
    }
  }

  // Performance optimization: Cache selectors for elements
  createSelectorCache() {
    this.selectorCache = new Map();
  }

  getCachedSelector(elementKey) {
    return this.selectorCache?.get(elementKey);
  }

  setCachedSelector(elementKey, selector) {
    if (this.selectorCache) {
      this.selectorCache.set(elementKey, selector);
    }
  }

  generateElementKey(elementInfo) {
    // Create a unique key for caching based on element properties
    const keyParts = [
      elementInfo.tagName,
      elementInfo.id,
      elementInfo.className,
      elementInfo.textContent.substring(0, 20),
      elementInfo.position.x,
      elementInfo.position.y
    ];
    
    return keyParts.filter(Boolean).join('|');
  }

  // Selector validation and improvement
  async improveSelectorStability(page, selector) {
    try {
      // Test selector against page changes
      const initialCount = await page.locator(selector.primary).count();
      
      // Simulate common page changes
      await page.evaluate(() => {
        // Add some dynamic classes
        document.body.classList.add('test-class-' + Math.random());
      });
      
      const afterChangeCount = await page.locator(selector.primary).count();
      
      if (initialCount !== afterChangeCount) {
        // Selector is unstable, try to improve it
        console.warn(`Selector "${selector.primary}" is potentially unstable`);
        selector.confidence *= 0.8; // Reduce confidence
      }
      
      return selector;
    } catch (error) {
      console.warn('Error testing selector stability:', error);
      return selector;
    }
  }

  // Generate multiple selector strategies for A/B testing
  async generateMultipleStrategies(page, elementHandle) {
    const strategies = [];
    
    const elementInfo = await this.getElementInfo(page, elementHandle);
    
    // Strategy 1: Attribute-based
    const attrSelector = this.generateTestIdSelector(elementInfo) || this.generateIdSelector(elementInfo);
    if (attrSelector) strategies.push({ ...attrSelector, strategy: 'attribute' });
    
    // Strategy 2: Text-based
    const textSelector = this.generateTextSelector(elementInfo);
    if (textSelector) strategies.push({ ...textSelector, strategy: 'text' });
    
    // Strategy 3: CSS-based
    const cssSelector = this.generateCssSelector(elementInfo);
    if (cssSelector) strategies.push({ ...cssSelector, strategy: 'css' });
    
    // Strategy 4: XPath-based
    const xpathSelector = this.generateXPathSelector(elementInfo);
    if (xpathSelector) strategies.push({ ...xpathSelector, strategy: 'xpath' });
    
    // Validate all strategies
    const validStrategies = [];
    for (const strategy of strategies) {
      if (await this.validateSelector(page, strategy, elementHandle)) {
        validStrategies.push(strategy);
      }
    }
    
    return validStrategies.sort((a, b) => b.confidence - a.confidence);
  }

  // Export selector configuration for reuse
  exportConfiguration() {
    return {
      options: this.options,
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
  }

  // Import selector configuration
  importConfiguration(config) {
    if (config.version === '1.0.0') {
      this.options = { ...this.options, ...config.options };
    }
  }
}

module.exports = SelectorGenerator;