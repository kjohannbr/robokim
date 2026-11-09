# Google Trends Scraper & API

Get **Google Trends data** for any keyword without writing code: **interest over time**, **interest by region** (countries, states, metro areas, cities), **related queries**, **related topics** and today's **trending searches** with news articles. Compare up to 5 keywords on one scale, pick any country, time range, category or Google property (Web, YouTube, News, Images, Google Shopping), and export everything to JSON, CSV, Excel or straight into your app through the API.

It is a simple **Google Trends API alternative** (and a hosted replacement for `pytrends`): you send keywords, you get clean, structured data back.

## What can this Google Trends scraper do?

- 📈 **Interest over time**: the 0-100 search interest curve for any period, from the past hour to 2004-present, or your own custom dates.
- 🧭 **Ready-made summary**: for every keyword you also get the average, the peak value and date, the latest value and whether interest is **rising, falling or stable** right now. No spreadsheet work needed.
- 🗺️ **Interest by region**: by country, state/province, US metro area (DMA) or city, including low-volume regions if you want them.
- 🔎 **Related queries and related topics**: top and rising, with **Breakout** terms flagged, so you can spot new keywords before your competitors.
- ⚖️ **Compare keywords**: up to 5 terms on one shared scale, exactly like the Google Trends website.
- 🔥 **Trending now**: today's trending searches for any country with approximate search volume and the news stories behind them.
- 🔗 **Paste Google Trends URLs**: open a search on trends.google.com, copy the link, and the scraper reads keywords, country, dates, category and property from it.
- 🎥 **Any Google property**: Web search, YouTube search, Google News, Google Images and Google Shopping.
- 🛡️ **Built for reliability**: Google Trends often answers "too many requests". This actor waits and retries patiently through Apify Proxy, and if one part of a page fails you still get every other part, with a clear note about what is missing.

## What data can you extract from Google Trends?

| Data | Field |
|---|---|
| Search interest over time (0-100) per date | `interestOverTime` |
| Average, peak, latest value, recent direction | `summary` |
| Search interest by country / state / metro / city | `interestByRegion` |
| Top and rising related searches, breakouts | `relatedQueries` |
| Top and rising related topics (with topic type and ID) | `relatedTopics` |
| Exact dates used by Google Trends | `resolvedTimeRange` |
| Link to the same view on Google Trends | `trendsUrl` |
| Trending searches, approximate traffic, news articles | `type: "trendingNow"` |

## How to use Google Trends Scraper

1. Click **Try for free** and open the **Input** tab.
2. Type one or more **search terms** (or paste Google Trends URLs).
3. Choose the **country or region**, **time range**, **category** and **Google property** if you need them. Leave them as they are for worldwide web search over the past 12 months.
4. Turn on **Compare terms** to put several keywords on one scale.
5. Click **Start** and download the results as JSON, CSV, Excel or HTML, or connect them to Google Sheets, Zapier, Make, n8n or your own code.

## Input example

```json
{
    "searchTerms": ["chatgpt", "gemini", "claude"],
    "compareTerms": true,
    "geo": "US",
    "timeRange": "today 12-m",
    "property": "web",
    "sections": ["interestOverTime", "interestByRegion", "relatedQueries"],
    "trendingNowCountries": ["US", "BR"]
}
```

Country and region codes follow Google Trends: `US`, `GB`, `BR`, `DE`, `IN`, or regions such as `US-CA` and `BR-SP`. Leave the field empty for worldwide.

## Output example

One result per keyword (or per comparison):

```json
{
    "type": "keyword",
    "searchTerms": ["bitcoin"],
    "keyword": "bitcoin",
    "geo": "US",
    "timeRange": "today 12-m",
    "resolvedTimeRange": "2025-11-09 2026-11-09",
    "category": 0,
    "property": "web",
    "trendsUrl": "https://trends.google.com/trends/explore?q=bitcoin&date=today+12-m&hl=en-US&geo=US",
    "summary": {
        "bitcoin": {
            "average": 48.3,
            "peakValue": 100,
            "peakDate": "2026-02-01T00:00:00.000Z",
            "latestValue": 41,
            "recentChangePercent": -12.5,
            "recentDirection": "falling"
        }
    },
    "interestOverTime": [
        { "date": "2025-11-09T00:00:00.000Z", "timestamp": 1762646400, "formattedTime": "Nov 9 – 15, 2025", "isPartial": false, "values": { "bitcoin": 41 }, "value": 41 }
    ],
    "regionResolution": "REGION",
    "interestByRegion": [
        { "geoCode": "US-WY", "geoName": "Wyoming", "values": { "bitcoin": 100 }, "value": 100 }
    ],
    "relatedQueries": {
        "top": [{ "query": "bitcoin price", "value": 100, "trendsUrl": "https://trends.google.com/trends/explore?q=bitcoin+price&date=today+12-m&geo=US" }],
        "rising": [{ "query": "bitcoin etf", "isBreakout": false, "increasePercent": 250, "formattedValue": "+250%", "trendsUrl": "..." }]
    },
    "relatedTopics": { "top": [], "rising": [] },
    "scrapedAt": "2026-11-09T10:00:00.000Z"
}
```

