#!/usr/bin/env node
/**
 * extract-i18n-keys.js
 *
 * Reads every *.html file in src/ui/assets/ (excluding admin.html / any file
 * whose name starts with "admin"), extracts all unique data-i18n="..." values,
 * and writes the result to src/ui/assets/ui-i18n-keys.json.
 *
 * The JSON shape is:
 *   { "<page>": ["key1", "key2", ...], ... }
 *
 * where <page> is the file's basename without extension (e.g. "login",
 * "register", "forgot-password").
 *
 * Usage:
 *   node scripts/extract-i18n-keys.js
 *
 * Or via npm:
 *   npm run extract-i18n
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'src', 'ui', 'assets');
const OUT_FILE   = path.join(ASSETS_DIR, 'ui-i18n-keys.json');

// Pages to skip (admin shell has no data-i18n keys meaningful for i18n)
const SKIP_PAGES = new Set(['admin', 'base']);

/**
 * Extract all data-i18n attribute values from an HTML string.
 * Returns a sorted, deduplicated array.
 */
function extractKeys(html) {
  const keys  = new Set();
  const regex = /data-i18n="([^"]+)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    keys.add(m[1]);
  }
  return Array.from(keys).sort();
}

function main() {
  const files = fs.readdirSync(ASSETS_DIR).filter(f => f.endsWith('.html'));

  const result = {};

  for (const file of files) {
    const page = path.basename(file, '.html');

    if (SKIP_PAGES.has(page)) {
      continue;
    }

    const html = fs.readFileSync(path.join(ASSETS_DIR, file), 'utf8');
    const keys = extractKeys(html);

    if (keys.length > 0) {
      result[page] = keys;
    }
  }

  // Sort pages alphabetically for stable output
  const sorted = Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
  );

  fs.writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

  const pageCount = Object.keys(sorted).length;
  const keyCount  = Object.values(sorted).reduce((n, ks) => n + ks.length, 0);
  console.log(`✅  Wrote ${OUT_FILE}`);
  console.log(`   ${pageCount} pages, ${keyCount} total keys`);
}

main();
