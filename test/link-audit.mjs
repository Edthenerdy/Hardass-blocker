// Link & asset integrity check across all HTML + the manifest.
// Fails (exit 1) if any internal link/asset or manifest reference is missing.
// Reports external links, mailto, and placeholders for review. Run: node test/link-audit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const htmlFiles = [];
for (const d of ['extension', 'docs']) {
  const dir = path.join(ROOT, d);
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) htmlFiles.push(path.join(d, f));
}

const out = { ok: [], missing: [], external: [], mailto: [], placeholder: [] };
const attrRe = /(?:href|src)\s*=\s*"([^"]*)"/gi;
for (const rel of htmlFiles) {
  const full = path.join(ROOT, rel);
  const html = fs.readFileSync(full, 'utf8');
  let m;
  while ((m = attrRe.exec(html))) {
    const url = m[1], where = rel + ' → ' + url;
    if (url === '#' || url === '' || /TODO|your-username|your-team/i.test(url)) out.placeholder.push(where);
    else if (url.startsWith('mailto:')) out.mailto.push(where);
    else if (/^https?:\/\//i.test(url)) out.external.push(where);
    else if (url.startsWith('data:')) { /* inline */ }
    else {
      const target = path.normalize(path.join(path.dirname(full), url.split('#')[0].split('?')[0]));
      (fs.existsSync(target) ? out.ok : out.missing).push(where);
    }
  }
}
const mani = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension/manifest.json'), 'utf8'));
const refs = [mani.background?.service_worker, mani.action?.default_popup, mani.options_page, mani.storage?.managed_schema, ...Object.values(mani.icons || {}), ...(mani.web_accessible_resources || []).flatMap(r => r.resources)].filter(Boolean);
const maniMissing = refs.filter(r => !fs.existsSync(path.join(ROOT, 'extension', r)));

console.log(`internal ok:${out.ok.length} missing:${out.missing.length} | external:${out.external.length} mailto:${out.mailto.length} placeholder:${out.placeholder.length} | manifest refs:${refs.length} missing:${maniMissing.length}`);
out.missing.forEach(x => console.log('  MISSING', x));
maniMissing.forEach(x => console.log('  MANIFEST MISSING', x));
out.placeholder.forEach(x => console.log('  placeholder', x));
const broken = out.missing.length + maniMissing.length;
console.log(broken ? `\nFAIL: ${broken} broken reference(s)` : '\nOK: no broken internal references');
process.exit(broken ? 1 : 0);
