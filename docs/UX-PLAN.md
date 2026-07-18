# Holdfast UX plan — research-grounded, execution-ready

A phased UX roadmap for Holdfast (consumer) and Holdfast for Teams, built from
(a) three rounds of internal audit/testing already completed, and (b) external
best-practice research (habit formation, freemium conversion, extension
onboarding). Each item has a spec, acceptance criteria, and a test approach so
it can be executed without further discussion. Items marked **[Claude]** I can
build and verify; **[Edward]** are decisions/accounts.

---

## 1. Principles (the lens for every decision)

1. **Honesty is the brand.** Holdfast wins by *not* gaslighting the user —
   "friction, not a cage." No dark patterns: no fake urgency, no hidden cancel,
   no shame mechanics. Loss-aversion framing is allowed only when it's true
   (e.g. a real streak the user actually holds).
2. **The moment of temptation is the product.** Every UX decision optimizes one
   scene: user hits a blocked site, wants in, and the page must make *not caving*
   the easy, satisfying choice.
3. **Positive before negative.** Lead with wins (time saved, days held), keep
   the mirror (relapse stats) visible but second. (Shipped: time-saved stat.)
4. **Value before paywall.** Research: users must hit the "aha moment" before
   any upgrade prompt; contextual prompts convert 5–10× better than generic
   ones; keep ~80% of everyday value free and gate the top ~20%.
5. **Instant usability.** 86% of users decide in the first few minutes; the
   extension must be fully working even if the welcome page is skipped (it is —
   defaults are seeded on install).

## 2. Current state (what's already strong)

- Onboarding welcome page (3-step explainer + editable starter blocklist) ✅
- The Cooldown with persistent timer, written reason, relapse mirror ✅
- Time-saved stat (consumer block page; org-wide in Teams console) ✅
- Gated remove (3s think-delay), bypass-vector blocking, self-heal ✅
- 71 automated checks + link audit + rendered-UX audits ✅

Gaps this plan addresses: no habit loop (nothing to come back to), no streaks,
popup is purely functional (no wins surfaced), no freemium gate yet, upgrade
moments undesigned, welcome page ends flat, no post-cave compassion moment.

---

## 3. Phase P0 — before store submission (small, high-leverage)

### P0.1 Streak — "days held" **[Claude]**
The single strongest habit mechanic in the research (loss aversion done
honestly: the streak is real).
- **Spec:** track the longest run of consecutive days with zero self-granted
  passes (`relapseLog` empty for the day). Store `streak: {current, best,
  lastCaveTs}` derived nightly (alarm) + on events. Show on block page stats
  ("Days held: 6 — best 11") and popup header.
