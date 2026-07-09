---
batch_id: YYYY-MM-DD-NNN
client_slug: <slug>
asset_type: retargeting-ad
retargeting_role: "cycle-bin-1-warm | direct-response | post-optin-trust | sales-page | cycle-bin-3-customer | hammer-them-post-booking"
buying_motive: "<which of the 20+ motives this targets, only for sales-page role>"
interval_days: <0-5 | 5-30 | 30-60 | 60-90 | 90-180>  # days since warm-up / opt-in / sales-page visit
target_audience_definition: "<exact audience: e.g. 'sales page visitors days 30-37 who didn't buy'>"
duration_target: "15s | 30s | 60s | 90s | 120s"
aspect_ratios: ["9:16", "1:1", "16:9"]
placements: ["feed", "stories", "reels", "in-stream", "marketplace", "audience-network"]
locale: UK | US | other
voice_tier: full | partial | generic
ai_tell_scan: pending | passed | flagged-rewrite-needed
---

# Retargeting <role> — <descriptive title>

> **Where this fires:** <plain-English description of who sees this and when>

## Buying motive (if sales-page role)

<One sentence stating which buying motive from the 20+ mapped in plan.md this addresses. E.g. "Some buyers want status + prove others wrong" or "Some buyers want tax efficiency on a side income".>

## Spoken copy / on-screen copy

<Full copy. For 15s vertical stories: under 35 words. For 30-60s feed: full hook → body → CTA structure. Acknowledge what action the viewer already took ("You watched our webinar but haven't booked yet...") per File 6 retargeting best-practice.>

## Hook (0-3s)

<Pattern interrupt that acknowledges the viewer's stage. Avoid generic "Hey, just wanted to remind you...">

## Body

<Address ONE motive. Don't try to cover everything — that's why we have 20+ variations.>

## CTA

<Clear next action. Tied to the funnel step they didn't complete.>

## Filming / asset directions

- **Environment:** <where>
- **Format:** <existing footage re-edit | new shoot | static + text overlay>
- **Pattern interrupt:** <visual or audio jolt 3-5s in if asset is 30s+>

## Audience exclusions

- Already-converted customers (always exclude)
- People who completed the step this ad targets (e.g. exclude people who have booked a call if ad CTA is "book a call")

## Interval logic

This ad fires <N> days after the trigger event. Per File 6 Harvester strategy, retargeting sequence uses 5-7 day intervals up to 180 days max (FB cap).

## Self-check before shipping

- [ ] Buying motive named (if sales-page role)
- [ ] Audience definition is specific (date range + URL pattern)
- [ ] Exclusions defined
- [ ] No banned constructs
- [ ] Locale matches
