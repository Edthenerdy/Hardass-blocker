# Chrome Web Store — submission pack (Holdfast)

Everything to paste into the Developer Dashboard. Copy each block verbatim; swap the two placeholders marked ⚠️.

---

## Listing basics

- **Name:** `Holdfast — Website Blocker`
- **Category:** Productivity → *Workflow & Planning*
- **Language:** English
- **Short description (132-char limit, from manifest):**
  `The blocker you can't talk your way out of. Unblocking means a cooldown, a written reason, and facing your own relapse history.`

## Detailed description (paste into "Description")

```
Every website blocker fails at the same moment — the one-click "just disable it for a sec" when your self-control is weakest. Holdfast makes UNBLOCKING deliberately hard, so the block you set actually holds.

When you try to open a site you've blocked, you don't get a nag you can dismiss. You get the Cooldown:

1. WAIT. A mandatory cooldown timer (you set the length — default 20 min). It keeps running even if you close the tab; reopening doesn't reset it.
2. WRITE WHY. Type a real reason before you can unblock. Minimum length enforced. No blank, thoughtless unblocks.
3. FACE YOUR HISTORY. See how many times you've caved this week, your average self-granted pass, and when you last gave in.

Only then does the unblock button work — and it grants a time-boxed pass that re-blocks the site automatically when it runs out.

WHY IT WORKS
- The wait kills the impulse.
- The written reason kills the self-deception.
- The history is the mirror.

FEATURES
- Block any site in two clicks from the toolbar.
- Set your own cooldown length, pass length, and minimum reason length.
- Bypass-vector blocking: translation proxies, cached copies, and archive mirrors of blocked sites are blocked too.
- Your relapse log, kept honest and kept private.
- Per-device: your blocklist and history live on this device and nothing syncs anywhere.

PRIVACY
Holdfast stores everything locally on your device. It collects no personal data, sends nothing to us, and has no ads, analytics, or trackers. See the privacy policy linked below.

Holdfast won't argue with you. Past-you set the rule. Holdfast holds the line.
```

## Single purpose (paste into "Single purpose")

```
Holdfast blocks websites the user chooses and enforces a deliberate cooldown — a timed wait, a written reason, and a review of the user's own unblocking history — before a blocked site can be reopened.
```

## Permission justifications (paste one per field)

- **`declarativeNetRequest`**
  `Used to redirect a site the user has blocked to the extension's cooldown page. The extension defines block rules; the browser enforces them. It does not read or intercept the content of pages.`

- **`storage`**
  `Stores the user's blocklist, settings, active cooldowns, and relapse history locally on the device (chrome.storage.local). Nothing is transmitted off the device.`

- **`alarms`**
  `Re-blocks a site automatically when its time-boxed pass expires, and periodically re-asserts the user's block rules if they are cleared.`

- **`activeTab`**
  `Lets the user block the site in the current tab with one click from the toolbar popup.`

- **Host permissions (`<all_urls>`)**
  `Required so the user can block any website they choose — the block rule must be able to apply to any host. The extension does not read, collect, log, or transmit the user's browsing; host access is used only to redirect user-blocked sites to the cooldown page.`

- **Are you using remote code?** → **No.** All code is bundled in the package; nothing is fetched and executed at runtime.

## Privacy practices tab (what to declare)

- **Single purpose** — as above.
- **Data collected:** select **none**. Holdfast does not collect or transmit user data in individual use.
- **Data usage certifications** — tick all three:
  - I do not sell or transfer user data to third parties (outside approved use cases).
  - I do not use or transfer user data for purposes unrelated to the item's single purpose.
  - I do not use or transfer user data to determine creditworthiness or for lending.
- **Privacy policy URL:** ⚠️ `https://<your-username>.github.io/<repo>/privacy.html` (from GitHub Pages — see below)

## Graphics to upload
- **Store icon:** 128×128 (in `extension/icons/icon128.png`).
- **Screenshots:** at least 1, ideally 3–5, at **1280×800** (or 640×400). I'll generate these — the cooldown page, the popup, and the settings/history view.
- **Small promo tile (optional but recommended):** 440×280.

## Notes
- ⚠️ **Contact email in the privacy policy** is currently `support@holdfast.app`. Either grab `holdfast.app` and set up forwarding, or change it in `docs/privacy.html` to an address you own before publishing.
- The `<all_urls>` + `declarativeNetRequest` combo can trigger a manual review question. The justification above is written to answer it head-on; if Google asks, reply fast quoting it.
- Do **not** claim "unbypassable" anywhere in the listing — the individual extension can be disabled by a determined user. Sell the Cooldown, not enforcement.
