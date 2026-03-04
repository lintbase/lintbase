#!/usr/bin/env node
// install-skill.js — CommonJS compatible
// Installs the LintBase SKILL.md into the current project's .agent/skills/ directory.
// Run via: npx lintbase-mcp-install-skill

const fs = require('fs');
const path = require('path');

const SKILL_SRC = path.join(__dirname, 'SKILL.md');
const TARGET_DIR = path.join(process.cwd(), '.agent', 'skills', 'lintbase');
const TARGET_FILE = path.join(TARGET_DIR, 'SKILL.md');

// Create target directory if it doesn't exist
fs.mkdirSync(TARGET_DIR, { recursive: true });

// Copy SKILL.md
fs.copyFileSync(SKILL_SRC, TARGET_FILE);

console.log('');
console.log('✅ LintBase skill installed to:');
console.log('   ' + TARGET_FILE);
console.log('');
console.log('Your AI agent will now automatically check the real Firestore schema');
console.log('before writing any database code.');
console.log('');
console.log('Make sure lintbase-mcp is configured in your IDE:');
console.log('  → https://www.npmjs.com/package/lintbase-mcp');
console.log('');
