# The Airbnb Deal Analyser

**Plug In Any Property's Numbers and Know If It's Profitable in 60 Seconds**

---

*By Terry Dwobeng | Property Labs*

*propertylabs.co.uk*

---

Look, I've seen too many people jump into Airbnb, sign a lease, spend thousands on furniture, and then realise three months later that they're actually losing money. That's not a business. That's an expensive hobby.

This analyser exists so you never make that mistake.

Before you commit to any deal, you plug the numbers in here. If it works on paper, it works in real life. If it doesn't work on paper, walk away. Simple as that.

---

## How to Use the Analyser

This is dead simple. No spreadsheet wizardry required.

**Step 1: Open the spreadsheet**
Import the CSV file into Google Sheets (File > Import > Upload). The formulas will be laid out for you. All you need to do is fill in the yellow-highlighted input cells.

**Step 2: Fill in the Property Details**
Start at the top. Pop in the address, number of bedrooms, property type, monthly rent, and the city. This is basic stuff you'll get from the listing or the landlord.

**Step 3: Add Your Revenue Numbers**
This is where it gets interesting. You need two numbers: your average nightly rate and your expected occupancy rate. I'll show you exactly where to find these below.

**Step 4: Fill In Your Costs**
Go line by line. Rent, council tax, utilities, insurance, cleaning, consumables, platform fees. Don't skip anything. The deals that look profitable but aren't? It's always because someone forgot to account for a cost.

**Step 5: Add Your Setup Costs**
How much are you spending to get this place guest-ready? Furniture, photography, supplies, listing setup. Be honest with yourself here.

**Step 6: Read the Verdict**
The bottom section tells you everything: monthly profit, annual profit, profit margin, ROI, and how many months until you break even. Green means go. Red means walk away.

---

## What Each Field Means (And Where to Find the Data)

### Property Details

| Field | What It Is | Where to Find It |
|-------|-----------|-------------------|
| **Property Address** | The full address of the property you're analysing | The listing or landlord |
| **Number of Bedrooms** | How many bedrooms the property has | The listing |
| **Property Type** | Flat, house, or room | The listing |
| **Monthly Rent** | What you'll pay the landlord each month | The tenancy agreement or listing on Rightmove/OpenRent |
| **Location/City** | The city or area | You know this one |

### Revenue Projection

| Field | What It Is | Where to Find It |
|-------|-----------|-------------------|
| **Average Nightly Rate** | What you'll charge guests per night on average | Search AirDNA, Mashvisor, or look at comparable listings on Airbnb in the same area. Filter by same bedroom count and similar quality. Take the average of 5-10 comparable listings. |
| **Expected Occupancy Rate** | What percentage of nights you'll actually book | AirDNA gives area averages. For your first estimate, use 65-70% for a decent area. Never assume above 80% unless you have real data. |
| **Nights Per Month** | How many nights you'll be booked (calculated) | Occupancy Rate x 30. The spreadsheet does this for you. |
| **Monthly Revenue** | Your gross income before any costs (calculated) | Nightly Rate x Nights Per Month. Again, the spreadsheet handles it. |
| **Annual Revenue** | Monthly Revenue x 12 (calculated) | Automatic. |

### Costs

| Field | What It Is | Where to Find It |
|-------|-----------|-------------------|
| **Monthly Rent** | Same as above, pulled down into costs | Your tenancy agreement |
| **Council Tax** | Monthly council tax payment | Check the local council's website. Search "[city] council tax bands". The landlord can also tell you the band. |
| **Utilities** | Gas, electric, water, and wifi combined | Budget 120-180/month for a 2-bed. Call suppliers for exact quotes. Wifi is typically 25-35/month. |
| **Insurance** | Short-let or serviced accommodation insurance | Get quotes from Guardhog, Pikl, or Proper Insurance. Budget 50-80/month for a standard property. |
| **Cleaning** | Cost per clean multiplied by number of turnovers per month | Ask local cleaning companies. Typically 40-70 per clean for a 2-bed. Multiply by expected turnovers (average stay is 2-3 nights, so roughly 8-10 turnovers/month). |
| **Consumables** | Toiletries, coffee, tea, welcome packs | Budget 30-50/month. This covers toilet rolls, shower gel, coffee pods, bin bags, etc. |
| **Platform Fees** | Airbnb charges hosts approximately 3% per booking | 3% of your Monthly Revenue. The spreadsheet calculates this. |
| **Maintenance Reserve** | Money set aside for repairs and replacements | 5% of Monthly Revenue. Things break. Guests are not always careful. Budget for it. |
| **Management Fee** | If you're using a co-host or management company | Typically 15-20% of revenue. Leave at 0 if you're self-managing. |
| **Total Monthly Costs** | Everything above added together (calculated) | Automatic. |

