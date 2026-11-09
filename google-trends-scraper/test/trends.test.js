import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseGoogleJson, buildSearches, searchFromUrl, exploreUrl, trendsPageUrl, planWidgetRequests,
    parseTimeline, summarizeTimeline, parseRegions, parseRelated, parseTrendingRss, resolveTime,
} from '../src/trends.js';

const opts = { language: 'en-US', tz: 0, sections: [], regionResolution: 'AUTO' };

test('strips the anti-XSSI prefix', () => {
    assert.deepEqual(parseGoogleJson(")]}'\n{\"a\":1}"), { a: 1 });
    assert.deepEqual(parseGoogleJson(")]}',\n[1]"), [1]);
    assert.throws(() => parseGoogleJson('<html>blocked</html>'));
});

test('one search per term, or batches of 5 when comparing', () => {
    const terms = ['a', 'b', 'c', 'd', 'e', 'f', 'a', ' '];
    assert.equal(buildSearches({ searchTerms: terms }).length, 6);
    const cmp = buildSearches({ searchTerms: terms, compareTerms: true, geo: 'br' });
    assert.deepEqual(cmp.map((s) => s.terms.length), [5, 1]);
    assert.equal(cmp[0].geo, 'BR');
    assert.equal(cmp[0].time, 'today 12-m');
});

test('custom time range overrides preset and is validated', () => {
    assert.equal(resolveTime({ timeRange: 'today 5-y', customTimeRange: '2024-01-01 2024-12-31' }), '2024-01-01 2024-12-31');
    assert.throws(() => resolveTime({ customTimeRange: '2024/01/01' }));
});

test('reads settings from a Google Trends URL', () => {
    const s = searchFromUrl('https://trends.google.com/trends/explore?date=today%205-y&geo=US-CA&q=bitcoin,ethereum&cat=7&gprop=youtube', { geo: '', category: 0 });
    assert.deepEqual(s.terms, ['bitcoin', 'ethereum']);
    assert.equal(s.geo, 'US-CA');
    assert.equal(s.time, 'today 5-y');
    assert.equal(s.category, 7);
    assert.equal(s.property, 'youtube');
    assert.throws(() => searchFromUrl('https://example.com/?q=x', {}));
    assert.throws(() => searchFromUrl('https://trends.google.com/trends/explore?geo=US', {}));
});

test('explore request matches what the website sends', () => {
    const url = new URL(exploreUrl({ terms: ['x', 'y'], geo: 'BR', time: 'now 7-d', category: 0, property: 'web' }, opts));
    const req = JSON.parse(url.searchParams.get('req'));
    assert.deepEqual(req.comparisonItem, [{ keyword: 'x', geo: 'BR', time: 'now 7-d' }, { keyword: 'y', geo: 'BR', time: 'now 7-d' }]);
    assert.equal(req.property, '');
    const page = trendsPageUrl({ terms: ['x'], geo: '', time: 'today 12-m', category: 0, property: 'news' }, opts);
    assert.match(page, /gprop=news/);
    assert.doesNotMatch(page, /geo=/);
});

const explore = {
    widgets: [
        { id: 'TIMESERIES', token: 't1', request: { time: '2025-11-09 2026-11-09' } },
        { id: 'GEO_MAP', token: 't2', request: { resolution: 'REGION', comparisonItem: [{ time: '2025-11-09 2026-11-09' }] } },
        { id: 'GEO_MAP_0', token: 't3', request: {} },
        { id: 'RELATED_TOPICS_0', token: 't4', request: {} },
        { id: 'RELATED_QUERIES_0', token: 't5', request: {} },
        { id: 'RELATED_QUERIES_1', token: 't6', request: {} },
        { id: 'SOMETHING_ELSE', token: 't7', request: {} },
    ],
};

test('plans widget requests per section and term', () => {
    const plans = planWidgetRequests(explore, { terms: ['a', 'b'] }, { ...opts, regionResolution: 'CITY', includeLowVolumeRegions: true });
    assert.deepEqual(plans.map((p) => `${p.section}:${p.term}`), [
        'interestOverTime:null', 'interestByRegion:null', 'relatedTopics:a', 'relatedQueries:a', 'relatedQueries:b',
    ]);
    const geo = plans[1];
    assert.equal(geo.resolution, 'CITY');
    assert.equal(JSON.parse(new URL(geo.url).searchParams.get('req')).includeLowSearchVolumeGeos, true);
    assert.match(plans[0].url, /widgetdata\/multiline\?/);
    // A single term keeps the per-term GEO_MAP widget when it is the only one.
    const only = planWidgetRequests({ widgets: [explore.widgets[2]] }, { terms: ['a'] }, opts);
    assert.equal(only.length, 1);
    // Section filter.
    assert.equal(planWidgetRequests(explore, { terms: ['a', 'b'] }, { ...opts, sections: ['relatedQueries'] }).length, 2);
});

