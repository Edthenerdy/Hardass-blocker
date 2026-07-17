# Holdfast

**The blocker you can't talk your way out of.**

> **Naming:** the individual product now ships on the Chrome Web Store as **Holdfast** (see `docs/`). This repo keeps "Holdfast" as its working name; the SME/enterprise tier is **Holdfast for Teams**. A full project rename to Holdfast is optional — tracked in `docs/LAUNCH-PROGRESS.md`.

Every website blocker fails at the same moment — the one-click "just disable it for a sec" when self-control is weakest. Holdfast makes *unblocking* deliberately hard: a mandatory cooldown, a written reason, and a look at your own relapse history before you're let back in.

This repo contains the concept, the brand, and a working proof-of-concept.

---

## What's here

| Path | What it is |
|---|---|
| [`docs/BUSINESS-PLAN.md`](docs/BUSINESS-PLAN.md) | Strategy, market analysis, competitive map, pricing, GTM, risks |
| [`docs/BRAND.md`](docs/BRAND.md) | Brand guide — voice, two-mark logo system (Rocky + holdfast), palette, granite texture |
| [`docs/MOAT.md`](docs/MOAT.md) | Circumvention-resistance strategy — the layered defense and its honest limits |
| [`enterprise-policy/`](enterprise-policy/) | Chrome/Edge force-install policy — makes the extension unremovable without MDM |
| [`extension/`](extension/) | Individual POC — a Manifest V3 Chrome extension (the consumer "Holdfast" product) |
| [`server/`](server/) | Enterprise POC backend — Node.js API (auth, policy sync, approvals, telemetry) |
| [`console/`](console/) | Enterprise POC — the admin console (Holdfast for Teams) |
| [`device/`](device/) | Enterprise POC — a managed-device client that enrols and enforces policy |
| [`tools/gen-icons.js`](tools/gen-icons.js) | Dependency-free PNG icon generator |

There are two products here sharing one idea, matching the business plan's two phases:

1. **Holdfast** (`extension/`) — the individual product. Self-discipline via the Cooldown.
2. **Holdfast for Teams** (`server/` + `console/` + `device/`) — the SME product. The *same enforcement idea*, but the admin holds the key. This is the part that has no equivalent on the market (Freedom has a team tier but refuses to enforce; MDM is overkill).

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

## Holdfast for Teams — the enterprise POC (full-stack)

The SME tier the business plan calls the real business: **admin-enforced** blocking, deployed without MDM. It's a working full-stack slice — a Node backend, an admin console, and a device client that enrols, pulls its policy, enforces it, and asks the admin for access.

### Run it

```bash
cd server
npm start          # or: node server.js   (no dependencies to install)
```

Then open two tabs:

- **Admin console** — <http://localhost:8787/console/> — sign in with `admin@northshore.example` / `holdfast`
- **Device client** — <http://localhost:8787/device/> — enrol with code `NSD-4K9-QX2`

### The end-to-end loop to try

1. In the **device** tab, type `instagram.com` and hit Go → you're **blocked** (policy synced from the server, enforced client-side).
2. Write a reason and click **Request access**.
3. Switch to the **console** tab → the request appears under **Access requests** → click **Approve**.
4. Back on the **device**, it auto-detects the approval, re-syncs, and the site now loads for the granted window.

Enrol with `NSD-7P3-ZW8` instead to land in the **Clinicians** group, which uses *cooldown* mode (self-serve wait) rather than admin approval — showing both enforcement styles from one engine.

### What it demonstrates (and the four things nobody else combines)

- **Central, admin-set policy** — blocklists, categories, schedule, cooldown, enforcement level — that devices sync automatically.
- **Locked enforcement** — the device is "managed"; the user can't disable it (vs Freedom, which refuses to enforce).
- **Admin-approved unblocks** — the enterprise version of the Cooldown: the admin holds the key.
- **Non-MDM enrolment** — a device joins with a short code, no device-management suite, no IT.
- Plus telemetry → **compliance reporting** (blocked attempts per site), the reason a clinic or call centre buys.

### Connect the *real* extension to a team (managed mode)

The browser extension in [`extension/`](extension/) is now the real enforcement agent — not just the web simulator. With the server running:

1. Load the extension (`chrome://extensions` → Developer mode → Load unpacked → `extension/`).
2. Open its options (popup → **Settings, team & history**) → **Team (managed mode)**.
3. Server URL `http://localhost:8787`, enrollment code `NSD-4K9-QX2`, then **Enrol this device**.

Now the extension:
- pulls its blocklist and rules from the server and re-syncs every 30s (and on approval),
- **locks down** — when the policy is `locked`, the popup shows "Managed by …" and the user can't add, remove, or disable anything,
- routes unblock attempts through the server: **admin-approval** groups create a request the admin approves in the console; **cooldown** groups run the wait then self-grant,
- reports blocked attempts as telemetry → the console's reports.

Leaving a team is blocked while the policy is `locked` — exactly the "can't talk your way out of it" promise, enforced by the org instead of a timer.

### Enterprise backend notes

- Zero npm dependencies — plain Node `http`, `crypto` (scrypt password hashing), JSON-file store (`server/data.json`, gitignored, seeded on first run).
- Token auth: admin tokens and per-device tokens. Device endpoints are device-scoped; admin endpoints require an admin token (unauthorized calls 401).
- This is a POC: single-tenant seed data, file storage, no HTTPS/SSO/billing yet. Production needs a real DB, multi-tenancy, SSO, Stripe, and the managed *browser extension* (not just the web simulator) as the enforcement agent.

## Architecture (individual extension POC)

- **Manifest V3**, `declarativeNetRequest` dynamic rules redirect blocked domains to the block page.
- **`background.js`** — service worker: manages the blocklist, cooldowns, time-boxed allowances (via `chrome.alarms`), and the relapse log.
- **`blocked.html/js/css`** — the flagship Cooldown surface.
- **`popup.*`** — quick block/unblock and status.
- **`options.*`** — the rules (cooldown length, pass length, minimum reason) and your history.
- **`common.js`** — shared state schema and helpers over `chrome.storage.local`.

---

## Roadmap

- [x] SME tier POC: central admin console, admin-enforced blocklists, admin-approved unblocks, non-MDM enrolment, compliance reporting *(see `server/` + `console/` + `device/`)*.
- [x] Wire the *real* extension into managed mode — enrol → pull policy from the server → sync every 30s → lock down add/remove/disable → server-backed request/approval + cooldown + telemetry.
- [x] Gate blocklist *removal* behind a think-delay in the individual extension (managed+locked disables it entirely).
- [x] Circumvention-resistance layers 1–2: bypass-vector blocking (proxies/translate/cache/archive), self-healing watchdog, pinned extension ID, and Chrome/Edge **force-install** policy so the user can't disable/remove it or use incognito. See [`docs/MOAT.md`](docs/MOAT.md) + [`enterprise-policy/`](enterprise-policy/).
- [ ] Circumvention-resistance layer 3: native OS agent (DNS/hosts/other-browser/uninstall resistance). *(needs: native builds, code-signing, admin testing)*
- [ ] Cross-browser (Firefox) build target.
- [ ] Production backend: real DB + multi-tenancy, SSO, Stripe billing, HTTPS. *(needs: hosting, a DB, Stripe + IdP accounts)*

---

*Concept, brand, and POC. Figures in the business plan are grounded in verified July 2026 research; anything marked a hypothesis is for validation, not commitment.*