### Setup Costs

| Field | What It Is | Where to Find It |
|-------|-----------|-------------------|
| **Furniture & Furnishing** | Everything the guest sees and uses | Budget 2,000-4,000 for a 2-bed. IKEA, Facebook Marketplace, B&M, Dunelm. Don't overspend. |
| **Photography** | Professional listing photos | 100-200 for a decent property photographer. This is NOT optional. |
| **Initial Supplies** | First batch of consumables, linens, towels | 200-400. Buy in bulk. |
| **Listing Setup** | Any costs for getting your listing live | Usually free if you do it yourself. Budget 100-200 if you need help. |
| **Total Setup Investment** | Sum of all setup costs (calculated) | Automatic. |

---

## Terry's Rules of Thumb

These are the benchmarks I use on every single deal. If a property doesn't hit these, I don't touch it.

### Minimum Margins

- **Monthly profit must be at least 500 after ALL costs.** If you're making 200-300/month, one bad month wipes you out. You need a buffer.
- **Profit margin must be at least 25%.** Below that, you're working too hard for too little.
- **Break-even must be within 3-4 months.** If it takes 6+ months to recoup your setup costs, the deal is too thin.

### Occupancy Benchmarks

- **65%** = conservative estimate (use this for your first analysis)
- **75%** = good, achievable with a solid listing and pricing strategy
- **85%+** = exceptional, only realistic in prime locations or during peak seasons
- **Below 55%** = red flag, the area might not have enough demand

### Red Flags (Walk Away Immediately)

- Rent is more than 50% of projected revenue at 65% occupancy
- The area has more than 100 Airbnb listings within 1 mile and low occupancy rates
- Council tax is Band D or above (eats into margins)
- The landlord hasn't explicitly agreed to subletting (this will end badly)
- No nearby transport links, attractions, or business hubs driving demand
- The property needs more than 5,000 in setup costs
- Monthly profit is below 300 even at 75% occupancy

---

## Worked Example: 2-Bed Flat in Manchester (Northern Quarter)

Let me walk you through a real-looking deal so you can see how this works in practice.

### The Property

A 2-bedroom flat on Dale Street, Northern Quarter, Manchester. It's a modern build, decent size, walking distance from Piccadilly Station and the Arndale Centre. The landlord is fine with short-lets.

### The Numbers

**Property Details:**
- Address: 45 Dale Street, Northern Quarter, Manchester, M1 2HF
- Bedrooms: 2
- Type: Flat
- Monthly Rent: 1,100
- City: Manchester

**Revenue Projection:**
- Average Nightly Rate: 120 (based on comparable listings in the Northern Quarter)
- Expected Occupancy: 72% (Manchester average for a well-managed 2-bed)
- Nights Per Month: 21.6
- Monthly Revenue: 2,592
- Annual Revenue: 31,104

**Monthly Costs:**
- Rent: 1,100
- Council Tax: 110 (Band B)
- Utilities: 150
- Insurance: 60
- Cleaning: 480 (60 per clean x 8 turnovers)
- Consumables: 40
- Platform Fees: 78 (3% of revenue)
- Maintenance Reserve: 130 (5% of revenue)
- Management Fee: 0 (self-managed)
- **Total Monthly Costs: 2,148**

**Setup Costs:**
- Furniture & Furnishing: 3,000
- Photography: 150
- Initial Supplies: 300
- Listing Setup: 50
- **Total Setup Investment: 3,500**

**Profitability:**
- Monthly Profit: 444
- Annual Profit: 5,328
- Profit Margin: 17.1%
- ROI on Setup Costs: 152%
- Break-Even: Month 8

### The Verdict: MARGINAL

Now here's where it gets interesting. At first glance, 444/month looks alright. But the profit margin is only 17.1% and break-even is month 8. That's outside my comfort zone.

But what if we push the nightly rate to 130? Now monthly revenue goes to 2,808, monthly profit jumps to 624, and the margin hits 22.2%. Getting closer.

Or what if we negotiate the rent down to 1,000? Now we're at 544/month profit with a 21% margin.

This is exactly why you run the numbers BEFORE you sign anything. Small changes in rent or nightly rate completely change whether a deal works or not.

---

## The 3 Numbers That Make or Break an Airbnb Deal

