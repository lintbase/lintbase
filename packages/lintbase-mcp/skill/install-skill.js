#!/usr/bin/env node
// install-skill.js
// Installs the LintBase SKILL.md into the current project's .agent/skills/ directory.
// Run via: npx lintbase-mcp install-skill
//      or: node install-skill.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SKILL_SRC = path.join(__dirname, 'SKILL.md');
const TARGET_DIR = path.join(process.cwd(), '.agent', 'skills', 'lintbase');
const TARGET_FILE = path.join(TARGET_DIR, 'SKILL.md');

// Create target directory if it doesn't exist
fs.mkdirSync(TARGET_DIR, { recursive: true });

// Copy SKILL.md
fs.copyFileSync(SKILL_SRC, TARGET_FILE);

console.log(`✅ LintBase skill installed to ${TARGET_FILE}`);
console.log('');
console.log('Your AI agent will now automatically use LintBase tools');
console.log('before writing any Firestore code.');
console.log('');
console.log('Make sure lintbase-mcp is configured in your IDE:');
console.log('  → https://www.npmjs.com/package/lintbase-mcp');
