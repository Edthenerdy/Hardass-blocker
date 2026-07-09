# Hardass Blocker — Business Plan

*Working draft v0.1 · July 2026*

> **One line:** The blocker you can't talk your way out of — and the first one a small team can actually *enforce* without an IT department.

---

## 1. The thesis in a paragraph

Every website/app blocker on the market fails at the same two moments. For individuals, it fails at the instant of temptation — the one-click "just disable it for a sec" that every incumbent allows because, as a consumer product, a truly unbeatable block creates angry customers and chargebacks. For small businesses, it fails at deployment — there is no product that lets a manager *enforce* a blocking policy across a handful of work machines without buying heavyweight enterprise device-management software built for 500-seat corporates. Hardass Blocker attacks both gaps with one engine: **genuinely hard-to-bypass blocking** (the "hardass" promise) delivered to individuals as self-discipline and to small teams as **admin-enforced policy** — the thing every incumbent structurally refuses to build.

---

## 2. The problem

**For the individual:** Blockers are trivially defeated at the exact moment self-control is weakest. You disable the extension, edit the block schedule, uninstall the app, switch browsers, or grab your phone. The block exists to be broken, so it doesn't change behaviour — it just performs the *intention* of change.

**For the small business (5–50 people):** A café, agency, clinic, call centre, or trades office wants staff off gambling, adult, or social-media sites on work devices. Their only options today are:

- **Consumer blockers** (BlockSite, Cold Turkey) — no central control; each employee installs and manages their own, and can turn it off. Useless as policy.
- **Freedom for Teams** — has team billing but *deliberately* enforces nothing (see §4).
- **Enterprise MDM / web-filtering** (Scalefusion, ManageEngine, Cisco Umbrella) — powerful but overkill: per-device agents, IT expertise, contracts, and price points built for large corporates.

There is nothing in the middle. The SME that wants enforcement gets pushed all the way up to enterprise MDM or gives up.

---

## 3. Market & incumbent reality (verified research, July 2026)

We ran a multi-source, adversarially fact-checked scan. What survived verification:

| Fact | Status |
|---|---|
| BlockSite is **unfunded**, with an opaque corporate footprint (Delaware/Tel Aviv conflict) | High confidence |
| BlockSite is **B2C-only** — no team, business, bulk, or admin tier | High confidence |
| BlockSite Chrome extension: **1M+ users, 4.5★, 32.2K ratings** | High confidence |
| BlockSite pricing: **$10.99/mo → $3.99/mo (3-yr), $49.99 lifetime**; free tier capped at ~3 sites | High confidence |
| BlockSite anti-bypass = password + uninstall-prevention (**friction only**, no true strict mode) | High confidence |

**What we could NOT verify (treat as open risk, not fact):**

- BlockSite's actual revenue and mobile install base — *every* revenue/download estimate we found was refuted in verification. The popular belief that "BlockSite prints money" is **unproven**.
- The "everyone bypasses BlockSite easily" narrative — plausible but *not substantiated* by hard evidence in this pass.
- Total market size / growth rate for the digital-wellbeing / focus / web-filtering category — no figure survived verification.

**Implication:** We are *not* building a business case on "steal BlockSite's revenue," because we can't see that revenue. We are building on a **structural gap** that is verifiable regardless of anyone's revenue.

---

## 4. Competitive map — and the hole in the middle

| Player | Hard to bypass? | Team / central admin? | Enforcement? | Price |
|---|---|---|---|---|
| **BlockSite** | Friction only | None (B2C only) | No | $10.99/mo → $3.99/mo; $49.99 lifetime |
| **Cold Turkey** | Strongest locking ("own forever") | None (personal-use license only) | Self only | One-time $39 / $49 |
| **Freedom** | Soft | **Team tier exists** | **Refuses to enforce** | Flat $99 / $299 / $999 mo, 11+ seat min |
| **Enterprise MDM** | Strong | Yes | Yes | Overkill: agents, IT, contracts |
| **→ Hardass Blocker** | **Genuinely hard** | **Yes, SME-friendly** | **Admin-enforced** | *TBD — see §6* |

The decisive finding is the **Freedom row**. Freedom is the *only* incumbent with a real team product, and they built it toothless *on purpose*. Their own docs:

> *"Freedom is self-managed by each account holder... no mandates, no forced sessions, no shackles."*
> *"No one other than you can see what you choose to block or when — not even your Team Administrator."*

That is a deliberate philosophical stance, and it **leaves the entire "the admin actually enforces it" market wide open.** No reviewed product combines (i) admin-pushed/enforced blocklists with (ii) SME-friendly, non-MDM deployment. That is the position Hardass Blocker takes.

---

## 5. Product strategy & phasing

Same engine, two chassis. The hard engineering problem — a block that genuinely resists circumvention plus the Cooldown mechanic — is identical for both audiences. Build it once.

