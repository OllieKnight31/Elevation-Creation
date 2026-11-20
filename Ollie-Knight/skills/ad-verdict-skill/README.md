# Ad Verdict Skill

A Claude Code skill that reviews every live ad in your Meta ad account and gives each one a verdict:

- **SCALE**, with the exact new budget
- **KILL**, with how much spend it frees up
- **HOLD**, with the kill line and the date to check again

It works out your allowable cost per lead from your funnel numbers, flags problems the ads can't fix (like a weak landing page), and suggests which new tests to run next. It only reads your account. It never changes anything unless you tell it to.

## What you need

- [Claude Code](https://claude.com/claude-code)
- Node.js 18 or newer
- A Meta Marketing API access token with `ads_read` for your ad account (a system user token from Business Settings works best)

## Setup

1. Copy this folder into your Claude skills folder:
   ```
   ~/.claude/skills/ad-verdict-skill/
   ```
2. Put your token in a `.env` file somewhere private, for example:
   ```
   META_ACCESS_TOKEN=your_token_here
   ```
3. Copy `clients/example.json` to `clients/<your-name>.json` and fill it in:
   - `act_id`: your ad account ID (starts with `act_`)
   - `token_source`: the path to your `.env` file and the variable name
   - `conversion_event`: what counts as a result, e.g. `complete_registration` or `lead`
   - `target_cpl`: the cost per lead you want to beat
   - `breakeven_cpl`: front end cash collected divided by results
   - `currency`: e.g. `GBP` or `USD`

Never commit your `.env` file or real tokens.

## Use it

In Claude Code, type:

```
/ad-verdict <your-name>
```

or just ask "which of my ads should I scale, kill or hold?"

Built by [@oliverknzght](https://instagram.com/oliverknzght).
