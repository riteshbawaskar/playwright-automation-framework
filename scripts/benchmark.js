#!/usr/bin/env node
// scripts/benchmark.js - Performance benchmarking

const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');

class PerformanceBenchmark {
  constructor() {
    this.results = {};
  }

  async runBenchmarks() {
    console.log('🏃 Running performance benchmarks...\n');
    
    await this.benchmarkFileOperations();
    await this.benchmarkSelectorGeneration();
    await this.benchmarkCodeGeneration();
    await this.benchmarkTestExecution();
    
    this.generateReport();
  }

  async benchmarkFileOperations() {
    console.log('📁 Benchmarking file operations...');
    
    const iterations = 100;
    const testData = 'x'.repeat(1000);
    
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const filePath = `temp/test-${i}.txt`;
      await fs.writeFile(filePath, testData);
      await fs.readFile(filePath, 'utf8');
      await fs.unlink(filePath);
    }
    
    const end = performance.now();
    const duration = end - start;
    
    this.results.fileOperations = {
      iterations,
      totalTime: duration,
      averageTime: duration / iterations,
      operationsPerSecond: (iterations / duration) * 1000
    };
    
    console.log(`  ✅ Completed in ${duration.toFixed(2)}ms`);
  }

  async benchmarkSelectorGeneration() {
    console.log('🎯 Benchmarking selector generation...');
    
    const SelectorGenerator = require('../core/recorder/selector-generator');
    const selectorGenerator = new SelectorGenerator();
    
    const mockElementData = {
      tagName: 'input',
      id: 'test-input',
      className: 'form-control',
      attributes: { 'data-testid': 'username-input', type: 'text' }
    };
    
    const iterations = 1000;
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      selectorGenerator.generateTestIdSelector(mockElementData);
      selectorGenerator.generateIdSelector(mockElementData);
      selectorGenerator.generateCssSelector(mockElementData);
    }
    
    const end = performance.now();
    const duration = end - start;
    
    this.results.selectorGeneration = {
      iterations,
      totalTime: duration,
      averageTime: duration / iterations,
      selectorsPerSecond: (iterations / duration) * 1000
    };
    
    console.log(`  ✅ Completed in ${duration.toFixed(2)}ms`);
  }

  async benchmarkCodeGeneration() {
    console.log('🔧 Benchmarking code generation...');
    
    const Handlebars = require('handlebars');
    
    const template = Handlebars.compile(`
      export class {{className}} {
        {{#each methods}}
        async {{name}}() {
          {{body}}
        }
        {{/each}}
      }
    `);
    
    const templateData = {
      className: 'TestPage',
      methods: Array.from({ length: 10 }, (_, i) => ({
        name: `method${i}`,
        body: `console.log('Method ${i}');`
      }))
    };
    
    const iterations = 500;
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      template(templateData);
    }
    
    const end = performance.now();
    const duration = end - start;
    
    this.results.codeGeneration = {
      iterations,
      totalTime: duration,
      averageTime: duration / iterations,
      generationsPerSecond: (iterations / duration) * 1000
    };
    
    console.log(`  ✅ Completed in ${duration.toFixed(2)}ms`);
  }
}