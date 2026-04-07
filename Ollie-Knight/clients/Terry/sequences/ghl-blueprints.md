# GoHighLevel (GHL) Automation Blueprints — Terry Dwobeng / Property Labs Webinar Funnel

## Overview
7 core GHL workflow blueprints for Terry Dwobeng's Airbnb coaching webinar funnel: **"The 3C System: How Complete Beginners Are Launching Profitable Airbnbs in 90 Days"**. Webinar date: **Monday, April 13, 2026**.

---

## GHL Account Setup Checklist

Before building workflows:
- [ ] GHL sub-account created for Property Labs
- [ ] Custom fields added (see Custom Fields section below)
- [ ] Email sending domain verified (DKIM + SPF)
- [ ] SMS number purchased and verified (UK number)
- [ ] Calendly webhook connected (or GHL Calendar used)
- [ ] Webinar platform webhook connected (Demio/Zoom/WebinarJam)
- [ ] Stripe/payment webhook connected

---

## Custom Fields Required (13)

Create these in GHL → Settings → Custom Fields:

| Field Name | Type | Values |
|-----------|------|--------|
| `webinar_registration_date` | Date | Auto-fill |
| `webinar_attended` | Checkbox | Yes/No |
| `webinar_watch_time` | Number | Minutes |
| `call_booked` | Checkbox | Yes/No |
| `call_booked_date` | Date | Auto-fill |
| `call_showed` | Checkbox | Yes/No |
| `offer_tier_interest` | Dropdown | £500 Course / £1,000 Course+Finance / £3,000 Group Coaching / £5,000 1:1 Coaching |
| `purchase_amount` | Number | GBP value |
| `purchase_date` | Date | Auto-fill |
| `utm_source` | Text | |
| `utm_medium` | Text | |
| `utm_campaign` | Text | |
| `utm_content` | Text | |
| `lead_stage` | Dropdown | Registered / Confirmed / Attended / Call Booked / Call Completed / Proposal Sent / Closed Won / Closed Lost / No Show |

---

## Pipeline Stages (9)

Create a pipeline called **"Property Labs Webinar Funnel"** with these stages:

1. **Registered** — Signed up for webinar
2. **Confirmed** — Completed confirmation steps (calendar add, etc.)
3. **Attended** — Showed up to webinar
4. **Call Booked** — Booked a Strategy Call with Terry
5. **Call Completed** — Call happened
6. **Proposal Sent** — Offer presented (tier identified)
7. **Closed Won** — Became a client
8. **Closed Lost** — Did not buy
9. **No Show** — Registered but didn't attend

---

## Workflow 1: Registration Trigger (On Sign-Up)

**Trigger:** Form submission on webinar registration page (or webhook from registration page)

**Goal:** Confirm registration, move to pipeline stage, start pre-webinar sequence

### Workflow Steps:

```
TRIGGER: Form Submitted (Registration Form)
  |
ACTION: Add to Pipeline → Stage: "Registered"
  |
ACTION: Add Tag → "webinar-registered"
  |
ACTION: Set Custom Field → webinar_registration_date = TODAY
  |
ACTION: Set Custom Field → lead_stage = "Registered"
  |
ACTION: Set Custom Field → utm_source = {{trigger.utm_source}}
         utm_medium = {{trigger.utm_medium}}
         utm_campaign = {{trigger.utm_campaign}}
         utm_content = {{trigger.utm_content}}
  |
ACTION: Send Confirmation Email (immediate)
  Subject: "You're in! Here's what to do before April 13th..."
  Body:
    Hey {{contact.first_name}},

    You've just secured your spot on the live training:
    "The 3C System: How Complete Beginners Are Launching Profitable Airbnbs in 90 Days"

    Date: Monday, April 13, 2026
    Host: Terry Dwobeng

    Step 1: Add this to your calendar RIGHT NOW → [CALENDAR LINK]
    Step 2: Join the WhatsApp group for updates → [WHATSAPP GROUP LINK]
    Step 3: Show up. That's it.

    I'm going to break down the exact 3C System (Credibility → Capital → Cash flow)
    that my clients use to launch profitable Airbnbs, even with no prior experience.

    Real talk, this training is going to be packed.
    The people who show up live always get the most out of it.

    See you there,
    Terry
  |
ACTION: Send SMS (immediate)
  "Hey {{contact.first_name}}! You're registered for the Airbnb training on April 13th with Terry Dwobeng. Add to calendar: [CALENDAR LINK]"
  |
ACTION: Wait 5 minutes
  |
ACTION: Send "Add to Calendar" Follow-Up Email
  Subject: "Quick — add this to your calendar before you forget"
  Body: Calendar link + WhatsApp group link
  |
ACTION: Add to Workflow → "Pre-Webinar Reminder Sequence"
```