**The Cooldown (core differentiator).** To lift any block you must: (1) wait a mandatory delay set while sober, (2) type *why* you're unblocking, and (3) see your own relapse history ("you've unblocked Instagram 4× this week, avg 47 min"). The wait kills the impulse; the reflection kills the self-deception. This is the "can't talk your way out of it" promise made concrete.

**Phase 0 — POC (now).** Chrome MV3 extension proving the Cooldown on the surface BlockSite competes on. Self-contained, demoable, stress-tests the core mechanic. *(This repo.)*

**Phase 1 — Individual product.** Polished cross-browser + desktop app. Individual "hardass" mode. This is R&D and proof: thousands of users stress-test "can't be removed" for free, and tell us within days whether the friction is too soft or too hard.

**Phase 2 — SME enforcement (the business).** Same engine + a central admin console: admin defines the blocklist and Cooldown policy, pushes it to team devices, and members *can't* unilaterally disable it. No MDM, no IT department, deploy in an afternoon. This is where the money is.

> **Note on sequencing:** the individual build is the proving ground; the SME tier is the revenue. Don't ship the admin console before the core block is proven on real users.

---

## 6. Business model & pricing (hypothesis)

- **Individual:** freemium. Free tier genuinely useful (more generous than BlockSite's 3-site cap — the cap is a common complaint and a cheap way to win goodwill). Paid **$9/mo** (monthly only — no lifetime; recurring revenue over a one-off, and it keeps the incentive to keep the product worth paying for).
- **SME (the wedge):** **per-seat, low minimum.** Freedom's flat $99/mo with an **11-seat minimum** structurally ignores the 3–15 person shop. Serve exactly that shop: e.g. **$3–5/seat/mo, 3-seat minimum**, admin console included. Undercut Freedom on minimums, out-feature them on the one thing they refuse to do (enforcement), stay an order of magnitude below MDM cost/complexity.
- **Why SME is the better business:** businesses pay and renew; consumers churn on willpower apps within weeks. "Can't be removed by the end user" is a *feature* in B2B (the admin holds the key) instead of an arms race in B2C.

*(All figures are hypotheses to validate in discovery, not commitments.)*

---

## 7. Go-to-market

**Individual (Phase 1):** the crowded but free acquisition channel. Chrome Web Store SEO, "BlockSite alternative / Cold Turkey alternative" content, and the differentiated hook ("the one you can't cheat"). Purpose is reach and product-proof, not primarily revenue.

**SME (Phase 2):** direct and vertical. Target verticals with a compliance or duty-of-care reason to block: call centres, clinics, finance/gambling-adjacent offices, schools, trades with shared machines. Sell the *outcome* ("your staff, off the sites you choose, on the machines you own, enforced — set up before lunch"), not features. Land via the owner/office manager, not IT (they don't have IT — that's the point).

---

## 8. The moat

1. **Circumvention-resistance** — genuinely hard to bypass is the hard build *and* the brand. On managed/SME devices this is winnable via OS-level policy; on personal devices it's an ongoing cat-and-mouse (hosts file, DNS, other browsers, safe mode). This engineering *is* the product.
2. **The Cooldown ritual** — a named, ownable mechanic, not a generic "strict mode."
3. **A position incumbents can't copy without self-harm** — BlockSite/Freedom keep blocks soft because hard blocks hurt a *consumer* funnel. Enforcement only makes sense when the buyer (admin) is different from the user. That's a business-model wall, not a feature gap.

---

## 9. Risks & open questions (be honest)

| Risk / unknown | Why it matters | How to close it |
|---|---|---|
| **Market size unverified** | We have no confirmed TAM for the category | Dedicated market-sizing research pass before real spend |
| **Bypass complaints unproven** | Core thesis rests on "blockers fail because people cheat" | First-hand mining of Reddit / store reviews |
| **5 competitors uncovered** | Opal, one sec, ScreenZen, Jomo, RescueTime not fully assessed — one may quietly ship team enforcement | Complete competitive pass |
| **Circumvention arms race** | On personal devices this could be 70% of engineering | Lean toward managed/SME devices where OS policy makes it tractable |
| **Consumer churn** | Willpower apps get rage-uninstalled | Treat individual tier as proof/funnel, monetise via SME |
| **Platform risk** | Chrome MV3 / app-store policy can constrain blocking & uninstall-prevention | Multi-surface (extension + desktop agent); don't depend on one store |

---

## 10. Immediate next steps

1. **POC** (this repo) — prove the Cooldown works and is unpleasant-in-a-good-way.
2. **Close the three unknowns** — market size, real bypass complaints, the 5 uncovered competitors.
3. **5–10 SME discovery calls** — validate that owners of 5–50-person shops will pay to *enforce* blocking, and at what price.
4. **Decide phase-1 surface** — extension-first vs desktop-first (desktop is the more defensible, less-served surface).

---

*Grounded in verified July 2026 research. Figures marked as hypotheses are for validation, not commitment.*
