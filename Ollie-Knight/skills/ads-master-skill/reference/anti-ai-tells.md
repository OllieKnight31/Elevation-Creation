# Anti-AI-Tells Codex

_Hardcoded style rules applied to every output, regardless of voice tier. Source: user feedback (`feedback_no_ai_tells`), `feedback_no_money_messaging`, `feedback_currency_gbp`, plus general direct-response practice. These are non-negotiable._

---

## Banned constructs (zero tolerance)

| Banned | Why it's a tell | What to do instead |
|---|---|---|
| Em-dashes (`—`) anywhere | Statistically over-represented in LLM output; reads "AI-polished" | Full stop. Comma. Line break. Or restructure. |
| Colon-lists in spoken copy ("You get: X, Y, Z.") | Hyper-corporate, never how real humans talk on camera | Make each item its own sentence. "You get X. Plus Y. And Z." |
| "Designed for X" closers | Bot-tier marketing-speak | "If you've already X, this is for you." (specific, second-person) |
| "Imagine if..." openers | Tired hypothetical opener every AI defaults to | Lead with a concrete event, number, or contrast. |
| "In today's fast-paced world..." / "In an era of..." | Generic filler | Delete. Start at the second clause. |
| "It's not just X, it's Y." | Pattern AI loves | Say the thing directly. |
| "Let's dive in" / "Let's break it down" / "Let's unpack" | Filler verbs | Start with the substance. |
| "Game-changer" / "Revolutionary" / "Unlock" | Hype words detached from specifics | Show the specific result. Cut the adjective. |
| "Whether you're A or B..." three-way parallel | A tell for AI-generated copy | Pick the one segment that actually matters in this script. |
| Triadic constructions for rhythm ("simple, fast, and effective") | Sounds composed, not spoken | Pick one strong word, drop the others. |
| Inflated "and that's a game-changer" coda after a stat | AI's signature closer | Land the stat and stop talking. |
| Stock CTAs ("Click below to learn more") | Direct response wants specificity | "Click below so you can [specific concrete benefit] without [specific friction]." |
| Smart quotes (`"` `"` `'` `'`) | Marker of LLM-formatted text | Use straight quotes (`"` `'`) throughout. |
| Numbered lists in spoken ad copy | Sounds like a slide deck, not a person | "First X. Then Y. Then Z." or just prose. |
| "I asked myself..." / "I had to find out..." | Faux-narrative AI cliché | Cut. Start with the discovery itself. |

---

## Currency & locale rules

- **GBP not USD** when client locale is UK (default for Terry; check `clients/[slug]/locale.md`)
- The user types `$` out of habit but means `£` — when reading user input, convert `$` to `£` if the client is UK
- Spell numbers naturally for video: "ten grand" beats "£10,000" in a hook; the body can use precise figures
- British spelling: realise / colour / centre / specialise / programme (NOT realize / color / center / specialize / program)
- Tax/payment refs: "VAT" not "sales tax"; "Companies House" not "EIN registration"; "council tax" not "property tax"

---

## Content rules

### Money / claims framing
- **Never lead with "£0 own money"** (per `feedback_no_money_messaging`) — attracts no-budget audience
- The program minimum is £3K (per `project_terry_program_price_minimum`) — "£0 capital" always refers to the Airbnb property money, never the program fee
- Income claims need a disclaimer line in the funnel, not the ad — but in the ad, avoid "guaranteed", "100% safe", "passive income forever"

### Specificity > flourish
- "Andrew added £4,200/month on one property" beats "Andrew transformed his finances"
- Real names, real numbers, real locations, real durations. If you don't know the real number, fall back to a structural statement, not a fabricated one.

### Voice (when voice tier ≠ FULL)
- Second-person ("you") more than first-person ("I") unless the hook is a personal-story type
- Conversational contractions ("you're", "it's", "don't") not formal forms
- One idea per sentence in the hook (first 5 seconds)
- Sentences in the body can build, but no sentence over 22 words in spoken copy

### Format hygiene
- Hook = max 2 sentences, under 5 seconds when spoken
- Body = bullets in the .md file are fine for **filming directions**, but the **spoken copy** is always prose
- CTA = one action, one reason ("so you can"), one click

---

## Trigger words to scan output for before shipping

If any of these appear in `## Hook` / `## Body` / `## CTA` sections of an output script, flag and rewrite:

```
unlock | unleash | revolutionary | game-changer | dive in | unpack | leverage
synergy | seamless | cutting-edge | next-level | paradigm | transform
ecosystem | journey | navigate | curate | meticulously | imagine if
in today's | in an era of | designed for | empower | elevate (as verb)
holistic | actionable insights | drill down | circle back | move the needle
```

(The word "transform" is allowed in the AD-TEMPLATE NAMES — e.g. "transformation contrast hook" — but should not appear in spoken copy unless it's the client's actual word.)

---

## Output stamping rules

Every produced asset file must include in YAML frontmatter:

```yaml
voice_tier: full | partial | generic
ai_tell_scan: passed | flagged-rewrite-needed
locale: UK | US | other
```

When `voice_tier: generic`, the file body must open with this HTML comment so it's not accidentally published:

```html
<!-- TIER: GENERIC — needs voice pass before publishing -->
```

---

## Self-check after writing each script

Before declaring an asset done, scan the spoken copy for:

1. Any em-dash → fix
2. Any banned construct from the table above → fix
3. Any trigger word from the list → fix or justify with a comment
4. Smart quotes → replace with straight quotes
5. Locale mismatch (USD in a UK ad, "color" in a UK ad) → fix
6. £0-own-money lead → rewrite the hook
