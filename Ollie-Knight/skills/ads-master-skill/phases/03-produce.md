# Phase 3 — Produce (the batch)

Phase 0/1/2 have resolved voice, locale, inputs, and the plan. Phase 3 writes every asset to disk.

## Inputs

- Phase 0/1/2 state files
- The accepted plan (Dog-Food reasons, framework spread, objection coverage, surfaces)
- All references loaded

## What it does

### Step 1 — Create the batch folder structure

```
clients/[slug]/ads/[YYYY-MM-DD]-[NNN]/
├── .phase-0-state.yaml
├── discovery-summary.md
├── plan.md
├── briefing.md                  (written last, summarises everything)
├── index.md                     (written last, links everything)
├── cold-dr/
│   ├── 01-[short-slug].md
│   ├── 02-[short-slug].md
│   └── ...
├── warm-up/
│   ├── video-1-authority.md
│   ├── video-2-positioning.md
│   ├── video-3.1-[category].md
│   ├── video-3.2-[category].md
│   └── video-3.3-[category].md
├── retargeting/
│   ├── cycle-bin-1-warm-cold/
│   ├── direct-response/
│   ├── post-optin-trust/
│   └── sales-page/  (the 20+ buying-motive variations)
└── static/
    ├── 01-[hook-slug].md
    └── ...
```

### Step 2 — Produce cold-DR scripts (one per Dog-Food reason)

For each accepted reason, invoke `direct-response-ads-skill` with this brief:

```yaml
client_slug: terry
batch_id: 2026-05-11-001
script_number: 03
voice_tier: full
voice_source: clients/Terry/knowledge-base/property-labs-synthesis.md#voice
locale: UK
offer_slug: foundation
funnel_destination: https://propertylabs.to/webinar
dog_food_reason: "Replace a 9-to-5 with R2R cashflow within 90 days"
target_segment: "in-market homeowner aged 28-45 with savings"
cognitive_bias: "loss aversion + opportunity cost"
hook_pattern: "transformation contrast"  # from 103-hook-templates patterns
sub_framework: "case study snapshot"     # from 8-sub-frameworks
ad_template: "Quick Win"                 # from 14-ad-templates (optional)
target_objection: "I don't have time"
duration_target: "45-60s"
output_path: clients/Terry/ads/2026-05-11-001/cold-dr/03-andrew-r2r-90-days.md
template_path: ~/.claude/skills/ads-master-skill/templates/cold-dr-script.md
```

The sub-skill writes a single script following `templates/cold-dr-script.md`. Master-skill scans it through `reference/anti-ai-tells.md` rules before declaring it done.

### Step 3 — Produce warm-up Venus Fly Trap scripts

These are NOT direct-response, so they don't go through `direct-response-ads-skill`. Master-skill writes them directly using `templates/warm-up-video.md` and `reference/venus-fly-trap.md`.

- Video 1: target audience = ideal future customers (cold). No CTA. Authority + social proof + broad value. 1-3 min. Optimize for thruplay/engagement.
- Video 2: positioning + brand promise + biggest bold claim + unique mechanism. No CTA. 1-3 min.
- Videos 3.x: category management. One video per offer category from the offer KB. Minimum 3 videos.

### Step 4 — Produce retargeting scripts (Harvester)

Invoke `hammer-them-skill` for the post-booking retargeting bundle.

For Harvester cycle bins, produce directly using `templates/retargeting-ad.md` and `reference/harvester-strategy.md`:

- **Cycle Bin 1** (warm cold audiences, days 0-5, frequency 3-5): 5-10 short value pieces. Goal: warm them before they see direct response ads.
- **Direct response retargeting** (days 5-30): 5-10 variations across right-column, newsfeed, stories, in-stream, marketplace, audience network placements.
- **Sales page retargeting** (5-7 day intervals up to 180 days): the 20+ buying-motive variations.
- **Cycle Bin 3** (customer retention, days 5-180): 3-5 brand-reinforcement pieces.

### Step 5 — Produce static ads

