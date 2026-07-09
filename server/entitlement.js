'use strict';
// Signed consumer entitlements. The server signs a short-lived token asserting a
// user's plan with an ECDSA P-256 key; the extension verifies it with the public
// key (WebCrypto). This means a user can't unlock Pro by editing chrome.storage —
// a forged flag won't carry a valid signature. `ieee-p1363` makes the signature
// verifiable by WebCrypto's ECDSA (which rejects the default DER encoding).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'keys') : path.join(__dirname, '.keys');
const FILE = path.join(DIR, 'entitlement.json');
const TTL = 24 * 60 * 60 * 1000;

let priv = null;
let pubJwk = null;

function load() {
  if (priv) return;
  if (fs.existsSync(FILE)) {
    const o = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    priv = crypto.createPrivateKey({ key: o.priv, format: 'pem' });
    pubJwk = o.pubJwk;
    return;
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  priv = privateKey;
  pubJwk = publicKey.export({ format: 'jwk' });
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ priv: privateKey.export({ type: 'pkcs8', format: 'pem' }), pubJwk }));
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload) {
  load();
  const p = b64url(JSON.stringify(payload));
  const sig = crypto.sign('sha256', Buffer.from(p), { key: priv, dsaEncoding: 'ieee-p1363' });
  return p + '.' + b64url(sig);
}

function pubkey() { load(); return pubJwk; }

function entitlementFor(user) {
  const now = Date.now();
  const active = user.plan === 'pro' && (user.lifetime || !user.proUntil || user.proUntil > now);
  return sign({ sub: user.id, plan: active ? 'pro' : 'free', lifetime: !!user.lifetime, iat: now, exp: now + TTL });
}

module.exports = { sign, pubkey, entitlementFor };
