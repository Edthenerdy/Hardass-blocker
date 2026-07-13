# Holdfast launch — work list & progress

**Goal:** ship the individual **Holdfast** extension to the Chrome Web Store this week → installs + reviews + validated positioning. Free; no billing this week by design.

**Legend:** ✅ done · ⏳ waiting on you (human-gated) · 🔜 next · 💤 out of scope this week

---

## ✅ Done overnight (Claude)
- ✅ **Rebranded** extension to **Holdfast — Website Blocker**, v1.0.0; description trimmed to the 132-char store limit; signing key kept (ID pinned). No "Hardass" left in the UI.
- ✅ **Privacy policy** — `docs/privacy.html` (GitHub Pages ready).
- ✅ **Store submission pack** — `docs/STORE-LISTING.md` (name, description, single purpose, per-permission justifications, data declarations).
- ✅ **Store screenshots** — 4× 1280×800 in `docs/store-assets/` (cooldown, popup, settings/history, "Nice try") + **promo tile** 440×280.
- ✅ **Landing page** — `docs/index.html` (GitHub Pages ready).
- ✅ **Launch content** — `docs/LAUNCH-CONTENT.md` (Product Hunt, HN Show HN, Reddit ×2, X thread, LinkedIn) — drafts for you to post.
- ✅ **Submission checklist** — `docs/SUBMISSION-CHECKLIST.md` (click-by-click).
- ✅ **Launch FAQ** — `docs/LAUNCH-FAQ.md` (canned replies to comments/reviews).
- ✅ **Launch-ready zip** — `holdfast-extension.zip` (in Downloads + repo).
- ✅ Pushed as **PR #4**.
- ✅ Trademark scan (preliminary): "Holdfast" looks open in software class 9/42; domains `.com`/`holdfastapp.com`/`getholdfast.com` taken (photo app + others), **`holdfast.app` available**.

## ⏳ Ready for you, in order (human-gated — I can't do these)
1. ⏳ **Merge the PRs** you're happy with. Suggested order: **#2** (device-client fix) → **#1** (per-device guard) → **#3** (managed enrolment) → **#4** (Holdfast rebrand). #4 is the one that matters for this launch.
2. ⏳ **Enable GitHub Pages** (Settings → Pages → `/docs`) → gives you the privacy-policy + landing URLs.
3. ⏳ **Pick the contact email** (grab `holdfast.app` + forwarding, or swap `support@holdfast.app` in `docs/privacy.html` for one you own).
4. ⏳ **Final smoke test** — load `extension/` unpacked in Chrome, confirm block → cooldown → unblock works under the Holdfast name.
5. ⏳ **Submit to the Web Store** — follow `SUBMISSION-CHECKLIST.md` (~40 min). **Do this early** — review latency is the main schedule risk.
6. ⏳ After approval: swap the live store URL into `docs/index.html` (1 TODO) and `LAUNCH-CONTENT.md` (`<STORE_URL>`), then **post the launch content** and reply to everything.

## 🔜 If time / after launch
- 🔜 Firefox build target.
- 🔜 Most-requested tweaks from feedback (likely: schedules, stronger lock).
- 💤 Multi-tenant SaaS + Stripe billing, signed native installers, Layer-3 native agent, the enterprise pilot — **out of scope this week**; that's the next-phase (paid) track.

---

## 7-day plan status
| Day | Focus | Status |
|---|---|---|
| 1 | Accounts, name, code polish, privacy policy | ✅ (yours: dev acct done; Pages + email pending) |
| 2 | Listing content + screenshots | ✅ all assets built |
| 3 | **Submit to Web Store** | ⏳ your ~40 min — the critical-path step |
| 4 | Landing page + launch prep | ✅ built; publish when Pages is on |
| 5 | Launch (post everywhere) | ⏳ after approval |
| 6 | Amplify + collect feedback | ⏳ |
| 7 | Iterate (fast patch) + retro | ⏳ |

## Open placeholders to resolve
- `support@holdfast.app` → an address you own.
- `<STORE_URL>` / the `#` CTA in the landing page → live listing URL (after approval).
- Privacy-policy URL → your GitHub Pages URL (after enabling Pages).

*Last updated by Claude during the overnight build session.*