- **Copy:** "held" language, on-brand: *"6 days held. Don't hand it back."*
  After a cave: reset current, keep best; never shame ("Back to day one.
  That's how it works.").
- **Accept:** streak survives browser restart; cave resets current not best;
  unit tests for day-boundary math; rendered check.

### P0.2 Popup leads with the win **[Claude]**
Popup currently shows brand + list only. Users open it daily — it's the habit
surface (Hook model: the "investment" view).
- **Spec:** one-line stat strip under the header: `🛡 3h 30m saved this week ·
  6 days held`. Click → options history. Empty state: "Block your first site
  to start saving time."
- **Accept:** renders at 380px without wrap-break; interaction test for click.

### P0.3 Post-cave "compassion + re-arm" moment **[Claude]**
Behavioral research: the moment after relapse is where habit apps lose people
(guilt → uninstall). Holdfast's honesty brand can own this.
- **Spec:** when a pass expires and the site re-blocks, the next visit to the
  blocked page shows a one-time banner: *"Pass over. No drama — the block is
  back on. (You've still saved 3h this week.)"*
- **Accept:** shows once per pass, not on every visit; journey test.

### P0.4 Welcome page ends with a next action **[Claude]**
Research: clear CTA at setup end lifts interaction ~30%; three-click rule.
- **Spec:** after "Start blocking →", offer an optional immediate micro-win:
  "Try it: open instagram.com" link (opens the blocked page → user sees the
  Cooldown once, calmly, before temptation ever hits). Skippable.
- **Accept:** link opens blocked view; welcome still closes cleanly.

### P0.5 "(est.)" honesty label on time-saved **[Claude]**
Keep the number credible: tooltip/label "≈15 min per blocked visit" on block
page + console. (Console already says "(est.)".)
- **Accept:** visible without hover on at least one surface.

## 4. Phase P1 — freemium gate (build while store review runs)

### P1.1 The 80/20 split **[Edward decision — recommended below, then Claude]**
Research: never paywall the aha moment (the Cooldown IS the aha); gate breadth
and power, not the core.
- **Free:** 5 blocked sites, full Cooldown, bypass-blocking, 7-day history,
  streak + time-saved.
- **Pro $7.99/mo:** unlimited sites, schedules (block 9–5 weekdays), full
  history + weekly report, strict mode (longer removal delay, no pass
  shortening), device sync (later).

### P1.2 Contextual upgrade prompts only **[Claude]**
Research: contextual converts 5–10×; generic popups burn goodwill.
- **Trigger A:** adding a 6th site → inline card in popup: "Five sites is the
  free wall. Pro takes it to unlimited — $7.99/mo." One tap → checkout.
- **Trigger B:** opening history older than 7 days → "Your full history is a
  Pro thing."
- **Trigger C (soft):** weekly stat moment ("You saved 4h this week") with a
  quiet "See your full report — Pro" link. Never interrupts the Cooldown page —
  the moment of temptation is sacred (and monetizing it would betray the brand).
- **Accept:** prompts appear only on their triggers, are dismissible, never
  shown more than once per day; interaction tests.

### P1.3 Account + entitlement plumbing **[Claude builds; Edward: Stripe keys]**
Extension sign-in (email link or token from the account page), entitlement
check against `/api/billing/status`, local grace cache (48h) so Pro doesn't
flicker offline. Price update $9 → **$7.99** in `server/billing.js`.

## 5. Phase P2 — post-launch (driven by review feedback)

- **P2.1 Schedules** (the most-requested blocker feature everywhere): block
  sets by time window; Pro.
- **P2.2 Weekly email/report** (opt-in): "Your week: 6h saved, 9 days held" —
  the Hook model's external trigger, honestly done.
- **P2.3 Focus sessions** (Forest-style timeboxing): "Hold for 50 minutes" —
  optional gamified sprint; free teaser, Pro for custom lengths.
- **P2.4 Teams console dashboard polish:** time-reclaimed trend chart, per-group
  breakdown, CSV export (the compliance artifact buyers ask for).
- **P2.5 A/B onboarding** (research: iterating onboarding lifts retention ~40%
  over 6 months): vary welcome CTA + starter-list defaults once install volume
  exists to measure.

## 6. Measurement plan (how we know it works)

Local-first (no tracking — consistent with the privacy policy): the extension
keeps anonymous *local* counters (installs can't be measured client-side;
store dashboard covers that). Store-level: installs, weekly users, uninstall
rate, rating. Teams: org signups → paid conversions in Stripe. Consumer Pro:
checkout starts vs completions (Stripe), trigger-attribution passed as a
query param (`?src=sixth-site`) so we learn which contextual prompt converts —
without any user tracking.

## 7. Execution order & effort

| # | Item | Effort | Depends on |
|---|---|---|---|
| P0.1 | Streak | ~1 session | — |
| P0.2 | Popup win strip | small | P0.1 |
| P0.3 | Post-cave moment | small | — |
| P0.4 | Welcome micro-win | small | — |
| P0.5 | (est.) label | tiny | — |
| P1.1–1.3 | Freemium + entitlement | 2–3 sessions | Edward: model sign-off, Stripe keys, deployed server |
| P2.x | Post-launch | ongoing | live feedback |

**P0 is submit-safe** (no accounts, no new permissions). Recommendation:
execute P0 now → submit → build P1 during review.

---

*Grounding: internal audits (`UX-AUDIT.md`, `USER-TESTING.md`) + external
research on habit formation & streaks (Hook model, Forest/Streaks case
studies), freemium conversion (aha-first, contextual prompts 5–10×, 80/20
gating, RevenueCat/Userpilot/Appcues guidance), and extension onboarding
(86% first-minutes decision, value-first onboarding, three-click rule).*
