// Source probe: one plain GET per target and proxy group, a couple of times each,
// to learn which candidate sources answer normally before building an Actor for them.
// It does not try to get around blocks: a blocked answer is recorded as blocked.
import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';

const DEFAULT_TARGETS = [
    { label: 'google-jobs', url: 'http://www.google.com/search?q=software+engineer+jobs+new+york&udm=8&hl=en&gl=us', expect: 'software engineer' },
    { label: 'google-hotels', url: 'https://www.google.com/travel/search?q=hotels%20in%20paris&hl=en&gl=us&curr=USD', expect: 'Paris' },
    { label: 'google-trends-api', url: 'https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=%7B%22comparisonItem%22%3A%5B%7B%22keyword%22%3A%22web%20scraping%22%2C%22geo%22%3A%22%22%2C%22time%22%3A%22today%2012-m%22%7D%5D%2C%22category%22%3A0%2C%22property%22%3A%22%22%7D', expect: 'widgets' },
    { label: 'coles-au', url: 'https://www.coles.com.au/search/products?q=milk', expect: '__NEXT_DATA__' },
    { label: 'woolworths-au', url: 'https://www.woolworths.com.au/shop/search/products?searchTerm=milk', expect: 'milk' },
    { label: 'product-hunt', url: 'https://www.producthunt.com/', expect: 'Product Hunt' },
    { label: 'g2', url: 'https://www.g2.com/products/slack/reviews', expect: 'Slack' },
    { label: 'capterra', url: 'https://www.capterra.com/p/135003/Slack/reviews/', expect: 'Slack' },
];

// Text that pages show when they refuse automated traffic.
const BLOCK_MARKERS = ['unusual traffic', 'captcha', '/sorry/', 'access denied', 'just a moment', 'cf-chl', 'pardon our interruption', 'incapsula', 'datadome', 'px-captcha', 'are you a robot'];

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const targets = input.targets?.length ? input.targets : DEFAULT_TARGETS;
const proxyGroups = input.proxyGroups?.length ? input.proxyGroups : ['DATACENTER', 'RESIDENTIAL', 'GOOGLE_SERP'];
const attempts = Math.max(1, Math.min(5, input.attemptsPerCombination ?? 2));

async function proxyFor(group) {
    if (group === 'NONE') return null;
    try {
        if (group === 'DATACENTER') return await Actor.createProxyConfiguration({});
        return await Actor.createProxyConfiguration({ groups: [group] });
    } catch (err) {
        log.warning(`Proxy group ${group} is not available: ${err.message}`);
        return undefined;
    }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(target, group, proxyConfiguration) {
    const tries = [];
    for (let i = 0; i < attempts; i++) {
        if (i) await sleep(3000);
        const started = Date.now();
        const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl(`p${Math.random().toString(36).slice(2, 12)}`) : undefined;
        try {
            const res = await gotScraping({
                url: target.url,
                proxyUrl,
                throwHttpErrors: false,
                retry: { limit: 0 },
                timeout: { request: 30000 },
                responseType: 'text',
            });
            const body = res.body || '';
            const lower = body.toLowerCase();
            const blockedBy = BLOCK_MARKERS.filter((m) => lower.includes(m));
            tries.push({
                status: res.statusCode,
                ms: Date.now() - started,
                bytes: body.length,
                finalUrl: res.url,
                hasExpectedText: target.expect ? lower.includes(target.expect.toLowerCase()) : null,
                blockMarkers: blockedBy,
                title: (/<title[^>]*>([^<]{0,120})/i.exec(body)?.[1] || '').trim(),
                snippet: body.replace(/\s+/g, ' ').slice(0, 200),
            });
        } catch (err) {
            tries.push({ status: null, ms: Date.now() - started, error: err.code || err.message });
        }
    }
    const ok = tries.filter((t) => t.status === 200 && t.hasExpectedText !== false && !t.blockMarkers?.length).length;
    return { verdict: ok === tries.length ? 'OK' : ok ? 'PARTIAL' : 'BLOCKED', okAttempts: `${ok}/${tries.length}`, tries };
}

const summary = [];
for (const group of proxyGroups) {
    const proxyConfiguration = await proxyFor(group);
    if (proxyConfiguration === undefined) {
        summary.push({ proxyGroup: group, note: 'not available on this account' });
        continue;
    }
    await Promise.all(targets.map(async (target) => {
        // The Google SERP proxy only works for Google Search pages over plain http.
        if (group === 'GOOGLE_SERP' && !/^http:\/\/www\.google\./.test(target.url)) return;
        const result = await probe(target, group, proxyConfiguration);
        log.info(`${result.verdict.padEnd(8)} ${target.label} via ${group} (${result.okAttempts}) statuses=${result.tries.map((t) => t.status ?? t.error).join(',')}`);
        summary.push({ target: target.label, proxyGroup: group, verdict: result.verdict, okAttempts: result.okAttempts });
        await Actor.pushData({ target: target.label, url: target.url, proxyGroup: group, ...result });
    }));
}

await Actor.setValue('SUMMARY', summary);
log.info('SUMMARY (target | proxy | verdict):');
for (const s of summary.filter((x) => x.target).sort((a, b) => a.target.localeCompare(b.target))) {
    log.info(`  ${s.target.padEnd(18)} ${s.proxyGroup.padEnd(12)} ${s.verdict} ${s.okAttempts}`);
}
await Actor.exit();
