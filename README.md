# robokim

Apify Actors. Each Actor lives in its own folder.

| Folder | What it is | Status |
|---|---|---|
| [google-hotels-scraper](google-hotels-scraper) | Google Hotels Scraper | Built from the repository root |
| [google-trends-scraper](google-trends-scraper) | Google Trends Scraper & API | Paused: Google Trends answers HTTP 429 even through residential proxy |
| [source-probe](source-probe) | Internal tool that checks which candidate sources answer before an Actor is built | Run it by pointing the root `.actor/actor.json` at its folder |