---

## Workflow 2: Pre-Webinar Reminder Sequence

**Trigger:** Added by Workflow 1 (or direct enrollment)

**Goal:** Maximize show-up rate to 45%+

### Email Sequence:
```
Day 0 (immediate): Confirmation + add to calendar
Day 0 +5min: Add to calendar reminder
Day -3 (Fri, April 10): "This Monday..." anticipation email
Day -1 (Sun, April 12): "Tomorrow!" reminder with social proof
Day 0, -4 hours: "4 hours to go" reminder
Day 0, -1 hour: "1 hour away" reminder
Day 0, -15 min: "Starting soon!" final push
```

### SMS Sequence:
```
Day 0 (immediate): "Confirmed! See you April 13th for the Airbnb training. [CALENDAR LINK]"
Day -1 evening (Sun 7pm): "Tomorrow at [TIME] — the Airbnb launch training with Terry. Join: [LINK]"
Day 0, -2 hours: "2 hours away — get ready! [LINK]"
Day 0, -30 min: "30 mins! We're about to go live. Join now: [LINK]"
Day 0, -5 min: "WE'RE LIVE! Join now: [LINK]"
```

### Workflow Steps:

```
TRIGGER: Enrolled in Pre-Webinar Sequence
  |
WAIT until Friday, April 10 at 10am
  |
SEND EMAIL: "This Monday — the training that's changing everything"
  Subject: "This Monday changes everything for your Airbnb journey"
  Body:
    Hey {{contact.first_name}},

    3 days.

    On Monday I'm sitting down with you LIVE and showing you the exact
    system that helped 25+ complete beginners launch profitable Airbnbs
    in under 90 days.

    Not theory. Not motivation. The actual step-by-step.

    People like Ihab, who raised £25k in capital in just 5 weeks.
    And Dylan, now running 5 Airbnbs pulling £12k a month.

    Monday, April 13th at [TIME].

    Be there.

    — Terry
  |
SEND SMS: "3 days until the Airbnb training, {{contact.first_name}}. Monday is going to be big. [LINK]"
  |
WAIT until Sunday, April 12 at 9am
  |
SEND EMAIL: "Tomorrow — don't miss this"
  Subject: "Tomorrow at [TIME] — your Airbnb gameplan"
  Body:
    {{contact.first_name}},

    Tomorrow's the day.

    I'm going live to break down the 3C System: Credibility, Capital, Cash flow.

    This is the same framework Andrew used to raise £13k and secure 3 units.
    Same framework Dylan used to build a £12k/month Airbnb portfolio.

    I'm handing it to you for free. All you have to do is show up.

    Tomorrow. [TIME]. Be there.

    — Terry
  |
SEND SMS: "Tomorrow! Your Airbnb training starts at [TIME]. Don't sleep on this. Join: [LINK]"
  |
WAIT until Monday, April 13 at [TIME - 4hrs]
  |
SEND EMAIL: "In 4 Hours — We Go Live"
  Subject: "4 hours until we go live"
  Body:
    {{contact.first_name}}, we go live in 4 hours.

    Here's what I'll cover:
    - How to build credibility with landlords (even with no prior experience)
    - How to raise capital for your first Airbnb (using investor capital through the 3C System)
    - The cash flow model that makes each unit profitable from month 1

    This is the session that changes things. Don't miss it.

    [WEBINAR LINK]

    — Terry
  |
WAIT until [TIME - 1hr]
  |
SEND EMAIL: "1 Hour Until We Go Live"
  Subject: "60 minutes — grab your seat"
  Body: Short and punchy. Link to webinar. "See you in there."
  |
SEND SMS: "1 hour! Training starts at [TIME]. Grab your spot: [LINK]"
  |
WAIT until [TIME - 15min]
  |
SEND SMS: "15 mins! Room is open. Get in now: [LINK]"
  |
WAIT until [TIME - 5min]
  |
SEND SMS: "WE'RE LIVE! Join now: [LINK]"
```

**Key Personalization Variables:**
- `{{contact.first_name}}`
- `{{webinar_date}}` — April 13, 2026
- `{{webinar_time}}`
- `{{webinar_join_link}}`
- `{{calendar_add_link}}`

---

## Workflow 3: Webinar Attendance Webhook Handler

