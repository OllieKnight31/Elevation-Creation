---
batch_id: YYYY-MM-DD-NNN
client_slug: <slug>
asset_type: cold-dr-video
script_number: NN
script_slug: <short-kebab>

# Diversification tags (all required)
dog_food_reason: "<one-line reason from the accepted Dog-Food list>"
target_segment: "<in-market / needs-convinced + descriptor>"
cognitive_bias: "<bias from 100-hook-framework category>"
hook_pattern: "<pattern from 103-hook-templates>"  # e.g. transformation-contrast, curiosity-gap, contrarian
sub_framework: "<one of: talking-head | case-study | demo | objection-first | qa | interview | skit | walk-and-talk>"
ad_template: "<one of the 14 templates from 14-ad-templates.md (optional, leave blank if none fits)>"
target_objection: "<which top objection this neutralises (or 'none — pure curiosity')>"

# Funnel alignment
funnel_destination: "<full URL>"
funnel_promise: "<exact one-line promise the landing page must echo>"

# Production
duration_target: "30s | 45s | 60s | 90s"
aspect_ratios: ["9:16", "1:1"]  # which versions to cut
locale: UK | US | other
voice_tier: full | partial | generic
ai_tell_scan: pending | passed | flagged-rewrite-needed
---

# Script <NN> — <Sub-framework>: <Short descriptive title>

> **Reason this ad exists:** <repeat dog_food_reason as a sentence so the editor understands the angle>

## Hook (0-5s)

<exact spoken copy. Max 2 sentences. Under 5 seconds spoken. No em-dashes. No banned constructs.>

## Body / Reasons (5-{duration-10}s)

<exact spoken copy. Prose paragraphs, not bullet lists. Each sentence under 22 words. Address one Dog-Food reason throughout. Weave in 1-2 proof points. Handle the target_objection inline if applicable. No filler.>

## CTA ({duration-10}-{duration}s)

<exact spoken copy. One action, one "so you can" reason, one click. Specific not generic.>

## Filming directions

- **Environment:** <where this is shot — pull from photo library / known locations>
- **Wardrobe:** <what talent wears>
- **Vibe:** <calm direct-to-camera | high-energy walk-and-talk | studio-formal | etc.>
- **B-roll:** <list of cutaway shots needed; reference photo library file numbers if available>
- **Text overlays:** <on-screen text moments — numbers, stats, names>
- **Talent:** <on-camera person; second person if interview/skit>

## Funnel alignment notes

The landing page must echo these to keep the promise intact (per File 5 Part 4):

- **Landing page headline:** "<echo of the hook>"
- **Sub-head:** "<echo of the body promise>"
- **VSL opener (first 5s):** "<echo of the CTA promise>"

If any of these don't match the current funnel page, flag this script as **REQUIRES FUNNEL CHANGE** in `index.md`.

## Objection note

<If target_objection != "none", explain in 1-2 sentences how this script neutralises it. If "none", say "Pure curiosity hook — does not neutralise an objection; relies on objection coverage from other scripts in batch.">

## Iteration recipe (for 2-4 week ad fatigue refresh)

Per File 5 Part 7, this script ships with 3-5 fatigue-refresh variants:

- **V2 — Opener swap:** Change hook to "<alternative opener targeting same reason>" — same body, same CTA. Re-edit only, no re-shoot.
- **V3 — Environment swap:** Re-shoot in <alternative location from photo library>. Same script.
- **V4 — Text overlay variant:** Add bold text overlay of the key number/stat. Re-edit only.
- **V5 — Duration cut:** Trim 60s version to 30s for short-form placements. Cut <specific section>.
- **V6 (optional) — Framework swap:** Restructure as <alternative sub-framework, e.g. objection-first instead of case-study>. Re-shoot needed.

## Self-check before shipping

- [ ] No em-dashes anywhere
- [ ] No banned constructs from anti-ai-tells.md
- [ ] No trigger words in spoken copy
- [ ] Straight quotes only (no smart quotes)
- [ ] Locale matches (UK = £ + British spelling; US = $ + American spelling)
- [ ] Hook is under 5 seconds when spoken
- [ ] CTA names one action, one reason, one click
- [ ] Funnel-alignment notes are concrete (real headline text, not placeholder)
- [ ] All diversification tags filled in frontmatter
