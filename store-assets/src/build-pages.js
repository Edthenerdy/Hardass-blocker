/*
 * Generates the Chrome Web Store listing pages for Hardass Blocker.
 * Each page reproduces the REAL extension UI (same markup, CSS, copy, Rocky
 * logo and palette as extension/blocked.* and extension/popup.*) sized to the
 * exact pixel dimensions the store wants, so headless Chrome can screenshot
 * them straight to upload-ready PNGs. No marketing art — this is the product.
 */
const fs = require('fs');
const path = require('path');
const OUT = __dirname; // write .html next to this script

/* ---- brand tokens (from docs/BRAND.md) ---- */
const C = {
  ink: '#0E0E10', slate: '#1B1C20', steel: '#33353B', bone: '#F4F1EC',
  ash: '#9A9CA3', redline: '#FF3B30', amber: '#FFB800', clear: '#37D67A',
  granite: '#A7ABB2', basalt: '#7C8188',
};

/* Rocky — the exact SVG shipped in the extension markup */
const rocky = (size) => `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
<rect x="20" y="20" width="80" height="80" rx="20" fill="#FF3B30"/><rect x="26" y="46" width="68" height="48" rx="24" fill="#A7ABB2"/>
<circle cx="38" cy="58" r="3" fill="#7C8188"/><circle cx="82" cy="60" r="2.5" fill="#7C8188"/><circle cx="40" cy="86" r="2.5" fill="#7C8188"/><circle cx="82" cy="84" r="3" fill="#7C8188"/>
<path d="M43 57L55 61" stroke="#0E0E10" stroke-width="4.4" stroke-linecap="round"/><path d="M77 57L65 61" stroke="#0E0E10" stroke-width="4.4" stroke-linecap="round"/>
<circle cx="50" cy="70" r="5.5" fill="#0E0E10"/><circle cx="70" cy="70" r="5.5" fill="#0E0E10"/><circle cx="48" cy="68" r="1.8" fill="#F4F1EC"/><circle cx="68" cy="68" r="1.8" fill="#F4F1EC"/>
<path d="M54 84L66 84" stroke="#0E0E10" stroke-width="3.8" stroke-linecap="round"/></svg>`;

const speckle = `
  background-color:${C.ink};
  background-image:
    radial-gradient(rgba(124,129,136,0.20) 1px, transparent 1.6px),
    radial-gradient(rgba(154,156,163,0.13) 1px, transparent 1.6px);
  background-size:13px 13px,21px 21px;
  background-position:0 0,7px 11px;`;

// NOTE: single quotes inside — these stacks are used in inline style="" attributes,
// where embedded double quotes would terminate the attribute and drop font+color.
const DISPLAY = `'Archivo Black','Arial Black',Impact,system-ui,sans-serif`;
const UI = `Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`;
const MONO = `ui-monospace,'Cascadia Mono',Consolas,'SFMono-Regular',Menlo,monospace`;

/* Shared CSS for the real blocked-page UI, scoped to .bp so it can live inside
   a browser-window mock without clobbering the stage. Mirrors blocked.css. */
