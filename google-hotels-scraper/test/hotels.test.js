import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSearches, searchUrl, extractData, parseSearchPage, passesFilters, parseDate } from '../src/hotels.js';

// Trimmed copy of a real Google Hotels page ("hotels in paris dec 10 to dec 13 2026 for 2 adults"):
// one sponsored carousel, three organic hotels and the paging card.
const html = readFileSync(new URL('./fixtures/search-paris.html', import.meta.url), 'utf8');
const today = new Date('2026-11-09T12:00:00Z');

test('builds one search per location and query, with dates and guests in the text', () => {
    const s = buildSearches({ locations: ['Paris', ' ', 'Paris'], searchQueries: ['hotels near Eiffel Tower'], checkInDate: '2026-12-10', checkOutDate: '2026-12-13', adults: 3 }, { today });
    assert.equal(s.length, 2);
    assert.equal(s[0].queryText, 'hotels in Paris dec 10 2026 to dec 13 2026 for 3 adults');
    assert.equal(s[0].input, 'Paris');
    assert.equal(s[1].queryText, 'hotels near Eiffel Tower dec 10 2026 to dec 13 2026 for 3 adults');
    assert.equal(s[1].checkIn, '2026-12-10');
    const noDates = buildSearches({ locations: ['Rome'] }, { today });
    assert.equal(noDates[0].queryText, 'hotels in Rome for 2 adults');
    assert.equal(noDates[0].checkIn, null);
    assert.equal(buildSearches({ locations: ['Rome'], adults: 1 }, { today })[0].queryText, 'hotels in Rome for 1 adult');
});

test('validates dates', () => {
    assert.throws(() => buildSearches({ locations: ['x'], checkInDate: '2026-12-10' }, { today }), /both/);
    assert.throws(() => buildSearches({ locations: ['x'], checkInDate: '2026-12-10', checkOutDate: '2026-12-10' }, { today }), /after/);
    assert.throws(() => buildSearches({ locations: ['x'], checkInDate: '2026-01-10', checkOutDate: '2026-01-12' }, { today }), /past/);
    assert.throws(() => parseDate('2026-02-30', 'Check-in date'), /not a real date/);
    assert.throws(() => parseDate('10/12/2026', 'Check-in date'), /2026-12-10/);
});

test('search URL carries the query and language', () => {
    const url = new URL(searchUrl({ queryText: 'hotels in Paris for 2 adults' }, { language: 'pt-BR' }));
    assert.equal(url.pathname, '/travel/search');
    assert.equal(url.searchParams.get('q'), 'hotels in Paris for 2 adults');
    assert.equal(url.searchParams.get('hl'), 'pt-BR');
});

test('extracts the data block, or null for a page without results', () => {
    assert.ok(extractData(html));
    assert.equal(extractData('<html><title>Before you continue</title></html>'), null);
});

test('reads organic hotels from a real page and skips ads', () => {
    const { hotels, totalResults } = parseSearchPage(extractData(html));
    assert.equal(totalResults, 3759);
    assert.equal(hotels.length, 3);
    const h = hotels[0];
    assert.equal(h.name, 'Glint Paris');
    assert.equal(h.rating, 4.5);
    assert.equal(h.reviewCount, 3329);
    assert.deepEqual(h.ratingBreakdown['5star'], { percent: 72, count: 2339 });
    assert.equal(h.pricePerNight, 380);
    assert.equal(h.priceText, 'R$380');
    assert.equal(h.currency, 'BRL');
    assert.equal(h.isAvailable, true);
    assert.equal(h.checkIn, '2026-12-10');
    assert.equal(h.checkOut, '2026-12-13');
    assert.equal(h.nights, 3);
    assert.equal(h.countryCode, 'FR');
    assert.equal(h.checkInTime, '3:00 PM');
    assert.equal(h.website, 'https://www.glint-stay.com/');
    assert.ok(h.latitude > 48 && h.latitude < 49);
    assert.ok(h.images.length > 0 && h.images[0].startsWith('https://'));
    assert.equal(h.thumbnail, h.images[0]);
    assert.match(h.googleHotelsUrl, /^https:\/\/www\.google\.com\/travel\/hotels\/entity\/\S+$/);
    const airport = h.nearbyPlaces.find((p) => p.category === 'airport');
    assert.deepEqual(airport.travelTimes.map((t) => t.mode), ['driving', 'transit']);
    for (const hotel of hotels) {
        assert.equal(typeof hotel.name, 'string');
        assert.notEqual(hotel.name, 'Paris Marriott Champs Elysees Hotel'); // sponsored carousel entry
    }
});

test('handles cards with missing parts', () => {
    const minimal = parseSearchPage([[[[null, [[0, { 397419284: [[null, 'Tiny Inn']] }]]]]]]);
    assert.equal(minimal.hotels[0].name, 'Tiny Inn');
    assert.equal(minimal.hotels[0].pricePerNight, null);
    assert.equal(minimal.hotels[0].isAvailable, false);
    assert.deepEqual(minimal.hotels[0].images, []);
    assert.deepEqual(parseSearchPage(null), { hotels: [], totalResults: null });
});

test('filters by rating, stars, price and availability', () => {
    const h = { rating: 4.4, stars: 3, pricePerNight: 150, isAvailable: true };
    assert.equal(passesFilters(h, {}), true);
    assert.equal(passesFilters(h, { minRating: 4.5 }), false);
    assert.equal(passesFilters(h, { minStars: 4 }), false);
    assert.equal(passesFilters(h, { maxPricePerNight: 149 }), false);
    assert.equal(passesFilters({ ...h, stars: null }, { minStars: 1 }), false);
    assert.equal(passesFilters({ ...h, pricePerNight: null, isAvailable: false }, { onlyAvailable: true }), false);
});
