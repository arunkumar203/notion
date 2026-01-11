/**
 * Utility to cache admin settings to avoid redundant network requests.
 */

interface AdminSettings {
    emailSendingEnabled: boolean;
    showCreatorAttribution: boolean;
    homePageMessage: string;
    maintenanceMode: boolean;
    maintenanceMessage: string;
}

let cachedSettings: AdminSettings | null = null;
let lastFetchTime = 0;
let pendingPromise: Promise<AdminSettings> | null = null;

// Cache for 5 minutes by default
const CACHE_TTL = 5 * 60 * 1000;

export async function getAdminSettings(force = false): Promise<AdminSettings> {
    const now = Date.now();

    // Return cached settings if they are fresh and not forced
    if (!force && cachedSettings && (now - lastFetchTime < CACHE_TTL)) {
        return cachedSettings;
    }

    // If already fetching, return the existing promise
    if (pendingPromise) {
        return pendingPromise;
    }

    pendingPromise = (async () => {
        try {
            const response = await fetch('/api/admin/email-settings', {
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch settings');
            }

            const data = await response.json();
            cachedSettings = data;
            lastFetchTime = Date.now();
            return data;
        } catch (error) {
            console.error('Error in getAdminSettings:', error);
            // Return stale but existing settings if fetch fails, or defaults
            return cachedSettings || {
                emailSendingEnabled: true,
                showCreatorAttribution: true,
                homePageMessage: '',
                maintenanceMode: false,
                maintenanceMessage: ''
            };
        } finally {
            pendingPromise = null;
        }
    })();

    return pendingPromise;
}
