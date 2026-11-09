import { Actor, log } from 'apify';
import { HttpClient, PermanentError } from './http.js';
import { buildSearches, searchUrl, extractData, parseSearchPage, passesFilters } from './hotels.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
let searches;
try {
    searches = buildSearches(input);
} catch (err) {
    await Actor.fail(`Invalid input: ${err.message}`);
}
if (!searches.length) await Actor.fail('Nothing to do: add at least one location or search query.');

const language = (input.language || 'en').trim();
const maxResults = Math.max(1, Math.min(20, input.maxResultsPerSearch ?? 20));
const filters = {
    minRating: Number(input.minRating) || 0,
    minStars: Number(input.minStars) || 0,
    maxPricePerNight: Number(input.maxPricePerNight) || 0,
    onlyAvailable: Boolean(input.onlyAvailable),
};

// Google Hotels shows prices in the currency of the visitor's country, so the proxy country sets the currency.
let proxyConfiguration;
const wantsProxy = input.proxyConfiguration ?? { useApifyProxy: true, apifyProxyCountry: 'US' };
if (wantsProxy.useApifyProxy && !Actor.isAtHome() && !process.env.APIFY_PROXY_PASSWORD && !process.env.APIFY_TOKEN) {
    log.warning('Running locally without Apify credentials: requests go out directly, without a proxy. Prices will be in your local currency.');
} else {
    proxyConfiguration = await Actor.createProxyConfiguration(wantsProxy);
}

const client = new HttpClient({ proxyConfiguration, maxRetries: input.maxRetries ?? 5 });
const failures = [];
let pushed = 0;
let chargeLimitReached = false;
let warnedDates = false;

const pageProblem = (html) => {
    try {
        return extractData(html) ? null : 'page has no hotel results block (blocked or unexpected page)';
    } catch (err) {
        return `could not read the results block (${err.message})`;
    }
};

async function scrapeSearch(search) {
    const label = `"${search.queryText}"`;
    const html = await client.getText(searchUrl(search, { language }), label, pageProblem);
    const { hotels, totalResults } = parseSearchPage(extractData(html));
    if (!hotels.length) {
        log.warning(`${label}: Google returned no hotels for this search.`);
        return;
    }
    const scrapedAt = new Date().toISOString();
    let kept = 0;
    for (const [i, hotel] of hotels.entries()) {
        if (chargeLimitReached || kept >= maxResults) break;
        if (!passesFilters(hotel, filters)) continue;
        const datesMatched = search.checkIn ? hotel.checkIn === search.checkIn && hotel.checkOut === search.checkOut : null;
        if (datesMatched === false && !warnedDates) {
            warnedDates = true;
            log.warning(`${label}: Google used ${hotel.checkIn} to ${hotel.checkOut} instead of the requested dates. Those results are marked with datesMatched=false.`);
        }
        const item = {
            searchInput: search.input,
            searchQuery: search.queryText,
            position: i + 1,
            ...hotel,
            requestedCheckIn: search.checkIn,
            requestedCheckOut: search.checkOut,
            adults: search.adults,
            datesMatched,
            totalResultsForSearch: totalResults,
            scrapedAt,
        };
        const result = await Actor.pushData(item);
        pushed++;
        kept++;
        if (result?.eventChargeLimitReached) {
            chargeLimitReached = true;
            log.warning('The maximum cost per run you set was reached, stopping.');
        }
    }
    log.info(`${label}: ${kept} hotel(s) saved (${hotels.length} on the page${totalResults ? `, ${totalResults} in total on Google` : ''}).`);
}

log.info(`Starting ${searches.length} search(es).`);
const concurrency = Math.max(1, Math.min(10, input.maxConcurrency ?? 3));
let next = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, searches.length) }, async () => {
    while (next < searches.length && !chargeLimitReached) {
        const search = searches[next++];
        try {
            await scrapeSearch(search);
        } catch (err) {
            const message = err instanceof PermanentError ? err.message : `"${search.queryText}": ${err.message}`;
            log.error(message);
            failures.push({ search: search.queryText, message });
        }
    }
}));

await Actor.setValue('RUN_SUMMARY', { results: pushed, failed: failures, http: client.stats });
log.info(`Finished: ${pushed} hotel(s), ${failures.length} failed search(es). HTTP requests: ${client.stats.requests}, retries: ${client.stats.retries}.`);

if (failures.length && failures.length === searches.length) {
    await Actor.fail(`All ${searches.length} search(es) failed. First error: ${failures[0].message}`);
} else {
    if (failures.length) await Actor.setStatusMessage(`${pushed} hotels, ${failures.length} search(es) failed (see RUN_SUMMARY in the key-value store).`);
    await Actor.exit();
}