Trending searches come as separate results:

```json
{
    "type": "trendingNow",
    "country": "BR",
    "rank": 1,
    "title": "previsão do tempo",
    "approxTraffic": "200+",
    "approxTrafficMin": 200,
    "startedAt": "2026-11-09T09:20:00.000Z",
    "news": [{ "title": "...", "url": "https://g1.globo.com/...", "source": "G1", "picture": "..." }]
}
```

In comparisons, `values` holds one number per keyword, and `relatedQueries` / `relatedTopics` are grouped by keyword.

## How much does it cost to scrape Google Trends?

You pay per result: one result per keyword (or per comparison of up to 5 keywords), and one per trending search. You can see the exact price on the **Pricing** tab, and you can cap the cost of any run with the **maximum cost per run** setting. Apify's free plan includes monthly credits, enough to try the scraper on hundreds of keywords.

Tip: a comparison of 5 keywords costs the same as one keyword, and leaving out sections you don't need makes runs faster.

## Use cases

- **SEO and content planning**: find rising and breakout queries, check seasonality before you publish, pick the keyword with more interest.
- **Market research and product launches**: compare brands, products or features over time and by region.
- **E-commerce**: plan stock and campaigns around seasonal peaks, use Google Shopping interest.
- **YouTube and creators**: measure interest on YouTube search, not just web search.
- **Finance and data science**: feed Google Trends time series into models and dashboards.
- **News and social media monitoring**: schedule the "Trending now" feed every hour and react first.

## Schedule it and get alerts

Use Apify **Schedules** to run the scraper every day or every hour, and **integrations** (email, Slack, Google Sheets, webhooks, Zapier, Make, n8n) to send the results wherever you need them.

## Use the Google Trends API from your code

Call the actor through the [Apify API](https://docs.apify.com/api/v2) or the Apify clients:

```python
from apify_client import ApifyClient

client = ApifyClient("<YOUR_APIFY_TOKEN>")
run = client.actor("<USERNAME>/google-trends-scraper").call(run_input={
    "searchTerms": ["web scraping"],
    "geo": "US",
    "timeRange": "today 5-y",
})
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item["summary"])
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: '<YOUR_APIFY_TOKEN>' });
const run = await client.actor('<USERNAME>/google-trends-scraper').call({ searchTerms: ['web scraping'] });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items[0].interestOverTime);
```

It also works with AI agents through the [Apify MCP server](https://mcp.apify.com).

## FAQ

**Is there an official Google Trends API?**
Google has announced an official Google Trends API, but access is limited. This scraper gives you the same data as the public Google Trends website today, with no application or waiting list.

**Why are values between 0 and 100?**
Google Trends never shows absolute search volumes. 100 is the peak popularity for the selected terms, place and time, 50 means half as popular, and 0 means there was not enough data. Values in one comparison share the same scale. Separate searches do not.

**What does "Breakout" mean?**
A rising query or topic grew more than 5,000%. These are flagged with `isBreakout: true`.

**Why is the last point marked `isPartial`?**
The current day, week or month is not finished yet, so its value can still change. The summary leaves partial points out.

**Can I get daily data for a whole year?**
Google Trends picks the granularity from the period: up to about 9 months gives daily points, longer periods give weekly or monthly points. Run several shorter custom time ranges if you need daily data for longer periods.

**Is scraping Google Trends legal?**
This actor collects aggregated, public statistics that contain no personal data. Still, check the terms of the sites you use and the rules that apply to you. If you are unsure, ask a lawyer.

**Something did not work.**
Open an issue on the **Issues** tab with your input and run link. Issues are answered quickly.