I've analysed hundreds of deals. And I can tell you, it always comes down to three numbers. Get these right and you'll be profitable. Get any one of them wrong and you'll struggle.

### Number 1: The Rent-to-Revenue Ratio

**Your rent should be no more than 40-45% of your projected monthly revenue.**

This is the single most important number. If your rent is 50%+ of revenue, you've got almost no room for costs and profit. The deal is dead before it starts.

How to calculate it: Monthly Rent / Monthly Revenue x 100

In our Manchester example: 1,100 / 2,592 = 42.4%. That's right on the edge. It works, but there's no room for error.

**The sweet spot is 35-40%.** That gives you breathing room.

### Number 2: The Effective Nightly Rate

**This is your actual revenue per night, not your listed price.**

Most beginners look at what other hosts are charging and think that's what they'll earn. Wrong. You need to account for:
- Weekend vs weekday pricing (weekdays are often 20-30% lower)
- Seasonal dips (January and February in most UK cities are quiet)
- Gaps between bookings (you won't fill every single night)
- Discounts for longer stays

Your effective nightly rate is: Monthly Revenue / 30

If you're listing at 120/night but your effective rate is 86/night (because of gaps, discounts, and quiet periods), that's a very different deal.

**Always run your analysis at 85-90% of the listed comparable rate.** That accounts for reality.

### Number 3: Cost Per Turnover

**This is how much it costs you every time a guest checks out and a new one checks in.**

It includes:
- Cleaning fee (40-70)
- Laundry (if outsourced, 10-20)
- Consumables top-up (5-10)
- Your time or your team's time

If your cost per turnover is 70 and you're getting 10 turnovers per month, that's 700/month just on turnovers. If your average booking is only 1 night at 120, you're spending 70 to make 120. That's a 58% cost on cleaning alone.

**The fix:** aim for an average stay length of 2.5+ nights. Set minimum stays (2-night minimum is standard). Offer weekly discounts to attract longer bookings. Every extra night a guest stays is almost pure profit because there's no turnover cost.

---

## 7 Common Mistakes Beginners Make When Analysing Deals

### Mistake 1: Using Best-Case Occupancy

"I'll just assume 85% occupancy." No, you won't. Not in your first 3 months. Not in January. Not without reviews. Start your analysis at 65% and work up from there. If the deal doesn't work at 65%, it's not a deal.

### Mistake 2: Forgetting About Seasonality

A property that makes 2,500/month in summer might make 1,200/month in winter. Your analysis needs to account for the annual average, not just the good months. I always model a "worst month" scenario alongside the average.

### Mistake 3: Ignoring Platform Fees

Airbnb takes roughly 3% from hosts (and 14-16% from guests). That 3% doesn't sound like much, but on 2,500/month revenue, it's 75. Over a year, it's 900. It adds up.

### Mistake 4: Underestimating Cleaning Costs

Cleaning is almost always your second biggest cost after rent. And it scales with turnovers. If you're getting short stays (1-2 nights), your cleaning costs will eat you alive. Factor in realistic turnover rates.

### Mistake 5: Not Accounting for Void Periods

Your property won't be booked 365 days a year. There will be gaps between bookings, maintenance days, and the occasional cancellation. Build in a 5-10% void buffer on top of your occupancy estimate.

### Mistake 6: Skipping the Setup Cost Recovery Calculation

"I'll make it back eventually." When? Month 3? Month 12? Month 24? You need to know your break-even point. If it takes more than 4 months to recover setup costs, either negotiate harder on rent or find a cheaper way to furnish.

### Mistake 7: Analysing Only One Deal

The biggest mistake is falling in love with the first property you find. Analyse at least 5-10 properties before committing to one. The more deals you run through this spreadsheet, the better your instinct gets for what a good deal looks like.

---

## Ready to Find Your First (or Next) Profitable Airbnb Deal?

This analyser gives you the numbers. But numbers are only half the story.

If you want help finding the right property, negotiating with landlords, setting up your listing to actually get bookings, and building a system that runs without you, that's exactly what we cover in a Strategy Call.

In 30 minutes, we'll:
- Review your current situation and goals
- Identify the best areas and property types for your budget
- Map out your first 90 days to a profitable Airbnb business
- Show you the exact system Terry uses to manage multiple properties

**Book your free Strategy Call now:**

**https://calendly.com/d/cxst-rp2-k95/property-labs-strategy-call-lm**

No pressure. No hard sell. Just a straight conversation about whether Airbnb is right for you and how to do it properly.

---

*Property Labs | propertylabs.co.uk*

*Copyright 2026 Property Labs. All rights reserved.*
