# UX audit — Holdfast (commercial-readiness pass)

Every extension surface was rendered in a **real headless Chromium** (Puppeteer)
with realistic seeded state, at production viewports (popup at 380px), and
reviewed as a paying user would. Render script: `render_ux.js` (scratchpad).
Surfaces: welcome, popup (+ empty), options, blocked (waiting / start / ready /
bypass).

## Verdict
The flagship Cooldown page and popup are already commercial-quality — strong
hierarchy, sharp microcopy ("Past-you was serious", "Be honest — future-you is
reading this"), clear disabled/enabled states, good empty states. Four concrete
issues found and fixed; one product decision flagged.

## Fixed
1. **Brand mark was inconsistent.** The welcome page, landing page, and all store
   assets (screenshots, promo tile, marquee) used the *holdfast* mark, but the
   actual shipping icon (`icons/icon128.png`) and the popup/options/blocked pages
   use the *Rocky granite-face*. A user would see one icon in the store and a
   different one in the product. **Fix:** unified everything on the real Rocky
   mark — swapped the SVG in `welcome.html` + `docs/index.html`, and re-rendered
   all store assets embedding the actual `icon128.png`.
2. **Settings led with enterprise noise.** The options page opened with "Team
   (managed mode)" — server URL, enrollment code — irrelevant and slightly
   sketchy-looking to a solo consumer. **Fix:** reordered so **Personal rules**
   come first and **Your history** second; the Team section moved to the bottom
   with copy "Optional — ignore this unless your workplace asked you to enrol."
3. **A dev value would have shipped.** The Server URL field had a hardcoded
   `value="http://localhost:8787"`. **Fix:** replaced with a `placeholder`
   (`https://your-team-server`).
4. **A dead button on the bypass page.** The "Nice try." page (shown when a user
   tries a proxy/translate/archive route) still rendered a "Start the cooldown"
   button — but there's no cooldown for a bypass hit (the domain isn't on the
   blocklist). **Fix:** `initBypass()` now hides it; the only action is "Nope —
   take me back."

All four re-rendered and visually confirmed. Unit suite 20/20 and journey suite
24/24 still green after the changes.

## Flagged (product decision — not changed)
- **Bypass-blocking vs legitimate Google Translate use** (also noted in
  `USER-TESTING.md`): with the bypass toggle on (default), all of Translate /
  archive.org is blocked even on non-blocked pages. On-brand, but a plausible
  1-star magnet. It's already a setting — consider defaulting it off for consumer
  and on for the enforced/team tier.

## Minor (nice-to-have, not blocking)
- ~~The popup's site input relies on placeholder text rather than a label.~~ Fixed in round 2 (aria-label added).

---

# Round 2 — edge content, responsive & accessibility

Rendered stress states in headless Chromium: long domains, a full (10-item)
blocklist, a long no-space reason, a long org name, the landing at 375px mobile,
and the welcome page narrow. Render script: `render_stress.js`.

## Fixed
1. **Popup: long domain overlapped the Remove button** (text cut off as "Remo…").
   The site text block now shrinks and wraps (`min-width:0; overflow-wrap:anywhere`)
   and the Remove button holds its size (`flex-shrink:0`). Verified.
2. **Options history: a long no-space reason blew the table out horizontally**
   (page ballooned to ~3500px wide). Fixed with `table-layout:fixed`, bounded
   column widths (22/34/44%), and `overflow-wrap:anywhere` on cells. Verified.
3. **Keyboard focus was invisible on the dark theme.** Buttons had no focus
   indicator. Added a clear `:focus-visible` ring (amber, 2–3px, offset) across
   popup / blocked / options. Belt-and-suspenders `overflow-wrap` added to the
   blocked page's headline + domain line too.
4. **A11y label:** `aria-label` added to the popup and welcome "add site" inputs
   (placeholders aren't reliable accessible names).

## Verified good (no change needed)
- **Popup with a full blocklist scrolls** (the list is capped at 240px with
  `overflow-y:auto`) — no page blowout.
- **Landing page is fully responsive at 375px** — cards stack, the 3-step grid
  collapses to one column, no horizontal scroll.
- **Managed banner** wraps a very long org/group name cleanly.
- **Blocked page** wraps a long domain within its column.
- **Colour contrast (computed, WCAG):** body text (bone/ink) ~17:1, muted
  (ash/ink) ~7:1 (AAA), red accent ~5.4:1 and amber ~11:1 (both AA+). Passes.

Both test suites still green after all changes (unit 20/20, journeys 24/24).
