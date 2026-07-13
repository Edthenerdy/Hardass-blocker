# Launch content — ready to post (Holdfast)

Draft only. **You** post these — in your voice, from your accounts. Space them out (don't blast all channels in one hour). Swap `<STORE_URL>` for the live Chrome Web Store link and `<LANDING_URL>` for the GitHub Pages site.

Golden rules for all of them:
- **Never say "unbypassable."** The individual extension can be disabled by a determined user. Sell the *Cooldown* and the honesty, not enforcement.
- Lead with the insight ("blockers fail at the moment of temptation"), not the product.
- Reply to every comment for the first 48h — early engagement drives ranking everywhere.

---

## 1. Product Hunt

**Name:** Holdfast
**Tagline (60 char):** `The website blocker you can't talk your way out of`
**Topics:** Productivity, Chrome Extensions, Self-improvement

**Description:**
```
Every blocker fails at the same moment: the one-click "just disable it for a sec" when your willpower is lowest. Holdfast makes UNBLOCKING the hard part. Try to open a blocked site and you hit the Cooldown — a mandatory wait, a written reason, and a look at how many times you've caved this week. Only then can you through, and only for a few minutes before it re-blocks itself. It's a Chrome/Edge extension, it's free, and everything stays on your device.
```

**Maker's first comment (pin this):**
```
Hey PH 👋 I built Holdfast because every blocker I tried died the second I wanted it to. One click and the wall's gone — right when self-control is weakest.

So I inverted it. In Holdfast, blocking is easy; UNBLOCKING is the deliberate, annoying part:
• a cooldown timer that keeps running even if you close the tab
• a written reason (minimum length — no "asdf")
• your own relapse history staring back at you

Then it grants a short, time-boxed pass and re-blocks automatically.

Honest bit: it's an extension, so on your own machine a determined you can still turn it off. I'm not pretending otherwise — the point is to make caving cost more than one reflexive click, which turns out to be enough most of the time. Everything's local; no account, no data leaves your browser.

Would love to hear how you'd want to tune the friction. Too soft? Too hard?
```

---

## 2. Hacker News — Show HN

**Title:** `Show HN: Holdfast – a website blocker that makes unblocking the hard part`

**Body:**
```
I got tired of website blockers that fold the instant you push back. The failure is always the same: one click to disable, exactly when your self-control is lowest.

Holdfast inverts the friction. Blocking a site is easy; unblocking is deliberate:
- a cooldown timer (default 20 min) that persists across tab close/reopen
- a written reason, minimum length enforced
- your own relapse stats for that site (times this week, avg pass, last time)
Then it grants a time-boxed pass and re-blocks itself.

Technical: Manifest V3, declarativeNetRequest for the redirect-to-cooldown, a watchdog alarm that re-asserts rules if they're cleared, and a bypass-vector list (translate/cache/archive/proxies). All state is chrome.storage.local — nothing syncs, nothing leaves the device.

I'm deliberately not calling it "unbypassable" — on your own machine you can disable any extension. The bet is that raising the cost of caving from one reflexive click to a 20-minute reflective wait is enough to change behaviour, and in my own use it has been.

Free, no account. Feedback on the friction model especially welcome.
<STORE_URL>
```
*(HN note: post yourself, don't ask for upvotes, reply substantively, expect skepticism about bypassing — the honest framing above pre-empts it.)*

---

## 3. Reddit

Read each sub's self-promo rules first; some require you to be an active participant. Post as a story, not an ad.

**r/getdisciplined** — Title: `I built the blocker I actually needed: unblocking takes a 20-min cooldown, a written reason, and a look at how often I've caved`
```
The thing that broke every blocker for me was how easy the escape hatch was. One click to disable, right at the moment I had the least willpower.

So I made the unblocking the hard part instead of the blocking. When I try to open a site I've blocked, I get:
- a cooldown timer I have to wait out (and it keeps running if I close the tab)
- a box where I have to type WHY, minimum length
- my own stats: "you've unblocked this 3× this week, avg 12 min"

By the time the timer's done, the urge usually isn't there. Seeing "3× this week" is weirdly effective shame.

It's a free Chrome/Edge extension, everything stays on your device. Not magic — you can still disable an extension if you really want — but the friction has genuinely changed my defaults. Happy to answer anything about how it works.
<STORE_URL>
```

**r/productivity** — Title: `Website blockers fail at the exact moment of temptation. Here's the fix I built.`
```
Standard blockers let you disable them in one click — precisely when self-control is weakest. That's not a bug in your discipline, it's a bug in the tool.

Holdfast makes unblocking deliberately slow: a cooldown wait, a written reason, and your own relapse history for that site, before it lets you through for a short, auto-expiring pass.

Free, Chrome/Edge, fully local (no account, no tracking). Would love feedback from this crowd on whether the default 20-min cooldown is too much or too little.
<STORE_URL>
```
*(Also candidate subs, check rules: r/nosurf, r/DecidingToBeBetter, r/selfimprovement.)*

---

## 4. X / Twitter — thread

```
1/ Every website blocker fails at the same moment: the one-click "just disable it for a sec" — exactly when your willpower is lowest.

So I built one where UNBLOCKING is the hard part.

Meet Holdfast 🧵

2/ Try to open a site you've blocked and you don't get a nag you can dismiss. You get the Cooldown:

• a timer you have to wait out (keeps running if you close the tab)
• a written reason, minimum length
• your own history: "3 caves this week, avg 12 min"

3/ Only then does the unblock button work — and it gives you a short, time-boxed pass before the site re-blocks itself.

The wait kills the impulse. The reason kills the self-deception. The history is the mirror.

4/ It also blocks the sneaky routes — Google Translate, cached copies, archive mirrors, proxies. "Nice try."

Everything stays on your device. No account. No tracking. It's free.

5/ Honest bit: it's an extension, so a determined you can still switch it off. I'm not selling "unbypassable." I'm selling friction that turns one reflexive click into a 20-minute reflective pause. That's the whole game.

6/ Chrome + Edge, free: <STORE_URL>

Built it because I needed it. Tell me if the cooldown's too soft or too hard.
```

---

## 5. LinkedIn (your voice — builder/BD angle)

```
I shipped something small this week that I actually needed myself.

Every website blocker I've used has the same flaw: you can turn it off in one click — at the precise moment your self-control is weakest. The escape hatch is right there, so the block never really changes behaviour.

So I built Holdfast, a Chrome/Edge extension that flips it: blocking a site is easy, but UNBLOCKING is deliberately hard. A cooldown you have to wait out, a written reason, and a look at how many times you've already caved this week. Then it grants a short pass and re-blocks itself.

Two things I care about in how I built it:
→ It's honest. I'm not claiming it's unbeatable — on your own machine you can disable any extension. It raises the cost of caving from a reflex to a reflective pause, and that's usually enough.
→ It's private. Everything stays on your device. No account, no data leaves your browser.

It's free. If distraction is quietly eating your deep-work time, give it a go — and tell me where the friction feels wrong.

<STORE_URL>
```

---

## 6. Indie Hackers / personal blog (optional, later)
Angle: the *build-in-public* story — "I inverted the blocker: making unblocking the hard part," the Cooldown mechanic, the honest positioning, and what happens next (the SME/enforced tier). Good for depth once you have install numbers to share.

---

## Sequencing suggestion (launch day)
1. Web Store live + landing page up.
2. Product Hunt (early AM your time / evening US Pacific the night before is ideal — PH day starts 00:01 PT).
3. X thread → pin it.
4. LinkedIn post.
5. Reddit (one sub in the morning, another later — don't cross-post identically same hour).
6. Show HN (pick a weekday morning US time; it's a coin flip, don't force it).
Reply to everything. Screenshot the nicest comments for social proof.
