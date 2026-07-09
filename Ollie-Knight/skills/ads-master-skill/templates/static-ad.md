---
batch_id: YYYY-MM-DD-NNN
client_slug: <slug>
asset_type: static-ad
script_number: NN
script_slug: <short-kebab>

# Diversification tags
dog_food_reason: "<one-line reason from accepted list>"
target_segment: "<segment>"
hook_template_source: "70-headline-swipe | 103-hook-templates | 100-hook-framework"
hook_template_id: "<which numbered template, e.g. '70-#34' or '103-#42'>"
ad_template: "<one of the 14 templates from 14-ad-templates.md>"
cognitive_bias: "<bias>"
target_objection: "<objection or 'none'>"

# Production
aspect_ratios: ["1:1", "9:16", "4:5"]
locale: UK | US | other
voice_tier: full | partial | generic
ai_tell_scan: pending | passed | flagged-rewrite-needed
funnel_destination: "<URL>"
---

# Static <NN> — <Ad template>: <Short title>

> **Dog-Food reason:** <repeat>

## Headline (the hook)

<3-12 word headline. Pulled from one of the swipe templates. High contrast, specific, no generic adjectives.>

## Sub-headline (optional)

<One sentence that bridges hook to body — specifies what changes if they keep reading.>

## Body copy

<Following the chosen 14-template structure. E.g. for "Before & After": vivid pain → transformation moment → proof → mechanism → promise. For "Insider Reveal": exclusivity hook → hidden info → proof → ease → CTA.>

## CTA

<Specific action verb. Specific "so you can" reason. One next step.>

## Visual direction

- **Image type:** <talent portrait | product shot | screenshot | before-after | infographic | text-on-color>
- **Composition:** <rule of thirds / centered / split-screen / etc>
- **Photo source:** <reference to photo library entry if applicable, with face-position + mechanism-fit notes>
- **Colour palette:** <client brand colours OR high-contrast for ad stop-power>
- **Text overlay strategy:** <minimal / heavy / numbered list>
- **Logo placement:** <corner / footer / none>

## Funnel alignment

- Landing page headline must echo: "<headline>"
- Landing page sub-head must echo: "<sub-headline>"

## Self-check before shipping

- [ ] Headline matches one of the swipe template patterns (verify template ID)
- [ ] Anti-AI-tell scan passed
- [ ] Visual direction references real photo library entry when available
- [ ] Locale matches (£/UK spelling for UK ads)
- [ ] Composition picked with stop-power in mind, not "pretty"
