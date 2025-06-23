// scripts/rename-to-cjs.js
const fs = require('fs');
const path = require('path');

function walk(dir) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (path.extname(fullPath) === '.js') {
      const newPath = fullPath.replace(/\.js$/, '.cjs');
      fs.renameSync(fullPath, newPath);
    }
  }
}

walk(path.resolve(__dirname, '../dist'));