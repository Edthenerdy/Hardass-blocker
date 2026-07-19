# Holdfast — comprehensive sense-making UX audit

Round 3+. Earlier rounds proved everything *works* (108 automated checks) and
*renders* well. This round asks the harder question: **does every screen make
sense to a real person** — is the next action obvious, is the copy true, do the
numbers agree with each other, and is there anywhere a user can land and think
"…what is this / now what?"

## Method

1. **Full state matrix** — render every surface in every reachable state
   (~24 renders, real Chromium, realistic seeded data), including the awkward
   ones: day-zero, empty, managed×Pro overlap, preview, post-cave.
2. **Fresh-eyes persona reviews** — three independent reviewers (subagents who
   have never seen the code or this plan) each walk the screenshots as a
   persona and report confusions, unclear next-actions, and trust-killers:
   - **P-A "Casual Casey"** — just installed from the store, mild TikTok habit,
     non-technical.
   - **P-B "Wallet Willa"** — engaged free user who just hit the 5-site wall;
     deciding whether $7.99/mo is credible and safe.
   - **P-C "Skeptic Sam"** — power user who reads permissions, sniffs dark
     patterns, and will one-star anything dishonest.
3. **Coherence & as-intended audit (author):**
   - **Numbers agree** everywhere (popup week-saved == blocked-page week-saved;
     streak identical across surfaces; console math).
   - **Copy is true** (nothing advertised that isn't built — e.g. "schedules").
   - **No dead ends** (every CTA leads somewhere that can actually fulfil it —
     e.g. where does "Get Pro" go before the account server exists?).
   - **State interplay** (managed device + Pro card? preview + back button?
     day-zero streak feel? cap vs seeded sites?).
4. **Fix → re-render → re-test → document.** Every fix verified by suite +
   render.

## Pass criteria

- A first-time user can say, on every screen, *what this is* and *what to do
  next* without any external explanation.
- No number contradicts another surface.
- No CTA promises something unavailable (feature or purchase path).
- No state exists where the only exit is closing the tab in confusion.
- Tone stays Holdfast: blunt, honest, on the user's side; zero dark patterns.

## State matrix (render inventory)

| Surface | States |
|---|---|
| welcome | fresh (3 seeds) · narrow |
| popup | empty · few sites · day-zero streak · at the wall (card) · Pro active · managed-locked · open pass |
| blocked | never-started · waiting · done-no-reason · ready · preview · post-cave note · bypass · managed approval · managed none |
| options | fresh free · linked free · Pro active · managed |
| landing | desktop · the "Get Pro" arrival point |

## Results

Three fresh-eyes personas walked all 22 rendered states blind; I then ran a
coherence/as-intended pass over the same matrix. Findings were triaged into
**real product issues** (fixed) vs **test-fixture artifacts** (screenshot data
only, no code change). Everything below is a real fix, verified by suite + a
re-render I looked at.

### What the personas caught (and what I did)

**P-A "Casual Casey" (new, non-technical)**
- *"After I click "Done — it's already on", is it actually on? I did nothing."*
  → Welcome copy now states blocking is live immediately and the button reads
  **"Done — it's already on ✓"**; a low-stakes **"Preview what a block feels
  like"** link lets her feel the Cooldown before it matters.
- *"On the block page the unblock button is greyed out and I don't know why."*
  → The disabled button now explains itself ("Keep waiting — N left" / "Write a
  bit more first"), so the wait never reads as a bug.

**P-B "Wallet Willa" (hit the 5-site wall, weighing $7.99)**
- *"I click Get Pro… and land where? Is there even a way to pay?"* This was the
  biggest trust gap. The account server isn't live yet, so an eager "Get Pro"
  would have been a dead end — the classic dark-pattern smell.
  → Options now shows an honest **"sign-ups aren't open yet"** gate instead of a
  password form that posts to nowhere; the free plan is stated to **work
  forever** with no account. The landing pricing card spells out the real path
  ("install → Settings → Holdfast Pro → subscribe, payments via Stripe").
- *"Is $7.99 the same everywhere?"* → Reconciled: popup card, options, landing,
  and server billing all say **$7.99/mo** (server amount 900→799).

**P-C "Skeptic Sam" (reads permissions, hunts dark patterns)**
- *"The options page pushes a consumer subscription at a device my employer
  manages — that's gross."* → On a managed device the **Pro card is hidden**
  and personal rules are **locked with a clear "managed by <org>" note** rather
  than shown as editable fields that silently do nothing.
- *"Privacy page implies more than the code does."* → Softened/aligned: the copy
  now matches reality (local-only by default; the *only* exception is an
  optional Pro account for email + subscription status, payments via Stripe).
- *"'Schedules' is advertised but I can't find it."* → Removed the unbuilt
  "schedules" claim from all copy.
- *Bypass page felt like a generic scold.* → It now **names the site**, explains
  *why* proxies/translators/caches are blocked, offers a real recourse ("turn
  off Block bypass tricks in Settings — it stays your call"), and the button is
  a genuine **escape hatch to Settings** rather than a dead re-scold.

### Coherence / as-intended fixes (author pass)
- **Day-zero streak** reads "Holding since today" instead of a hollow "0 days".
- **Preview mode** hides stats/reason/unblock and the back button just closes the
  tab — a preview can't log a relapse or grant a pass.
- **Managed "none" block page** no longer shows a dead "Start the cooldown"
  primary button; it says "Your policy does not allow unblocking. Talk to your
  admin," which is the only true next action.
- **Numbers agree** across popup win-strip, blocked-page stats, options, and the
  console reports (all off the same `timeSavedStats` / `daysHeld` helpers, 15
  min per block).
- Popup options button relabeled **"Settings & history"** (dropped "team", which
  most users never touch); "open Xm" → **"Xm left"**.

### Verification (final, all green)
- Unit (mock-chrome vm): **40/40**
- User journeys (jsdom, real page↔background): **24/24**
- Interactions (every button/input, incl. 7 new sense-making assertions): **53/53**
- Visual re-render: 22-state matrix re-rendered in real Chromium and reviewed;
  the six highest-risk states (managed options, managed-none block, bypass,
  coming-soon gate, day-zero, landing pricing) confirmed coherent by eye.

**Total: 117 automated checks + 22 visual states. No open sense-making issues.**

### Deferred (product decisions, not bugs)
- Bypass-blocking default on/off — currently **on**; kept as a per-user toggle
  with a clear escape hatch. Left for Edward to confirm as the shipping default.
- Live Pro purchase path is gated until the account server is deployed and a
  Stripe key is set (Edward's launch step). The extension already speaks to it
  (`proLink`/`proSync`); the UI honestly reflects "not open yet" until then.

---

## Round 4 — four more fresh personas + the enterprise surfaces

Round 3 shipped, but the review had only walked the *consumer* extension. Round 4
(a) rendered the surfaces no persona had seen — the **admin console** (rendered
live against the running backend, so it doubles as an end-to-end Teams check),
plus the **privacy page** and **mobile landing**; and (b) ran four *new* blind
personas chosen to stress angles the first three missed:

- **Relapser Rae** — emotional safety / shame triggers (the returning user who
  just caved).
- **Admin Amir** — non-technical practice manager evaluating Holdfast for Teams.
- **ESL Elena** — non-native English speaker; idioms that hide the action.
- **Cancel Cal** — churn/cancel/refund skeptic hunting dark patterns.

The signal to trust was **convergence**: where independent personas flagged the
same thing, it got fixed.

### Fixed (verified by suite + re-render)

- **Honest purchase path (Cal, BLOCKER ×2).** The paywall's "Get Pro" and the
  linked-free "Upgrade" button presented a *live* purchase while the app admits
  elsewhere that sign-ups aren't open. Added one source of truth —
  `HB.proLive()` (true only once an account server is configured). Until then the
  popup card reads "Unlimited sites… are coming in Holdfast Pro ($7.99/mo). The
  core stays free — no rush." with a **"See the plan"** button (not a dead
  purchase), the options upgrade button is hidden with an honest status line, and
  the landing pricing card says **"Coming soon."** When Edward sets `PRO_SERVER`,
  every CTA flips to live automatically.
- **"cave/caved" removed from functional copy (Rae + Elena, BLOCKER).** Rae read
  the data label "Last time you caved" as the tool sneering in a spreadsheet cell;
  Elena (ESL) couldn't parse the word at all — and it sat in *settings help* and
  the *welcome* flow, the worst places for an idiom. Now: block-page stat →
  **"Last unblock"**; settings help → **"…before you can unblock a site"**;
  welcome/landing → **"given in"**. Brand voice stays in headlines; data labels
  and config help are literal.
- **Ambiguous escape button (Elena, BLOCKER; Rae).** "Nope — take me back" read to
  a non-native speaker as "take me *to* the site." Relabeled to the unambiguous
  **"Leave this site"**, which also gives the escape the weight Rae wanted.
- **"Pass over" misread as "Passover" (Elena, BLOCKER).** The post-cave banner now
  opens **"Your pass ended. No drama…"** — same compassion Rae praised, no parse
  trap.
- **Shame-tone captions softened (Rae + Amir).** History caption "Every time you
  talked yourself into unblocking something" → **"The reasons you gave, in your
  own words — an honest mirror, not a scoreboard."** "No relapses logged yet" →
  **"No unblocks logged yet."** Cooldown sub-line "Past-you was serious" (scold) →
  **"The wait is the point — you set this yourself."**
- **Cancel vs Unlink clarity (Cal).** Options now states: cancel under **Manage
  subscription** (Stripe); **Unlink** only signs the device out — it does *not*
  cancel billing. So no one keeps paying after unlinking.
- **Downgrade honesty (Cal).** The free-window history note now says older entries
  are **hidden, not deleted — they return if you upgrade.**
- **Monthly renewal showed a year out (Amir).** Seed + migration set
  `currentPeriodEnd` to +365 days for a *monthly* plan, so the console read
  "Renews 18/07/2027." Fixed to +30 days (the real subscribe path was already
  correct); console now shows **18/08/2026**.
- **Reports looked invented / opaque per-seat price (Amir + Cal).** Console reports
  now state the basis (**"~15 min per blocked attempt across enrolled devices"**);
  billing shows the multiplier (**"$56 · $4/seat"**).

### Flagged for Edward — brand & product calls, not unilaterally changed

- **The angry mascot + "can't talk your way out of" tagline** (Rae, Amir). On a bad
  day the permanently-scowling face reads as the tool taking a side *against* the
  user; in a workplace it reads as treating staff like addicts. This is a
  deliberate brand identity — Edward's call, not mine to rewrite. Options if he
  wants: a calmer/resolute mascot, and/or a neutral **workplace copy mode** in
  managed installs (swap "relapses/cave" and the scowl for plain "not available on
  work devices").
- **Teams needs its own story** (Amir): the public site barely mentions Teams — no
  per-seat price, no deployment walkthrough, no admin tour. And "no MDM, no IT"
  still leaves an admin emailing 14 people a raw code; an **enrolment invite link**
  (install + prefilled code) would close that gap.
- **Managed privacy for staff** (Amir): "Your admin reads this" + per-device reason
  logs is an HR landmine without a short staff-facing privacy summary and/or
  approver notifications/auto-expiry.
- **Data export (CSV)** (Cal): local-first deletion is honest, but there's no
  "download my history."

### Verification (final, all green)
- Unit (mock-chrome vm): **42/42** (+`proLive` gate)
- User journeys (jsdom): **24/24**
- Interactions (every button/input): **55/55** (+ honest-CTA + billing-not-live)
- Link/asset audit: clean
- Visual: full matrix + admin console (live backend), privacy, mobile landing
  re-rendered and reviewed; every fixed state confirmed by eye.

**Total: 121 automated checks + ~28 visual states across 7 personas over two
rounds. No open trust or comprehension issues; remaining items are explicit
brand/product decisions for Edward.**