**Trigger:** Webhook from webinar platform (Demio/Zoom/WebinarJam) when contact joins

**Goal:** Track attendance, update pipeline stage, route to correct post-webinar flow

### Setup:
1. In webinar platform, configure webhook for `attendee.joined` event
2. Webhook URL: `https://app.gohighlevel.com/hooks/[YOUR_LOCATION_ID]/[WEBHOOK_KEY]`
3. Map fields: email → GHL contact email, join_time, watch_time

### Workflow Steps:

```
TRIGGER: Inbound Webhook (Attendee Joined)
  |
ACTION: Find Contact by Email
  |
ACTION: Remove from "Pre-Webinar Reminder Sequence"
  |
ACTION: Add Tag → "webinar-attended"
  |
ACTION: Remove Tag → "webinar-registered" (if present)
  |
ACTION: Update Pipeline Stage → "Attended"
  |
ACTION: Set Custom Field → webinar_attended = Yes
  |
ACTION: Set Custom Field → lead_stage = "Attended"
  |
ACTION: Set Custom Field → webinar_watch_time = {{webhook.watch_time}}
  |
WAIT 30 seconds
  |
ACTION: Add to Workflow → "Post-Webinar Attendee Sequence"
```

---

## Workflow 4: Post-Webinar Attendee Sequence

**Trigger:** Enrolled after attending webinar

**Goal:** Drive Strategy Call bookings from attendees who didn't book during webinar

### Email Sequence (6 emails + 2 SMS over 9 days):
```
Immediate (30min post-webinar): Recap + book call CTA
+1 day: "The 3C System — did you catch this?" email
+2 days: Case study — Ihab's story (£25k raised, 5 weeks)
+3 days: FAQ / objection handling email
+5 days: "Spots are filling up" urgency email
+7 days: Final email — straight talk
+9 days: Breakup email
```

### Workflow Steps:

