---
name: ad-verdict-skill
description: |
  Scale / Kill / Hold verdict engine for live Meta ad accounts, built on Jeremy Haynes /
  Megaladon Media scaling doctrine. Pulls every ACTIVE campaign → ad set → ad from the
  Marketing API with lifetime + daily insights (spend, CPL, CPM, link CTR, CPC, frequency,
  LPV, hook rate, hold rate, watch-depth), computes the client's allowable CPL from webinar /
  funnel economics, and issues a per-ad verdict with concrete next actions (exact new budgets,
  kill lines, revive candidates, learning-phase cautions, funnel-bottleneck flags, Andromeda
  test-slot refill plan). Analysis-only by default — never touches the account unless the
  user explicitly says to execute.

  Aliases: /ad-verdict, /scale-kill-hold, /ad-audit.

  Triggers on: "analyse the live ads", "scale kill or hold", "ad verdict for [client]",
  "which ads should I scale", "audit the ads", "breakdown of live ads", "should I kill this ad",
  "/ad-verdict [client]", "Haynes analysis", "Megaladon analysis of the ads".
metadata:
  type: skill
  default-client: example
---

# Ad Verdict Skill — Scale / Kill / Hold (Haynes / Megaladon doctrine)

## What this skill does

Given a client slug, it produces a boardroom-grade verdict table for every live ad:
**SCALE** (with the exact new budget), **KILL** (with the £ freed), or **HOLD** (with the
kill line and the date to re-check). It also surfaces what the ads CAN'T fix (funnel
bottlenecks) and what to feed back in (test-slot refills).

## Phase 0 — Resolve client config

Load `clients/<slug>.json` from this skill directory. It defines:

- `act_id` — ad account
- `token_source` — file path + env var name holding a valid Marketing API token
- `conversion_event` — the action_type that counts as "the result" (e.g. `complete_registration`)
- `target_cpl` — the CPL the account must beat (baseline or client-agreed)
- `breakeven_cpl` — front-end cash collected ÷ results (the true allowable)
- `currency`, `notes` (domain-flag history, throttles, event days, etc.)

If no config exists for the slug, build one by asking for / deriving: account ID, token,
conversion event, and the two CPL numbers. **Breakeven CPL = front-end cash per result.**
If the client runs a webinar: cash collected ÷ registrations over the last representative
period. Save the config before proceeding.

## Phase 1 — Pull the data

Run `scripts/pull-meta-ads.js` (node, no deps):

```
node scripts/pull-meta-ads.js --client <slug> [--since YYYY-MM-DD --until YYYY-MM-DD]
```

Default window: launch date of the newest ACTIVE campaign → today. The script emits:

