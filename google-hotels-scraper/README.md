# Google Hotels Scraper

Scrape **Google Hotels** for any city and travel dates and get every hotel as clean data: **price per night**, **guest rating**, **review count** with the 1-5 star breakdown, **hotel star class**, description, **coordinates**, check-in and check-out times, website, **photos** and **nearby places** with travel times. Filter by price, rating and stars, then export to JSON, CSV or Excel, or pull the data into your app through the API.

Use it as a simple **Google Hotels API**: send a destination and dates, get structured hotel prices back.

## What can this Google Hotels scraper do?

- 🏨 **Search any destination**: cities, neighborhoods, landmarks or free-text searches like "pet friendly hotels in Austin".
- 📅 **Your dates and guests**: set check-in, check-out and the number of adults. Every result tells you which dates Google actually used (`datesMatched`), so you never mix up prices.
- 💲 **Price per night** as Google shows it, with the exact value, the currency code and an availability flag for sold-out hotels.
- ⭐ **Ratings and reviews**: guest rating, review count and the percentage and count of 1 to 5 star reviews.
- 📍 **Location data**: latitude, longitude, country, website, check-in and check-out times, and nearby attractions, airports, restaurants and stations with walking, driving and transit times.
- 🖼️ **Photos** and a direct link to each hotel's Google Hotels page.
- 🔎 **Filters**: minimum rating, minimum star class, maximum price per night, only hotels with a price.
- 💱 **Any currency**: prices follow the proxy country. United States gives US dollars, Germany gives euros, United Kingdom gives pounds.
- 🛡️ **Reliable**: one light request per search, no browser, automatic retries with a fresh IP if Google answers with an error.

## What data do you get?

| Field | Example |
|---|---|
| `name` | Hills Hotel Lisboa |
| `pricePerNight`, `priceText`, `currency` | 64, "$64", USD |
| `rating`, `reviewCount` | 4.1, 362 |
| `ratingBreakdown` | 5 stars: 52% (188 reviews), ... |
| `stars`, `hotelClass` | 4, "4-star hotel" |
| `checkIn`, `checkOut`, `nights`, `datesMatched` | 2026-12-10, 2026-12-12, 2, true |
| `latitude`, `longitude`, `countryCode` | 38.72, -9.14, PT |
| `checkInTime`, `checkOutTime`, `website` | 3:00 PM, 12:00 PM, https://... |
| `nearbyPlaces` | Lisbon Airport, driving 15 min |
| `images`, `googleHotelsUrl` | photo URLs, Google Hotels page |
| `position`, `totalResultsForSearch` | rank on the page, total properties Google reports |

## How to scrape Google Hotels

1. Click **Try for free** and open the **Input** tab.
2. Type one or more **locations**, for example `Paris`, `Lisbon` or `Times Square, New York`.
3. Optionally set **check-in** and **check-out** dates and the number of **adults**.
4. Optionally add **filters** (minimum rating, stars, maximum price).
5. Click **Start**, then download the results as JSON, CSV, Excel or HTML, or send them to Google Sheets, Zapier, Make, n8n or your own code.

## Input example

```json
{
    "locations": ["Lisbon", "Porto"],
    "checkInDate": "2026-12-10",
    "checkOutDate": "2026-12-12",
    "adults": 2,
    "minRating": 4,
    "maxPricePerNight": 200,
    "proxyConfiguration": { "useApifyProxy": true, "apifyProxyCountry": "US" }
}
```

## Output example

```json
{
    "searchInput": "Lisbon",
    "searchQuery": "hotels in Lisbon dec 10 2026 to dec 12 2026 for 2 adults",
    "position": 1,
    "name": "Hills Hotel Lisboa",
    "hotelClass": "4-star hotel",
    "stars": 4,
    "rating": 4.1,
    "reviewCount": 362,
    "ratingBreakdown": { "5star": { "percent": 52, "count": 188 }, "4star": { "percent": 25, "count": 90 } },
    "pricePerNight": 64,
    "pricePerNightExact": 63.82,
    "priceText": "$64",
    "currency": "USD",
    "isAvailable": true,
    "checkIn": "2026-12-10",
    "checkOut": "2026-12-12",
    "nights": 2,
    "datesMatched": true,
    "latitude": 38.7223,
    "longitude": -9.1393,
    "countryCode": "PT",
    "checkInTime": "3:00 PM",
    "checkOutTime": "12:00 PM",
    "website": "https://...",
    "nearbyPlaces": [{ "name": "Humberto Delgado Airport", "category": "airport", "travelTimes": [{ "mode": "driving", "duration": "15 min" }] }],
    "images": ["https://lh3.googleusercontent.com/..."],
    "googleHotelsUrl": "https://www.google.com/travel/hotels/entity/...",
    "totalResultsForSearch": 1851,
    "scrapedAt": "2026-11-09T23:30:00.000Z"
}
```

Values in this example are illustrative.

## How much does it cost to scrape Google Hotels?

You pay per hotel saved. The exact price is on the **Pricing** tab, and you can cap any run with the **maximum cost per run** setting. Filters run before saving, so hotels you filter out are not charged. The Apify free plan includes monthly credits, enough to try the scraper on many destinations.

## Use cases

- **Hotel price monitoring**: schedule daily runs for the same city and dates and watch prices change.
- **Revenue management and competitor analysis**: compare your hotel's price and rating with nearby properties.
- **Travel apps and comparison sites**: feed hotel lists, photos and coordinates into your product.
- **Market research**: average prices, ratings and star classes by city or neighborhood.
- **Lead generation**: hotel names, websites and locations for B2B outreach.

## Tips

- **More hotels per city**: version 1 reads the first results page (about 18-20 hotels per search). Add neighborhoods or landmarks as extra locations, for example `Lisbon Alfama`, `Lisbon Baixa`, `Lisbon Belém`.
- **Currency**: change the proxy country in **Proxy configuration**. Prices are always in the currency reported in `currency`.
- **Dates**: when dates are set, check `datesMatched`. If Google could not apply your dates it is `false`, and `checkIn` / `checkOut` show the dates actually used.

## Use the Google Hotels API from your code

```python
from apify_client import ApifyClient

client = ApifyClient("<YOUR_APIFY_TOKEN>")
run = client.actor("<USERNAME>/google-hotels-scraper").call(run_input={
    "locations": ["Lisbon"],
    "checkInDate": "2026-12-10",
    "checkOutDate": "2026-12-12",
})
for hotel in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(hotel["name"], hotel["pricePerNight"], hotel["currency"])
```

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: '<YOUR_APIFY_TOKEN>' });
const run = await client.actor('<USERNAME>/google-hotels-scraper').call({ locations: ['Lisbon'] });
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items.map((h) => `${h.name}: ${h.priceText}`));
```

It also works with AI agents through the [Apify MCP server](https://mcp.apify.com).

## FAQ

**Is the price per night or for the whole stay?**
Per night, as Google Hotels shows it by default. Multiply by `nights` for the stay total.

**Why do some hotels have no price?**
Google shows no price when a property is sold out or has no offers for your dates. These have `isAvailable: false`. Turn on **Only hotels with a price** to leave them out.

**Does it include sponsored hotels?**
No. Sponsored carousels are skipped. Results are the regular Google Hotels list in page order.

**Is scraping Google Hotels legal?**
The scraper collects public listing information about businesses, not personal data. Check the rules that apply to your use. If you are unsure, ask a lawyer.

**Something did not work.**
Open an issue on the **Issues** tab with your input and run link. Issues are answered quickly.
