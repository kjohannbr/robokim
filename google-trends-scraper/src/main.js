import { Actor, log } from 'apify';
import { TrendsClient, PermanentError } from './http.js';
import {
    SECTIONS, buildSearches, exploreUrl, trendsPageUrl, planWidgetRequests, parseGoogleJson,
    parseTimeline, summarizeTimeline, parseRegions, parseRelated, parseTrendingRss, trendingRssUrl,
} from './trends.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const opts = {
    language: (input.language || 'en-US').trim(),
    tz: 0,
    sections: (input.sections?.length ? input.sections : SECTIONS).filter((s) => SECTIONS.includes(s)),
    regionResolution: input.regionResolution || 'AUTO',
    includeLowVolumeRegions: Boolean(input.includeLowVolumeRegions),
};

let searches;
try {
    searches = buildSearches(input);
} catch (err) {
    await Actor.fail(`Invalid input: ${err.message}`);
}
const trendingCountries = [...new Set((input.trendingNowCountries || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean))];

if (!searches.length && !trendingCountries.length) {
    await Actor.fail('Nothing to do: add at least one search term, Google Trends URL or "Trending now" country.');
}

// Proxy: Apify Proxy on the platform. Locally without Apify credentials we fall back to a direct connection.
let proxyConfiguration;
const wantsProxy = input.proxyConfiguration ?? { useApifyProxy: true };
if (wantsProxy.useApifyProxy && !Actor.isAtHome() && !process.env.APIFY_PROXY_PASSWORD && !process.env.APIFY_TOKEN) {
    log.warning('Running locally without Apify credentials: requests go out directly, without a proxy.');
} else {
    proxyConfiguration = await Actor.createProxyConfiguration(wantsProxy);
}

const client = new TrendsClient({ proxyConfiguration, maxRetries: input.maxRetries ?? 6 });
const failures = [];
let pushed = 0;
let chargeLimitReached = false;

async function push(item) {
    if (chargeLimitReached) return;
    const result = await Actor.pushData(item);
    pushed++;
    if (result?.eventChargeLimitReached) {
        chargeLimitReached = true;
        log.warning('The maximum cost per run you set was reached, stopping.');
    }
}

async function scrapeSearch(search) {
    const label = `"${search.terms.join(', ')}"`;
    const explore = parseGoogleJson(await client.getText(exploreUrl(search, opts), `${label} explore`));
    const plans = planWidgetRequests(explore, search, opts);

    const item = {
        type: search.terms.length > 1 ? 'comparison' : 'keyword',
        searchTerms: search.terms,
        keyword: search.terms.length === 1 ? search.terms[0] : null,
        geo: search.geo || 'WORLDWIDE',
        timeRange: search.time,
        resolvedTimeRange: null,
        category: search.category,
        property: search.property,
        trendsUrl: trendsPageUrl(search, opts),
        input: search.source,
    };
    if (opts.sections.includes('interestOverTime')) { item.summary = null; item.interestOverTime = []; }
    if (opts.sections.includes('interestByRegion')) { item.regionResolution = null; item.interestByRegion = []; }
    const perTerm = search.terms.length > 1;
    if (opts.sections.includes('relatedQueries')) item.relatedQueries = perTerm ? {} : { top: [], rising: [] };
    if (opts.sections.includes('relatedTopics')) item.relatedTopics = perTerm ? {} : { top: [], rising: [] };
    const errors = [];

    for (const plan of plans) {
        if (chargeLimitReached) return;
        try {
            const json = parseGoogleJson(await client.getText(plan.url, `${label} ${plan.section}`));
            if (plan.section === 'interestOverTime') {
                item.interestOverTime = parseTimeline(json, search.terms);
                item.summary = summarizeTimeline(item.interestOverTime, search.terms);
                item.resolvedTimeRange = plan.resolvedTime;
            } else if (plan.section === 'interestByRegion') {
                item.interestByRegion = parseRegions(json, search.terms);
                item.regionResolution = plan.resolution;
            } else {
                const parsed = parseRelated(json, plan.section === 'relatedTopics' ? 'topics' : 'queries');
                if (perTerm) item[plan.section][plan.term ?? search.terms[0]] = parsed;
                else item[plan.section] = parsed;
            }
        } catch (err) {
            log.warning(`${label}: could not get ${plan.section}: ${err.message}`);
            errors.push({ section: plan.section, term: plan.term, message: err.message });
        }
    }
    item.scrapedAt = new Date().toISOString();
    if (errors.length) item.errors = errors;
    if (errors.length && errors.length === plans.length) {
        throw new Error(`every section failed (${errors[0].message})`);
    }
    await push(item);
    log.info(`${label}: done${errors.length ? ` with ${errors.length} missing section(s)` : ''}.`);
}

async function scrapeTrending(country) {
    const xml = await client.getText(trendingRssUrl(country, opts.language), `trending ${country}`);
    const rows = parseTrendingRss(xml, country);
    const scrapedAt = new Date().toISOString();
    for (const row of rows) {
        if (chargeLimitReached) return;
        await push({ type: 'trendingNow', ...row, scrapedAt });
    }
    log.info(`Trending now ${country}: ${rows.length} trending searches.`);
}

const tasks = [
    ...searches.map((s) => ({ name: s.terms.join(', '), run: () => scrapeSearch(s) })),
    ...trendingCountries.map((c) => ({ name: `trending now ${c}`, run: () => scrapeTrending(c) })),
];
log.info(`Starting ${searches.length} Google Trends search(es) and ${trendingCountries.length} trending-now feed(s).`);

const concurrency = Math.max(1, Math.min(10, input.maxConcurrency ?? 2));
let next = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length && !chargeLimitReached) {
        const task = tasks[next++];
        try {
            await task.run();
        } catch (err) {
            const message = err instanceof PermanentError ? err.message : `${task.name}: ${err.message}`;
            log.error(message);
            failures.push({ task: task.name, message });
        }
    }
}));

await Actor.setValue('RUN_SUMMARY', { results: pushed, failed: failures, http: client.stats });
log.info(`Finished: ${pushed} result(s), ${failures.length} failed task(s). HTTP requests: ${client.stats.requests}, retries: ${client.stats.retries}, rate-limited: ${client.stats.rateLimited}.`);

if (failures.length && failures.length === tasks.length) {
    await Actor.fail(`All ${tasks.length} task(s) failed. First error: ${failures[0].message}`);
} else {
    if (failures.length) await Actor.setStatusMessage(`${pushed} results, ${failures.length} task(s) failed (see RUN_SUMMARY in the key-value store).`);
    await Actor.exit();
}
