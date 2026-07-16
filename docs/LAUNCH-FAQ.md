# Launch-day FAQ & canned responses

Copy-paste starting points for comments, reviews, and questions. Keep the voice honest and a little dry — never defensive, never overclaiming.

## The big one: "Can't you just disable the extension / use another browser?"
```
Yep — on your own machine you can. I'm not claiming it's unbeatable, and I'd distrust anyone who did. The point isn't a cage; it's friction. Turning "cave in one reflexive click" into "wait out a 20-minute cooldown, write down why, and look at how often you've already caved" is enough to kill most impulses. That gap is the whole product. (A genuinely enforced version — where an admin holds the key on a managed device — is the separate business/team track.)
```

## "How is this different from BlockSite / Cold Turkey / Freedom?"
```
They mostly make blocking easy and unblocking easy — so the block folds the moment you want it to. Holdfast makes unblocking the deliberate part: a cooldown, a written reason, and your own relapse history before you can through. Cold Turkey has strong locking on desktop; Holdfast's angle is the Cooldown ritual (and it's free, in-browser, and fully local).
```

## "Is it free? What's the catch?"
```
Free, no account. No catch on the individual extension — everything runs locally. Down the road there's a paid team/enterprise version (an admin can enforce policy across work devices), but the personal blocker stays free.
```

## "Do you collect my browsing data?"
```
No. Everything — blocklist, settings, history — is stored locally in your browser (chrome.storage.local) and never sent anywhere. No account, no analytics, no trackers. Full policy: <LANDING_URL>/privacy.html
```

## "Why does it need access to all sites?"
```
So you can block ANY site you choose — a block rule has to be able to apply to any host. It doesn't read, log, or send your browsing; the access is only used to redirect sites you've blocked to the cooldown page.
```

## "Does it work on mobile / Firefox / Safari?"
```
Right now it's Chrome & Edge (desktop). Firefox is on the list. iOS/Android browsers don't allow this kind of extension, so mobile would be a separate build — noted, not promised.
```

## "The cooldown is too long / too short."
```
It's fully adjustable in Settings — cooldown length, pass length, and the minimum reason length. Set it hard while you're motivated; you'll live with it later. Curious what you landed on.
```

## "Feature request: schedules / password lock / sync / focus stats"
```
Good call — noting it. (Sync is deliberately off for now: keeping everything local means zero data leaves your device. Schedules and a stronger lock are the most-requested so far.)
```

## "It blocked [X] and I couldn't get in for something legitimate."
```
That's the cooldown doing its job, but it shouldn't trap you — you can always remove a site from the blocklist in the popup, and passes are time-boxed. If something felt broken rather than just strict, tell me the site and what happened and I'll fix it.
```

## Negative review triage
- **"Too aggressive / annoying"** → thank them, point to the adjustable settings, note that "annoying at the moment of temptation" is the design. Don't argue.
- **"Bypassed it easily"** → agree openly, restate the friction-not-cage framing, mention the enforced team version exists for people who need the lock.
- **Bug report** → ask for browser + version + steps, fix fast, ship a patch, reply when it's live. A fixed bug + a reply often flips the review.

## If a journalist / bigger account bites
Offer the one-liner: *"Holdfast is the blocker you can't talk your way out of — it makes unblocking the hard part."* Then the honest angle (friction over enforcement, fully local) and that a team-enforced version is coming. Point them at `<LANDING_URL>`.
