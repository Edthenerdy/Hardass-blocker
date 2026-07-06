#!/usr/bin/env node
'use strict';
/*
 * Firefox build target.
 *
 * The extension in extension/ is Chrome-first (Manifest V3, service-worker
 * background, a Chrome `key` for a stable id). Firefox MV3 differs in a few
 * manifest details but can run the *same* JS, thanks to two guards already in
 * the shared source:
 *   - common.js aliases `chrome` → `browser` on Firefox (promise-based APIs)
 *   - background.js only calls importScripts() when it exists (Chrome SW);
 *     Firefox loads common.js via the background.scripts array instead.
 *
 * So this build only transforms the manifest and copies the rest verbatim:
 *   - drop `key` (Chrome-only; Firefox ids come from browser_specific_settings)
 *   - add browser_specific_settings.gecko.{id,strict_min_version}
 *   - background.service_worker → background.scripts:["common.js","background.js"]
 *
 * Output: dist/firefox/  (load via about:debugging → Load Temporary Add-on →
 * pick dist/firefox/manifest.json). Package with `web-ext build` if desired.
 *
 * NOTE: produced and statically validated here, but not yet run inside Firefox
 * (this environment ships Chromium only). Firefox's DNR redirect-to-extension
 * support is the one behaviour to confirm on a real Firefox before shipping.
 */
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'extension');
const OUT = path.join(REPO, 'dist', 'firefox');
const GECKO_ID = 'hardass-blocker@hadrongroup.com.au';
const STRICT_MIN = '128.0'; // Firefox 128+ ships MV3 dynamic declarativeNetRequest

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function firefoxManifest(chromeManifest) {
  const m = JSON.parse(chromeManifest);
  delete m.key; // Chrome-only id pin
  m.browser_specific_settings = {
    gecko: { id: GECKO_ID, strict_min_version: STRICT_MIN }
  };
  // Firefox background: event-page scripts, common.js first so HB is defined
  m.background = { scripts: ['common.js', 'background.js'] };
  return JSON.stringify(m, null, 2) + '\n';
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(SRC, OUT);
  const chromeManifest = fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'manifest.json'), firefoxManifest(chromeManifest));

  // sanity: the output manifest must parse and carry the Firefox bits
  const out = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const okBg = Array.isArray(out.background.scripts) && out.background.scripts[0] === 'common.js';
  const okId = out.browser_specific_settings.gecko.id === GECKO_ID;
  const okNoKey = !('key' in out);
  if (!okBg || !okId || !okNoKey) { console.error('Firefox manifest transform failed'); process.exit(1); }

  console.log('Built Firefox extension → ' + path.relative(REPO, OUT));
  console.log('  background.scripts:', out.background.scripts.join(', '));
  console.log('  gecko.id:', out.browser_specific_settings.gecko.id, '(min ' + STRICT_MIN + ')');
  console.log('  key removed:', okNoKey);
  console.log('\nLoad it: Firefox → about:debugging#/runtime/this-firefox → Load Temporary Add-on → dist/firefox/manifest.json');
}

main();