const bpCSS = `
  .bp{color:${C.bone};font-family:${UI};text-align:center;height:100%;display:flex;
      flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;}
  .bp .wrap{width:100%;max-width:412px;display:flex;flex-direction:column;align-items:center;}
  .bp .logo{margin-bottom:16px;}
  .bp h1{font-family:${DISPLAY};font-size:34px;letter-spacing:-0.5px;margin:0 0 8px;line-height:1.05;}
  .bp .sub{color:${C.ash};font-size:15px;margin:0 0 24px;line-height:1.5;}
  .bp .sub strong{color:${C.bone};}
  .bp .timer{font-family:${MONO};font-variant-numeric:tabular-nums;font-size:64px;font-weight:600;
      letter-spacing:3px;color:${C.amber};line-height:1;}
  .bp .timer.done{color:${C.redline};}
  .bp .cap{color:${C.ash};font-size:13px;margin:10px 0 22px;}
  .bp .stats{width:100%;background:${C.slate};border:.5px solid ${C.steel};border-radius:12px;
      padding:14px 16px;margin:0 0 22px;text-align:left;}
  .bp .stats .row{display:flex;justify-content:space-between;font-size:13px;padding:3px 0;}
  .bp .stats .row span:first-child{color:${C.ash};}
  .bp .stats .row span:last-child{color:${C.bone};font-weight:500;}
  .bp .stats .flag{color:${C.redline}!important;}
  .bp .reasonLabel{align-self:flex-start;font-size:13px;color:${C.ash};margin-bottom:6px;}
  .bp textarea{width:100%;min-height:78px;resize:none;background:${C.slate};border:.5px solid ${C.steel};
      border-radius:10px;color:${C.bone};font-family:inherit;font-size:14px;padding:12px 14px;margin-bottom:6px;line-height:1.5;}
  .bp textarea.filled{border-color:${C.amber};}
  .bp textarea.empty{color:${C.ash};}
  .bp .hint{align-self:flex-start;font-size:12px;color:${C.ash};margin:0 0 18px;}
  .bp .actions{width:100%;display:flex;flex-direction:column;gap:10px;margin-bottom:14px;}
  .bp button{font-family:inherit;font-size:15px;font-weight:600;border-radius:10px;padding:13px 18px;border:.5px solid transparent;}
  .bp .primary{background:${C.bone};color:${C.ink};}
  .bp .danger{background:${C.redline};color:#fff;}
  .bp .danger:disabled,.bp .danger.off{background:${C.steel};color:${C.ash};}
  .bp .ghost{background:transparent;color:${C.ash};border:.5px solid ${C.steel};font-weight:500;}`;

/* A minimal browser-window chrome so a screenshot reads as "in your browser". */
function browserWindow(urlLabel, innerHTML, opts = {}) {
  const shield = opts.blocked === false ? '' :
    `<span style="color:${C.redline};font-weight:700;font-size:12px;letter-spacing:.3px;">● BLOCKED</span>`;
  return `<div class="win">
    <div class="titlebar">
      <span class="dot" style="background:#FF5F57"></span>
      <span class="dot" style="background:#FEBC2E"></span>
      <span class="dot" style="background:#28C840"></span>
      <div class="addr">
        <span class="lock">⚠</span>
        <span class="url">${urlLabel}</span>
        ${shield}
      </div>
    </div>
    <div class="content" style="${speckle}">${innerHTML}</div>
  </div>`;
}

const winCSS = `
  .win{width:100%;height:100%;background:#141519;border:1px solid ${C.steel};border-radius:16px;
       overflow:hidden;display:flex;flex-direction:column;box-shadow:0 40px 90px rgba(0,0,0,.55);}
  .titlebar{height:46px;flex:none;display:flex;align-items:center;gap:9px;padding:0 16px;
       background:#202226;border-bottom:1px solid #2b2d33;}
  .dot{width:12px;height:12px;border-radius:50%;flex:none;}
  .addr{flex:1;height:30px;margin-left:8px;background:${C.ink};border:.5px solid ${C.steel};border-radius:8px;
       display:flex;align-items:center;gap:10px;padding:0 12px;color:${C.ash};font-family:${UI};font-size:13px;}
  .addr .lock{color:${C.redline};font-size:13px;}
  .addr .url{flex:1;}
  .content{flex:1;overflow:hidden;}`;

/* Caption strip that frames each screenshot for the store. Honest one-liners. */
function caption(title, sub) {
  return `<div class="cap-strip">
    ${rocky(44)}
    <div class="cap-text"><h2>${title}</h2><p>${sub}</p></div>
  </div>`;
}
const capCSS = `
  .cap-strip{display:flex;align-items:center;gap:16px;margin-bottom:26px;}
  .cap-text h2{font-family:${DISPLAY};font-size:27px;color:${C.bone};margin:0;letter-spacing:-0.4px;line-height:1.1;}
  .cap-text p{font-family:${UI};font-size:15px;color:${C.ash};margin:5px 0 0;}`;

