#!/usr/bin/env node
'use strict';
/*
 * End-to-end Chrome integration test.
 *
 * Loads the REAL unpacked extension into a headless Chromium via Playwright,
 * points it at a freshly-seeded multi-tenant Deadbolt server, and drives the
 * whole managed-mode loop the way a device in the field would — proving the
 * Chrome extension and the backend actually integrate, not just in theory.
 *
 * What it asserts:
 *   1. Enrol into an admin-approval group → policy pulled, device is managed+locked.
 *   2. Dynamic DNR rules are installed for the policy blocklist (+ bypass rules).
 *   3. Lockdown holds: addBlock / removeBlock / leaveTeam are refused while locked.
 *   4. A blocked site really redirects to the extension's block page (live nav).
 *   5. requestAccess → admin approves via the server API → syncNow → the
 *      allowance appears and the site's DNR rule is dropped → the site loads.
 *   6. Cooldown group: selfGrantManaged grants a self-serve allowance.
 *   7. Telemetry posted by the device shows up in the admin reports — scoped to
 *      the right tenant.
 *
 * Run (in this environment, Playwright is global):
 *   NODE_PATH=$(npm root -g) node tools/chrome-integration-test.js
 * On a normal machine: `npm install playwright` first (see tools/package.json).
 */
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error("This test needs Playwright. Install it: `npm install playwright`\n(in this managed environment run: NODE_PATH=$(npm root -g) node tools/chrome-integration-test.js)"); process.exit(2); }

const REPO = path.resolve(__dirname, '..');
const EXT = path.join(REPO, 'extension');
const SERVER = path.join(REPO, 'server', 'server.js');
// Prefer an explicit CHROME_BIN, then this managed env's bundled Chromium, and
// otherwise fall back to Playwright's own download (the normal-machine path).
function resolveChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const managed = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (fs.existsSync(managed)) return managed;
  return undefined; // let Playwright use the Chromium it installed
}
const CHROME = resolveChrome();
const PORT = 8899;
const BASE = `http://localhost:${PORT}`;

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(BASE + '/api/dashboard'); if (r.status === 401 || r.ok) return true; } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error('server did not start');
}

