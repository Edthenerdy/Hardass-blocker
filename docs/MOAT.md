# The Moat — circumvention resistance

The product's only real defensibility is this: **the block actually holds.** Everyone can build a blocklist; almost nobody makes it genuinely hard to get around, because in a consumer freemium model an unbeatable block creates angry customers. We make it hard on purpose. This is defense-in-depth, and it's honest about where each layer stops.

> A blocker is only as strong as its weakest bypass. The point of layering is that each layer closes the doors the one below it leaves open.

---

## Layer 1 — In-browser hardening *(built)*

In [`extension/`](../extension/), enforced by `declarativeNetRequest`:

- **Subdomain + scheme coverage.** `||domain^` rules catch `www.`, other subdomains, http/https.
- **Bypass-vector blocklist.** Translation proxies (`translate.goog`, `translate.google.com`), cached copies (`webcache.googleusercontent.com`), archive mirrors (`web.archive.org`, `archive.ph`, …) and common public web proxies (`croxyproxy`, `proxysite`, `12ft.io`, …) are blocked alongside the real list, so you can't load a blocked site *through* another site. Hitting one shows a "Nice try." page. See `HB.BYPASS_DOMAINS` in [`common.js`](../extension/common.js).
- **Self-healing watchdog.** A watchdog alarm (plus every policy sync and every browser start) re-computes the intended rule set and compares it to the live rules; if they've been cleared or tampered with, it silently re-asserts them. See `verifyAndHeal()` in [`background.js`](../extension/background.js).

**Stops:** casual in-browser dodges — subdomains, "just use Google Translate", cached/archived copies, a quick proxy, and rules being wiped.
**Doesn't stop:** disabling or removing the extension itself, incognito, a different browser, OS-level tricks. → Layer 2 & 3.

## Layer 2 — Unremovable deployment *(built)*

In [`enterprise-policy/`](../enterprise-policy/). The extension ID is **pinned** via a signing `key` in the manifest (`mdfcmhkfkelkdhjbjddmkmjkmobijbgc`), so enterprise policy can target it:

- **Force-install** via Chrome/Edge enterprise policy → the user **cannot disable or remove** the extension (no toggle on `chrome://extensions`).
- **Incognito disabled** → closes the "open it in a private window" hole.
- **No MDM required** — a `.reg` merge, a GPO, or a dropped JSON policy file does it. This is the whole "enterprise control for SMEs without an IT department" thesis, made real.

**Stops:** the user turning it off, removing it, or escaping via incognito — on the managed browser.
**Doesn't stop:** a *second* browser (Firefox, a portable build), changing DNS, or editing the hosts file. → Layer 3.

## Layer 3 — Native OS agent *(designed, not built — needs native dev + admin)*

The genuinely bulletproof layer, and the honest edge of what a browser-only product can do. A small native component (installed as a service/daemon with admin rights, talking to the extension via **native messaging**) would:

- enforce blocking at the **DNS / hosts-file / system-proxy** layer, so *every* browser and app is covered, not just Chrome;
- resist **uninstall** (protected service, watchdog process, tamper alerts to the admin console);
- detect and report **other browsers** and attempts to change network settings.

This is real engineering — a signed installer per OS, a privileged service, and an arms race against a determined technical user. It is deliberately **not** in this repo: it needs native builds, code-signing certificates, and admin-level testing. It's the right next investment once Layers 1–2 are validated with paying SMEs.

---

## Honest scorecard

| Bypass attempt | L1 in-browser | L2 force-install | L3 native agent |
|---|---|---|---|
| Type the URL / a subdomain | ✅ blocked | ✅ | ✅ |
| Google Translate / cache / archive / web proxy | ✅ blocked | ✅ | ✅ |
| Clear the extension's rules | ✅ self-heals | ✅ | ✅ |
| Disable / remove the extension | ❌ | ✅ can't | ✅ |
| Incognito window | ❌ | ✅ disabled | ✅ |
| A different / portable browser | ❌ | ❌ | ✅ |
| Change DNS / edit hosts file | ❌ | ❌ | ✅ |
| Uninstall at the OS level | ❌ | ❌ | ✅ (resisted) |

**Where we are:** Layers 1 and 2 make the block genuinely hard to beat on a managed browser — which is exactly the SME use-case (company-owned devices, admin holds the key). Layer 3 is the moat's deep end, and it's honestly scoped as the next build, not something already done.