```
TRIGGER: Enrolled in Post-Webinar Attendee Sequence
  |
WAIT until 30 minutes after webinar ends
  |
SEND EMAIL: "Thanks for showing up — here's your next step"
  Subject: "You showed up. Now let's make it count."
  Body:
    {{contact.first_name}},

    Respect for showing up tonight. You're already ahead of 80% of people
    who say they want to build an Airbnb business.

    Quick recap of what we covered:
    - The 3C System: Credibility → Capital → Cash flow
    - How 25+ complete beginners launched profitable Airbnbs in 90 days
    - The guarantee: your first profitable Airbnb in 90 days

    Now here's the thing. Watching the training is step 1.
    Step 2 is getting on a Strategy Call with me so we can map out YOUR plan.

    No pressure, no hard sell. Just a conversation about where you are,
    where you want to be, and the fastest way to get there.

    Book your Strategy Call here → [CALENDLY LINK]

    Speak soon,
    Terry
  |
SEND SMS: "Hey {{contact.first_name}}! Thanks for being on the training tonight. Ready to map out your Airbnb plan? Book a Strategy Call: [CALENDLY LINK]"
  |
WAIT 1 day
  |
IF contact.call_booked = Yes → EXIT WORKFLOW
  |
SEND EMAIL: "The 3C System — did you catch this part?"
  Subject: "Most people miss this about the 3C System..."
  Body:
    {{contact.first_name}},

    Quick thought from yesterday's training.

    Most people hear "Credibility, Capital, Cash flow" and think it's about
    doing things in order. It's not.

    It's about doing the RIGHT things in each phase so you don't waste
    6 months figuring it out on your own.

    That's exactly what the Strategy Call is for. We look at where you are
    right now and figure out which C you need to focus on first.

    Takes 30 minutes. Could save you 6 months.

    → [CALENDLY LINK]

    — Terry
  |
WAIT 1 day
  |
IF contact.call_booked = Yes → EXIT WORKFLOW
  |
SEND EMAIL: "How Ihab raised £25k in 5 weeks"
  Subject: "Ihab had no experience. Then this happened."
  Body:
    {{contact.first_name}},

    Let me tell you about Ihab.

    When he came to me, he had no prior property experience. No portfolio.
    No connections in the industry. Just a decision that he wanted
    to build something.

    5 weeks later he'd raised £25k in capital.

    Not from savings. Not from a bank loan.
    From the exact system I showed you on Monday night.

    Ihab isn't special (sorry Ihab). He just followed the process.

    The same process Dylan used to build 5 Airbnbs pulling £12k a month.
    The same one Andrew used to raise £13k and secure 3 units.

    Your version of this story starts with a 30-minute Strategy Call.

    → [CALENDLY LINK]

    — Terry
  |
WAIT 1 day
  |
IF contact.call_booked = Yes → EXIT WORKFLOW
  |
SEND SMS: "Still thinking about it, {{contact.first_name}}? Happy to answer any questions on a quick call. Book here: [CALENDLY LINK]"
  |
SEND EMAIL: "Your top 5 questions — answered"
  Subject: "I know what you're thinking..."
  Body:
    {{contact.first_name}},

    I've had hundreds of these conversations now.
    Here are the 5 things people always ask:

    1. "Do I need money to start?"
    → No. The Capital phase of the 3C System shows you how to raise it.
       Ihab raised £25k using the 3C System.

    2. "Do I need property experience?"
    → No. Most of our success stories started from scratch.

    3. "How long before I'm profitable?"
    → We guarantee your first profitable Airbnb in 90 days.
       That's not a marketing claim. It's a guarantee.

    4. "What are the investment options?"
    → We have 4 tiers from £500 to £5,000 depending on how much
       hands-on support you want. We'll figure out the right fit on the call.

    5. "Is this just another course?"
    → The course is one part. The real value is the system,
       the capital-raising framework, and the coaching.

    Still got questions? That's what the Strategy Call is for.

    → [CALENDLY LINK]

    — Terry
  |
WAIT 2 days
  |
IF contact.call_booked = Yes → EXIT WORKFLOW
  |
SEND EMAIL: "Spots are filling up — real talk"
  Subject: "I need to be straight with you"
  Body:
    {{contact.first_name}},

    Straight talk.

    I can only take on a limited number of coaching clients at a time.
    I'm not saying this to pressure you. It's just how it works
    when you're giving people real, hands-on support.

    If you've been thinking about booking that Strategy Call,
    now's the time. Not next week. Now.

    → [CALENDLY LINK]

    The guarantee stands: first profitable Airbnb in 90 days.

    — Terry
  |
WAIT 2 days
  |
IF contact.call_booked = Yes → EXIT WORKFLOW
  |
SEND EMAIL: "Last message from me on this"
  Subject: "Should I close your file?"
  Body:
    {{contact.first_name}},

    This is my last email about the Strategy Call.

    I don't chase people. If it's not the right time, that's completely fine.
    No hard feelings.

    But if you watched the training, saw what Ihab, Dylan, and Andrew
    did, and thought "I want that", then book the call.

    30 minutes. No pressure. Just clarity on your next step.

    → [CALENDLY LINK]

    If I don't hear from you, I'll assume it's a no for now
    and I won't keep emailing you about this.

    Respect either way.

    — Terry
```

---

## Workflow 5: No-Show Recovery Sequence

**Trigger:** Webinar ends AND contact does NOT have tag "webinar-attended"

**Goal:** Re-engage no-shows with replay and drive them back

### How to Detect No-Shows:
- Use a scheduled workflow that runs 2 hours after webinar end time
- Filter: Has tag "webinar-registered" AND does NOT have tag "webinar-attended"

### Workflow Steps (over 6 days):

```
TRIGGER: Scheduled trigger (2hrs after webinar, April 13) + filter for no-shows
  |
ACTION: Add Tag → "webinar-noshow"
  |
ACTION: Update Pipeline Stage → "No Show"
  |
ACTION: Set Custom Field → lead_stage = "No Show"
  |
WAIT 1 hour
  |
SEND EMAIL: "You missed it — but I saved you a replay"
  Subject: "I saved you a seat (replay inside)"
  Body:
    {{contact.first_name}},

    You registered for tonight's training but I didn't see you in the room.

    No stress. Life happens.

    But I don't want you to miss what we covered, because it was big.

    I broke down the exact 3C System (Credibility → Capital → Cash flow)
    that 25+ complete beginners used to launch profitable Airbnbs in under 90 days.

    Including Ihab, who raised £25k in just 5 weeks starting from zero.

    Here's the replay. It won't be up forever.

    → [REPLAY LINK]

    Watch it. Then book a Strategy Call if it clicks.

    → [CALENDLY LINK]

    — Terry
  |
SEND SMS: "Hey {{contact.first_name}}, you missed the training! No worries, here's the replay: [REPLAY LINK]. Watch it before it comes down."
  |
WAIT 1 day
  |
SEND EMAIL: "Here's what you missed on Monday night..."
  Subject: "Here's what you missed (in 60 seconds)"
  Body:
    {{contact.first_name}},

    Quick rundown of what happened on the training:

    - I revealed the 3C System. The exact framework behind 25+ successful Airbnb launches
    - Showed how Ihab raised £25k in 5 weeks with no property experience
    - Broke down how Dylan built 5 Airbnbs generating £12k/month
    - Explained the 90-day guarantee: your first profitable Airbnb or we keep working with you

    The full replay is here → [REPLAY LINK]

    It's about 90 minutes but honestly the first 30 minutes alone
    will shift how you think about Airbnb as a business.

    — Terry
  |
WAIT 2 days
  |
SEND EMAIL: "Last chance on the replay"
  Subject: "Replay coming down soon"
  Body:
    {{contact.first_name}},

    The replay of Monday's Airbnb training is coming down soon.

    If you haven't watched it yet, this is your last window.

    → [REPLAY LINK]

    After you watch, book a Strategy Call and let's talk about your plan:
    → [CALENDLY LINK]

    — Terry
  |
WAIT 3 days
  |
SEND SMS: "Last chance, the Airbnb training replay comes down tonight. Watch it here: [REPLAY LINK]"
```

