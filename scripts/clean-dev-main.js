const fs = require('fs');
const path = require('path');

const roots = [
  path.join(__dirname, '..', 'dist', 'main'),
  path.join(__dirname, '..', 'dist', 'preload'),
];

for (const target of roots) {
  fs.rmSync(target, { recursive: true, force: true });
}
