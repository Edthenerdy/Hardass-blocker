# Hardass Blocker

**The blocker you can't talk your way out of.**

Every website blocker fails at the same moment — the one-click "just disable it for a sec" when self-control is weakest. Hardass Blocker makes *unblocking* deliberately hard: a mandatory cooldown, a written reason, and a look at your own relapse history before you're let back in.

This repo contains the concept, the brand, and a working proof-of-concept.

---

## What's here

| Path | What it is |
|---|---|
| [`docs/BUSINESS-PLAN.md`](docs/BUSINESS-PLAN.md) | Strategy, market analysis, competitive map, pricing, GTM, risks |
| [`docs/BRAND.md`](docs/BRAND.md) | Brand guide — voice, logo, palette, typography |
| [`extension/`](extension/) | The POC — a Manifest V3 Chrome extension |
| [`tools/gen-icons.js`](tools/gen-icons.js) | Dependency-free PNG icon generator |

---

## The core mechanic — the Cooldown

When you try to visit a blocked site, you land on the block page. To get through you must:

1. **Wait out a cooldown** (default 20 min). The timer persists even if you close the tab — reopening doesn't reset it.
2. **Write down why** you're unblocking (minimum length enforced).
3. **Face your history** — how many times you've caved this week, your average self-granted pass, when you last gave in.

Only then does the unblock button work, and it grants a *time-boxed* pass (default 10 min) before the site re-blocks itself automatically.

The wait kills the impulse. The written reason kills the self-deception. The history is the mirror.

---

## Try the POC

1. Run `node tools/gen-icons.js` if the icons aren't already in `extension/icons/` (they are committed).
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `extension/` folder.
5. A few common sites are blocked by default. Try visiting one — you'll hit the Cooldown.
6. Use the toolbar icon to block/unblock sites; open **Settings & history** for the rules and your relapse log.

> **Note:** this is a POC. It demonstrates the Cooldown on the browser surface. It is *not* yet hardened against a determined technical user (removing a site from the blocklist is currently easy, DNS/other-browser bypass isn't addressed). Circumvention-resistance and admin-enforced team policy are the next real engineering — see the business plan.

---

## Architecture (POC)

- **Manifest V3**, `declarativeNetRequest` dynamic rules redirect blocked domains to the block page.
- **`background.js`** — service worker: manages the blocklist, cooldowns, time-boxed allowances (via `chrome.alarms`), and the relapse log.
- **`blocked.html/js/css`** — the flagship Cooldown surface.
- **`popup.*`** — quick block/unblock and status.
- **`options.*`** — the rules (cooldown length, pass length, minimum reason) and your history.
- **`common.js`** — shared state schema and helpers over `chrome.storage.local`.

---

## Roadmap

- [ ] Gate blocklist *removal* behind the same cooldown (close the obvious escape).
- [ ] Cross-browser + desktop agent (the more defensible surface).
- [ ] Real circumvention-resistance (uninstall/DNS/other-browser).
- [ ] SME tier: central admin console, admin-enforced blocklists, non-MDM deployment.

---

*Concept, brand, and POC. Figures in the business plan are grounded in verified July 2026 research; anything marked a hypothesis is for validation, not commitment.*