---

## Workflow 6: Call Booked → Confirmation + Reminders

**Trigger:** Webhook from Calendly (or GHL Calendar) when appointment is booked

**Goal:** Maximize call show rate (target: 75%+) with 4 SMS reminders

### Setup:
In Calendly → Integrations → Webhooks:
- Event type: `invitee.created`
- Webhook URL: GHL inbound webhook URL
- Map: `invitee_email`, `event_start_time`, `event_name`

### Workflow Steps:

```
TRIGGER: Inbound Webhook (Calendly booking created)
  |
ACTION: Find Contact by Email
  |
ACTION: Add Tag → "call-booked"
  |
ACTION: Update Pipeline Stage → "Call Booked"
  |
ACTION: Set Custom Field → call_booked = Yes
  |
ACTION: Set Custom Field → call_booked_date = [from webhook]
  |
ACTION: Set Custom Field → lead_stage = "Call Booked"
  |
ACTION: Assign to User → Terry (or notify Terry via internal notification)
  |
SEND EMAIL: Booking confirmation
  Subject: "You're booked! Here's how to prepare for your Strategy Call"
  Body:
    {{contact.first_name}},

    Your Strategy Call is locked in.

    Date: {{call_booked_date}}
    Time: [TIME]
    Where: Zoom — [ZOOM LINK]

    What to expect:
    - We'll look at where you are right now (experience, capital, goals)
    - I'll map out which tier of the programme fits you best
    - You'll leave with a clear next step, whether you join or not

    This is a real conversation, not a sales pitch.
    Come with your questions. Come ready to be honest about where you are.

    See you on the call,
    Terry
  |
SEND SMS [1 of 4]: "Strategy Call confirmed! {{contact.first_name}}, you're booked for {{call_booked_date}} at [TIME]. Zoom: [LINK]. See you there — Terry"
  |
WAIT until 1 day before call at 9am
  |
IF call_showed = Yes → EXIT
  |
SEND SMS [2 of 4]: "Reminder: your Strategy Call with Terry is tomorrow at [TIME]. Come with your questions! Zoom: [LINK]"
  |
SEND EMAIL: "Tomorrow's call — quick heads up"
  Subject: "Tomorrow — quick prep for your Strategy Call"
  Body:
    Short prep checklist:
    1. Think about your current situation (savings, experience, goals)
    2. Have an idea of which tier interests you (£500–£5,000)
    3. Be ready to be honest. I can only help if I know where you really are

    Zoom: [LINK]
    See you tomorrow.
    — Terry
  |
WAIT until 2 hours before call
  |
IF call_showed = Yes → EXIT
  |
SEND SMS [3 of 4]: "2 hours until your Strategy Call with Terry! Join here: [ZOOM LINK]"
  |
WAIT until 15 minutes before call
  |
SEND SMS [4 of 4]: "Starting in 15 mins, {{contact.first_name}}! Click to join: [ZOOM LINK]"
```

---

## Workflow 7: Post-Call Handler

**Trigger:** Pipeline stage changed (manually by Terry after call)

**Goal:** Handle outcomes: closed, no-show, follow-up needed, lost

### Workflow Steps:

