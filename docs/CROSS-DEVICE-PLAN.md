# Cross-device plan — Pro cloud sync

**Decision (Edward, 2026-07-24):** Free stays **per-device and fully local**. Cross-device
sync is an **opt-in Holdfast Pro feature**, so it never breaks the privacy promise
or the per-device default, and it gives Pro a real reason to exist.

> **Status: BUILT & VERIFIED (2026-07-24).** Server endpoints, extension merge/wiring,
> privacy + options copy are all in. Verified by 8 merge unit tests and a 9-check
> two-device end-to-end run against the live dev server (`test/sync-e2e.mjs`): two
> devices converge, settings/streak merge, removals propagate via tombstone, re-adds
> win, unauth is rejected. It stays dormant for real users until `PRO_SERVER` is set
> and the account server is deployed (same gate as billing).

## Where things stand today
- **Free / unlinked:** blocklist, settings, streak, history all in `chrome.storage.local`.
  Never leaves the device. Each device independent. *(No change — this is the default.)*
- **Teams:** already cross-device — the admin sets policy centrally and every enrolled
  device pulls it from the org server. *(No change.)*
- **Pro plumbing that already exists:** `proLink` / `proSync` / `proMaybeRefresh` in
  `background.js`, an account server with per-user auth (email + token), and a periodic
  watchdog refresh. Sync bolts onto this — we are extending an existing channel, not
  building a new one.

## What syncs (v1)
Small, high-value, low-sensitivity state only:
- **Blocklist** (the sites you block)
- **Settings** (cooldown length, pass length, min reason, bypass toggle)
- **Streak anchors** (`meta`: installedAt, lastCaveTs, bestDaysHeld)

**Not** in v1: the raw relapse log / block log (larger, more sensitive; stays local).
Pro's "full history" pitch is history *depth on a device*, not cross-device merge —
so this is consistent. Revisit history sync in v2 if users ask.

## Server (add to the existing account server)
A per-user profile blob, guarded by the existing Pro token:
- `GET  /api/pro/profile` → `{ ok, profile, updatedAt }` — current cloud state.
- `PUT  /api/pro/profile` → body `{ profile, updatedAt }` — store if newer.

`profile = { blocklist:[{domain}], settings:{…}, meta:{…}, updatedAt }`.
Storage: one JSON blob per user row. ~30 lines; no schema migration.

## Merge rule (a single user's own devices — keep it boring)
On sync, reconcile local vs cloud:
- **Blocklist:** union by domain (adding a site on any device adds it everywhere;
  removals use a per-domain `removedAt` tombstone so a remove isn't undone by a stale peer).
- **Settings:** whole-object last-writer-wins by `updatedAt`.
- **Streak:** `bestDaysHeld = max`; `lastCaveTs = most recent` (a cave anywhere resets
  the shared streak — correct for one person across devices).
Then write the merged result both up (PUT) and down (local `HB.set`), stamp `updatedAt`.

## Extension wiring
- On `proLink` success and inside `proMaybeRefresh` (already periodic), also pull+merge+push.
- Add explicit **"Sync now"** (the Pro card already has the button — extend its handler).
- Gate entirely behind being signed into Pro: unlinked = local-only, unchanged.
- Apply DNR rules after a sync-down so a newly-synced blocklist takes effect immediately.

## Privacy / copy (must update before shipping sync)
- `docs/privacy.html`: today it says the only thing sent to the account server is
  email + subscription status. Add: "If you turn on Pro sync, your blocklist and
  settings are also stored on the account server so they follow you across devices.
  Your browsing and the reasons you type stay on your device."
- Options Pro card: one line — "Signed into Pro: your blocklist & settings sync across
  your devices." Free users see nothing new.

## Testing (doable now, against the local dev server)
The dev backend already runs at `127.0.0.1:8787`. Build order:
1. Server endpoints + a unit test (store/fetch a profile).
2. Extension merge logic + a test that simulates **two devices**: device A blocks a
   site → device B pulls and sees it; B changes cooldown → A converges; a remove on A
   isn't resurrected by B's stale copy.
3. Privacy + options copy, re-render.

## Effort & gating
~2 evenings, fully testable against the dev server today. It only goes *live* for real
users once the account server is deployed and `PRO_SERVER` is set (the same launch gate
as billing) — so this can be built and verified now, and switches on with everything else.