async function adminApprove(email, domain) {
  const login = await (await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'deadbolt' })
  })).json();
  const tok = login.token;
  const reqs = await (await fetch(BASE + '/api/requests', { headers: { Authorization: 'Bearer ' + tok } })).json();
  const target = reqs.requests.find(r => r.domain === domain && r.status === 'pending');
  if (!target) return { ok: false, error: 'no pending request for ' + domain };
  return (await fetch(BASE + `/api/requests/${target.id}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
    body: JSON.stringify({ decision: 'approved', grantedMin: 10 })
  })).json();
}

async function adminReports(email) {
  const login = await (await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'deadbolt' })
  })).json();
  return (await fetch(BASE + '/api/reports', { headers: { Authorization: 'Bearer ' + login.token } })).json();
}

(async () => {
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hb-data-')), 'data.json');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-profile-'));

  console.log('Starting server (fresh multi-tenant seed) on ' + BASE + ' …');
  const srv = spawn('node', [SERVER], { env: { ...process.env, PORT: String(PORT), STORE: 'json', DATA_FILE: dataFile }, stdio: 'ignore' });

  let ctx;
  try {
    await waitForServer(8000);

    ctx = await chromium.launchPersistentContext(userDir, {
      executablePath: CHROME,
      headless: true,
      args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox']
    });

    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
    const id = sw.url().split('/')[2];
    console.log('Extension loaded: ' + id + '\n');

    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/options.html`);
    const msg = m => page.evaluate(mm => chrome.runtime.sendMessage(mm), m);
    const dynRules = () => sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());

    /* 1. Enrol into Northshore "Front desk" (admin-approval, locked) */
    console.log('1. Enrol into an admin-approval group');
    const enroll = await msg({ type: 'enrollTeam', serverUrl: BASE, code: 'NSD-4K9-QX2', deviceName: 'CI-Reception' });
    ok(enroll.ok, 'enrol succeeds');
    ok(enroll.policy && enroll.policy.org === 'Northshore Dental', 'policy is from the right tenant (Northshore Dental)');
    ok(enroll.policy && enroll.policy.unblockMode === 'admin-approval', 'unblockMode is admin-approval');
    const state1 = (await msg({ type: 'getState' })).state;
    ok(state1.team && state1.team.deviceToken, 'device is now managed');
    ok(enroll.policy.blocklist.includes('instagram.com'), 'blocklist includes instagram.com (Social category)');
    ok(enroll.policy.blocklist.includes('tiktok.com'), 'blocklist includes tiktok.com (custom)');

    /* 2. DNR rules installed */
    console.log('2. Dynamic network rules installed');
    const rules1 = await dynRules();
    const blockedDomains = enroll.policy.blocklist.length;
    ok(rules1.length >= blockedDomains, `>= ${blockedDomains} dynamic rules present (${rules1.length})`);
    ok(rules1.some(r => r.action.redirect.extensionPath.includes('instagram.com')), 'a rule redirects instagram.com to the block page');

    /* 3. Lockdown holds */
    console.log('3. Lockdown is enforced (locked policy)');
    ok((await msg({ type: 'addBlock', domain: 'foo.com' })).error === 'managed', 'addBlock refused while managed+locked');
    ok((await msg({ type: 'removeBlock', domain: 'instagram.com' })).error === 'managed', 'removeBlock refused while managed+locked');
    ok((await msg({ type: 'leaveTeam' })).error === 'locked', 'leaveTeam refused while locked');

    /* 4. A blocked site really redirects to the block page */
    console.log('4. Live navigation to a blocked site redirects to the block page');
    let redirected = false;
    try {
      await page.goto('http://instagram.com/', { waitUntil: 'commit', timeout: 8000 });
      redirected = page.url().startsWith(`chrome-extension://${id}/blocked.html`);
    } catch { redirected = page.url().startsWith(`chrome-extension://${id}/blocked.html`); }
    ok(redirected, 'instagram.com was redirected to blocked.html (url: ' + page.url().slice(0, 60) + ')');
    await page.goto(`chrome-extension://${id}/options.html`); // back to a stable page for messaging

    /* 5. request -> admin approves -> sync -> allowance + rule dropped -> loads */
    console.log('5. Request access → admin approves → sync → site unblocks');
    const req = await msg({ type: 'requestAccess', domain: 'instagram.com', reason: 'need a client DM for the integration test', requestedMin: 10 });
    ok(req.ok && req.request.status === 'pending', 'device created a pending request');
    const decision = await adminApprove('admin@northshore.example', 'instagram.com');
    ok(decision.ok && decision.request.status === 'approved', 'admin approved it via the server API');
    const sync = await msg({ type: 'syncNow' });
    ok(sync.ok && (sync.policy.allowances || []).some(a => a.domain === 'instagram.com'), 'after sync, policy carries the instagram.com allowance');
    const rules2 = await dynRules();
    ok(!rules2.some(r => r.action.redirect.extensionPath.includes('instagram.com')), 'the instagram.com block rule is now dropped');
    let allowedLoad = false;
    try {
      await page.goto('http://instagram.com/', { waitUntil: 'commit', timeout: 8000 });
      allowedLoad = !page.url().startsWith(`chrome-extension://${id}/blocked.html`);
    } catch { allowedLoad = !page.url().startsWith(`chrome-extension://${id}/blocked.html`); }
    ok(allowedLoad, 'instagram.com is no longer redirected to the block page');
    await page.goto(`chrome-extension://${id}/options.html`);

    /* 6. Telemetry -> reports (tenant-scoped) */
    console.log('6. Telemetry reaches the admin reports for the right tenant');
    await msg({ type: 'telemetry', domain: 'facebook.com', event: 'blocked' });
    await msg({ type: 'telemetry', domain: 'facebook.com', event: 'blocked' });
    await sleep(300);
    const nsReports = await adminReports('admin@northshore.example');
    ok(nsReports.top.some(t => t.domain === 'facebook.com' && t.count >= 2), 'Northshore report shows facebook.com blocked >= 2');
    const ccReports = await adminReports('admin@capecall.example');
    ok(!ccReports.top.some(t => t.domain === 'facebook.com'), "the other tenant's report does NOT see it (isolation)");

    /* 7. Cooldown group: re-enrol into Clinicians and self-grant */
    console.log('7. Cooldown group self-grant (re-enrol into Clinicians)');
    // leaveTeam is blocked while locked, so simulate a fresh device by clearing storage
    await sw.evaluate(() => chrome.storage.local.clear());
    const enroll2 = await msg({ type: 'enrollTeam', serverUrl: BASE, code: 'NSD-7P3-ZW8', deviceName: 'CI-Surgery' });
    ok(enroll2.ok && enroll2.policy.unblockMode === 'cooldown', 're-enrolled into a cooldown-mode group');
    const grant = await msg({ type: 'selfGrantManaged', domain: 'bet365.com', reason: 'self-serve cooldown grant under test' });
    ok(grant.ok && grant.request.status === 'approved', 'selfGrantManaged returns an approved self-serve allowance');

    console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  } catch (err) {
    console.error('\nFATAL:', err && err.stack || err);
    failed++;
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    srv.kill();
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(path.dirname(dataFile), { recursive: true, force: true }); } catch {}
  }
  process.exit(failed ? 1 : 0);
})();
