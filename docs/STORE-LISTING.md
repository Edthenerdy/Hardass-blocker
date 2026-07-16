# Chrome Web Store — Privacy & Permissions submission

Copy-paste fields for the Web Store dashboard's **Privacy** tab. Every justification is
specific to what Deadbolt Blocker actually does — vague or over-broad wording is a top
rejection reason, so keep these tight.

---

## Privacy policy URL

> https://edthenerdy.github.io/Hardass-blocker/privacy-policy.html

The policy lives at [`docs/privacy-policy.html`](privacy-policy.html). To publish it for
free: repo **Settings → Pages → Source: Deploy from a branch → Branch: `main`, folder:
`/docs` → Save**. Wait ~1 minute, then the URL above goes live — paste it into the CWS
**Privacy policy** field. (Any publicly reachable HTTPS URL works — GitHub Pages is just
the zero-cost option.)

---

## Single purpose (required field)

> Deadbolt Blocker blocks a user-chosen list of websites and enforces a waiting period
> before any block can be lifted, to help people stay off distracting sites.

---

## Permission justifications

Paste each into the matching box under **Privacy → Permission justification**.

### `declarativeNetRequest`
> Used to block navigation to the sites on the user's blocklist by redirecting them to the
> extension's own "blocked" page. The extension defines redirect rules for the domains the
> user chose to block; it does not observe or report the user's browsing.

### `storage`
> Used to save the user's blocklist, settings, cooldown/allowance timers, and their personal
> relapse history locally on the device via `chrome.storage.local`. In personal use this data
> never leaves the device.

### `alarms`
> Used to run time-based enforcement: expiring a temporary "allowance" and re-blocking a site
> when its cooldown ends, and a periodic watchdog that re-asserts the blocking rules if they
> are cleared or tampered with. Also drives the periodic policy sync when the extension is
> enrolled in managed mode.

### Host permission `<all_urls>`
> Required so the blocking rules can apply to any domain the user chooses to add to their
> blocklist — the extension cannot know in advance which sites a given user will block, so it
> needs the ability to match any URL at the main-frame navigation level. The extension only
> checks whether the destination URL is on the user's blocklist in order to redirect it. It
> does not read, inject into, collect, or transmit the content of any page.

---

## Data usage disclosures (checkboxes + certification)

Answer the "What user data do you collect?" section as follows.

**Personal (unmanaged) mode — the default:** the extension collects **no** data that is
transmitted off the device. All storage is local. On the data-collection checklist, do **not**
tick any category as collected/transmitted, because in personal mode nothing is sent anywhere.

**If you also ship managed/enterprise mode in the same published build,** disclose that when a
user is enrolled by an organisation, the extension transmits to that organisation's own server:
the domain and reason text for an access request, and blocked/allowed enforcement events. This
maps to the CWS category **"Website content" → no**, **"User activity"** (limited to the
blocked-domain events) and **"Personal communications" → no**. Certify:

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases.
- ☑ I do not use or transfer user data for purposes unrelated to my item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes.

> **Recommendation:** if the first public listing is the consumer product, publish the
> extension *without* the managed-mode code paths active by default (they only activate on
> explicit enrolment). That keeps the data disclosure to the simplest, cleanest answer —
> "all data stays on device" — which is the fastest path through review.

---

## Notes for reviewer (optional "notes" field)

> This is a website blocker. It stores the user's blocklist and settings locally. It requests
> broad host access only because blocking rules must be able to match whichever domains the
> individual user chooses to block; it does not read or transmit page content. An optional
> enterprise mode communicates only with a server address the enrolling organisation controls.
