# GHL Implementation Guide — Property Labs Webinar Funnel

**Client:** Terry Dwobeng / Property Labs
**Webinar:** "The 3C System: How Complete Beginners Are Launching Profitable Airbnbs in 90 Days"
**Webinar Date:** Monday, April 13, 2026
**Webinar Time:** 7:00 PM BST
**Generated:** March 2026

> This is the single reference document for building the entire Property Labs webinar funnel inside GoHighLevel. Follow each phase in order. Every email, SMS, workflow step, and configuration is included — ready to copy-paste.

---

## TABLE OF CONTENTS

1. [Phase 1: Account Setup](#phase-1-account-setup)
2. [Phase 2: Custom Fields (13 Fields)](#phase-2-custom-fields-13-fields)
3. [Phase 3: Pipeline Setup](#phase-3-pipeline-setup)
4. [Phase 4: Tags](#phase-4-tags)
5. [Phase 5: Email Templates (27 Emails)](#phase-5-email-templates-27-emails)
6. [Phase 6: SMS Templates (16 SMS)](#phase-6-sms-templates-16-sms)
7. [Phase 7: Build Workflows (7 Workflows)](#phase-7-build-workflows-7-workflows)
8. [Phase 8: Webhook Setup](#phase-8-webhook-setup)
9. [Phase 9: Smart Lists](#phase-9-smart-lists)
10. [Phase 10: Testing Checklist](#phase-10-testing-checklist)
11. [Phase 11: WhatsApp Group Messages](#phase-11-whatsapp-group-messages)
12. [Appendix: GHL Merge Field Reference](#appendix-ghl-merge-field-reference)

---

## PHASE 1: ACCOUNT SETUP

> Complete all of these before building anything else.

### Step 1.1: Create Sub-Account

1. Log into your GHL Agency dashboard
2. Click **Agency** in the left sidebar
3. Click **Sub-Accounts** > **Create Sub-Account**
4. Fill in:
   - **Business Name:** Property Labs - Terry Dwobeng
   - **Business Phone:** [Terry's UK mobile]
   - **Business Email:** founder@propertylabs.to
   - **Business Address:** [Terry's registered business address]
   - **Timezone:** Europe/London (GMT/BST — auto-adjusts for daylight saving)
   - **Currency:** GBP (£)
   - **Language:** English (UK)
5. Click **Save**

### Step 1.2: Domain & Email Setup

**Add Sending Domain:**

1. Go to **Settings** > **Email Services** > **Dedicated Domain**
2. Click **Add Domain**
3. Enter: `propertylabs.to`
4. GHL will generate DNS records. Add these to your domain's DNS settings (via your registrar — Namecheap, GoDaddy, Cloudflare, etc.):

| Record Type | Host/Name | Value | TTL |
|------------|-----------|-------|-----|
| TXT (SPF) | `@` or `propertylabs.to` | `v=spf1 include:_spf.gohighlevel.com ~all` | 3600 |
| CNAME (DKIM) | `ghl._domainkey` | (GHL will provide this — copy exactly) | 3600 |
| CNAME (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:founder@propertylabs.to` | 3600 |

5. Wait for verification (can take up to 48 hours, usually 1-4 hours)
6. Once verified, go to **Settings** > **Email Services** > **Default Sending Settings**:
   - **From Name:** Terry from Property Labs
   - **From Email:** founder@propertylabs.to
   - **Reply-To:** founder@propertylabs.to

### Step 1.3: Purchase UK Phone Number

1. Go to **Settings** > **Phone Numbers** > **Buy Number**
2. Select:
   - **Country:** United Kingdom (+44)
   - **Type:** Local
   - **Capabilities:** Check both **SMS** and **Voice**
   - **Area Code:** Choose a London code (020) or leave blank for any UK number
3. Click **Buy Number**
4. Go to **Settings** > **Phone Numbers** > click on the new number
5. Set as the **default SMS number** for the sub-account
6. Enable **A2P 10DLC registration** if prompted (required for SMS delivery in some regions)

### Step 1.4: Connect Stripe

1. Go to **Settings** > **Integrations** > **Stripe**
2. Click **Connect Stripe**
3. Log into Stripe with:
   - **Email:** founder@propertylabs.to
   - **Password:** @Godmade12
4. Authorize GHL to access the Stripe account
5. Verify the connection shows "Connected" with a green status
6. Set the default currency to **GBP**

### Step 1.5: Connect Calendly (if not using GHL Calendar)

1. Go to **Settings** > **Integrations** > **Calendly**
2. Click **Connect**
3. Log into Calendly and authorize
4. Select the event type for "Strategy Call with Terry"
5. Ensure the webhook is active (see Phase 8 for webhook details)

---

## PHASE 2: CUSTOM FIELDS (13 Fields)

> Go to **Settings** > **Custom Fields** > **Create Folder** called "Property Labs Webinar"

Create each field inside the "Property Labs Webinar" folder:

| # | Field Name | Internal Key | Type | Options / Notes |
|---|-----------|-------------|------|----------------|
| 1 | Webinar Registration Date | `webinar_registration_date` | Date Picker | Auto-filled by workflow |
| 2 | Webinar Attended | `webinar_attended` | Checkbox | Yes / No |
| 3 | Webinar Watch Time | `webinar_watch_time` | Number | Minutes (integer) |
| 4 | Call Booked | `call_booked` | Checkbox | Yes / No |
| 5 | Call Booked Date | `call_booked_date` | Date Picker | Auto-filled by workflow |
| 6 | Call Showed | `call_showed` | Checkbox | Yes / No |
| 7 | Offer Tier Interest | `offer_tier_interest` | Dropdown | Options: `£500 Course` / `£1,000 Course+Finance` / `£3,000 Group Coaching` / `£5,000 1:1 Coaching` |
| 8 | Purchase Amount | `purchase_amount` | Number | GBP value |
| 9 | Purchase Date | `purchase_date` | Date Picker | Auto-filled by workflow |
| 10 | UTM Source | `utm_source` | Single Line Text | |
| 11 | UTM Medium | `utm_medium` | Single Line Text | |
| 12 | UTM Campaign | `utm_campaign` | Single Line Text | |
| 13 | UTM Content | `utm_content` | Single Line Text | |

**How to create each field:**

1. Click **+ Add Field**
2. Select the field type from the dropdown
3. Enter the field name exactly as shown above
4. For Dropdown fields, add each option on a new line
5. Click **Save**
6. Repeat for all 13 fields

---

## PHASE 3: PIPELINE SETUP

1. Go to **Opportunities** > **Pipelines** > **+ Create Pipeline**
2. **Pipeline Name:** Property Labs Webinar Funnel
3. Add 9 stages in this exact order:

| # | Stage Name | Suggested Color | Description |
|---|-----------|----------------|-------------|
| 1 | Registered | Blue (#3B82F6) | Signed up for webinar |
| 2 | Confirmed | Light Blue (#06B6D4) | Completed confirmation steps (calendar add, etc.) |
| 3 | Attended | Green (#22C55E) | Showed up to the live webinar |
| 4 | Call Booked | Yellow (#EAB308) | Booked a Strategy Call with Terry |
| 5 | Call Completed | Orange (#F97316) | Call happened |
| 6 | Proposal Sent | Purple (#A855F7) | Offer presented, tier identified |
| 7 | Closed Won | Dark Green (#16A34A) | Became a paying client |
| 8 | Closed Lost | Red (#EF4444) | Did not buy |
| 9 | No Show | Grey (#6B7280) | Registered but didn't attend webinar |

**To add stages:**
1. Click **+ Add Stage** for each stage
2. Enter the stage name
3. Click the color swatch to set the color
4. Drag to reorder if needed
5. Click **Save Pipeline**

---

## PHASE 4: TAGS

> Go to **Settings** > **Tags** (or create them on-the-fly in workflows — but creating upfront is cleaner)

Create every tag listed below. These are used across all 7 workflows.

| # | Tag Name | Used In | Purpose |
|---|---------|---------|---------|
| 1 | `webinar-registered` | Workflow 1 | Applied on registration |
| 2 | `webinar-attended` | Workflow 3 | Applied when attendance confirmed |
| 3 | `webinar-noshow` | Workflow 5 | Applied to no-shows post-webinar |
| 4 | `call-booked` | Workflow 6 | Applied when Strategy Call is booked |
| 5 | `call-noshow` | Workflow 7 | Applied when contact misses their call |
| 6 | `client-won` | Workflow 7 | Applied when deal closes |
| 7 | `lost` | Workflow 7 | Applied when deal is lost |
| 8 | `needs-followup` | Workflow 7 | Applied when follow-up is needed post-call |
| 9 | `replay-sent` | Workflow 5 | Applied when replay link is sent |
| 10 | `abandoned-booking` | Abandoned Cart Workflow | Applied when booking page is abandoned |
| 11 | `abandoned-booking-completed` | Abandoned Cart Workflow | Applied after full abandoned sequence completes |
| 12 | `sequence-completed-attendee` | Workflow 4 | Applied after attendee sequence completes without booking |
| 13 | `sequence-completed-noshow` | Workflow 5 | Applied after no-show sequence completes |

**To create tags:**
1. Go to **Settings** > **Tags**
2. Click **+ Add Tag**
3. Type the tag name exactly as shown
4. Click **Save**
5. Repeat for all 13 tags

---

## PHASE 5: EMAIL TEMPLATES (27 Emails)

> Go to **Marketing** > **Emails** > **Templates** > **+ Create Template**
> For each template: choose "Code/HTML" or "Drag & Drop" builder. For Terry's plain-text style, use **Drag & Drop** with a single text block (no heavy design — these should look like personal emails, not marketing blasts).

### FORMATTING NOTES FOR ALL EMAILS

- Use a **simple, single-column layout** — no header images, no fancy design
- Font: System default or Arial, 14-16px
- From Name: **Terry from Property Labs**
- From Email: **founder@propertylabs.to**
- Reply-To: **founder@propertylabs.to**
- Footer: Include GHL's required unsubscribe link and Property Labs address
- All merge fields use GHL syntax: `{{contact.first_name}}`, `{{contact.email}}`, etc.

---

### GROUP A: PRE-WEBINAR EMAILS (5 Emails)

---

#### Email A1: Registration Confirmation

- **Template Name:** `PRE — Registration Confirmation`
- **Subject Line:** You're locked in. Here's what you need to know
- **Preview Text:** Your seat is confirmed — save your link for Monday, April 13th
- **Used In:** Workflow 1 (Registration Trigger) — sent immediately

**Body:**

```
Hey {{contact.first_name}},

Big move.

You're officially in for "The 3C System: How Complete Beginners Are Launching Profitable Airbnbs in 90 Days", the live training where I'm going to break down exactly how complete beginners (we're talking regular 9-5 workers, uni students, people with no prior property experience) are launching profitable Airbnbs and building real passive income.

Here are your details:

Date: Monday, April 13th
Time: 7:00 PM BST
Your Live Link: [WEBINAR JOIN LINK]

Save this email. That link is your ticket in on the day.

---

Here's what I'm covering (and why you need to hear this):

Most people think you need savings, a mortgage, or rich parents to get into property. That's a lie. I built a 14-unit Airbnb portfolio as a law student at Warwick using the 3C System. Peak months I was hitting £50k in revenue (£16k profit). I'm talking sub-penthouse in London type results.

On this training I'll walk you through:

- The 3C System (Credibility → Capital → Cash flow). The exact framework behind every single one of my students' results
- How to raise capital and launch your first Airbnb using investor capital through the 3C System
- Why most people who "want passive income" stay stuck, and the mindset shift that changes everything
- Real student results: people going from zero to profitable Airbnbs in weeks, not years

This is NOT a pre-recorded video. This is live, it's me, and I'm holding nothing back.

---

Do this right now:

Block this time in your calendar. Seriously. People who calendar-block show up. People who don't make excuses.

[ADD TO GOOGLE CALENDAR] | [ADD TO APPLE CALENDAR] | [ADD TO OUTLOOK]

I'll see you live.

Terry Dwobeng
Founder, Property Labs

P.S. If something comes up and you can't make it, reply to this email. I've got you.
```

---

#### Email A2: 24-Hour Reminder

- **Template Name:** `PRE — 24hr Reminder`
- **Subject Line:** Tomorrow changes things. Don't miss this.
- **Preview Text:** Your live training is in 24 hours — read this before tomorrow
- **Used In:** Workflow 2 (Pre-Webinar Sequence) — Sunday, April 12 at 7:00 PM BST

**Body:**

```
{{contact.first_name}},

Tomorrow is the day.

Your live training, "The 3C System: How Complete Beginners Are Launching Profitable Airbnbs in 90 Days", kicks off in less than 24 hours and I want to make sure you're locked in.

Tomorrow. Monday, April 13th
7:00 PM BST
Your Link: [WEBINAR JOIN LINK]

---

Let me tell you a quick story.

Ihab came to me with no property experience. None. He was working a regular job, had no savings earmarked for property, and honestly didn't think this was possible for someone like him.

Within 5 weeks of working together, Ihab raised £25,000 in capital. Not a loan. Not a mortgage. Capital raised through the exact system I'm teaching you tomorrow.

He went from "I don't even know where to start" to fully funded and launching his first Airbnb in five weeks.

And Ihab isn't the only one. Dylan now runs 5 Airbnbs doing £12k a month. Andrew raised £13k and has 3 units. Elite Kleans is pulling in £2.2k a month in passive income.

These are normal people. They just learned the right system.

That's exactly what I'm teaching you tomorrow.

---

To get the most out of tomorrow, do this tonight:

1. Find somewhere quiet. No distractions, no Netflix in the background
2. Have a pen and notepad ready (trust me on this)
3. Come with an open mind. Even if you think property isn't for you yet, what I'm sharing will change how you see money

This is a working session. Come ready to think differently.

Your link for tomorrow: [WEBINAR JOIN LINK]

See you there.

Terry
```

---

#### Email A3: 1-Hour Reminder

- **Template Name:** `PRE — 1hr Reminder`
- **Subject Line:** 60 minutes. Your link is inside.
- **Preview Text:** We go live in 1 hour — click your link and get ready
- **Used In:** Workflow 2 (Pre-Webinar Sequence) — Monday, April 13 at 6:00 PM BST

**Body:**

```
{{contact.first_name}},

One hour.

We go live in 60 minutes. Here's your link:

[WEBINAR JOIN LINK]

Click it 5 minutes before we start. The room opens early so you can get settled and be ready when I kick things off.

---

Quick reminder of what you're walking into:

- The 3C System. The framework behind every student success story in my programme
- How to raise capital for your first Airbnb using the 3C System
- Real breakdowns of students who went from zero to cash-flowing properties in weeks
- The exact playbook I used to build a 14-unit portfolio as a law student at Warwick

This is the same system people pay thousands for inside my coaching programme. You're getting it live, free, today.

Don't be late. I start on time.

[WEBINAR JOIN LINK]

See you in the room.

Terry Dwobeng
```

---

#### Email A4: 15-Minute Reminder

- **Template Name:** `PRE — 15min Reminder`
- **Subject Line:** 15 minutes. The room is open.
- **Preview Text:** We're about to go live — click here to join now
- **Used In:** Workflow 2 (Pre-Webinar Sequence) — Monday, April 13 at 6:45 PM BST

**Body:**

```
{{contact.first_name}},

15 minutes.

The room is open right now. Click the link below to get in:

[WEBINAR JOIN LINK]

I'm going live in 15 and I'm not waiting around. If you're late you'll miss the opening, and that's where I break down the biggest mistake people make when trying to get into Airbnb. You don't want to miss that.

Get in now.

Terry
```

---

#### Email A5: Post-Webinar Replay / No-Show

- **Template Name:** `PRE — Post-Webinar Replay`
- **Subject Line:** Missed it? Here's what went down...
- **Preview Text:** The live training just ended — your replay access is inside
- **Used In:** Workflow 2 (Pre-Webinar Sequence) — Monday, April 13 at 9:00 PM BST (1 hour after end)

**Body:**

```
{{contact.first_name}},

The live training just wrapped up.

If you were there, thank you. The energy was incredible and I loved the questions. Some of you are about to change your whole financial situation.

If you missed it, here's what you need to know:

We covered:
- The 3C System (Credibility → Capital → Cash flow). The full breakdown
- How Ihab raised £25k in 5 weeks and launched his first Airbnb using the 3C System
- The exact strategy I used to build a 14-unit portfolio as a law student at Warwick using the 3C framework
- And I made a specific offer for people who are serious about doing this in the next 90 days

---

The replay is up, but it's not staying up forever.

I'm taking this down in 48 hours. If you want to watch it, do it now.

Watch the Replay: [REPLAY PAGE URL]

---

If you watched live and you're ready to take the next step:

I'm opening up a small number of strategy call spots for people who are serious about launching their first (or next) profitable Airbnb. On the call we'll map out your personal plan. Your situation, your capital strategy, your timeline.

Book your free strategy call here: [CALENDLY BOOKING LINK]

No pressure. No weird sales tactics. Just a straight conversation about where you are and how to get where you want to be.

Terry Dwobeng
Founder, Property Labs

P.S. Seriously, 48 hours and the replay comes down. Don't sit on this.
```

---

### GROUP B: POST-WEBINAR ATTENDEE EMAILS (6 Emails)

---

#### Email B1: Recap + CTA

- **Template Name:** `ATTENDEE — Recap + Book Call`
- **Subject Line:** Here's everything from tonight's session
- **Preview Text:** Your replay link + what to do next if you're serious
- **Used In:** Workflow 4 (Post-Attendee Sequence) — 30 minutes after webinar ends

**Body:**

```
Hey {{contact.first_name}},

Appreciate you showing up tonight. Real talk, most people who register for these things never actually turn up. You did. That says something.

We went through a LOT. So here's a quick breakdown of what we covered so you can come back to it:

What we went through:

- Why you don't need your own money to start an Airbnb business, and the private equity-inspired approach I used to build a 14-unit portfolio as a law student at Warwick using the 3C System
- The 3C System (Credibility → Capital → Cash flow). The exact framework my students use to go from nothing to profitable Airbnbs in under 90 days
- How 25+ complete beginners, from corporate workers to students, launched profitable Airbnbs using this system
- The step-by-step path from where you are right now to your first unit generating passive income every single month

If you want to rewatch anything, the replay is live now:

Watch the Replay: [REPLAY PAGE URL]

Heads up: This replay comes down in 48 hours. After that, it's gone. I won't be running this session again for a while.

---

One more thing.

During the training I mentioned the opportunity to work together inside Property Labs, where I walk you through implementing everything I showed you tonight, step by step.

If that's something you're even slightly considering, the next step is a quick strategy call. It's not a high-pressure sales thing. It's a 30-minute conversation where we look at your situation, your goals, and give you an honest answer on whether what we do makes sense for where you are right now.

Book Your Strategy Call: [CALENDLY BOOKING LINK]

Spots are limited each week, so if you're interested, don't sit on this.

Talk soon.

Terry Dwobeng
Founder, Property Labs

P.S. If you stayed until the end tonight, you heard about the 90-day guarantee. First profitable Airbnb in 90 days or we keep working with you until you get there. If you've got questions about that, the strategy call is where we break it all down.
```

---

#### Email B2: Value Teaching — You Don't Need Money

- **Template Name:** `ATTENDEE — You Dont Need Money`
- **Subject Line:** "But Terry, I don't have money to invest"
- **Preview Text:** That's exactly why this works
- **Used In:** Workflow 4 — Day 2, 10:00 AM

**Body:**

```
Hey {{contact.first_name}},

I want to share something that took me a minute to figure out. And honestly, it's the thing that changed everything for me.

When I was starting out, I was a law student at Warwick. I didn't have savings. I didn't have rich parents. I didn't have a trust fund. I was the kid who started by selling sweets at school just to have some pocket money. The idea that I'd one day have a 14-unit Airbnb portfolio doing £50k/month in revenue (£16k/month profit) and live in a sub-penthouse in central London? Laughable.

But here's what I figured out, and this is the core of everything I taught on the webinar:

You don't need money to build wealth. You need knowledge, credibility, and conviction. Capital follows conviction.

That's not a motivational quote. That's literally how private equity works. Big firms don't use their own money. They raise capital, deploy it into assets, and generate returns. That's the same model we use, just adapted for Airbnb.

Here's how the 3C System breaks down:

Step 1: Credibility.
You learn the Airbnb business inside out. The numbers, the operations, the deal analysis. When you speak, people can tell you know what you're talking about. This is what the coaching gives you. The knowledge and confidence to present yourself as someone worth backing.

Step 2: Capital.
Once you have credibility, raising money becomes straightforward. You're not begging anyone. You're presenting a solid investment opportunity to people who have money sitting around doing nothing. My student Ihab raised £25k in just 5 weeks. Andrew, a Masters student and junior accountant, raised £13k. These aren't people with connections. They just followed the system.

Step 3: Cash flow.
You deploy that capital into Airbnb units and generate passive income. Month after month. That's the whole game. Dylan went from zero to 5 Airbnbs in 3 months. His best month? £12k. He bought a Richard Mille watch.

The biggest lie in property is that you need money to make money. You don't. You need a system, a mentor, and the guts to actually follow through.

If you haven't rewatched the webinar section on the 3C System, the replay is still live: [REPLAY PAGE URL]

And if this is clicking for you and you want to talk about what it looks like to implement this in your life, book a strategy call:

Book Your Strategy Call: [CALENDLY BOOKING LINK]

No pressure. Just a real conversation about where you are and where you want to be.

Terry Dwobeng

P.S. The replay comes down tomorrow. If you haven't watched it again, tonight's your last chance.
```

---

#### Email B3: Case Study — Ihab, Dylan, Andrew

- **Template Name:** `ATTENDEE — Case Studies`
- **Subject Line:** Ihab raised £25k in 5 weeks. Dylan bought a Richard Mille.
- **Preview Text:** These are normal people who followed the system
- **Used In:** Workflow 4 — Day 3, 10:00 AM

**Body:**

```
Hey {{contact.first_name}},

I want to tell you about two people. Because I think their stories might sound familiar to where you are right now.

---

Ihab's story.

When Ihab came to us, he had no property experience. No big network of investors. No special advantage. He was just a regular guy who wanted to build something real.

He joined the programme, followed the 3C System, and within 5 weeks he'd raised £25,000 in capital. Not from a bank. Not from his own savings. From investors who believed in the opportunity he presented to them.

He now manages 2 profitable Airbnbs. And he's just getting started.

The only difference between Ihab and someone still scrolling social media thinking about it? He actually took the step.

---

Dylan's story.

Dylan was another one who came in with nothing special on paper. No property background. No massive savings account.

Within 3 months of working with us, he had 5 Airbnbs running. Five. His best month hit £12,000. And yes, he went and bought himself a Richard Mille. Because when the money's coming in like that, you start living differently.

---

Andrew's story.

This one's for anyone who thinks they're "too young" or "not experienced enough." Andrew was a Masters student and junior accountant. Not exactly the profile people picture when they think "property investor." He raised £13,000 in capital and now manages 3 Airbnb units. While studying. While working his job.

---

And then there's Elite Kleans.

They were a cleaning company. Came to us to learn the Airbnb model. Added just ONE unit and now earn £2,200 per month in passive income from it. One unit. That's an extra £26k a year on top of their existing business.

---

These are not special people with special circumstances. They're complete beginners who made a decision, followed a system, and took action.

The 3C System is the same framework I showed you on the webinar. The difference is they had coaching, accountability, and someone in their corner making sure they didn't make the expensive mistakes.

If they can do it, you can do it. That's not some motivational line. That's what I've watched happen over and over again.

Want the same result? Let's have a conversation.

Book a strategy call and we'll look at your situation honestly:

Book Your Strategy Call: [CALENDLY BOOKING LINK]

Terry Dwobeng

P.S. I asked Ihab what he'd say to someone on the fence. His response: "Just book the call. I was overthinking it for weeks. One conversation changed everything."
```

---

#### Email B4: FAQ / Objection Handling

- **Template Name:** `ATTENDEE — FAQ Objections`
- **Subject Line:** Your biggest questions, answered
- **Preview Text:** "I don't have money" / "Will this work for me?" / "Is Airbnb saturated?"
- **Used In:** Workflow 4 — Day 5, 10:00 AM

**Body:**

```
Hey {{contact.first_name}},

Since the webinar, I've had loads of messages. People asking questions, sharing what resonated, telling me about their situation. I appreciate every single one.

But I keep seeing the same concerns come up again and again. So I want to address them head on. No fluff.

---

"I don't have money to invest."

This is the one I hear most. And honestly? It's the reason I built the whole system the way I did.

I didn't have money either. I was a law student at Warwick. I built a 14-unit portfolio using the 3C System. The 3C System is literally designed for people who don't have capital. That's the whole point.

Step 1 is building credibility. Step 2 is raising capital from other people. You're not putting your savings on the line. You're presenting a solid investment opportunity to people who have money sitting in bank accounts earning nothing.

Ihab raised £25k in 5 weeks. Andrew raised £13k as a student. If they can do it with zero capital of their own, so can you.

---

"Will this actually work for me?"

I get why you'd ask this. You've probably seen courses and programmes that promise the world and deliver nothing.

Here's what I'd say: look at the results. Not mine. My students'. We've got people from all walks of life getting results. Students. Corporate professionals. Business owners. People with no prior property experience.

The system works if you work it. And we back that up with a guarantee: your first profitable Airbnb in 90 days, or we keep coaching you until you get there. I wouldn't offer that if I wasn't confident in what we deliver.

---

"I'm scared to take the leap."

Good. You should be. Anyone who tells you they weren't nervous before making a big decision is lying.

Here's what I know though. Fear doesn't go away by thinking about it more. It goes away when you take action and realise you're more capable than you thought.

Every single student I've worked with was scared at some point. The ones who are winning now are the ones who felt the fear and did it anyway. Sounds cliche, but it's literally true.

That's also why we give you coaching every step of the way. You're not figuring this out alone. You've got me, the team, and a community of people doing the exact same thing.

---

"Airbnb is saturated."

I love this one. Because the people saying Airbnb is saturated are the same people who said property was "too expensive" ten years ago. And the ones who ignored that noise? They're sitting on portfolios now.

Is there competition? Of course. There's competition in every business. But here's what most people get wrong. They think you need to own the property. We don't buy properties. We use other people's properties and other people's money. That changes the entire game.

The margins are there. The demand is there. London alone has massive short-let demand. The question isn't whether Airbnb works. It's whether you have the right strategy, and that's exactly what we teach.

---

The strategy call is free. It's 30 minutes. And there's no obligation.

We'll look at your specific situation, answer your questions, and give you an honest answer on whether this is right for you. If it's not, we'll tell you that.

Book Your Strategy Call: [CALENDLY BOOKING LINK]

Terry Dwobeng

P.S. If you've got a question I didn't cover here, reply to this email. I read every one.
```

---

#### Email B5: Last Chance Urgency

- **Template Name:** `ATTENDEE — Last Chance Urgency`
- **Subject Line:** Two versions of your life. Pick one.
- **Preview Text:** What happens if you do nothing vs. what happens if you take action
- **Used In:** Workflow 4 — Day 7, 10:00 AM

**Body:**

```
Hey {{contact.first_name}},

I'm going to be straight with you.

The strategy call spots from the webinar are nearly full. Once they're gone, the next availability won't be for a while. And the current offer, including the pricing and the 90-day guarantee, won't be around forever.

But honestly? This email isn't about the offer. It's about something bigger.

---

Right now, you're at a crossroads. And you're going to go one of two directions whether you make a conscious decision or not. Because doing nothing is still a choice.

Direction 1: You do nothing.

You close this email. You go back to your 9-5 on Monday. You keep scrolling social media watching other people build the life you want. You keep telling yourself "one day" while the months keep passing. You keep thinking about Airbnb, property, passive income, but never actually doing anything about it.

Six months from now, you're in the exact same position. Same job. Same salary. Same feeling that there has to be more than this. And you're looking back at this moment thinking, "What if I'd just booked the call?"

Direction 2: You take action.

You book the strategy call. You have a real conversation about your situation. If it makes sense, you start working with us. Within 30 days, you've built credibility and you're having conversations with potential investors. Within 60 days, you've raised capital. Within 90 days, you've got your first profitable Airbnb generating income every single month.

That's not a fantasy. That's what Ihab did. That's what Dylan did. That's what Andrew did. That's what happens when you follow a proven system with someone guiding you through it.

---

The decision isn't really about money.

It's about whether you're willing to keep living the same year on repeat, or whether you're ready to build something different.

I built my entire portfolio as a law student at Warwick and incoming commercial solicitor at a top 5 law firm, following the 3C framework. Now I live in a sub-penthouse in central London and I've got the Rolex I always wanted on my wrist. Not because I'm special. Because I made a decision and followed through.

Your version of that story starts with one conversation.

Book Your Strategy Call: [CALENDLY BOOKING LINK]

Terry Dwobeng

P.S. I started by selling sweets at school. If I can go from that to 14 Airbnbs doing £50k/month in revenue, what makes you think you can't do it too? The only thing standing between you and results is a decision. Make it.
```

---

#### Email B6: Breakup Email

- **Template Name:** `ATTENDEE — Breakup`
- **Subject Line:** Should I close your file?
- **Preview Text:** Genuine question — I need to know where your head's at
- **Used In:** Workflow 4 — Day 9, 10:00 AM

**Body:**

```
Hey {{contact.first_name}},

I'll keep this short.

You came to the webinar. You saw the 3C System. You heard the results. Ihab, Dylan, Andrew, all of them. But you haven't booked a call, and I haven't heard from you.

I want to respect your time, and mine.

So I'm asking you straight: are you still interested, or should I move on?

I'm not being harsh here. I know life gets busy. I know timing matters. And I know maybe right now isn't the right moment for you. That's completely fine. Not everyone's ready at the same time and I respect that.

But if there's even a small part of you that watched the webinar and thought "this could actually work for me", don't let that go without at least having the conversation.

One call. 30 minutes. No commitment. Just a real conversation about where you are and what's possible.

If you're still interested, two options:

1. Reply to this email and tell me what's holding you back. I'll read it personally and respond.

2. Book a strategy call and get your questions answered directly: [CALENDLY BOOKING LINK]

If I don't hear from you, that's cool. I'll move you to our general list and you'll keep getting value content from me. No pressure, no more follow-ups about this specific offer.

But I didn't want to stop reaching out without giving you one last chance to raise your hand.

Whatever you decide, I respect it. And I appreciate you showing up to the webinar. That alone puts you ahead of most people who just talk about wanting more.

Terry Dwobeng
Founder, Property Labs

P.S. This is genuinely my last email about this. No more follow-ups after today. If you've been sitting on the fence, now's the time to either make the move or let it go. Either way, I wish you nothing but the best. But just know, the people winning right now are the ones who stopped overthinking and started doing. Your call.
```

---

### GROUP C: NO-SHOW RECOVERY EMAILS (6 Emails)

---

#### Email C1: You Missed It + Replay

- **Template Name:** `NOSHOW — Missed It + Replay`
- **Subject Line:** You missed it — but I saved it for you
- **Preview Text:** The webinar just wrapped. Here's what went down (and why you need to see this).
- **Used In:** Workflow 5 (No-Show Recovery) — 1-2 hours after webinar ends

**Body:**

```
Hey {{contact.first_name}},

I noticed you weren't on tonight's training, "The 3C System: How Complete Beginners Are Launching Profitable Airbnbs in 90 Days."

Listen, no stress. Life happens. I'm not here to guilt trip you.

But I AM here to tell you that you really missed out. This was easily one of the best sessions I've done, and I don't say that lightly.

Here's a quick rundown of what we covered in 75 minutes:

- The 3C System (Credibility, Capital, Cash flow). The exact framework I used to build a 14-unit Airbnb portfolio as a law student at Warwick. I broke the whole thing down step by step.
- How to raise capital using the 3C System. I showed people exactly how Ihab raised £25k and launched 2 Airbnbs in just 5 weeks. Live on the call.
- The Airbnb model that's working RIGHT NOW in the UK. Not what worked in 2023. What's printing money today, in 2026, for complete beginners with no experience.
- The roadmap from zero to your first profitable Airbnb in 90 days. The milestones, the order they need to happen, and where most people get stuck.
- And at the end, I shared a specific opportunity to work with me directly for people who are serious about making this happen.

---

The replay is live right now, but only for a limited time.

I don't keep replays up forever. Once it's gone, it's gone. And I won't be running this session again for a while.

Watch the Replay Here: [REPLAY PAGE URL]

Real talk, watch it tonight or first thing tomorrow morning. Don't tell yourself you'll "get to it later." That's how you miss it twice.

Terry Dwobeng
Founder, Property Labs

P.S. Make sure you watch until the end. There's a specific offer I made for people who want to work with me directly, and it's only available for a limited time. All the details are in the replay.
```

---

#### Email C2: Highlight Reel / FOMO

- **Template Name:** `NOSHOW — Highlight Reel FOMO`
- **Subject Line:** The moment everyone lost it on the call
- **Preview Text:** The chat went mental when I showed them this. You need to see it.
- **Used In:** Workflow 5 — Day 2, 10:00 AM

**Body:**

```
Hey {{contact.first_name}},

I want to share one specific moment from the webinar with you, because this is the part where people's jaws literally dropped.

There were loads of people on the live call, and the chat went absolutely wild when I showed them this:

Most people think you need your own money to start in Airbnb. That's the biggest lie in the property game.

I know that sounds wild. But here's what I proved on the training, with real numbers, real students, real bank statements:

You don't need savings. You don't need a mortgage. You don't need rich parents or a trust fund. You need a SYSTEM.

I showed everyone exactly how I built a 14-unit portfolio as a law student at Warwick using the 3C framework, and how my students are doing the exact same thing right now.

When I pulled up Ihab's story, a guy who raised £25k in capital and launched 2 Airbnbs in 5 weeks flat, people were typing things like "this changes everything" and "why has no one explained it like this before."

Then I showed Dylan's results. 5 Airbnbs in 3 months, now pulling in £12k a month. The chat went even crazier.

---

The replay is still live, but it won't be for much longer.

If you're even slightly serious about building an income stream that doesn't require you trading hours for money, you need to watch this. Especially the section where I break down the 3C System. That's where the magic happens.

Watch the Replay: [REPLAY PAGE URL]

Terry

P.S. I'm not being dramatic. This was genuinely one of the best sessions I've done. The energy was different. Watch it and you'll see what I mean.
```

---

#### Email C3: Social Proof + Urgency

- **Template Name:** `NOSHOW — Social Proof Urgency`
- **Subject Line:** They started exactly where you are right now
- **Preview Text:** Real people. Real results. No trust funds. No experience. Just the system.
- **Used In:** Workflow 5 — Day 3, 10:00 AM

**Body:**

```
Hey {{contact.first_name}},

Since the webinar, people have already watched the replay, booked strategy calls, and started moving forward with building their Airbnb businesses.

I'm sharing this because I want you to see what's actually possible when you stop thinking about it and start doing something about it.

Here are real results from people who went through the exact system I taught on the training:

Ihab. Had no prior property experience. Used the 3C System to raise £25,000 in capital. Launched 2 profitable Airbnbs in just 5 weeks. Five. Weeks.

Dylan. Went from knowing nothing about Airbnb to running 5 properties in 3 months. Now pulling in £12,000 a month. Let that sink in. £12k a month from short-term rentals, built from scratch.

These aren't unicorns. These aren't people who had advantages you don't have. They're complete beginners who learned the system, followed it, and got results.

The only difference between them and you right now? They took action.

---

The people who watched the replay and booked a call are already moving. The people who didn't are still scrolling, still wondering, still in the same place they were last week.

The replay is coming down soon. If you haven't watched it yet, do it now.

Watch the Replay: [REPLAY PAGE URL]

And if you've already watched it and you're ready to have a proper conversation about working together, book a strategy call with me:

Book Your Strategy Call: [CALENDLY BOOKING LINK]

No pressure. No hard sell. Just a straight conversation about where you are and whether I can actually help.

Terry Dwobeng
Founder, Property Labs
```

---

#### Email C4: Value Recap / 3C System Explained

- **Template Name:** `NOSHOW — 3C System Explained`
- **Subject Line:** The 3C System — here's what you missed
- **Preview Text:** The exact framework behind every student success story. Broken down.
- **Used In:** Workflow 5 — Day 4, 10:00 AM

**Body:**

```
Hey {{contact.first_name}},

I've had a load of messages since the webinar from people asking about the system I use with my students. So let me break it down for you properly, because this is the core of everything.

It's called the 3C System: Credibility, Capital, Cash flow.

Here's how it works:

---

Step 1: Credibility

Before you raise a single pound or sign a single lease, you need to position yourself as someone worth investing in. I'm not talking about faking it or pretending to be something you're not. I'm talking about building a real, credible presence, even if you've never done a property deal in your life. There's a specific process for this, and it takes days, not months.

Step 2: Capital

Once you've got credibility, you can raise capital from investors through the 3C System. This is the bit that blows people's minds. Ihab raised £25k. Andrew raised £13k. Neither of them used their own cash. They followed the system, had the right conversations, and secured funding from people who WANTED to invest. This isn't theory. It's a repeatable process.

Step 3: Cash flow

With capital secured, you launch your first Airbnb using a proven setup process. Sourcing, furnishing, listing, pricing, automation. Everything systematised so you're not running around like a headless chicken. The goal: your first profitable Airbnb generating cash flow within 90 days.

---

That's it. That's the system. Credibility. Capital. Cash flow. In that order.

Every student success story I've shared (Ihab, Dylan, Andrew, Elite Kleans), they all followed this exact framework. Different starting points. Different cities. Same system. Same results.

Here's the thing though: knowing the framework isn't enough. Implementation is where people either fly or fall. And that's exactly what I help with inside the coaching.

---

Two things I'd suggest:

1. Watch the replay if you haven't yet. I go much deeper into each step with real examples: [REPLAY PAGE URL]
2. Book a strategy call if you want to talk through your specific situation and see if this is the right fit: [CALENDLY BOOKING LINK]

The call is just a conversation. I'll ask about your situation, your goals, what's holding you back. If I can help, I'll explain exactly how. If I can't, I'll tell you straight. No games.

Terry
```

---

#### Email C5: Deadline Warning

- **Template Name:** `NOSHOW — Replay Deadline`
- **Subject Line:** Replay comes down tomorrow
- **Preview Text:** This is your last chance to watch it. Not being dramatic — it's actually going.
- **Used In:** Workflow 5 — Day 5, 10:00 AM

**Body:**

```
Hey {{contact.first_name}},

Quick one.

The replay of "The 3C System: How Complete Beginners Are Launching Profitable Airbnbs in 90 Days" comes down tomorrow. After that, it's done.

This was a live training. I shared things on that call that I don't put on YouTube, I don't put on Instagram, I don't share anywhere else. The full 3C System breakdown, real student financials, the exact process for raising capital using the 3C System, and the step-by-step roadmap to launching your first profitable Airbnb in 90 days.

I've had people message me after watching saying it was the most valuable 75 minutes they've spent on their business goals this year.

If you've been meaning to watch it and keep putting it off, today is the day. Seriously.

Watch Before It's Gone: [REPLAY PAGE URL]

Tomorrow it comes down and I won't be sending it again.

Terry
```

---

#### Email C6: Final Call / Breakup

- **Template Name:** `NOSHOW — Final Breakup`
- **Subject Line:** Last one from me. Two options.
- **Preview Text:** This is the final email. Here's where we stand.
- **Used In:** Workflow 5 — Day 6, 10:00 AM

**Body:**

```
Hey {{contact.first_name}},

The replay is down.

The offer from the webinar is closing. And this is the last email I'm sending you about it.

I want to keep it real with you for a second.

You signed up for that webinar because something about your current situation isn't where you want it to be. Maybe you're tired of your 9-5. Maybe you've been wanting to get into property but don't know where to start. Maybe you saw other people building Airbnb income and thought "why not me?"

Whatever it was, that reason hasn't gone away just because you didn't watch the replay.

---

Right now you've got two paths:

Path A: Close this email. Go back to scrolling. Go back to the same routine, the same income, the same "I'll figure it out eventually" energy. Maybe things change on their own. But if you've been saying "one day" for months, you already know how that plays out.

Path B: Take 30 minutes. Get on a strategy call with me. Have a proper conversation about where you are, where you want to be, and whether the 3C System is the right vehicle to get you there.

I've helped complete beginners (students, 9-5 workers, people with no prior property experience) build profitable Airbnb portfolios using the 3C System. Not in theory. In practice. With receipts.

But I can only help people who actually show up.

---

Book Your Strategy Call: [CALENDLY BOOKING LINK]

Even if you missed the replay, the call is the fastest way to get clarity on your next move. I'll walk you through the system, the offer, and help you figure out if this is right for you.

This is the last email from me on this, {{contact.first_name}}. The next move is yours.

Terry Dwobeng
Founder, Property Labs

P.S. Ihab was in your exact position not long ago. Hesitant. Unsure. No property experience. No capital. He booked the call anyway. Five weeks later he had 2 Airbnbs and £25k raised. Dylan was the same. Now he's at £12k a month. The only difference between them and where you are right now is a decision. Book the call: [CALENDLY BOOKING LINK]
```

---

### GROUP D: ABANDONED CART EMAILS (4 Emails)

---

#### Email D1: Did Something Go Wrong?

- **Template Name:** `ABANDONED — Tech Check`
- **Subject Line:** Did something go wrong?
- **Preview Text:** Just checking — your booking didn't go through
- **Used In:** Abandoned Cart Workflow — 30-60 minutes after abandonment

**Body:**

```
Hey {{contact.first_name}},

You were just on our booking page a few minutes ago, and it looks like you didn't finish.

Sometimes links break. Sometimes wifi decides to have a moment. Sometimes your phone rings at the worst possible time. It happens to all of us.

So I'm not going to assume anything. I just want to make sure the tech didn't get in the way.

Here's your link to book a strategy call with me:

[CALENDLY BOOKING LINK]

In case you need a quick reminder, here's what the call covers:

- Where you are right now and what's actually stopping you from launching your first Airbnb
- Whether the 3C System is the right fit for your specific situation
- A clear next step, regardless of whether we work together or not

It's 30 minutes. No prep needed. Just show up and be honest about where you're at.

[CALENDLY BOOKING LINK]

Talk soon,

Terry Dwobeng
```

---

#### Email D2: Objection Handler

- **Template Name:** `ABANDONED — Objection Handler`
- **Subject Line:** I already know what you're thinking
- **Preview Text:** The two things stopping you — and why they shouldn't
- **Used In:** Abandoned Cart Workflow — 24 hours after abandonment

**Body:**

```
Hey {{contact.first_name}},

I noticed you were about to book a call yesterday and didn't.

No judgement. Genuinely. But I've been doing this long enough to know exactly what's going through your head right now. So let me just address it straight up.

---

"I don't have money to invest in coaching right now."

I hear this one a LOT. And I get it. But here's the thing. I built a 14-unit Airbnb portfolio using the 3C System. As a law student at Warwick. The whole point of the 3C System is that you don't need your own capital to start.

Ihab raised £25k and launched 2 Airbnbs in 5 weeks. Andrew raised £13k and now runs 3 units. Neither of them used their own savings. The system teaches you how to raise capital from investors. That's literally Step 2.

The strategy call is free. There's no commitment. No credit card. No "surprise close" at the end. If you like what you hear, great. If you don't, you leave with more clarity than you had before. Either way you win.

"Will this actually work for me though?"

Look, I'm not going to sit here and tell you it works for everyone. It doesn't. It works for people who actually follow the system and put the work in.

But the results speak for themselves. Complete beginners, not property moguls, not trust fund kids, not people with 20 years of experience, are launching profitable Airbnbs in under 90 days using this exact framework. I've watched it happen over and over again.

The call exists so we can figure out whether YOU specifically are a good fit. If you're not, I'll tell you. I don't want people in my programme who aren't going to get results. That helps nobody.

"The timing isn't right."

The call is 30 minutes. That's it. You can take it from your car, your sofa, your lunch break. And if nothing else, you'll walk away knowing exactly what your next move should be, even if that move is waiting.

But I'll be honest with you. "The timing isn't right" is what 90% of people say right before they spend another 6 months doing nothing. At some point you've got to stop waiting for the perfect moment and just make a decision.

---

Here's what I know for certain: the doubt you're feeling right now is the exact same doubt every single one of my successful students felt before they booked the call.

The difference? They booked it anyway.

[CALENDLY BOOKING LINK]

Terry

P.S. I only take a limited number of strategy calls each week. If the slots fill up, you'll have to wait until next week's batch opens.
```

---

#### Email D3: Testimonial Heavy

- **Template Name:** `ABANDONED — Testimonials`
- **Subject Line:** They were exactly where you are right now
- **Preview Text:** Real people who almost didn't book. Here's what happened when they did.
- **Used In:** Abandoned Cart Workflow — 48 hours after abandonment

**Body:**

```
Hey {{contact.first_name}},

I want to introduce you to two people.

They both had something in common: they visited the booking page, hesitated, and almost walked away. Both of them will tell you that booking the call was the turning point.

---

Andrew, UK

Before: Interested in Airbnb but had no idea how to actually get started. No property experience. No capital. Thought he needed to save up for years before he could even think about it.

What changed: Joined the programme, followed the 3C System, and learned how to raise capital from investors instead of waiting to save it himself.

Now: Raised £13,000 in investor capital. Runs 3 Airbnb units. Generating consistent cash flow every single month, using the 3C System.

---

Elite Kleans, UK

Before: Had a cleaning business but wanted a passive income stream on the side. Didn't think Airbnb was realistic without a massive upfront investment.

What changed: Went through the system, launched their first Airbnb using the framework, and set it up for passive management from day one.

Now: Pulling in £2,200 per month in passive income from Airbnb, on top of their existing business. That's money coming in while they sleep.

---

Two completely different starting points. Two completely different backgrounds.

Same system. Same decision.

Every one of them had the exact same hesitation you're feeling right now. They booked the call anyway. And their lives look completely different because of it.

Your turn: [CALENDLY BOOKING LINK]

Terry
```

---

#### Email D4: Final Urgency

- **Template Name:** `ABANDONED — Final Urgency`
- **Subject Line:** Last email from me on this
- **Preview Text:** I'm going to be straight with you
- **Used In:** Abandoned Cart Workflow — 72 hours after abandonment

**Body:**

```
Hey {{contact.first_name}},

This is my last email about booking a call.

I'm not going to chase you. That's not how I move and it's not the kind of relationship I want to start with.

But before I go, I want to be straight with you.

---

You watched the training. You saw the framework. You went to the booking page. Something about what I showed you hit differently, enough for you to take those steps.

And then you stopped.

I don't know your reason. Maybe it's money. Maybe it's timing. Maybe it's fear. All of those are valid. But none of them change the maths.

Here's the guarantee: Your first profitable Airbnb in 90 days. That's not a slogan. That's the actual promise. If you join, follow the 3C System, and put in the work, you'll have a cash-flowing Airbnb within 90 days. I've watched it happen with Ihab (5 weeks), Dylan (3 months, now £12k/month), Andrew (3 units, £13k raised), and dozens more.

Here's the reality: Three months from now, you'll either have your first Airbnb generating income while you sleep, or you'll still be where you are right now. Same job. Same income. Same "I'll do it one day" energy. Same scroll.

The only difference between those two futures is a decision.

And that decision starts with a 30-minute call.

---

Book your strategy call: [CALENDLY BOOKING LINK]

Or don't. But make a decision either way. The worst thing you can do is sit in the middle and do nothing. That's where dreams go to die.

This is the last time I'll reach out about this. Whatever you decide, I respect it.

Terry Dwobeng
Founder, Property Labs

P.S. I built a 14-unit portfolio hitting £50k/month in revenue (£16k/month profit) at peak as a law student at Warwick using the 3C System. I'm not telling you that to flex. I'm telling you because every single one of my students had the same doubts you have right now. The ones who booked the call are building portfolios. The ones who didn't are still thinking about it. Book the call: [CALENDLY BOOKING LINK]
```

---

### GROUP E: CALL BOOKED EMAILS (2 Emails)

---

#### Email E1: Booking Confirmation

- **Template Name:** `CALL — Booking Confirmation`
- **Subject Line:** You're booked! Here's how to prepare for your Strategy Call
- **Preview Text:** Your Strategy Call details + how to get the most out of it
- **Used In:** Workflow 6 (Call Booked) — immediately on booking

**Body:**

```
{{contact.first_name}},

Your Strategy Call is locked in.

Date: [CALL DATE — pulled from Calendly webhook or enter manually]
Time: [CALL TIME]
Where: Zoom — [ZOOM LINK]

What to expect:
- We'll look at where you are right now (experience, capital, goals)
- I'll map out which tier of the programme fits you best
- You'll leave with a clear next step, whether you join or not

This is a real conversation, not a sales pitch. Come with your questions. Come ready to be honest about where you are.

See you on the call,
Terry
```

---

#### Email E2: Day-Before Prep

- **Template Name:** `CALL — Day Before Prep`
- **Subject Line:** Tomorrow — quick prep for your Strategy Call
- **Preview Text:** 3 things to think about before we chat
- **Used In:** Workflow 6 — 1 day before call, 9:00 AM

**Body:**

```
{{contact.first_name}},

Quick heads up. Your Strategy Call with me is tomorrow.

To make sure we get the most out of our 30 minutes, here's a short prep checklist:

1. Think about your current situation (savings, experience, goals)
2. Have an idea of which tier interests you (£500 - £5,000)
3. Be ready to be honest. I can only help if I know where you really are

Zoom: [ZOOM LINK]

See you tomorrow.

— Terry
```

---

### GROUP F: POST-CALL EMAILS (4 Emails)

---

#### Email F1: Welcome — Closed Won

- **Template Name:** `POSTCALL — Welcome Closed Won`
- **Subject Line:** Welcome to Property Labs — let's get you started
- **Preview Text:** You've made the decision. Here's what happens next.
- **Used In:** Workflow 7 (Post-Call Handler) — when stage changed to "Closed Won"

**Body:**

```
{{contact.first_name}},

Welcome to Property Labs. You've made the decision. Now let's execute.

Here's what happens next:
1. You'll get access to your programme materials within 24 hours
2. I'll be in touch personally to kick off your onboarding
3. We start working on your 90-day plan immediately

The guarantee is live from today: your first profitable Airbnb in 90 days.

Let's go.

— Terry
```

---

#### Email F2: Closed Lost — Door's Open

- **Template Name:** `POSTCALL — Closed Lost`
- **Subject Line:** Quick message from Terry
- **Preview Text:** No hard feelings — and the door's always open
- **Used In:** Workflow 7 — 3 days after stage changed to "Closed Lost"

**Body:**

```
{{contact.first_name}},

Thanks for taking the time to chat.

I get it. The timing might not be right, or it might not be the right fit. No pressure from me.

But if anything changes, or if you just want to ask a question down the line, reply to this email. I read everything.

In the meantime, keep learning. The Airbnb opportunity isn't going anywhere.

— Terry
```

---

#### Email F3: Call No-Show — Reschedule

- **Template Name:** `POSTCALL — Call No Show`
- **Subject Line:** We missed each other — let's rebook
- **Preview Text:** No worries about the call — grab another time
- **Used In:** Workflow 7 — 1 day after stage changed to "No Show" (call no-show)

**Body:**

```
{{contact.first_name}},

No worries about missing the call. Things come up.

But I'd hate for you to lose momentum. The people who book and show up are the ones who end up like Ihab, Dylan, and Andrew.

Grab another time here: [CALENDLY BOOKING LINK]

— Terry
```

---

#### Email F4: Call No-Show — Last Attempt

- **Template Name:** `POSTCALL — Call No Show Last Attempt`
- **Subject Line:** Last shout — want to rebook?
- **Preview Text:** Final chance to grab a Strategy Call slot
- **Used In:** Workflow 7 — 4 days after stage changed to "No Show" (call no-show)

**Body:**

```
{{contact.first_name}},

This is my last message about rescheduling.

I know life gets busy. But if you're still serious about launching your first Airbnb, the Strategy Call is the fastest way to get a clear plan.

Grab a time: [CALENDLY BOOKING LINK]

If I don't hear from you, no worries. The door's always open if you want to come back later.

— Terry
```

---

### GROUP G: FOLLOW-UP NEEDED EMAILS (2 Emails)

---

#### Email G1: Follow-Up After Call

- **Template Name:** `POSTCALL — Follow Up 1`
- **Subject Line:** Following up on our chat
- **Preview Text:** Wanted to share a few things after our call
- **Used In:** Workflow 7 — immediately when stage changed to "Follow Up Needed"

**Body:**

```
{{contact.first_name}},

Good chatting with you earlier.

I wanted to follow up with a few things we discussed:

- The 3C System breakdown and how it applies to your specific situation
- The tier I recommended based on where you are right now
- The 90-day guarantee: your first profitable Airbnb or we keep working together

Take some time to think it over. No rush. But if you've got questions, reply to this email. I'm here.

— Terry
```

---

#### Email G2: Second Follow-Up

- **Template Name:** `POSTCALL — Follow Up 2`
- **Subject Line:** Still thinking it over?
- **Preview Text:** Just checking in — no pressure
- **Used In:** Workflow 7 — 2 days after stage changed to "Follow Up Needed"

**Body:**

```
{{contact.first_name}},

Just circling back from our call the other day.

I know these decisions take time, and I respect that. But I also know that the longer you sit on it, the easier it is to talk yourself out of something that could genuinely change your financial situation.

If you've got lingering questions or concerns, hit reply. I'd rather address them head on than have you wonder.

The offer we discussed is still available, but I can't guarantee it will be for much longer.

— Terry
```

---

## PHASE 6: SMS TEMPLATES (16 SMS)

> Go to **Marketing** > **Templates** > **SMS** (or create inline within workflows)
> All SMS should use the sender number purchased in Phase 1.
> GHL merge field syntax: `{{contact.first_name}}`

---

### GROUP A: PRE-WEBINAR SMS (6 SMS)

---

#### SMS A1: Registration Confirmation

- **Template Name:** `PRE-SMS — Registration Confirmation`
- **Character Count:** ~145
- **Workflow:** Workflow 1 (Registration Trigger)
- **Timing:** Immediately on registration

```
Hey {{contact.first_name}}, it's Terry. You're locked in for the live Airbnb training on Monday, April 13th at 7:00 PM BST. Save this link: [WEBINAR JOIN LINK] — Terry
```

---

#### SMS A2: 24-Hour Reminder

- **Template Name:** `PRE-SMS — 24hr Reminder`
- **Character Count:** ~155
- **Workflow:** Workflow 2 (Pre-Webinar Sequence)
- **Timing:** Sunday, April 12 at 7:00 PM BST

```
{{contact.first_name}}, tomorrow I'm showing you how complete beginners are launching profitable Airbnbs in 90 days. You won't want to miss this. [WEBINAR JOIN LINK] — Terry
```

---

#### SMS A3: 2-Hour Reminder

- **Template Name:** `PRE-SMS — 2hr Reminder`
- **Character Count:** ~115
- **Workflow:** Workflow 2
- **Timing:** Monday, April 13 at 5:00 PM BST

```
{{contact.first_name}}, we go live in 2 hours. Grab a pen and notebook, this is a working session. Join here: [WEBINAR JOIN LINK] — Terry
```

---

#### SMS A4: 30-Minute Reminder

- **Template Name:** `PRE-SMS — 30min Reminder`
- **Character Count:** ~95
- **Workflow:** Workflow 2
- **Timing:** Monday, April 13 at 6:30 PM BST

```
30 mins, {{contact.first_name}}. The room opens soon, click this link and have it ready: [WEBINAR JOIN LINK] — Terry
```

---

#### SMS A5: We're LIVE

- **Template Name:** `PRE-SMS — Were Live`
- **Character Count:** ~45
- **Workflow:** Workflow 2
- **Timing:** Monday, April 13 at 6:55 PM BST (5 minutes before)

```
We're LIVE. Get in now: [WEBINAR JOIN LINK] — Terry
```

---

#### SMS A6: Post-Webinar Replay

- **Template Name:** `PRE-SMS — Post Webinar Replay`
- **Character Count:** ~140
- **Workflow:** Workflow 2
- **Timing:** Monday, April 13 at 9:00 PM BST (1 hour after webinar ends)

```
{{contact.first_name}}, the live training just ended. I saved the replay for you but it comes down in 48hrs. Watch it here: [REPLAY PAGE URL] — Terry
```

---

### GROUP B: POST-ATTENDEE SMS (3 SMS)

---

#### SMS B1: Replay + Call CTA

- **Template Name:** `ATTENDEE-SMS — Replay + CTA`
- **Character Count:** ~210
- **Workflow:** Workflow 4
- **Timing:** 30 minutes after webinar ends

```
Hey {{contact.first_name}}, it's Terry Dwobeng from Property Labs. Thanks for showing up tonight. The replay is live here: [REPLAY PAGE URL] (comes down in 48hrs). If you're serious about launching your first Airbnb, book your free strategy call: [CALENDLY BOOKING LINK]
```

---

#### SMS B2: Case Study

- **Template Name:** `ATTENDEE-SMS — Case Study`
- **Character Count:** ~230
- **Workflow:** Workflow 4
- **Timing:** Day 3, 2:00 PM

```
{{contact.first_name}}, Ihab raised £25k in 5 weeks and launched 2 Airbnbs. Dylan hit £12k in one month. Andrew did it as a student. All followed the same system I showed you on the webinar. If you want the same results, book your strategy call before spots fill: [CALENDLY BOOKING LINK] — Terry Dwobeng
```

---

#### SMS B3: Last Chance

- **Template Name:** `ATTENDEE-SMS — Last Chance`
- **Character Count:** ~175
- **Workflow:** Workflow 4
- **Timing:** Day 5, 2:00 PM

```
{{contact.first_name}}, real talk, strategy call spots from the webinar are almost gone. This is your shot to get a clear plan for your first profitable Airbnb in 90 days. Don't overthink it: [CALENDLY BOOKING LINK] — Terry Dwobeng
```

---

### GROUP C: NO-SHOW SMS (3 SMS)

---

#### SMS C1: Replay Available

- **Template Name:** `NOSHOW-SMS — Replay Available`
- **Character Count:** ~130
- **Workflow:** Workflow 5
- **Timing:** 1-2 hours after webinar ends

```
{{contact.first_name}}, you missed the Airbnb webinar but I saved the replay for you. Watch it before it comes down: [REPLAY PAGE URL] — Terry
```

---

#### SMS C2: Replay Deadline

- **Template Name:** `NOSHOW-SMS — Replay Deadline`
- **Character Count:** ~145
- **Workflow:** Workflow 5
- **Timing:** Day 5

```
{{contact.first_name}}, the webinar replay comes down tomorrow. Last chance to watch how complete beginners are launching profitable Airbnbs in 90 days: [REPLAY PAGE URL] — Terry
```

---

#### SMS C3: Call CTA (Post-Replay)

- **Template Name:** `NOSHOW-SMS — Call CTA`
- **Character Count:** ~140
- **Workflow:** Workflow 5
- **Timing:** Day 6

```
{{contact.first_name}}, replay is gone but you can still book a free strategy call with me. Let's talk about getting your first Airbnb launched: [CALENDLY BOOKING LINK] — Terry
```

---

### GROUP D: ABANDONED CART SMS (1 SMS)

---

#### SMS D1: Booking Didn't Go Through

- **Template Name:** `ABANDONED-SMS — Tech Check`
- **Character Count:** ~115
- **Workflow:** Abandoned Cart Workflow
- **Timing:** 30-60 minutes after abandonment

```
{{contact.first_name}}, looks like your booking didn't go through! Here's the link to grab your free strategy call: [CALENDLY BOOKING LINK] — Terry
```

---

### GROUP E: CALL BOOKED SMS (4 SMS)

---

#### SMS E1: Booking Confirmation

- **Template Name:** `CALL-SMS — Confirmation`
- **Character Count:** ~155
- **Workflow:** Workflow 6
- **Timing:** Immediately on booking

```
Strategy Call confirmed! {{contact.first_name}}, you're booked for your call with Terry. Check your email for the Zoom link and details. See you there — Terry
```

---

#### SMS E2: Day-Before Reminder

- **Template Name:** `CALL-SMS — Day Before`
- **Character Count:** ~120
- **Workflow:** Workflow 6
- **Timing:** 1 day before call, 9:00 AM

```
Reminder: your Strategy Call with Terry is tomorrow. Come with your questions! Check your email for the Zoom link. — Terry
```

---

#### SMS E3: 2-Hour Reminder

- **Template Name:** `CALL-SMS — 2hr Reminder`
- **Character Count:** ~80
- **Workflow:** Workflow 6
- **Timing:** 2 hours before call

```
2 hours until your Strategy Call with Terry! Check your email for the Zoom link.
```

---

#### SMS E4: 15-Minute Reminder

- **Template Name:** `CALL-SMS — 15min Reminder`
- **Character Count:** ~85
- **Workflow:** Workflow 6
- **Timing:** 15 minutes before call

```
Starting in 15 mins, {{contact.first_name}}! Check your email for the Zoom link. See you in there!
```

---

### GROUP F: POST-CALL SMS (2 SMS)

---

#### SMS F1: Welcome — Closed Won

- **Template Name:** `POSTCALL-SMS — Welcome`
- **Character Count:** ~130
- **Workflow:** Workflow 7
- **Timing:** Immediately when stage = Closed Won

```
Welcome to Property Labs, {{contact.first_name}}! I'll be in touch within 24hrs to get you started. This is where it begins. — Terry
```

---

#### SMS F2: Call No-Show — Reschedule

- **Template Name:** `POSTCALL-SMS — No Show Reschedule`
- **Character Count:** ~120
- **Workflow:** Workflow 7
- **Timing:** 1 hour after call was supposed to happen

```
Hey {{contact.first_name}}, looks like we missed each other! Want to reschedule? [CALENDLY BOOKING LINK] — Terry
```

---

#### SMS F3: Follow-Up Nudge

- **Template Name:** `POSTCALL-SMS — Follow Up Nudge`
- **Character Count:** ~115
- **Workflow:** Workflow 7
- **Timing:** 5 days after stage = Follow Up Needed

```
Hey {{contact.first_name}}, just circling back. Any questions since our chat? Happy to help. — Terry
```

---

## PHASE 7: BUILD WORKFLOWS (7 Workflows)

> Go to **Automation** > **Workflows** > **+ Create Workflow** > **Start from Scratch**

---

### WORKFLOW 1: Registration Trigger

**Workflow Name:** `WF1 — Registration Trigger`
**Folder:** Property Labs Webinar

| Step # | Type | Configuration |
|--------|------|--------------|
| 1 | **TRIGGER** | **Type:** Form Submitted / Webhook (Inbound) — "Registration Form" |
| 2 | **Action: Create/Update Opportunity** | Pipeline: "Property Labs Webinar Funnel" / Stage: "Registered" |
| 3 | **Action: Add Tag** | Tag: `webinar-registered` |
| 4 | **Action: Update Custom Field** | Field: `webinar_registration_date` / Value: `{{current_date}}` |
| 5 | **Action: Update Custom Field** | Field: `utm_source` / Value: `{{trigger.utm_source}}` |
| 6 | **Action: Update Custom Field** | Field: `utm_medium` / Value: `{{trigger.utm_medium}}` |
| 7 | **Action: Update Custom Field** | Field: `utm_campaign` / Value: `{{trigger.utm_campaign}}` |
| 8 | **Action: Update Custom Field** | Field: `utm_content` / Value: `{{trigger.utm_content}}` |
| 9 | **Action: Send Email** | Template: `PRE — Registration Confirmation` |
| 10 | **Action: Send SMS** | Template: `PRE-SMS — Registration Confirmation` |
| 11 | **Action: Wait** | Duration: 5 minutes |
| 12 | **Action: Add to Workflow** | Workflow: `WF2 — Pre-Webinar Reminder Sequence` |

**GHL Click Path:**
1. Automation > Workflows > + Create Workflow > Start from Scratch
2. Click "Add New Trigger" > Select "Form Submitted" (or "Inbound Webhook" if using external registration page)
3. For each step below the trigger, click the **+** button to add an action
4. For "Create/Update Opportunity": Search "Create Opportunity" in the action list > Select pipeline and stage
5. For "Add Tag": Search "Add Contact Tag" > Type `webinar-registered`
6. For "Update Custom Field": Search "Update Contact Field" > Select field from dropdown > Enter value
7. For "Send Email": Search "Send Email" > Choose template from library
8. For "Send SMS": Search "Send SMS" > Choose template from library
9. For "Wait": Search "Wait" > Set to 5 minutes
10. For "Add to Workflow": Search "Add to Workflow" > Select WF2

---

### WORKFLOW 2: Pre-Webinar Reminder Sequence

**Workflow Name:** `WF2 — Pre-Webinar Reminder Sequence`
**Folder:** Property Labs Webinar

| Step # | Type | Configuration |
|--------|------|--------------|
| 1 | **TRIGGER** | **Type:** Added to Workflow (enrolled by WF1) |
| 2 | **Action: Wait** | Wait until: **Friday, April 10, 2026 at 10:00 AM BST** |
| 3 | **Action: Send Email** | Template: `PRE — 24hr Reminder` (Note: this is the "3 days out" anticipation email — reuse the 24hr reminder template with the Ihab/Dylan story or create a separate "3 days out" version. The 24hr reminder template content works for both days.) |
| 4 | **Action: Send SMS** | Message: `3 days until the Airbnb training, {{contact.first_name}}. Monday is going to be big. [WEBINAR JOIN LINK] — Terry` |
| 5 | **Action: Wait** | Wait until: **Sunday, April 12, 2026 at 7:00 PM BST** |
| 6 | **Action: Send Email** | Template: `PRE — 24hr Reminder` |
| 7 | **Action: Send SMS** | Template: `PRE-SMS — 24hr Reminder` |
| 8 | **Action: Wait** | Wait until: **Monday, April 13, 2026 at 3:00 PM BST** |
| 9 | **Action: Send Email** | Subject: "4 hours until we go live" / Body: (see GHL Blueprints — 4hr email content below) |
| 10 | **Action: Wait** | Wait until: **Monday, April 13, 2026 at 5:00 PM BST** |
| 11 | **Action: Send SMS** | Template: `PRE-SMS — 2hr Reminder` |
| 12 | **Action: Wait** | Wait until: **Monday, April 13, 2026 at 6:00 PM BST** |
| 13 | **Action: Send Email** | Template: `PRE — 1hr Reminder` |
| 14 | **Action: Send SMS** | Message: `1 hour! Training starts at 7:00 PM. Grab your spot: [WEBINAR JOIN LINK] — Terry` |
| 15 | **Action: Wait** | Wait until: **Monday, April 13, 2026 at 6:30 PM BST** |
| 16 | **Action: Send SMS** | Template: `PRE-SMS — 30min Reminder` |
| 17 | **Action: Wait** | Wait until: **Monday, April 13, 2026 at 6:45 PM BST** |
| 18 | **Action: Send Email** | Template: `PRE — 15min Reminder` |
| 19 | **Action: Wait** | Wait until: **Monday, April 13, 2026 at 6:55 PM BST** |
| 20 | **Action: Send SMS** | Template: `PRE-SMS — Were Live` |
| 21 | **Action: Wait** | Wait until: **Monday, April 13, 2026 at 9:00 PM BST** (1 hour post-webinar) |
| 22 | **Action: Send Email** | Template: `PRE — Post-Webinar Replay` |
| 23 | **Action: Send SMS** | Template: `PRE-SMS — Post Webinar Replay` |

**4-Hour Reminder Email Body (for Step 9 — create as template `PRE — 4hr Reminder`):**

- **Template Name:** `PRE — 4hr Reminder`
- **Subject Line:** 4 hours until we go live
- **Preview Text:** Here's what I'm covering tonight — don't miss it

```
{{contact.first_name}}, we go live in 4 hours.

Here's what I'll cover:
- How to build credibility with landlords (even with no prior experience)
- How to raise capital for your first Airbnb (using investor capital through the 3C System)
- The cash flow model that makes each unit profitable from month 1

This is the session that changes things. Don't miss it.

[WEBINAR JOIN LINK]

— Terry
```

> NOTE: This brings the Pre-Webinar email count to 6 (adding the 4hr reminder). Total email count across all workflows: 28.

---

### WORKFLOW 3: Webinar Attendance Webhook Handler

**Workflow Name:** `WF3 — Webinar Attendance Handler`
**Folder:** Property Labs Webinar

| Step # | Type | Configuration |
|--------|------|--------------|
| 1 | **TRIGGER** | **Type:** Inbound Webhook — URL provided by GHL (copy this URL and paste into WebinarJam/Demio/Zoom webhook settings) |
| 2 | **Action: Contact Lookup** | Match by: Email (from webhook payload `{{webhook.email}}`) |
| 3 | **Action: Remove from Workflow** | Remove from: `WF2 — Pre-Webinar Reminder Sequence` |
| 4 | **Action: Add Tag** | Tag: `webinar-attended` |
| 5 | **Action: Remove Tag** | Tag: `webinar-registered` |
| 6 | **Action: Update Opportunity** | Pipeline: "Property Labs Webinar Funnel" / Move to Stage: "Attended" |
| 7 | **Action: Update Custom Field** | Field: `webinar_attended` / Value: `Yes` |
| 8 | **Action: Update Custom Field** | Field: `webinar_watch_time` / Value: `{{webhook.watch_time}}` (if available from webhook) |
| 9 | **Action: Wait** | Duration: 30 seconds |
| 10 | **Action: Add to Workflow** | Workflow: `WF4 — Post-Webinar Attendee Sequence` |

---

### WORKFLOW 4: Post-Webinar Attendee Sequence

**Workflow Name:** `WF4 — Post-Webinar Attendee Sequence`
**Folder:** Property Labs Webinar

**Exit Condition (set at workflow level):** If contact tag `call-booked` is added at any point, remove from workflow immediately.

> In GHL: Click the workflow settings gear icon > Workflow Settings > Add "Remove contact when" > Condition: Tag = `call-booked`

| Step # | Type | Configuration |
|--------|------|--------------|
| 1 | **TRIGGER** | **Type:** Added to Workflow (enrolled by WF3) |
| 2 | **Action: Wait** | Wait until: **Monday, April 13, 2026 at 8:30 PM BST** (30 min post-webinar) |
| 3 | **Action: Send Email** | Template: `ATTENDEE — Recap + Book Call` |
| 4 | **Action: Send SMS** | Template: `ATTENDEE-SMS — Replay + CTA` |
| 5 | **Action: Wait** | Duration: 1 day |
| 6 | **If/Else Condition** | IF: Custom Field `call_booked` = `Yes` → Go to END. ELSE: Continue |
| 7 | **Action: Send Email** | Template: `ATTENDEE — You Dont Need Money` |
| 8 | **Action: Wait** | Duration: 1 day |
| 9 | **If/Else Condition** | IF: Custom Field `call_booked` = `Yes` → Go to END. ELSE: Continue |
| 10 | **Action: Send Email** | Template: `ATTENDEE — Case Studies` |
| 11 | **Action: Send SMS** | Template: `ATTENDEE-SMS — Case Study` |
| 12 | **Action: Wait** | Duration: 1 day |
| 13 | **If/Else Condition** | IF: Custom Field `call_booked` = `Yes` → Go to END. ELSE: Continue |
| 14 | **Action: Send Email** | Template: `ATTENDEE — FAQ Objections` |
| 15 | **Action: Send SMS** | Template: `ATTENDEE-SMS — Last Chance` |
| 16 | **Action: Wait** | Duration: 2 days |
| 17 | **If/Else Condition** | IF: Custom Field `call_booked` = `Yes` → Go to END. ELSE: Continue |
| 18 | **Action: Send Email** | Template: `ATTENDEE — Last Chance Urgency` |
| 19 | **Action: Wait** | Duration: 2 days |
| 20 | **If/Else Condition** | IF: Custom Field `call_booked` = `Yes` → Go to END. ELSE: Continue |
| 21 | **Action: Send Email** | Template: `ATTENDEE — Breakup` |
| 22 | **Action: Add Tag** | Tag: `sequence-completed-attendee` |

**How to build If/Else in GHL:**
1. Click **+** to add action > search "If/Else"
2. Click **+ Add Condition**
3. Select **Contact Custom Field** > Field: `call_booked` > Operator: `is` > Value: `Yes`
4. In the **If Yes** branch: Add action "End This Workflow" (or "Remove from Workflow")
5. In the **If No** branch: Continue with the next email/action

---

### WORKFLOW 5: No-Show Recovery Sequence

**Workflow Name:** `WF5 — No-Show Recovery Sequence`
**Folder:** Property Labs Webinar

**Exit Condition (set at workflow level):** If contact tag `call-booked` is added, remove from workflow.

| Step # | Type | Configuration |
|--------|------|--------------|
| 1 | **TRIGGER** | **Type:** Tag Added = `webinar-noshow` (this tag is applied by a scheduled action — see note below) |
| 2 | **Action: Add Tag** | Tag: `replay-sent` |
| 3 | **Action: Update Opportunity** | Pipeline: "Property Labs Webinar Funnel" / Move to Stage: "No Show" |
| 4 | **Action: Wait** | Duration: 1 hour |
| 5 | **Action: Send Email** | Template: `NOSHOW — Missed It + Replay` |
| 6 | **Action: Send SMS** | Template: `NOSHOW-SMS — Replay Available` |
| 7 | **Action: Wait** | Duration: 1 day |
| 8 | **Action: Send Email** | Template: `NOSHOW — Highlight Reel FOMO` |
| 9 | **Action: Wait** | Duration: 1 day |
| 10 | **Action: Send Email** | Template: `NOSHOW — Social Proof Urgency` |
| 11 | **Action: Wait** | Duration: 1 day |
| 12 | **Action: Send Email** | Template: `NOSHOW — 3C System Explained` |
| 13 | **Action: Wait** | Duration: 1 day |
| 14 | **Action: Send Email** | Template: `NOSHOW — Replay Deadline` |
| 15 | **Action: Send SMS** | Template: `NOSHOW-SMS — Replay Deadline` |
| 16 | **Action: Wait** | Duration: 1 day |
| 17 | **Action: Send Email** | Template: `NOSHOW — Final Breakup` |
| 18 | **Action: Send SMS** | Template: `NOSHOW-SMS — Call CTA` |
| 19 | **Action: Add Tag** | Tag: `sequence-completed-noshow` |

**How to detect no-shows (trigger the `webinar-noshow` tag):**

You need to create a separate small workflow or use a GHL scheduled action:

1. Create a new workflow: `WF5a — No-Show Detector`
2. **Trigger:** Date/Time Based > Run on **Monday, April 13, 2026 at 10:00 PM BST** (2 hours after webinar ends)
3. **Filter:** Contact has tag `webinar-registered` AND does NOT have tag `webinar-attended`
4. **Action:** Add Tag > `webinar-noshow`

This will trigger WF5 for all no-shows.

---

### WORKFLOW 6: Call Booked + Reminders

**Workflow Name:** `WF6 — Call Booked + Reminders`
**Folder:** Property Labs Webinar

| Step # | Type | Configuration |
|--------|------|--------------|
| 1 | **TRIGGER** | **Type:** Inbound Webhook (from Calendly — `invitee.created` event) or Appointment Booked (if using GHL Calendar) |
| 2 | **Action: Contact Lookup** | Match by: Email (`{{webhook.invitee_email}}` or `{{appointment.email}}`) |
| 3 | **Action: Add Tag** | Tag: `call-booked` |
| 4 | **Action: Update Opportunity** | Pipeline: "Property Labs Webinar Funnel" / Move to Stage: "Call Booked" |
| 5 | **Action: Update Custom Field** | Field: `call_booked` / Value: `Yes` |
| 6 | **Action: Update Custom Field** | Field: `call_booked_date` / Value: `{{webhook.event_start_time}}` or `{{appointment.start_time}}` |
| 7 | **Action: Assign User** | Assign to: Terry Dwobeng |
| 8 | **Action: Internal Notification** | Send notification to Terry: "New Strategy Call booked by {{contact.first_name}} {{contact.last_name}} on {{contact.call_booked_date}}" |
| 9 | **Action: Send Email** | Template: `CALL — Booking Confirmation` |
| 10 | **Action: Send SMS** | Template: `CALL-SMS — Confirmation` |
| 11 | **Action: Wait** | Wait until: 1 day before appointment at 9:00 AM |
| 12 | **If/Else Condition** | IF: Custom Field `call_showed` = `Yes` → END. ELSE: Continue |
| 13 | **Action: Send SMS** | Template: `CALL-SMS — Day Before` |
| 14 | **Action: Send Email** | Template: `CALL — Day Before Prep` |
| 15 | **Action: Wait** | Wait until: 2 hours before appointment time |
| 16 | **If/Else Condition** | IF: Custom Field `call_showed` = `Yes` → END. ELSE: Continue |
| 17 | **Action: Send SMS** | Template: `CALL-SMS — 2hr Reminder` |
| 18 | **Action: Wait** | Wait until: 15 minutes before appointment time |
| 19 | **Action: Send SMS** | Template: `CALL-SMS — 15min Reminder` |

**GHL Configuration Notes for Wait Steps:**
- For "Wait until X before appointment": In GHL, use "Wait" > "Until date/time in custom field" > Select `call_booked_date` > Offset: subtract 1 day / 2 hours / 15 minutes respectively
- If GHL doesn't support offset from custom field dates, use "Wait for event" > "Before appointment" > Set interval

---

### WORKFLOW 7: Post-Call Handler

**Workflow Name:** `WF7 — Post-Call Handler`
**Folder:** Property Labs Webinar

| Step # | Type | Configuration |
|--------|------|--------------|
| 1 | **TRIGGER** | **Type:** Pipeline Stage Changed — Pipeline: "Property Labs Webinar Funnel" |
| 2 | **If/Else Branch** | Check which stage the contact was moved to: |

**BRANCH A: Stage = "Closed Won"**

| Step # | Type | Configuration |
|--------|------|--------------|
| A1 | **Action: Add Tag** | Tag: `client-won` |
| A2 | **Action: Update Custom Field** | Field: `purchase_date` / Value: `{{current_date}}` |
| A3 | **Action: Send Email** | Template: `POSTCALL — Welcome Closed Won` |
| A4 | **Action: Send SMS** | Template: `POSTCALL-SMS — Welcome` |

**BRANCH B: Stage = "Closed Lost"**

| Step # | Type | Configuration |
|--------|------|--------------|
| B1 | **Action: Add Tag** | Tag: `lost` |
| B2 | **Action: Wait** | Duration: 3 days |
| B3 | **Action: Send Email** | Template: `POSTCALL — Closed Lost` |

**BRANCH C: Stage = "No Show" (Call No-Show — set manually by Terry when contact misses call)**

| Step # | Type | Configuration |
|--------|------|--------------|
| C1 | **Action: Add Tag** | Tag: `call-noshow` |
| C2 | **Action: Wait** | Duration: 1 hour |
| C3 | **Action: Send SMS** | Template: `POSTCALL-SMS — No Show Reschedule` |
| C4 | **Action: Wait** | Duration: 1 day |
| C5 | **Action: Send Email** | Template: `POSTCALL — Call No Show` |
| C6 | **Action: Wait** | Duration: 3 days |
| C7 | **Action: Send Email** | Template: `POSTCALL — Call No Show Last Attempt` |

**BRANCH D: Stage moved to "Call Completed" → then manually moved to a custom "Follow Up Needed" status (or use a tag-based approach)**

| Step # | Type | Configuration |
|--------|------|--------------|
| D1 | **Action: Add Tag** | Tag: `needs-followup` |
| D2 | **Action: Create Task** | Title: "Follow up with {{contact.first_name}} {{contact.last_name}}" / Assign to: Terry / Due: 48 hours |
| D3 | **Action: Send Email** | Template: `POSTCALL — Follow Up 1` |
| D4 | **Action: Wait** | Duration: 2 days |
| D5 | **Action: Send Email** | Template: `POSTCALL — Follow Up 2` |
| D6 | **Action: Wait** | Duration: 3 days |
| D7 | **Action: Send SMS** | Template: `POSTCALL-SMS — Follow Up Nudge` |

**How to build the If/Else branching in GHL:**
1. After the trigger, add an **If/Else** action
2. First condition: Pipeline Stage `is` "Closed Won" → add Branch A steps
3. Click **Add Condition** (or **Else If**): Pipeline Stage `is` "Closed Lost" → add Branch B steps
4. Click **Add Condition**: Pipeline Stage `is` "No Show" → add Branch C steps
5. **Else** (default): This catches "Proposal Sent" or other stages → you can add Branch D steps here or create an additional condition for "Call Completed"

---

### WORKFLOW 8: Abandoned Cart / Abandoned Booking (Bonus Workflow)

**Workflow Name:** `WF8 — Abandoned Booking Recovery`
**Folder:** Property Labs Webinar

**Exit Condition:** If contact tag `call-booked` is added, remove from workflow.

| Step # | Type | Configuration |
|--------|------|--------------|
| 1 | **TRIGGER** | **Type:** Page Visited — URL contains `calendly.com/terry` (or your Calendly page URL). Alternative: Use a GHL Trigger Link or UTM-tracked link that fires when the booking page is visited. |
| 2 | **Action: Wait** | Duration: 30 minutes |
| 3 | **If/Else Condition** | IF: Custom Field `call_booked` = `Yes` → END. ELSE: Continue (they visited but didn't book) |
| 4 | **Action: Add Tag** | Tag: `abandoned-booking` |
| 5 | **Action: Wait** | Duration: 30 minutes |
| 6 | **Action: Send Email** | Template: `ABANDONED — Tech Check` |
| 7 | **Action: Send SMS** | Template: `ABANDONED-SMS — Tech Check` |
| 8 | **Action: Wait** | Duration: 24 hours |
| 9 | **If/Else Condition** | IF: Custom Field `call_booked` = `Yes` → END. ELSE: Continue |
| 10 | **Action: Send Email** | Template: `ABANDONED — Objection Handler` |
| 11 | **Action: Wait** | Duration: 24 hours |
| 12 | **If/Else Condition** | IF: Custom Field `call_booked` = `Yes` → END. ELSE: Continue |
| 13 | **Action: Send Email** | Template: `ABANDONED — Testimonials` |
| 14 | **Action: Wait** | Duration: 24 hours |
| 15 | **If/Else Condition** | IF: Custom Field `call_booked` = `Yes` → END. ELSE: Continue |
| 16 | **Action: Send Email** | Template: `ABANDONED — Final Urgency` |
| 17 | **Action: Remove Tag** | Tag: `abandoned-booking` |
| 18 | **Action: Add Tag** | Tag: `abandoned-booking-completed` |

---

## PHASE 8: WEBHOOK SETUP

### 8.1: WebinarJam / Demio / Zoom → GHL (Attendance Tracking)

**Purpose:** When a registrant joins the live webinar, trigger WF3 to mark them as attended.

**Setup in GHL:**
1. Go to **Automation** > **Workflows** > Open `WF3 — Webinar Attendance Handler`
2. Click on the **Trigger** step
3. Copy the **Inbound Webhook URL** displayed (format: `https://services.leadconnectorhq.com/hooks/[LOCATION_ID]/[WEBHOOK_KEY]`)

**Setup in WebinarJam:**
1. Go to **Integrations** > **Webhooks** > **Add Webhook**
2. Event: `Attendee Joined` (or `registrant.attended`)
3. URL: Paste the GHL webhook URL from above
4. Test the webhook with a test event

**Field Mapping:**
| WebinarJam Field | GHL Contact Field |
|-----------------|-------------------|
| `attendee_email` | Contact Email (used for lookup) |
| `attendee_name` | Contact Name |
| `watch_time` | Custom Field: `webinar_watch_time` |
| `joined_at` | (informational — logged in webhook data) |

### 8.2: Calendly → GHL (Call Booking)

**Purpose:** When someone books a Strategy Call, trigger WF6.

**Setup in GHL:**
1. Go to **Automation** > **Workflows** > Open `WF6 — Call Booked + Reminders`
2. Click on the **Trigger** step
3. Copy the **Inbound Webhook URL**

**Setup in Calendly:**
1. Go to **Integrations** > **Webhooks** > **Add Webhook Subscription**
2. Event: `invitee.created`
3. URL: Paste the GHL webhook URL
4. Signing key: (optional — copy if provided for verification)

**Field Mapping:**
| Calendly Field | GHL Contact Field |
|---------------|-------------------|
| `invitee.email` | Contact Email (lookup) |
| `invitee.name` | Contact Name |
| `event.start_time` | Custom Field: `call_booked_date` |
| `event.name` | (informational) |

### 8.3: Registration Page → GHL (New Registration)

**Option A — GHL Form:**
If the registration page uses a GHL form, no webhook is needed. The form submission directly triggers WF1.

**Option B — External Landing Page (e.g., Carrd, WordPress, custom):**
1. Go to **Automation** > **Workflows** > Open `WF1 — Registration Trigger`
2. Click on the **Trigger** step > Select "Inbound Webhook"
3. Copy the **Inbound Webhook URL**
4. On your registration page, set the form submission to POST to this URL
5. Ensure these fields are included in the POST payload:

**Field Mapping:**
| Form Field | GHL Contact Field |
|-----------|-------------------|
| `first_name` | `contact.first_name` |
| `last_name` | `contact.last_name` |
| `email` | `contact.email` |
| `phone` | `contact.phone` |
| `utm_source` | Custom Field: `utm_source` |
| `utm_medium` | Custom Field: `utm_medium` |
| `utm_campaign` | Custom Field: `utm_campaign` |
| `utm_content` | Custom Field: `utm_content` |

### 8.4: Stripe → GHL (Payment Confirmation)

**Purpose:** When a payment is completed, update the contact's purchase data.

If using GHL's built-in Stripe integration, payments are automatically logged. For additional automation:

1. In Stripe > Developers > Webhooks > Add Endpoint
2. URL: GHL inbound webhook URL (create a new workflow for payment handling)
3. Events: `checkout.session.completed`, `payment_intent.succeeded`

**Field Mapping:**
| Stripe Field | GHL Custom Field |
|-------------|------------------|
| `customer_email` | Contact Email (lookup) |
| `amount_total` | `purchase_amount` |
| `created` (timestamp) | `purchase_date` |

---

## PHASE 9: SMART LISTS

> Go to **Contacts** > **Smart Lists** > **+ Create Smart List**

### Smart List 1: All Registrants

- **Name:** All Webinar Registrants
- **Filter:** Tag `is` `webinar-registered` OR Tag `is` `webinar-attended` OR Tag `is` `webinar-noshow`

### Smart List 2: Attended — Not Booked

- **Name:** Attended - Not Booked
- **Filter:** Tag `is` `webinar-attended` AND Custom Field `call_booked` `is not` `Yes`

### Smart List 3: Called — Not Closed

- **Name:** Called - Not Closed
- **Filter:** Tag `is` `call-booked` AND Pipeline Stage `is not` `Closed Won`

### Smart List 4: No-Shows

- **Name:** Webinar No-Shows
- **Filter:** Tag `is` `webinar-noshow`

### Smart List 5: Call No-Shows

- **Name:** Call No-Shows
- **Filter:** Tag `is` `call-noshow`

### Smart List 6: Active Clients

- **Name:** Active Clients
- **Filter:** Tag `is` `client-won`

### Smart List 7: Cold Leads (90+ Days)

- **Name:** Cold Leads - 90+ Days
- **Filter:** Contact Created Date `is before` 90 days ago AND Tag `is not` `client-won` AND NOT in any active workflow

---

## PHASE 10: TESTING CHECKLIST

Before going live, test every component of the funnel:

### Registration Flow
- [ ] Submit the registration form with a test contact
- [ ] Verify contact appears in GHL with correct data
- [ ] Verify tag `webinar-registered` is applied
- [ ] Verify opportunity is created in "Registered" stage
- [ ] Verify custom fields (UTM params, registration date) are populated
- [ ] Verify confirmation email (A1) is received
- [ ] Verify confirmation SMS (A1) is received
- [ ] Verify contact is enrolled in WF2 (Pre-Webinar Sequence)

### Email Delivery
- [ ] Send a test of every email template to your own inbox
- [ ] Check subject lines render correctly
- [ ] Check merge fields (`{{contact.first_name}}`) populate correctly
- [ ] Check all links are clickable and go to the right pages
- [ ] Check emails don't land in spam (check with mail-tester.com)
- [ ] Verify unsubscribe link works in every email

### SMS Delivery
- [ ] Send a test SMS to your own phone
- [ ] Verify merge fields populate
- [ ] Verify links are clickable
- [ ] Check character counts (stay under 160 for single-segment SMS where possible)

### Webhook Connections
- [ ] Test WebinarJam/Demio webhook: trigger a test `attendee.joined` event
- [ ] Verify WF3 fires and contact is updated (tag: `webinar-attended`, stage: "Attended")
- [ ] Test Calendly webhook: create a test booking
- [ ] Verify WF6 fires and contact is updated (tag: `call-booked`, stage: "Call Booked")
- [ ] Verify the registration page webhook (if external) correctly creates/updates contacts

### Pipeline Movement
- [ ] Manually move a test contact through each pipeline stage
- [ ] Verify WF7 (Post-Call Handler) triggers for each stage change
- [ ] Verify the correct branch fires (Closed Won, Closed Lost, No Show, Follow Up)
- [ ] Verify emails/SMS in each branch are sent

### If/Else Branching
- [ ] Test WF4: Set `call_booked` = Yes on a test contact mid-sequence
- [ ] Verify the contact exits the workflow at the next If/Else check
- [ ] Test WF5: Same — verify exit conditions work
- [ ] Test WF8: Set `call_booked` = Yes on an abandoned-booking contact
- [ ] Verify exit

### Exit Conditions
- [ ] Verify contacts with `call-booked` tag are removed from WF4, WF5, and WF8
- [ ] Verify unsubscribed contacts do not receive further emails/SMS
- [ ] Verify contacts who purchase are removed from all selling sequences

### Timing Verification
- [ ] Check that all "Wait until" steps reference the correct dates and times in BST
- [ ] Verify no emails/SMS overlap in timing (minimum 30-minute gap)
- [ ] Confirm the no-show detector (WF5a) fires at the correct time (April 13, 10:00 PM BST)

---

## PHASE 11: WHATSAPP GROUP MESSAGES

> These are NOT automated through GHL. They are manual messages posted by Terry (or a team member) into the WhatsApp group. Copy-paste each message at the specified time.

### WhatsApp Group Setup
- **Group Name:** Property Labs — Airbnb Training (April 13)
- **Group Description:** Live training with Terry Dwobeng. Monday, April 13th at 7:00 PM BST.
- **Admin Only:** Set to "Only admins can send messages" (to keep the group clean)
- **Pin Message 1** to the top of the group immediately

---

### Message 1: Welcome (PIN THIS — send when group goes live)

```
Welcome in!

I'm Terry Dwobeng, founder of Property Labs.

If you're in this group it means you've signed up for the live training on Monday, April 13th, "The 3C System: How Complete Beginners Are Launching Profitable Airbnbs in 90 Days."

This group is here to make sure you actually show up and get the most out of it.

Over the next few days I'll be sharing:
- Real results from people who've been through my programme
- Exactly what we're covering on Monday so you come prepared
- Reminders so you don't miss a thing
- The live link when we go live

The training is on Monday, April 13th at 7:00 PM BST.

Add it to your calendar. Tell someone you're doing this. That one move alone will triple your chances of showing up.

See you Monday.

— Terry
```

---

### Message 2: Social Proof Drop (Friday, April 10)

```
While we're waiting for Monday, let me share something.

Got a message from one of my clients this morning and it reminded me why I do this.

Ihab came to me a few months ago. No property experience. No portfolio. No connections in the industry. Just a decision that he was done waiting.

5 weeks later he'd raised £25,000 in capital. Not from savings. Not from a bank loan. From the exact system I'm going to break down on Monday night.

Ihab isn't some outlier. He's one of many complete beginners who've launched profitable Airbnbs in 90 days using this framework.

That's what Monday is about. Not motivation. Not theory. A system that works.

Monday, April 13th at 7:00 PM BST. I'll see you there.

Drop a "locked in" below if you're ready.

— Terry
```

---

### Message 3: Value Tease (Saturday, April 11)

```
Quick one.

On Monday I'm revealing the exact system that's behind every single one of my client success stories. I want you to know what's coming so you can show up prepared.

Here's what I'm covering in the training:

1. The 3C System: Credibility, Capital, Cash flow. This is the framework. Everything else is built on this.

2. How to build credibility with landlords and property owners even if you've never done this before and have no prior experience.

3. How to raise capital for your first Airbnb using investor capital through the 3C System, the same method Ihab used to raise £25k in 5 weeks.

4. The cash flow model that makes each unit profitable from month 1. Not month 6, not "eventually." Month 1.

5. The exact path from where you are right now to your first profitable Airbnb in 90 days. Step by step.

Nothing held back. This is the full system.

Come with questions. Come ready to take notes. If you've got a specific situation you want me to address, drop it below and I might cover it live.

Monday, April 13th at 7:00 PM BST.
Your link will be in this group when we go live.

— Terry
```

---

### Message 4: Day-Of Hype (Monday, April 13, 9:00 AM)

```
Today's the day.

The training goes live tonight at 7:00 PM BST.

I've done a lot of these sessions and I can tell you straight, the people who show up live always get more out of it than the people who watch replays. Something about being in the room, hearing other people's questions, feeling the energy.

Dylan was on one of my live sessions. He asked a question during Q&A that completely shifted his approach. Fast forward, he's now running 5 Airbnbs and pulling in £12k a month.

That one question. That one session.

I don't know what your version of that moment is going to be. But I know it won't happen if you don't show up.

Tonight. 7:00 PM BST. Be there.

— Terry

P.S. Know someone who should be on this call? Share this group with them. The more serious people in the room, the better it gets for everyone.
```

---

### Message 5: 1-Hour Warning (Monday, April 13, 6:00 PM)

```
One hour.

We go live in 60 minutes.

If you haven't already, open the link on your laptop (not your phone), find somewhere quiet, and have something to take notes with.

This isn't a "sit back and watch" kind of session. I'm going to be moving fast and covering a lot. The first 10 minutes set the foundation for everything else. Don't be late.

[WEBINAR JOIN LINK]

See you in the room.

— Terry
```

---

### Message 6: 15-Minute Final Push (Monday, April 13, 6:45 PM)

```
15 minutes.

Room is open NOW.

[WEBINAR JOIN LINK]

Click that. Get in. Get settled.

We start on time. No waiting around.

— Terry
```

---

### Message 7: Going LIVE (Monday, April 13, 7:00 PM)

```
WE ARE LIVE

Get in here right now:

[WEBINAR JOIN LINK]

— Terry
```

---

### Message 8: Post-Webinar (Monday, April 13, ~8:30 PM — 30 min after end)

```
That was incredible.

Thank you to everyone who showed up tonight and brought the energy. If you were there, you know. We went deep.

For those who missed it:
The replay will be available for 48 hours. Watch it. What I shared at the end won't be available forever.

[REPLAY PAGE URL]

For those who were there and want to take the next step:
Book a Strategy Call with me. It's a straight conversation. No pressure, no hard sell. We look at where you are, where you want to be, and figure out the fastest way to get there.

[CALENDLY BOOKING LINK]

We've got 4 options from £500 to £5,000 depending on how much hands-on support you want. The guarantee stays the same across all of them: your first profitable Airbnb in 90 days.

Proud of what we built in this room tonight. The success stories keep growing, and your name could be next.

Let's go.

— Terry
```

---

## APPENDIX: GHL MERGE FIELD REFERENCE

Use this table to replace placeholders across all templates with the correct GHL merge field syntax.

| Placeholder (in source files) | GHL Merge Field / Hardcoded Value | Notes |
|-------------------------------|-----------------------------------|-------|
| `{{FIRST_NAME}}` | `{{contact.first_name}}` | GHL contact merge field |
| `{{HOST_NAME}}` | `Terry Dwobeng` | Hardcode — does not change |
| `{{BUSINESS_NAME}}` | `Property Labs` | Hardcode — does not change |
| `{{WEBINAR_TITLE}}` | `The 3C System: How Complete Beginners Are Launching Profitable Airbnbs in 90 Days` | Hardcode — full title |
| `{{WEBINAR_DATE}}` | `Monday, April 13th` | Hardcode — single event |
| `{{WEBINAR_TIME}}` | `7:00 PM BST` | Hardcode — single event |
| `{{LIVE_LINK}}` | `[WEBINAR JOIN LINK]` | Replace with actual WebinarJam/Demio/Zoom join URL when available |
| `{{REPLAY_LINK}}` | `[REPLAY PAGE URL]` | Replace with actual replay page URL after webinar |
| `{{CALENDLY_URL}}` | `[CALENDLY BOOKING LINK]` | Replace with Terry's Calendly Strategy Call URL |
| `[Google Calendar]` | `[GOOGLE CALENDAR ADD LINK]` | Generate from AddEvent.com or similar |
| `[Apple Calendar]` | `[APPLE CALENDAR .ICS LINK]` | Generate .ics file link |
| `[Outlook]` | `[OUTLOOK CALENDAR ADD LINK]` | Generate from AddEvent.com |
| `[ZOOM LINK]` | `[ZOOM MEETING LINK]` | Terry's Zoom meeting room for Strategy Calls |
| `{{contact.email}}` | `{{contact.email}}` | GHL contact email merge field |
| `{{contact.phone}}` | `{{contact.phone}}` | GHL contact phone merge field |
| `{{contact.full_name}}` | `{{contact.full_name}}` | GHL full name merge field |
| `{{current_date}}` | `{{current_date}}` | GHL system date (used in workflows for setting custom field dates) |

### Links to Generate Before Launch

Before going live, you need to create and insert these actual URLs:

1. **Webinar Join Link** — Get from WebinarJam/Demio/Zoom after creating the webinar event
2. **Replay Page URL** — Create a replay page (GHL funnel page, or hosted replay) — available after the live event
3. **Calendly Strategy Call URL** — Get from Calendly (Terry's booking page URL)
4. **Calendar Add Links** — Generate from [AddEvent.com](https://www.addevent.com/) for the event: Monday April 13, 2026, 7:00 PM BST, "Property Labs Airbnb Training"
5. **Zoom Strategy Call Link** — Terry's personal Zoom meeting room link
6. **WhatsApp Group Invite Link** — Create the group in WhatsApp and generate the invite link

---

## FINAL SUMMARY

| Component | Count |
|-----------|-------|
| Custom Fields | 13 |
| Pipeline Stages | 9 |
| Tags | 13 |
| Email Templates | 28 (6 Pre-Webinar + 6 Post-Attendee + 6 No-Show + 4 Abandoned Cart + 2 Call Booked + 2 Follow-Up + 2 Post-Call Outcome) |
| SMS Templates | 19 (6 Pre-Webinar + 3 Post-Attendee + 3 No-Show + 1 Abandoned Cart + 4 Call Booked + 2 Post-Call) |
| Workflows | 8 (7 core + 1 No-Show Detector) |
| Smart Lists | 7 |
| Webhooks | 4 (WebinarJam, Calendly, Registration Page, Stripe) |
| WhatsApp Messages | 8 (manual) |

**Build order:**
1. Account setup (Phase 1)
2. Custom fields (Phase 2)
3. Pipeline (Phase 3)
4. Tags (Phase 4)
5. Email templates (Phase 5)
6. SMS templates (Phase 6)
7. Workflows (Phase 7) — build in order WF1 through WF8
8. Webhooks (Phase 8) — connect after workflows are built
9. Smart lists (Phase 9)
10. Test everything (Phase 10)
11. Prepare WhatsApp messages (Phase 11)

---

*Generated: March 2026 | Client: Terry Dwobeng / Property Labs*
*This document is the single source of truth for the GHL implementation.*
