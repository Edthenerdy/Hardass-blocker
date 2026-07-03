'use strict';
// Generates a stable extension identity so enterprise force-install policy can
// target a fixed extension ID. Writes the private key (gitignored) and prints
// the manifest "key" (public) and the derived extension ID.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
const manifestKey = spkiDer.toString('base64');

// Chrome extension ID = first 16 bytes of sha256(DER public key), each nibble
// mapped 0-f -> a-p.
const hash = crypto.createHash('sha256').update(spkiDer).digest();
let id = '';
for (let i = 0; i < 16; i++) {
  id += String.fromCharCode(97 + (hash[i] >> 4));
  id += String.fromCharCode(97 + (hash[i] & 0x0f));
}

const keyDir = path.join(__dirname, '..', '.keys');
fs.mkdirSync(keyDir, { recursive: true });
fs.writeFileSync(path.join(keyDir, 'extension-private-key.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }));

console.log('EXTENSION_ID=' + id);
console.log('MANIFEST_KEY=' + manifestKey);
