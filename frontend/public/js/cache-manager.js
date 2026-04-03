/**
 * cache-manager.js
 * ───────────────────────────────────────────────────────────────────
 * Validates backend data versioning against localStorage cache and 
 * serves instantaneous payload responses for downstream JS files.
 */

class CacheManager {
    constructor() {
        this.cacheKey = "catalogo_items_cache";
        this.versionKey = "catalogo_version";
        this.ttl = 24 * 60 * 60 * 1000; // 24 hours
        this.apiItemsUrl = "/api/items";
        this.apiVersionUrl = "/api/version";
    }

    /**
     * Clear specifically the active catalog cache manually
     */
    clearCache() {
        localStorage.removeItem(this.cacheKey);
        localStorage.removeItem(this.versionKey);
    }

    /**
     * Forcibly fetch a new payload bypassing version/ttl checks
     */
    async syncNow() {
        this.clearCache();
        return await this.fetchItems();
    }

    /**
     * Checks if the frontend localStorage version matches the backend.
     * Fast, lightweight ping to validate staleness.
     */
    async isVersionValid(localVersionTimestamp, localCacheAgeAt) {
        // Enforce TTL: Ignore if cache is older than 24h
        if (!localVersionTimestamp || !localCacheAgeAt) return false;
        if (Date.now() - parseInt(localCacheAgeAt, 10) > this.ttl) return false;

        try {
            const res = await fetch(this.apiVersionUrl);
            if (!res.ok) return false;
            const data = await res.json();
            
            // Validate memory dataVersion from server against local cache version map
            return parseInt(data.version, 10) === parseInt(localVersionTimestamp, 10);
        } catch (error) {
            // If offline or endpoint fails, fall back to whatever is cached
            console.error("Cache Manager validation ping failed, falling back to cache.", error);
            return true;
        }
    }

    /**
     * Retrieves items natively, saving the local dataset back to localStorage
     * to speed up subsequent queries.
     */
    async fetchFromAPI() {
        try {
            const res = await fetch(this.apiItemsUrl);
            if (!res.ok) throw new Error("Network response was not ok");
            const items = await res.json();
            
            // Grab a fresh version timestamp as we just grabbed the freshest config.
            // If we don't grab one, we'll ping out of sync again. Use Date.now if 
            // the server doesn't respond with its own version map in the data headers.
            let latestVersion = Date.now();
            try {
                const verRes = await fetch(this.apiVersionUrl);
                if (verRes.ok) {
                   const vData = await verRes.json();
                   latestVersion = vData.version;
                }
            } catch (e) {}

            localStorage.setItem(this.cacheKey, JSON.stringify(items));
            localStorage.setItem(this.versionKey, latestVersion);
            localStorage.setItem(`${this.cacheKey}_age`, Date.now());

            return items;
        } catch (error) {
            console.error("Failed fetching live items API.", error);
            return null;
        }
    }

    /**
     * Primary entry point. Returns parsed array of item objects
     * either strictly from localStorage dictating 0 API overhead
     * or hydrated by the active fetch stream.
     */
    async fetchItems() {
        const cachedItems = localStorage.getItem(this.cacheKey);
        const cacheVersion = localStorage.getItem(this.versionKey);
        const cacheAge = localStorage.getItem(`${this.cacheKey}_age`);

        if (cachedItems) {
            const isValid = await this.isVersionValid(cacheVersion, cacheAge);
            if (isValid) {
                console.log("Serving items natively from LocalStorage Cache.");
                try {
                    return JSON.parse(cachedItems);
                } catch(e) {
                    console.error("Invalid cache format - syncing now.");
                }
            } else {
                 console.log("Item Cache invalidated due to staleness or version drift.");
            }
        }
        
        console.log("Hydrating fresh payload off network...");
        return await this.fetchFromAPI();
    }
}

// Expose globally
window.cacheManager = new CacheManager();
