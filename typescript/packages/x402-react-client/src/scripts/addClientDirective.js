#!/usr/bin/env node

import fs from "fs";

const CLIENT_DIRECTIVE = `'use client';\n`;

function addClientDirective(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(` File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");

  // Skip if directive already exists
  if (content.startsWith(CLIENT_DIRECTIVE) || content.startsWith("'use client';")) {
    console.log(`Already has directive: ${filePath}`);
    return;
  }

  fs.writeFileSync(filePath, `${CLIENT_DIRECTIVE}${content}`, "utf8");
  console.log(`Added directive: ${filePath}`);
}

// Add to all output files
const files = ["dist/index.js", "dist/index.cjs"];

files.forEach(addClientDirective);

console.log("\nClient directives added successfully!");
process.exit(0);