```
TRIGGER: Pipeline Stage Changed (by Terry after call)
  |
BRANCH:

  IF Stage = "Closed Won":
    ACTION: Add Tag → "client-won"
    ACTION: Set Custom Field → lead_stage = "Closed Won"
    ACTION: Set Custom Field → purchase_date = TODAY
    ACTION: Set Custom Field → purchase_amount = [from Terry's input]
    ACTION: Send Welcome Email
      Subject: "Welcome to Property Labs — let's get you started"
      Body:
        {{contact.first_name}},

        Welcome to Property Labs. You've made the decision. Now let's execute.

        Here's what happens next:
        1. You'll get access to your programme materials within 24 hours
        2. I'll be in touch personally to kick off your onboarding
        3. We start working on your 90-day plan immediately

        The guarantee is live from today: your first profitable Airbnb in 90 days.

        Let's go.

        — Terry
    ACTION: Send SMS: "Welcome to Property Labs, {{contact.first_name}}! I'll be in touch within 24hrs to get you started. This is where it begins. — Terry"
    ACTION: Add to Onboarding Workflow

  IF Stage = "Closed Lost":
    ACTION: Add Tag → "lost"
    ACTION: Set Custom Field → lead_stage = "Closed Lost"
    WAIT 3 days
    SEND EMAIL: "No hard feelings — door's always open"
      Subject: "Quick message from Terry"
      Body:
        {{contact.first_name}},

        Thanks for taking the time to chat.

        I get it. The timing might not be right, or it might not be the right fit.
        No pressure from me.

        But if anything changes, or if you just want to ask a question
        down the line, reply to this email. I read everything.

        In the meantime, keep learning. The Airbnb opportunity isn't going anywhere.

        — Terry
    WAIT 7 days
    SEND EMAIL: Next webinar/training invitation
    Add to long-term nurture sequence

  IF Stage = "Follow Up Needed":
    ACTION: Add Tag → "needs-followup"
    ACTION: Create Task → Assign to Terry, due in 48hrs
    SEND EMAIL: Follow-up with relevant info based on call notes
    WAIT 2 days
    SEND EMAIL: Second follow-up — address specific objection from call
    WAIT 3 days
    SEND SMS: "Hey {{contact.first_name}}, just circling back. Any questions since our chat? Happy to help. — Terry"

  IF Stage = "No Show" (Call No-Show):
    ACTION: Add Tag → "call-noshow"
    WAIT 1 hour
    SEND SMS: "Hey {{contact.first_name}}, looks like we missed each other! Want to reschedule? [CALENDLY LINK] — Terry"
    WAIT 1 day
    SEND EMAIL: "Missed you on the call — want to reschedule?"
      Subject: "We missed each other — let's rebook"
      Body:
        {{contact.first_name}},

        No worries about missing the call. Things come up.

        But I'd hate for you to lose momentum. The people who book
        and show up are the ones who end up like Ihab, Dylan, and Andrew.

        Grab another time here: [CALENDLY LINK]

        — Terry
    WAIT 3 days
    SEND EMAIL: Last attempt to reschedule
      Subject: "Last shout — want to rebook?"
```

---

## Smart List Segments

| List Name | Filter |
|-----------|--------|
| All Registrants | Tag = webinar-registered |
| Attended Not Booked | Tag = webinar-attended AND call_booked ≠ Yes |
| Called Not Closed | Tag = call-booked AND Stage ≠ Closed Won |
| No-Shows | Tag = webinar-noshow |
| Call No-Shows | Tag = call-noshow |
| Active Clients | Tag = client-won |
| Cold Leads (90+ days) | Created > 90 days, no purchase, no active workflow |

---

## GHL Reporting Setup

In GHL → Reporting, track:

1. **Contacts Created** — new registrants per period
2. **Pipeline Stage Conversion** — % moving through each stage
3. **Revenue by Tier** — track £500 / £1,000 / £3,000 / £5,000 closes
4. **Email Open Rate** — per sequence
5. **SMS Delivery Rate** — per sequence
6. **Call Show Rate** — call_showed / call_booked

---

## Integration Connections Required

| Integration | Purpose | Setup Location |
|-------------|---------|---------------|
| Meta Pixel | CAPI for lead/purchase events | GHL Settings → Integrations → Meta |
| Calendly | Call booking trigger | GHL Settings → Integrations → Calendly |
| Stripe | Payment confirmation | GHL Settings → Integrations → Stripe |
| Demio/Zoom | Attendance webhook | Webinar platform → Outbound webhooks |
| Make.com | Advanced automations | GHL provides webhook URLs |
| Google Sheets | Data export for tracker | Via Make.com scenario |

---

*Generated: March 2026 | Client: Terry Dwobeng / Property Labs*