Invoke `static-ad-skill` for each static. Use `templates/static-ad.md` schema. Pull hooks from `reference/70-headline-swipe.md` AND `reference/103-hook-templates.md`. Use one of the 14 templates from `reference/14-ad-templates.md` as the structural backbone.

### Step 6 — Run anti-AI-tell scan on every output

After every script is written, scan its `## Hook` / `## Body` / `## CTA` sections against `reference/anti-ai-tells.md`. Flag any banned construct or trigger word. Rewrite the offending line. Re-scan. Only mark `ai_tell_scan: passed` in frontmatter once clean.

### Step 7 — Write briefing.md

After all assets are produced, write `briefing.md`:

```markdown
# Editor + Talent Briefing — [client] — [batch_id]

## Shoot day plan
- Estimated total filming time: ~3 hours
- Locations needed: [list pulled from per-script filming directions]
- Wardrobe: [list of distinct wardrobe per script]
- Props: [list of distinct props]

## Filming order (efficiency-optimised)
1. Scripts in location A: #03, #07, #11
2. Scripts in location B: #01, #05, #09
3. ...

## B-roll shot list
- [Consolidated list of unique b-roll needed]

## Post-production notes
- Aspect ratios needed: 9:16 vertical (primary), 1:1 square (secondary)
- Duration targets: 30s / 60s / 90s per script
- Text overlays: see per-script notes
- Music: [if applicable]

## Compliance check
- Disclaimers per script: [list]
- Any income claims to verify before publishing: [list]
```

### Step 8 — Write index.md (coverage matrix)

```markdown
# Batch Index — [client] — [batch_id]

## Surface coverage
| Surface | Count |
|---|---|
| Cold DR | 18 |
| Warm-up | 3 |
| Retargeting (Harvester) | 8 cycle-bin + 20 sales-page |
| Static | 8 |

## Dog-Food reason coverage
| # | Reason | Script | Sub-framework | Cognitive bias |
|---|---|---|---|---|
| 1 | ... | cold-dr/01-... | talking-head | ... |
| 2 | ... | cold-dr/02-... | case-study | ... |
| ... | ... | ... | ... | ... |

## Cognitive bias coverage
- Urgency & Scarcity: 3 scripts
- Social Proof & Authority: 4 scripts
- Problem Agitation: 3 scripts
- Curiosity Gap: 2 scripts
- Transformation & Outcome: 4 scripts
- Tactical & Specific: 1 script
- Industry Disruption: 1 script
✓ 7/7 categories represented

## Sub-framework coverage
- Talking head + B-roll: 6 ✓
- Case Study Snapshot: 4 ✓
- Objection First: 3 ✓
- Demo: 2 ✓
- Q&A: 1 ✓
- Interview: 1 ✓
- Skit: 0
- Walk-and-talk: 1 ✓
✓ 7/8 frameworks used

## Objection coverage
| Objection | Addressed by |
|---|---|
| "I don't have time" | #03, #11, #17 |
| "I don't have capital" | #07, #14 |
| "Is this a scam?" | #02, #08 |
| "What if the market dips?" | #16 |
✓ 4/4 objections covered

## Asset links
[Bulleted list linking every produced file]
```

## Outputs

A complete batch folder with:
- 15-20 cold-DR scripts
- 3-5 warm-up scripts
- 8-30 retargeting scripts (depending on cycle bins + buying motives)
- 5-10 static ads
- `briefing.md`
- `index.md`
- All Phase 0/1/2 state files

## Critical rules

1. **Run anti-AI-tell scan on EVERY output.** Don't ship a script that hasn't been scanned.
2. **Sub-skills receive a structured brief.** They don't re-prompt the user for offer / ICP / voice.
3. **Filming directions reference the photo library** when one exists. Don't invent shoots that can't be done with the client's actual setup.
4. **Funnel-alignment notes are mandatory on every cold DR script.** Without them, the ad-funnel promise breaks.
5. **Iteration recipes are mandatory on every cold DR script.** 3-5 fatigue-refresh variants per master.
6. **The index.md coverage matrix is the QA gate.** If any coverage row shows ✗, the batch is malformed.