1. All campaigns + effective_status (so you see what's live vs paused — never assume)
2. For each ACTIVE campaign: ad sets (budget, optimization goal, learning_stage_info) and ads
3. Lifetime ad-level insights: spend, impressions, reach, frequency, CPM, link CTR, link
   clicks, CPC, LPV, conversions, CPL, video_play_actions, thruplay, p25/50/75/100, avg watch
4. Daily ad-level insights (time_increment=1) — the trend is half the verdict
5. Campaign totals (blended CPL, LPV→conversion rate)

Derived metrics:
- **Hook rate** = video plays ÷ impressions (Meta autoplay inflates this; compare ads
  against each other, not against absolute benchmarks)
- **Hold rate** = ThruPlay ÷ plays (≥10–12% relative winner; <8% = hook writes a cheque
  the body can't cash)
- **LPV→conversion** = conversions ÷ landing_page_views. Webinar reg page should run
  25–40%. Below ~15% the bottleneck is the PAGE, not the ads — flag it loudly.

## Phase 2 — Verdict rules (the doctrine)

Judge on **CPL vs allowable + daily trend + volume**. CTR/hook/hold are diagnostics that
explain WHY, never the verdict itself. Cheap clicks that don't convert are expensive.

### KILL when any of:
- Spend ≥ 2× breakeven CPL with **zero** conversions
- Lifetime CPL > 2.5× target after ≥ 1.5× breakeven in spend
- Spend since the *last* conversion ≥ 2.5× breakeven (the ad died mid-flight)
- Frequency > 3.5 on cold traffic with CPL rising ≥3 consecutive days (fatigue death)

### SCALE when all of:
- Lifetime CPL ≤ target
- ≥ 5 conversions (below that it's noise, not signal)
- Daily trend flat or improving (no 2-day streak above breakeven)

Scaling mechanics (Haynes):
- **Vertical**: raise the ad set budget +20–30% per 24–48h. Never double — >30% jumps
  reset learning. State the exact new daily budget in the report.
- Champion tier (CPL ≤ 60% of target): +30% now AND queue a **horizontal** duplicate —
  clone into a fresh ad set (same creative, broad) at the original budget.
- **Consolidation trigger**: once 3+ ads each hold 20+ conversions under target, propose
  the winners CBO at the sum of their ABO budgets. Keep the ABO running until the CBO
  proves itself for 4–7 days — never cut the bridge you're standing on.

### HOLD when:
- CPL within ±25% of target but trend worsening → hold 48h, write the explicit kill
  line: "kill if 3-day rolling CPL > breakeven"
- Under-spent (< 1.5× breakeven in spend) → verdict is "no verdict yet", say so
- In learning with CPL ≤ breakeven → do not touch; edits reset the seven-day clock

### Revive check (always run):
Scan PAUSED ads inside active campaigns. Any ad whose **final full day** was under target
CPL was possibly killed early → recommend reviving at minimum budget as a test slot.

### Andromeda upkeep (Megaladon):
The machine needs a constant diet of diverse angles. Count dead test slots. For every
kill, recommend a refill from the client's ready script bank (check the client's ads
folder for unshipped batches before proposing new creative work). Target: never fewer
than 3–5 live test angles beside the winners. Note angle *diversity* — if all remaining
winners share one avatar/emotion, the account is fragile.

## Phase 3 — Report format

Lead with the verdict table, sorted SCALE → HOLD → KILL:

| Ad | Spend | Conv | CPL | Trend (daily CPLs) | Diagnostics | VERDICT → exact action |

Then, in order:
1. **Money summary** — blended CPL vs target vs breakeven, projected daily spend after
   changes, £ freed by kills and where it goes
2. **Funnel flags** — LPV→conversion rate, CPM drift, frequency, anything the ads can't fix
3. **Revive candidates**
4. **Test-slot refill plan** (which scripts, from where)
5. **Timing** — if the client's conversion moment is event-based (e.g. Sunday webinar),
   note how event proximity should shape when budget changes land (scale BEFORE the
   registration-deadline window, not during the dead zone after)

## Phase 4 — Execution (ONLY on explicit instruction)

This skill is read-only by default. If the user says "do it" / "apply", execute via the
Marketing API (POST to `/<adset_id>` with `daily_budget` in minor units, `status=PAUSED`
for kills), one change at a time, echoing each API response. Re-pull the structure
afterwards and show the new state. Never execute in the same turn as the analysis unless
the user pre-authorised it.

## Gotchas learned in production

- `daily_budget` is in **minor units** (pence/cents): `8790` = £87.90
- Use the `complete_registration` action_type for CPL; the `offsite_complete_registration_add_*`
  variants are duplicates of the same conversions
- `video_play_actions` ≈ any play (autoplay) — hook rates of 90%+ are normal; only
  compare relatively
- Learning-limited ad sets with tiny budgets will NEVER exit learning (need 50 conv/7d);
  that is fine for ABO angle-testing — do not chase learning exit, chase CPL
- Tokens: prefer the client's stored Never-expiry system-user token; never mint new ones
  mid-audit
- Religion/special-category flags: if a domain/dataset is flagged, conversion campaigns
  throttle silently (spend £0 or trickle). If an active campaign shows approved ads but
  near-zero delivery, check the flag history in the client config notes BEFORE blaming
  the creative