const timeline = {
    default: {
        timelineData: [
            { time: '1762646400', formattedTime: 'Nov 9 – 15, 2025', value: [40, 10] },
            { time: '1763251200', formattedTime: 'Nov 16', value: [50, 10] },
            { time: '1763856000', formattedTime: 'Nov 23', value: [60, 10] },
            { time: '1764460800', formattedTime: 'Nov 30', value: [100, 0] },
            { time: '1765065600', formattedTime: 'Dec 7', value: [5, 3], isPartial: true },
        ],
    },
};

test('parses the timeline and summarizes it', () => {
    const rows = parseTimeline(timeline, ['a', 'b']);
    assert.equal(rows.length, 5);
    assert.equal(rows[0].date, '2025-11-09T00:00:00.000Z');
    assert.equal(rows[0].formattedTime, 'Nov 9 – 15, 2025');
    assert.deepEqual(rows[0].values, { a: 40, b: 10 });
    assert.equal(rows[0].value, undefined);
    assert.equal(rows[4].isPartial, true);
    const sum = summarizeTimeline(rows, ['a', 'b']);
    assert.equal(sum.a.peakValue, 100);
    assert.equal(sum.a.average, 62.5); // partial point excluded
    assert.equal(sum.a.recentDirection, 'rising');
    assert.equal(sum.b.recentDirection, 'falling');
    assert.equal(parseTimeline(timeline, ['a'])[0].value, 40);
});

test('parses regions', () => {
    const rows = parseRegions({ default: { geoMapData: [{ geoCode: 'US-WY', geoName: 'Wyoming', value: [100], hasData: [true] }, { geoCode: 'US-XX', geoName: 'X', value: [0], hasData: [false] }] } }, ['bitcoin']);
    assert.deepEqual(rows[0], { geoCode: 'US-WY', geoName: 'Wyoming', values: { bitcoin: 100 }, value: 100 });
    assert.equal(rows[1].hasData, false);
});

test('parses related queries and topics, including breakouts', () => {
    const q = parseRelated({ default: { rankedList: [
        { rankedKeyword: [{ query: 'bitcoin price', value: 100, formattedValue: '100', link: '/trends/explore?q=bitcoin+price' }] },
        { rankedKeyword: [{ query: 'new coin', value: 32650, formattedValue: 'Breakout' }, { query: 'etf', value: 250, formattedValue: '+250%' }] },
    ] } }, 'queries');
    assert.equal(q.top[0].query, 'bitcoin price');
    assert.equal(q.top[0].trendsUrl, 'https://trends.google.com/trends/explore?q=bitcoin+price');
    assert.equal(q.rising[0].isBreakout, true);
    assert.equal(q.rising[0].increasePercent, null);
    assert.equal(q.rising[1].increasePercent, 250);
    const t = parseRelated({ default: { rankedList: [{ rankedKeyword: [{ topic: { mid: '/m/1', title: 'Bitcoin', type: 'Currency' }, value: 100 }] }] } }, 'topics');
    assert.deepEqual(t.top[0], { topic: 'Bitcoin', type: 'Currency', mid: '/m/1', value: 100, trendsUrl: null });
    assert.deepEqual(t.rising, []);
    assert.deepEqual(parseRelated({ default: { rankedList: [] } }, 'topics'), { top: [], rising: [] });
});

test('parses the trending RSS feed', () => {
    const xml = `<rss><channel><title>Daily Search Trends</title>
    <item><title>hospital &amp; care</title><ht:approx_traffic>2,000+</ht:approx_traffic><pubDate>Mon, 9 Nov 2026 01:20:00 -0800</pubDate>
    <ht:picture>https://img/1</ht:picture><ht:picture_source>AP News</ht:picture_source>
    <ht:news_item><ht:news_item_title>Poland&apos;s news</ht:news_item_title><ht:news_item_snippet/><ht:news_item_url>https://apnews.com/a</ht:news_item_url><ht:news_item_source>AP News</ht:news_item_source></ht:news_item>
    </item><item><title>second</title></item></channel></rss>`;
    const rows = parseTrendingRss(xml, 'US');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, 'hospital & care');
    assert.equal(rows[0].approxTrafficMin, 2000);
    assert.equal(rows[0].startedAt, '2026-11-09T09:20:00.000Z');
    assert.deepEqual(rows[0].news[0], { title: "Poland's news", url: 'https://apnews.com/a', source: 'AP News', picture: null });
    assert.equal(rows[1].rank, 2);
    assert.equal(rows[1].approxTraffic, null);
});
