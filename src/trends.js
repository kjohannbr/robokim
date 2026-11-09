// Pure helpers: building Google Trends requests and turning its responses into clean records.
// Nothing in this file does network I/O, so it is fully covered by unit tests.

export const TRENDS_ORIGIN = 'https://trends.google.com';
export const MAX_TERMS_PER_COMPARISON = 5;

export const SECTIONS = ['interestOverTime', 'interestByRegion', 'relatedQueries', 'relatedTopics'];
export const TIME_RANGES = ['now 1-H', 'now 4-H', 'now 1-d', 'now 7-d', 'today 1-m', 'today 3-m', 'today 12-m', 'today 5-y', 'all'];
const PROPERTIES = { web: '', images: 'images', news: 'news', froogle: 'froogle', youtube: 'youtube' };

/** Google prefixes JSON responses with an anti-XSSI guard such as `)]}'` or `)]}',`. */
export function parseGoogleJson(text) {
    const start = text.search(/[[{]/);
    if (start === -1) throw new Error(`Response is not JSON: ${text.slice(0, 120)}`);
    return JSON.parse(text.slice(start));
}

export function normalizeGeo(geo) {
    return (geo || '').trim().toUpperCase();
}

export function normalizeProperty(property) {
    const p = (property || 'web').trim().toLowerCase();
    return p in PROPERTIES ? p : 'web';
}

/** The `time` value Google expects: a preset such as "today 12-m" or "YYYY-MM-DD YYYY-MM-DD". */
export function resolveTime({ timeRange, customTimeRange }) {
    const custom = (customTimeRange || '').trim();
    if (custom) {
        if (!/^\d{4}-\d{2}-\d{2} \d{4}-\d{2}-\d{2}$/.test(custom)) {
            throw new Error(`Custom time range "${custom}" must look like "2024-01-01 2024-12-31".`);
        }
        return custom;
    }
    const preset = (timeRange || 'today 12-m').trim();
    return preset;
}

/**
 * Turns the input into a list of searches. Each search is one Google Trends explore page
 * (1 to 5 terms sharing the same geo, time, category and property) and becomes one dataset item.
 */
export function buildSearches(input) {
    const base = {
        geo: normalizeGeo(input.geo),
        time: resolveTime(input),
        category: Number(input.category || 0) || 0,
        property: normalizeProperty(input.property),
    };
    const terms = [...new Set((input.searchTerms || []).map((t) => String(t).trim()).filter(Boolean))];
    const searches = [];
    if (input.compareTerms) {
        for (let i = 0; i < terms.length; i += MAX_TERMS_PER_COMPARISON) {
            searches.push({ ...base, terms: terms.slice(i, i + MAX_TERMS_PER_COMPARISON), source: 'searchTerms' });
        }
    } else {
        for (const term of terms) searches.push({ ...base, terms: [term], source: 'searchTerms' });
    }
    for (const entry of input.startUrls || []) {
        const url = typeof entry === 'string' ? entry : entry?.url;
        if (!url) continue;
        searches.push(searchFromUrl(url, base));
    }
    return searches;
}

/** Reads keywords and settings from a Google Trends explore URL. */
export function searchFromUrl(url, defaults) {
    let parsed;
    try {
        parsed = new URL(url, TRENDS_ORIGIN);
    } catch {
        throw new Error(`Not a valid URL: ${url}`);
    }
    if (!/(^|\.)trends\.google\./.test(parsed.hostname) || !parsed.pathname.includes('explore')) {
        throw new Error(`Not a Google Trends explore URL: ${url}`);
    }
    const p = parsed.searchParams;
    const terms = (p.get('q') || '').split(',').map((t) => t.trim()).filter(Boolean);
    if (!terms.length) throw new Error(`The URL has no search term (q=...): ${url}`);
    if (terms.length > MAX_TERMS_PER_COMPARISON) {
        throw new Error(`Google Trends compares at most ${MAX_TERMS_PER_COMPARISON} terms, the URL has ${terms.length}: ${url}`);
    }
    const first = (v) => (v || '').split(',')[0].trim();
    return {
        terms,
        geo: p.has('geo') ? normalizeGeo(first(p.get('geo'))) : defaults.geo,
        time: p.has('date') ? first(p.get('date')) : 'today 12-m',
        category: p.has('cat') ? Number(p.get('cat')) || 0 : defaults.category,
        property: p.has('gprop') ? normalizeProperty(p.get('gprop')) : 'web',
        source: url,
    };
}

export function exploreUrl(search, { language, tz = 0 }) {
    const req = {
        comparisonItem: search.terms.map((keyword) => ({ keyword, geo: search.geo, time: search.time })),
        category: search.category,
        property: PROPERTIES[search.property] ?? '',
    };
    return `${TRENDS_ORIGIN}/trends/api/explore?${new URLSearchParams({ hl: language, tz: String(tz), req: JSON.stringify(req) })}`;
}

/** Human-facing Google Trends link for the same search, handy for checking results. */
export function trendsPageUrl(search, { language }) {
    const params = new URLSearchParams({ q: search.terms.join(','), date: search.time, hl: language });
    if (search.geo) params.set('geo', search.geo);
    if (search.category) params.set('cat', String(search.category));
    if (PROPERTIES[search.property]) params.set('gprop', PROPERTIES[search.property]);
    return `${TRENDS_ORIGIN}/trends/explore?${params}`;
}

const WIDGET_ENDPOINTS = {
    TIMESERIES: { section: 'interestOverTime', path: 'multiline' },
    GEO_MAP: { section: 'interestByRegion', path: 'comparedgeo' },
    RELATED_QUERIES: { section: 'relatedQueries', path: 'relatedsearches' },
    RELATED_TOPICS: { section: 'relatedTopics', path: 'relatedsearches' },
};

/**
 * Lists the widget data requests to make for one explore response.
 * In comparisons Google returns per-term widgets with a suffix (RELATED_QUERIES_0, GEO_MAP_1, ...);
 * the combined GEO_MAP / TIMESERIES widgets have no suffix.
 */
export function planWidgetRequests(explore, search, opts) {
    const wanted = new Set(opts.sections?.length ? opts.sections : SECTIONS);
    const plans = [];
    for (const widget of explore.widgets || []) {
        const m = /^([A-Z_]+?)(?:_(\d+))?$/.exec(widget.id || '');
        if (!m) continue;
        const endpoint = WIDGET_ENDPOINTS[m[1]];
        if (!endpoint || !wanted.has(endpoint.section) || !widget.token) continue;
        const termIndex = m[2] === undefined ? null : Number(m[2]);
        // For the region map, the combined widget covers every term; skip the per-term copies.
        if (endpoint.section === 'interestByRegion' && termIndex !== null && search.terms.length > 1) continue;
        const request = structuredClone(widget.request);
        if (endpoint.section === 'interestByRegion') {
            if (opts.regionResolution && opts.regionResolution !== 'AUTO') request.resolution = opts.regionResolution;
            if (opts.includeLowVolumeRegions) request.includeLowSearchVolumeGeos = true;
        }
        const params = new URLSearchParams({ hl: opts.language, tz: String(opts.tz ?? 0), req: JSON.stringify(request), token: widget.token });
        plans.push({
            section: endpoint.section,
            term: termIndex === null ? null : search.terms[termIndex] ?? null,
            url: `${TRENDS_ORIGIN}/trends/api/widgetdata/${endpoint.path}?${params}`,
            resolvedTime: request.time || request.comparisonItem?.[0]?.time || null,
            resolution: request.resolution || null,
        });
    }
    return plans;
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function parseTimeline(json, terms) {
    const rows = json?.default?.timelineData || [];
    return rows.map((row) => {
        const values = {};
        terms.forEach((term, i) => { values[term] = Number(row.value?.[i] ?? 0); });
        const out = {
            date: new Date(Number(row.time) * 1000).toISOString(),
            timestamp: Number(row.time),
            formattedTime: cleanSpaces(row.formattedTime),
            isPartial: Boolean(row.isPartial),
            values,
        };
        if (terms.length === 1) out.value = values[terms[0]];
        return out;
    });
}

/** Per-term summary computed from the timeline: average, peak, latest value and recent direction. */
export function summarizeTimeline(timeline, terms) {
    const summary = {};
    for (const term of terms) {
        const points = timeline.filter((p) => !p.isPartial);
        const series = (points.length ? points : timeline).map((p) => ({ date: p.date, v: p.values[term] ?? 0 }));
        if (!series.length) { summary[term] = null; continue; }
        const avg = series.reduce((s, p) => s + p.v, 0) / series.length;
        const peak = series.reduce((best, p) => (p.v > best.v ? p : best), series[0]);
        const window = Math.max(1, Math.min(4, Math.floor(series.length / 4)));
        const recent = series.slice(-window).reduce((s, p) => s + p.v, 0) / window;
        const prior = series.slice(-2 * window, -window);
        const priorAvg = prior.length ? prior.reduce((s, p) => s + p.v, 0) / prior.length : recent;
        const changePercent = priorAvg === 0 ? (recent === 0 ? 0 : null) : round(((recent - priorAvg) / priorAvg) * 100, 1);
        let direction = 'stable';
        if (changePercent === null || changePercent >= 10) direction = 'rising';
        else if (changePercent <= -10) direction = 'falling';
        summary[term] = {
            average: round(avg),
            peakValue: peak.v,
            peakDate: peak.date,
            latestValue: series[series.length - 1].v,
            recentChangePercent: changePercent,
            recentDirection: direction,
        };
    }
    return summary;
}

export function parseRegions(json, terms) {
    const rows = json?.default?.geoMapData || [];
    return rows.map((row) => {
        const values = {};
        terms.forEach((term, i) => { values[term] = Number(row.value?.[i] ?? 0); });
        const out = { geoCode: row.geoCode ?? null, geoName: row.geoName, values };
        if (row.coordinates) out.coordinates = row.coordinates;
        if (terms.length === 1) out.value = values[terms[0]];
        if (row.hasData && !row.hasData.some(Boolean)) out.hasData = false;
        return out;
    });
}

function relatedLink(link) {
    return link ? new URL(link, TRENDS_ORIGIN).toString() : null;
}

function parseRankedItem(item, kind, rising) {
    const out = kind === 'topics'
        ? { topic: item.topic?.title ?? null, type: item.topic?.type ?? null, mid: item.topic?.mid ?? null }
        : { query: item.query };
    const formatted = item.formattedValue ?? String(item.value ?? '');
    if (rising) {
        out.isBreakout = /breakout/i.test(formatted) || Number(item.value) >= 5000;
        out.increasePercent = out.isBreakout ? null : Number(item.value);
        out.formattedValue = formatted;
    } else {
        out.value = Number(item.value);
    }
    out.trendsUrl = relatedLink(item.link);
    return out;
}

export function parseRelated(json, kind) {
    const lists = json?.default?.rankedList || [];
    return {
        top: (lists[0]?.rankedKeyword || []).map((item) => parseRankedItem(item, kind, false)),
        rising: (lists[1]?.rankedKeyword || []).map((item) => parseRankedItem(item, kind, true)),
    };
}

function cleanSpaces(s) {
    return typeof s === 'string' ? s.replace(/[   ]/g, ' ') : s;
}

// --- Trending now (RSS feed of daily trending searches) ---

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeXml(s) {
    if (s == null) return null;
    return s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
            if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
            return ENTITIES[e.toLowerCase()] ?? m;
        })
        .trim();
}

function tag(xml, name) {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
    if (m) return decodeXml(m[1]) || null;
    return null;
}

export function parseTrendingRss(xml, country) {
    const items = [];
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    blocks.forEach((block, i) => {
        const news = (block.match(/<ht:news_item>[\s\S]*?<\/ht:news_item>/g) || []).map((n) => ({
            title: tag(n, 'ht:news_item_title'),
            url: tag(n, 'ht:news_item_url'),
            source: tag(n, 'ht:news_item_source'),
            picture: tag(n, 'ht:news_item_picture'),
        }));
        const traffic = tag(block, 'ht:approx_traffic');
        const pubDate = tag(block, 'pubDate');
        items.push({
            rank: i + 1,
            title: tag(block, 'title'),
            approxTraffic: traffic,
            approxTrafficMin: traffic ? Number(traffic.replace(/[^\d]/g, '')) || null : null,
            startedAt: pubDate ? new Date(pubDate).toISOString() : null,
            picture: tag(block, 'ht:picture'),
            pictureSource: tag(block, 'ht:picture_source'),
            news,
            country,
        });
    });
    return items;
}

export function trendingRssUrl(country, language) {
    return `${TRENDS_ORIGIN}/trending/rss?${new URLSearchParams({ geo: country, hl: language })}`;
}
