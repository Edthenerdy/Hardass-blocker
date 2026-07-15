# Tomorrow — get Holdfast live

**Where it stands:** the individual extension is built, rebranded **Holdfast**, and
hardened across **70 automated checks** (20 logic + 24 journeys + 26 every-control)
plus two real-Chromium UX audits. Launch kit (screenshots, promo tiles, demo GIF,
landing, privacy policy, store listing, launch posts, FAQ) is done. Everything is
on **PR #4** (`holdfast-launch-prep`), not merged.

Your total time below ≈ **1.5–2 hours**, most of it the Web Store form + smoke test.

---

## Do these in order

**0. Reconcile the repo (~10 min) — do this first.**
`main` now has extra work I didn't touch (`account/`, `Dockerfile`, `docker-compose.yml`,
`tools/` — looks like the SaaS/backend track). My launch branches were cut off an
older `main`. Skim `git log main`, and merge/rebase so PR #4 sits cleanly on top.
Nothing in PR #4 touches those files, so it should be conflict-free — just confirm.

**1. Merge the PRs (~5 min).** Suggested order: **#2** (device-client fix) → **#1**
(per-device guard) → **#3** (managed enrolment) → **#4** (Holdfast launch + all UX/QA).
#4 is the one that matters for this launch.

**2. Enable GitHub Pages (~2 min).** Repo → Settings → Pages → Deploy from branch →
`main` / `/docs`. Gives you:
- Privacy policy: `https://<you>.github.io/Hardass-blocker/privacy.html`
- Landing page: `https://<you>.github.io/Hardass-blocker/`

**3. Set your contact email (~5 min).** Replace `support@holdfast.app` in
`docs/privacy.html`, `docs/index.html`, and `docs/LAUNCH-FAQ.md` with an address you
own. (Optional: grab `holdfast.app` — it was available — and forward it.)

**4. Smoke-test in YOUR Chrome (~10 min) — the one thing only you can do.**
`chrome://extensions` → Developer mode → Load unpacked → select `extension/`.
Check: the welcome page opens; block a site → Cooldown page; wait/skip → unblock →
site loads; popup add/remove; options saves. (My tests simulate all this, but eyeball it.)

**5. Submit to the Chrome Web Store (~40 min) — the critical path; do it early.**
Follow `docs/SUBMISSION-CHECKLIST.md` step by step:
- Upload `holdfast-extension.zip` (in your Downloads).
- Paste listing text + permission justifications from `docs/STORE-LISTING.md`.
- Upload the 4 screenshots + promo tile from `docs/store-assets/` (also in your
  Downloads `holdfast-store-assets/`). Put `screenshot-01-cooldown.png` first.
- Privacy tab: declare **no data collected**, tick all 3 certifications, paste the
  Pages privacy URL.
- Submit. Review takes hours–days, so submitting early is the whole game.

**6. While it's in review:** publish the landing page, prep a Product Hunt draft
(assets + copy in `docs/LAUNCH-CONTENT.md`), and **make the one open decision** below.

**7. On approval:** paste the live store URL into `docs/index.html` (2× `#` CTAs)
and `docs/LAUNCH-CONTENT.md` (`<STORE_URL>`), then post the launch content
(PH, Show HN, Reddit ×2, X, LinkedIn) and reply to every comment for 48h.

---

## One decision to make (before launch)
**Bypass-blocking default.** With it on (current default), Holdfast also blocks
*legitimate* use of Google Translate/archive.org on non-blocked pages → a plausible
1-star magnet. It's already a toggle. Recommendation: default **off** for the
consumer extension, keep it **on** for the enforced/team tier. Change is one line in
`extension/common.js` DEFAULTS (`blockBypass`). See `docs/UX-AUDIT.md`.

## Placeholders to fill
- Store URL → after approval (landing CTAs + launch content).
- Contact email → step 3.
- Privacy-policy URL → after Pages (step 2).

## Where everything lives
- **Code + fixes:** `extension/` (on PR #4). **Tests:** `test/` — run `node test/extension.test.mjs`, `test/user-journeys.test.mjs`, `test/interactions.test.mjs`, `test/link-audit.mjs` (jsdom needed for the middle two).
- **Launch kit:** `docs/` — `SUBMISSION-CHECKLIST.md`, `STORE-LISTING.md`, `LAUNCH-CONTENT.md`, `LAUNCH-FAQ.md`, `UX-AUDIT.md`, `USER-TESTING.md`, `LAUNCH-PROGRESS.md`.
- **Assets:** `docs/store-assets/` (+ copies in Downloads): 4 screenshots, promo tile, marquee, demo GIF.
- **Install zip:** `holdfast-extension.zip` (Downloads).

## Not this week (the next phase, all flagged out of scope)
Multi-tenant SaaS + Stripe billing, signed native installers, the Layer-3 native
agent, the enterprise pilot. The `account/` + Docker work on `main` is the start of
that track — separate from this consumer launch.
