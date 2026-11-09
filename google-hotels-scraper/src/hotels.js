// Pure helpers: building Google Hotels search URLs and reading hotels out of the page.
// Google embeds the results as nested arrays inside an AF_initDataCallback({key: 'ds:0', ...}) script.
// No network I/O here, so everything is covered by unit tests with a real saved page.

export const ORIGIN = 'https://www.google.com';
const HOTEL_CARD_KEY = '397419284';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Parses "YYYY-MM-DD" into {y, m, d}, or throws a readable error. */
export function parseDate(value, field) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!m) throw new Error(`${field} must look like 2026-12-10, got "${value}".`);
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) throw new Error(`${field} "${value}" is not a real date.`);
    return { y, m: mo, d, date };
}

const isoDate = ({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const textDate = ({ y, m, d }) => `${MONTHS[m - 1]} ${d} ${y}`;

/**
 * Turns the input into searches. Google Hotels ignores date/guest URL parameters for plain requests,
 * but it understands them written in the search text ("... dec 10 2026 to dec 13 2026 for 2 adults"),
 * so dates and guests are added to the query and later checked against what Google returned.
 */
export function buildSearches(input, { today = new Date() } = {}) {
    const queries = [
        ...(input.locations || []).map((l) => String(l).trim()).filter(Boolean).map((l) => ({ location: l, text: `hotels in ${l}` })),
        ...(input.searchQueries || []).map((q) => String(q).trim()).filter(Boolean).map((q) => ({ location: null, text: q })),
    ];
    let checkIn = null;
    let checkOut = null;
    if (input.checkInDate || input.checkOutDate) {
        if (!input.checkInDate || !input.checkOutDate) throw new Error('Fill in both check-in and check-out dates, or leave both empty.');
        checkIn = parseDate(input.checkInDate, 'Check-in date');
        checkOut = parseDate(input.checkOutDate, 'Check-out date');
        if (checkOut.date <= checkIn.date) throw new Error('Check-out date must be after the check-in date.');
        const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
        if (checkIn.date.getTime() < startOfToday) throw new Error(`Check-in date ${input.checkInDate} is in the past.`);
    }
    const adults = Math.max(1, Math.min(12, Number(input.adults) || 2));
    const seen = new Set();
    const searches = [];
    for (const q of queries) {
        let text = q.text;
        if (checkIn) text += ` ${textDate(checkIn)} to ${textDate(checkOut)}`;
        text += ` for ${adults} adult${adults > 1 ? 's' : ''}`;
        if (seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        searches.push({
            input: q.location ?? q.text,
            location: q.location,
            queryText: text,
            checkIn: checkIn ? isoDate(checkIn) : null,
            checkOut: checkOut ? isoDate(checkOut) : null,
            adults,
        });
    }
    return searches;
}

export function searchUrl(search, { language = 'en' } = {}) {
    return `${ORIGIN}/travel/search?${new URLSearchParams({ q: search.queryText, hl: language })}`;
}

/** Finds the ds:0 data block. Returns null when the page has no results block (blocked or empty page). */
export function extractData(html) {
    const marker = "AF_initDataCallback({key: 'ds:0'";
    const start = html.indexOf(marker);
    if (start === -1) return null;
    const dataStart = html.indexOf('data:', start);
    const end = html.indexOf(', sideChannel: {}});', dataStart);
    if (dataStart === -1 || end === -1) return null;
    return JSON.parse(html.slice(dataStart + 5, end));
}

const clean = (v) => (typeof v === 'string' ? v.replace(/[   ]/g, ' ').trim() : v);
const get = (obj, ...path) => path.reduce((a, k) => (a == null ? undefined : a[k]), obj);
const dateFrom = (arr) => (Array.isArray(arr) && arr.length === 3 ? isoDate({ y: arr[0], m: arr[1], d: arr[2] }) : null);

const NEARBY_CATEGORIES = { 1: 'attraction', 3: 'airport', 6: 'restaurant' };
const TRAVEL_MODES = { 0: 'driving', 2: 'walking', 3: 'transit' };

function parseNearby(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const group of raw) {
        const category = NEARBY_CATEGORIES[group?.[0]] ?? 'other';
        for (const place of get(group, 1, 2) || []) {
            if (!place?.[0]) continue;
            out.push({
                name: place[0],
                category,
                travelTimes: (place[2] || []).filter(Boolean).map((t) => ({ mode: TRAVEL_MODES[t[0]] ?? 'other', duration: clean(t[1]) })),
            });
        }
    }
    return out;
}

function parseRatingBreakdown(raw) {
    const rows = get(raw, 0);
    if (!Array.isArray(rows)) return null;
    const out = {};
    for (const r of rows) if (Array.isArray(r) && r[0] >= 1 && r[0] <= 5) out[`${r[0]}star`] = { percent: r[1] ?? null, count: r[2] ?? null };
    return Object.keys(out).length ? out : null;
}

/** Reads one organic hotel card (the 397419284 entry) into a flat, documented record. */
export function parseHotel(h) {
    const priceBlock = get(h, 6, 2);
    const price = get(priceBlock, 1);
    const stay = get(priceBlock, 8) || get(h, 6, 1, 4);
    const entityToken = get(h, 20) ?? null;
    const images = (get(h, 5, 1) || []).map((img) => get(img, 1, 0)).filter((u) => typeof u === 'string');
    return {
        name: h[1],
        hotelClass: clean(get(h, 3, 0)) ?? null,
        stars: get(h, 3, 1) ?? null,
        rating: get(h, 7, 0, 0) ?? null,
        reviewCount: get(h, 7, 0, 1) ?? null,
        ratingBreakdown: parseRatingBreakdown(get(h, 7, 1)),
        pricePerNight: price ? (get(price, 4) ?? Math.round(get(price, 2))) : null,
        pricePerNightExact: price ? (get(price, 2) ?? null) : null,
        priceText: price ? (clean(get(price, 0)) ?? null) : null,
        currency: get(priceBlock, 15) ?? get(h, 6, 1, 3) ?? null,
        isAvailable: Boolean(price),
        checkIn: dateFrom(get(stay, 0)),
        checkOut: dateFrom(get(stay, 1)),
        nights: get(stay, 2) ?? null,
        description: get(h, 11, 0) ?? null,
        latitude: get(h, 2, 0, 0) ?? null,
        longitude: get(h, 2, 0, 1) ?? null,
        countryCode: get(h, 2, 36) ?? null,
        checkInTime: clean(get(h, 2, 17, 0)) ?? null,
        checkOutTime: clean(get(h, 2, 17, 1)) ?? null,
        website: get(h, 2, 29, 2) ?? null,
        nearbyPlaces: parseNearby(get(h, 2, 19)),
        images,
        googleHotelsUrl: entityToken ? `${ORIGIN}/travel/hotels/entity/${entityToken}` : null,
        entityToken,
        googleCid: get(h, 25) ?? null,
        googleFeatureId: get(h, 9) ?? null,
    };
}

/**
 * Returns the organic hotels of a results page, in page order. Sponsored carousels are skipped.
 * Also returns the total number of matching properties Google reports, when present.
 */
export function parseSearchPage(data) {
    const cards = get(data, 0, 0, 0, 1);
    if (!Array.isArray(cards)) return { hotels: [], totalResults: null };
    const hotels = [];
    let totalResults = null;
    for (const card of cards) {
        const body = card?.[1];
        if (!body || typeof body !== 'object') continue;
        const hotel = get(body, HOTEL_CARD_KEY, 0);
        if (Array.isArray(hotel) && typeof hotel[1] === 'string') hotels.push(parseHotel(hotel));
        for (const value of Object.values(body)) {
            // The paging card looks like ["CBI=", "", 3759, 1, 18]: token, ?, total, page, page size.
            if (Array.isArray(value) && typeof value[0] === 'string' && Number.isInteger(value[2]) && value.length === 5) totalResults = value[2];
        }
    }
    return { hotels, totalResults };
}

/** Optional client-side filters. */
export function passesFilters(hotel, { minRating, minStars, maxPricePerNight, onlyAvailable }) {
    if (minRating && !(hotel.rating >= minRating)) return false;
    if (minStars && !(hotel.stars >= minStars)) return false;
    if (maxPricePerNight && !(hotel.pricePerNight != null && hotel.pricePerNight <= maxPricePerNight)) return false;
    if (onlyAvailable && !hotel.isAvailable) return false;
    return true;
}
