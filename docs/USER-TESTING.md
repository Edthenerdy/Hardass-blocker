# Holdfast — user-testing plan & results

Simulated user-journey testing: the extension's real page scripts (`welcome.js`,
`popup.js`, `blocked.js`) wired to the real `background.js` in a headless DOM
(jsdom) with a shared in-memory `chrome` stub. Each persona's journey is scripted
end-to-end and asserted. Run: `node test/user-journeys.test.mjs`.

## Personas & scenarios

**P1 — The Procrastinator** (individual, the main user)
1. Fresh install → welcome page shows, starter blocklist seeded.
2. Adds `tiktok.com` from the welcome page → appears in the list.
3. Visits a blocked site → hits the Cooldown (blocked page).
4. Waits out the cooldown → button enables only after a valid reason.
5. Unblocks → gets a time-boxed pass; site is allowed.
6. Pass expires → site re-blocks automatically.
*Pass criteria:* every step gives clear feedback; no dead-ends.

**P2 — The Determined Cheater** (brand-critical)
1. Tries to unblock with no wait → blocked.
2. Tries with a 1-char reason → blocked.
3. Tries to reach the site via Google Translate / archive.org / a proxy → the bypass page ("Nice try.").
4. Tries to remove the block from the popup → gated by a think-delay, not one click.
*Pass criteria:* no path lets you through faster than the intended friction.

**P3 — The Fumbler** (robustness)
1. Adds junk / empty / whitespace / a full URL with protocol & path / a duplicate.
2. Opens the cooldown, types a reason, closes the "tab" and reopens mid-cooldown → timer resumes (does NOT reset).
3. Rapid double-clicks the unblock button.
4. Very long domain and very long reason (overflow / storage sanity).
*Pass criteria:* no crashes, no reset-on-reopen, sane normalization.

**P4 — The Admin** (enterprise console) — covered by the API suite (`qa.mjs`) + live walkthrough.
**P5 — The Employee** (enterprise device) — covered by `qa.mjs` + `enroll-test.mjs` + live walkthrough.

## Focus areas
- **Feedback:** every action confirms visibly; disabled states are obvious.
- **Dead-ends:** no state a user can get stuck in.
- **Edge inputs:** normalization, empties, duplicates, long strings.
- **Cheat-resistance:** the whole brand — bypass vectors, gated removal, gating.
- **Persistence:** cooldown survives tab close/reopen.
- **Accessibility:** buttons are real `<button>`s, inputs have labels, keyboard (Enter) works, contrast is high (bone on ink).

---

## Results

**24/24 journey checks pass** (`test/user-journeys.test.mjs`) + 20/20 unit checks (`test/extension.test.mjs`). Real page scripts wired to the real background in jsdom.

### Findings → fixed
1. **Unbounded local storage (Fix A).** `grantAllowance` stored the unblock reason with no length cap and never trimmed `relapseLog` — a daily user would grow it forever (the *server* already caps reason at 300 chars; the extension didn't). Now caps the reason to 300 chars and bounds `relapseLog` to the last 500 entries. *Verified: a 5000-char reason is stored at ≤300; a 600-entry log trims to ≤500.*
2. **Welcome "Start blocking" was a dead-end (Fix B).** The button called `window.close()`, but Chrome refuses to let a script close a tab it didn't open (the welcome tab is opened via `chrome.tabs.create`) — so it silently did nothing. Now closes the current tab via `chrome.tabs.getCurrent` + `remove`, with a `window.close()` fallback. *Verified: clicking Start calls `tabs.remove` on the current tab.*

### Verified working (no change needed)
- **Procrastinator:** welcome → seeded 5 defaults → add site → block → cooldown → reason-gated unblock → time-boxed pass.
- **Cheater:** can't unblock without the wait; can't unblock with a short reason; bypass routes (translate/archive/proxy) hit "Nice try."; removal is gated by a 3s think-delay, not one click.
- **Fumbler:** whitespace/empty input rejected with guidance; full URLs normalized to bare domains; duplicates deduped; **cooldown resumes on reopen (does not reset)** — the key persistence promise.
- **A11y spot-checks:** actions are real `<button>`s; options inputs have `<label>`s; Enter-to-submit works.
- **Admin/Employee (enterprise):** covered by `test/*` + `qa.mjs` (35 API checks) and the live console/device walkthrough.

### Flagged for your decision (not code-changed — it's a product call)
- **Bypass-blocking vs legitimate use.** With `blockBypass` on (default), *all* of Google Translate, `archive.org`, etc. are blocked — so a user legitimately translating a **non-blocked** page also hits "Nice try." That's on-brand ("no side doors") but risks annoyed reviews ("it blocks Google Translate!"). It's already a toggle. Options to consider: default it **off** for the consumer tier, keep it on for the enforced/team tier; or make it contextual (only block the proxy when the target is on the blocklist). Recommend deciding before launch.

