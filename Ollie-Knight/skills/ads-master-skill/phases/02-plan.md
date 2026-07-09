# Phase 2 — Plan (surfaces × volume × Dog-Food angles × framework spread)

Phase 1 has confirmed inputs and shown the user a discovery summary. Now we build the batch plan.

## Inputs

- Phase 0 + Phase 1 state files
- Discovery summary
- Reference: `reference/dog-food-exercise.md`, `reference/100-hook-framework.md`, `reference/8-sub-frameworks.md`, `reference/14-ad-templates.md`

## What it does

### Step 1 — Confirm surfaces

Ask via AskUserQuestion (multi-select, default all four checked):

- Cold DR video (15-20 scripts, default path)
- Warm-up Venus Fly Trap (3-5 videos: Video 1 authority, Video 2 positioning, Videos 3.1-3.3 category)
- Retargeting Harvester / Hammer Them (5-10 scripts across content cycle bins 1-3)
- Static image ads (5-10 hook+body+CTA + visual direction)

### Step 2 — Confirm volume path

If user passed `--volume-path` flag, use it. Otherwise ask:

- **diverse-15-20** (default, Andromeda Path 2) — 15-20 unique ads, each a different Dog-Food reason
- **high-50-plus** (Andromeda Path 1) — 50+ creatives/week using fewer angles + heavy volume
- **hybrid** — 15-20 unique + each gets 3-5 iteration variants (effective 60-100 weekly)

### Step 3 — Generate Dog-Food candidate reasons

Read offer KB + ICP + case studies + swipe file. Generate 18-25 candidate reasons someone would want this offer. Each reason has:

- A one-line reason statement (e.g., "Replace a 9-to-5 with R2R cashflow within 90 days")
- A buyer-segment tag (e.g., "in-market homeowner with savings", "needs-convinced corporate escapee", "in-market property newbie")
- A suggested cognitive bias from the 100-hook framework (e.g., "loss aversion", "curiosity gap", "social proof")
- A suggested sub-framework from the 8 (e.g., "case study snapshot", "objection first")

Present the candidate list and ask the user to:
- Accept all
- Edit any
- Remove any (must end with at least N where N = volume target)
- Add any (no upper limit)

The accepted list becomes the **diversification spine** of the batch.

### Step 4 — Spread frameworks

Across the accepted reasons, propose a framework spread (numbers tunable per surface):

| Sub-framework | Default share of 18-script batch |
|---|---|
| Talking head + B-roll | 5-7 |
| Case Study Snapshot | 3-4 |
| Objection First | 2-3 |
| Demo / Screencast | 1-2 |
| Q&A Style | 1-2 |
| 2-Person Interview | 1-2 |
| Skit / Scenario | 0-1 |
| Walk-and-talk | 1-2 |

Match each script's reason to the most natural framework. (A case-study reason → case-study framework. An objection-style reason → objection-first. A technical product → demo.)

Show the proposed spread and let user override.

### Step 5 — Objection coverage check

Cross-reference each reason against the top objections from discovery. The batch as a whole must address every top objection at least once (either via the reason itself, or via an objection-first script).

If coverage is incomplete, propose adding 1-2 objection-first scripts to fill gaps.

### Step 6 — For retargeting surface only — buying-motive mapping

If the retargeting surface is selected, generate 20+ buying-motive variations per the Lamborghini-vs-protein-powder principle (Harvester strategy). Each becomes a retargeting ad in the 5-7 day interval sequence.

### Step 7 — For warm-up surface only — Venus Fly Trap structure

Generate the 3-5 warm-up specs:
- Video 1: authority + social proof, no CTA, 1-3 min
- Video 2: positioning + brand promise / unique mechanism, no CTA, 1-3 min
- Videos 3.1, 3.2, 3.3 (or more): one per offer category from the offer KB (foundation, scale, empire, inner circle for Terry)

### Step 8 — Write the plan

Write `clients/[slug]/ads/[batch]/plan.md`:

```markdown
# Plan — [client] — [batch_id]

## Volume path
diverse-15-20

## Surfaces
- Cold DR: 18 scripts
- Warm-up: 3 (Video 1, Video 2, Videos 3.1-3.3)
- Retargeting: 8 scripts + 20 buying-motive variations
- Static: 8 scripts

## Dog-Food reasons (accepted)
1. [reason] — segment: [tag] — bias: [bias] — framework: [sub-framework]
2. ...
18. ...

## Framework spread
- Talking head + B-roll: 6
- Case Study Snapshot: 4
- Objection First: 3
- Demo: 2
- Q&A: 1
- Interview: 1
- Skit: 0
- Walk-and-talk: 1

## Objection coverage
- Objection 1: covered by scripts #03, #11, #17
- Objection 2: covered by scripts #07, #14
- Objection 3: covered by scripts #02, #08
- Objection 4: covered by script #16

## Retargeting buying motives (20+)
1. ...
2. ...
...

## Warm-up specs
- Video 1: ...
- Video 2: ...
- Videos 3.1-3.3: ...
```

User reviews and confirms before Phase 3.

## Outputs

- `clients/[slug]/ads/[batch]/plan.md`
- The diversification spine (used by Phase 3 to drive script-by-script generation)

## Critical rules

1. **Show every Dog-Food reason for user approval.** Don't proceed with auto-generated reasons unconfirmed.
2. **Coverage check is mandatory.** Every top objection must be neutralised by at least one script.
3. **Buying motives for retargeting target 20+.** Don't undercount — this is where most marketers fail.
4. **Hybrid path = 15-20 unique + iteration recipes**, not 15-20 with throwaway variations.
