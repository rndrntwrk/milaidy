import fs from 'fs';
import glob from 'glob';

// We'll just manually use find/exec or node's recursive readdir if glob isn't present,
// but let's try reading the files we already know about or just scanning recursively.
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

let total = 0;
const dirs = ['apps/app/src/components', 'packages/app-core/src/components'];

dirs.forEach(d => walkDir(d, file => {
  if (!file.endsWith('.tsx') && !file.endsWith('.ts')) return;
  let content = fs.readFileSync(file, 'utf8');
  const orig = content;

  // We want to replace text-accent with text-txt 
  // EXCEPT when it's text-accent-fg or text-accent-foreground
  content = content.replace(/\bhover:text-accent\b(?!-(?:fg|foreground))/g, 'hover:text-txt');
  content = content.replace(/\btext-accent\b(?!-(?:fg|foreground))/g, 'text-txt');
  
  // Also text-primary -> text-txt
  content = content.replace(/\bhover:text-primary\b/g, 'hover:text-txt');
  content = content.replace(/\btext-primary\b/g, 'text-txt');

  // And style colors
  content = content.replace(/color:\s*["'`]var\(--accent\)["'`]/g, 'color: "var(--text)"');
  
  // also hover:border-accent is fine to keep, since that's border, not text.

  if (content !== orig) {
    fs.writeFileSync(file, content);
    console.log('Updated ' + file);
    total++;
  }
}));

console.log('Total updated:', total);
