import { randomUUID } from 'node:crypto';
import { gotScraping } from 'got-scraping';
import { log } from 'apify';

export class PermanentError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Small HTTP client with patient retries.
 * Google Trends answers 429 when traffic is too fast; we wait longer after each 429
 * (exponential backoff with jitter) instead of hammering it, and give up after `maxRetries`.
 */
export class TrendsClient {
    constructor({ proxyConfiguration, maxRetries = 6, baseDelayMs = 2000, maxDelayMs = 60000 }) {
        this.proxyConfiguration = proxyConfiguration;
        this.maxRetries = maxRetries;
        this.baseDelayMs = baseDelayMs;
        this.maxDelayMs = maxDelayMs;
        this.stats = { requests: 0, retries: 0, rateLimited: 0 };
    }

    async getText(url, label) {
        let lastError;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            if (attempt > 0) {
                const delay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
                log.info(`${label}: retry ${attempt}/${this.maxRetries} in ${Math.round(delay / 1000)} s (${lastError?.message})`);
                this.stats.retries++;
                await sleep(delay);
            }
            const proxyUrl = this.proxyConfiguration ? await this.proxyConfiguration.newUrl(randomUUID().replace(/-/g, '').slice(0, 20)) : undefined;
            let res;
            try {
                this.stats.requests++;
                res = await gotScraping({
                    url,
                    proxyUrl,
                    responseType: 'text',
                    throwHttpErrors: false,
                    followRedirect: true,
                    retry: { limit: 0 },
                    timeout: { request: 30000 },
                });
            } catch (err) {
                lastError = new Error(`network error: ${err.code || err.message}`);
                continue;
            }
            if (res.statusCode === 200) return res.body;
            if (res.statusCode === 429) this.stats.rateLimited++;
            if (res.statusCode === 429 || res.statusCode >= 500) {
                lastError = new Error(`HTTP ${res.statusCode}`);
                continue;
            }
            throw new PermanentError(`${label}: Google Trends answered HTTP ${res.statusCode}. Check the input values (country code, time range, category).`);
        }
        throw new Error(`${label}: failed after ${this.maxRetries + 1} attempts (${lastError?.message}).`);
    }
}