function page(w, h, bodyCSS, bodyHTML, extraCSS = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  .stage{width:${w}px;height:${h}px;overflow:hidden;position:relative;font-family:${UI};${bodyCSS}}
  ${winCSS}${bpCSS}${capCSS}${extraCSS}
  </style></head><body><div class="stage">${bodyHTML}</div></body></html>`;
}

/* ============================ SCREENSHOTS (1280×800) ============================ */
const shotStage = `${speckle}padding:56px;display:flex;flex-direction:column;`;

/* 1 — the flagship: cooldown running, unblock locked */
const bp1 = `<div class="bp"><div class="wrap">
  <div class="logo">${rocky(56)}</div>
  <h1>Blocked. On purpose.</h1>
  <p class="sub">instagram.com — on your blocklist since you set it up sober.</p>
  <div class="timer">17:03</div>
  <p class="cap">Cooldown before you can unblock. Past-you was serious.</p>
  <label class="reasonLabel">Tell me why. In writing.</label>
  <textarea class="empty">Because…</textarea>
  <p class="hint">At least 15 characters. Be honest — future-you is reading this.</p>
  <div class="actions"><button class="danger off">Unblock for 10 min</button></div>
  <button class="ghost" style="align-self:stretch;">Nope — take me back</button>
</div></div>`;
fs.writeFileSync(path.join(OUT, 'shot-1-cooldown.html'),
  page(1280, 800, shotStage,
    caption('A cooldown you can’t skip', 'To reopen a blocked site you wait out a timer first. No instant “just this once.”') +
    `<div style="flex:1;">${browserWindow('instagram.com', bp1)}</div>`));

/* 2 — show the mirror: relapse stats */
const bp2 = `<div class="bp"><div class="wrap">
  <div class="logo">${rocky(56)}</div>
  <h1>Blocked. On purpose.</h1>
  <p class="sub">reddit.com — on your blocklist since you set it up sober.</p>
  <div class="stats">
    <div class="row"><span>Times unblocked this week</span><span class="flag">4</span></div>
    <div class="row"><span>Times unblocked, all time</span><span>37</span></div>
    <div class="row"><span>Average pass you grant yourself</span><span>12 min</span></div>
    <div class="row"><span>Last time you caved</span><span>2h ago</span></div>
  </div>
  <div class="timer">14:48</div>
  <p class="cap">Cooldown before you can unblock. Past-you was serious.</p>
  <div class="actions"><button class="danger off">Unblock for 10 min</button></div>
  <button class="ghost" style="align-self:stretch;">Nope — take me back</button>
</div></div>`;
fs.writeFileSync(path.join(OUT, 'shot-2-mirror.html'),
  page(1280, 800, shotStage,
    caption('It holds up the mirror', 'Your own relapse history is front and centre — not buried. Reflection, not punishment.') +
    `<div style="flex:1;">${browserWindow('reddit.com', bp2)}</div>`));

/* 3 — the popup: block a site in seconds (real popup.css, 320px) */
const popup = `<div class="popup">
  <div class="phead">${rocky(26)}<div class="pbrand"><strong>Hardass Blocker</strong><span>The blocker you can't talk your way out of.</span></div></div>
  <div class="padd"><input value="tiktok.com"><button class="pblock">Block</button></div>
  <p class="phint">&nbsp;</p>
  <div class="plisthead"><span>Blocked sites</span><span>5</span></div>
  <ul class="plist">
    <li><span class="psite">instagram.com</span><span class="pstatus">10 min pass · 06:14</span></li>
    <li><span class="psite">reddit.com</span><button class="prem">Remove</button></li>
    <li><span class="psite">x.com</span><button class="prem">Remove</button></li>
    <li><span class="psite">youtube.com</span><button class="prem">Remove</button></li>
    <li><span class="psite">news.ycombinator.com</span><button class="prem">Remove</button></li>
  </ul>
  <button class="pghost">Settings, team &amp; history</button>
</div>`;
const popupCSS = `
  .toolbar{height:52px;background:#202226;border-bottom:1px solid #2b2d33;border-radius:16px 16px 0 0;
     display:flex;align-items:center;padding:0 18px;gap:14px;}
  .toolbar .taddr{flex:1;height:30px;background:${C.ink};border:.5px solid ${C.steel};border-radius:8px;
     display:flex;align-items:center;padding:0 12px;color:${C.ash};font-size:13px;}
  .ticon{width:32px;height:32px;border-radius:8px;background:#2b2d33;display:flex;align-items:center;justify-content:center;position:relative;}
  .ticon.active{outline:2px solid ${C.redline};}
  .popup{position:absolute;top:60px;right:18px;width:320px;background:${C.ink};border:1px solid ${C.steel};
     border-radius:12px;padding:14px;box-shadow:0 40px 90px rgba(0,0,0,.6);color:${C.bone};font-family:${UI};font-size:14px;}
  .phead{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
  .pbrand{display:flex;flex-direction:column;line-height:1.3;}
  .pbrand strong{font-size:15px;}
  .pbrand span{color:${C.ash};font-size:11px;}
  .padd{display:flex;gap:8px;}
  .padd input{flex:1;background:${C.slate};border:.5px solid ${C.amber};border-radius:8px;color:${C.bone};font-family:inherit;font-size:14px;padding:9px 11px;}
  .pblock{background:${C.redline};color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;padding:9px 14px;}
  .phint{color:${C.ash};font-size:11px;min-height:14px;margin:6px 2px 10px;}
  .plisthead{display:flex;justify-content:space-between;color:${C.ash};font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin:4px 2px 8px;}
  .plist{list-style:none;margin:0;padding:0;}
  .plist li{display:flex;align-items:center;justify-content:space-between;background:${C.slate};border:.5px solid ${C.steel};border-radius:8px;padding:9px 11px;margin-bottom:6px;}
  .psite{font-size:13px;}
  .pstatus{color:${C.amber};font-size:11px;}
  .prem{background:transparent;color:${C.ash};border:.5px solid ${C.steel};padding:5px 9px;font-size:11px;font-weight:500;border-radius:8px;}
  .pghost{width:100%;margin-top:10px;background:transparent;color:${C.ash};border:.5px solid ${C.steel};font-weight:500;padding:10px;border-radius:8px;font-family:inherit;font-size:13px;}`;
const browserForPopup = `<div class="win" style="position:relative;">
  <div class="toolbar">
    <div class="ticon active">${rocky(20)}</div>
    <div class="taddr">tiktok.com</div>
  </div>
  <div class="content" style="${speckle}"></div>
  ${popup}
</div>`;
fs.writeFileSync(path.join(OUT, 'shot-3-popup.html'),
  page(1280, 800, shotStage,
    caption('Block a site in two seconds', 'Type a domain, hit Block. Manage your list, history and team from one panel.') +
    `<div style="flex:1;">${browserForPopup}</div>`, popupCSS));

/* 4 — no side doors: bypass attempt blocked */
const bp4 = `<div class="bp"><div class="wrap">
  <div class="logo">${rocky(56)}</div>
  <h1>Nice try.</h1>
  <p class="sub">Proxies, translators, cache and archive tricks are blocked too. There is no side door.</p>
  <p class="cap" style="margin-top:6px;">This is how you keep a block a block.</p>
  <button class="ghost" style="align-self:stretch;margin-top:8px;">Nope — take me back</button>
</div></div>`;
fs.writeFileSync(path.join(OUT, 'shot-4-nice-try.html'),
  page(1280, 800, shotStage,
    caption('No side doors', 'Translate proxies, Google cache, archive mirrors — the common workarounds are shut too.') +
    `<div style="flex:1;">${browserWindow('translate.google.com/…/instagram.com', bp4)}</div>`));

/* 5 — even then, you say why: cooldown done, unblock armed */
const bp5 = `<div class="bp"><div class="wrap">
  <div class="logo">${rocky(56)}</div>
  <h1>Blocked. On purpose.</h1>
  <p class="sub">youtube.com — on your blocklist since you set it up sober.</p>
  <div class="timer done">00:00</div>
  <p class="cap">Cooldown done. Still want in? Say why, then decide.</p>
  <label class="reasonLabel">Tell me why. In writing.</label>
  <textarea class="filled">Looking up one specific fix for the sink, not a 40-minute rabbit hole.</textarea>
  <p class="hint">At least 15 characters. Be honest — future-you is reading this.</p>
  <div class="actions"><button class="danger">Unblock for 10 min</button></div>
  <button class="ghost" style="align-self:stretch;">Nope — take me back</button>
</div></div>`;
fs.writeFileSync(path.join(OUT, 'shot-5-reason.html'),
  page(1280, 800, shotStage,
    caption('Even then, you write it down', 'When the timer ends you still have to type a real reason — one future-you gets to read back.') +
    `<div style="flex:1;">${browserWindow('youtube.com', bp5)}</div>`));

/* ============================ PROMO TILE (440×280) ============================ */
fs.writeFileSync(path.join(OUT, 'promo-440x280.html'),
  page(440, 280, `${speckle}display:flex;align-items:center;padding:0 30px;`,
    `<div style="display:flex;align-items:center;gap:22px;">
      <div style="flex:none;">${rocky(96)}</div>
      <div>
        <div style="font-family:${DISPLAY};color:${C.bone};font-size:36px;line-height:.92;letter-spacing:-0.5px;">HARDASS<br><span style="color:${C.redline};">BLOCKER</span></div>
        <div style="width:52px;height:5px;background:${C.redline};border-radius:3px;margin:14px 0 12px;"></div>
        <div style="font-family:${UI};color:${C.ash};font-size:14px;line-height:1.4;max-width:230px;">The blocker you can’t talk your way out of.</div>
        <div style="margin-top:12px;display:inline-flex;align-items:center;gap:7px;font-family:${MONO};color:${C.amber};font-size:13px;font-weight:600;border:.5px solid ${C.steel};border-radius:8px;padding:5px 10px;">
          <span style="color:${C.redline};">●</span> COOLDOWN 17:03
        </div>
      </div>
    </div>`));

/* ============================ MARQUEE (1400×560) ============================ */
const bpMini = `<div class="bp" style="padding:34px 26px;"><div class="wrap" style="max-width:360px;">
  <div class="logo">${rocky(48)}</div>
  <h1 style="font-size:30px;">Blocked. On purpose.</h1>
  <p class="sub" style="margin-bottom:20px;">instagram.com — on your blocklist since you set it up sober.</p>
  <div class="timer">17:03</div>
  <p class="cap">Cooldown before you can unblock. Past-you was serious.</p>
  <label class="reasonLabel">Tell me why. In writing.</label>
  <textarea class="empty" style="min-height:60px;">Because…</textarea>
  <div class="actions" style="margin-top:8px;"><button class="danger off">Unblock for 10 min</button></div>
</div></div>`;
fs.writeFileSync(path.join(OUT, 'marquee-1400x560.html'),
  page(1400, 560, `${speckle}display:flex;align-items:center;padding:0 80px;gap:70px;`,
    `<div style="flex:1;max-width:620px;">
       <div style="display:flex;align-items:center;gap:18px;margin-bottom:26px;">${rocky(72)}
         <div style="font-family:${DISPLAY};color:${C.bone};font-size:52px;line-height:.9;letter-spacing:-1px;">HARDASS <span style="color:${C.redline};">BLOCKER</span></div>
       </div>
       <div style="font-family:${DISPLAY};color:${C.bone};font-size:34px;line-height:1.12;letter-spacing:-0.5px;margin-bottom:18px;">The blocker you can’t<br>talk your way out of.</div>
       <div style="font-family:${UI};color:${C.ash};font-size:17px;line-height:1.6;max-width:520px;">
         Lifting a block means waiting out a cooldown, writing a real reason, and facing your own relapse history. Blocked sites stay blocked.</div>
       <div style="width:80px;height:6px;background:${C.redline};border-radius:3px;margin-top:26px;"></div>
     </div>
     <div style="width:430px;height:460px;flex:none;">${browserWindow('instagram.com', bpMini)}</div>`));

/* ============================ STORE ICON (128×128, transparent) ============================ */
fs.writeFileSync(path.join(OUT, 'store-icon-128.html'),
  page(128, 128, `background:transparent;display:flex;align-items:center;justify-content:center;`,
    `<div style="width:112px;height:112px;">${rocky(112)}</div>`));

console.log('Wrote listing pages to', OUT);
