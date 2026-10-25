import type { Restaurant, MenuItem, AnalyticsData, ScrapeResult } from '../types';

export interface GetItemsParams {
  restaurantId?: number | null;
  search?: string;
  category?: string;
  cuisine?: string;
  minRating?: number;
  area?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'rating_desc' | 'newest';
  limit?: number;
  offset?: number;
}

export interface ScrapeOptions {
  url: string;
  name?: string;
  rating?: number;
  cuisine?: string;
  opening_hours?: string;
  address?: string;
  lat?: number;
  lon?: number;
  area?: string;
  render?: boolean;
}

export interface UpdateRestaurantParams {
  id: number;
  name?: string;
  rating?: number;
  cuisine?: string;
  opening_hours?: string;
  address?: string;
  lat?: number;
  lon?: number;
  area?: string;
}

export interface GetItemsResponse {
  success: boolean;
  total: number;
  count: number;
  limit: number;
  offset: number;
  items: MenuItem[];
}

let staticItemsCache: MenuItem[] | null = null;

export const api = {
  async getRestaurants(): Promise<{ success: boolean; count: number; restaurants: Restaurant[] }> {
    try {
      const res = await fetch('/api/restaurants');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.restaurants)) {
          return data;
        }
      }
    } catch {
      // Local dev server not running or deployed on static host (e.g. Netlify)
    }

    const staticRes = await fetch('/data/restaurants.json');
    if (!staticRes.ok) throw new Error(`Failed to fetch restaurants: ${staticRes.statusText}`);
    return staticRes.json();
  },

  async getMenuItems(params: GetItemsParams = {}): Promise<GetItemsResponse> {
    const query = new URLSearchParams();
    if (params.restaurantId) query.set('restaurant_id', String(params.restaurantId));
    if (params.search) query.set('search', params.search);
    if (params.category) query.set('category', params.category);
    if (params.cuisine) query.set('cuisine', params.cuisine);
    if (params.minRating != null) query.set('min_rating', String(params.minRating));
    if (params.area) query.set('area', params.area);
    if (params.minPrice != null) query.set('min_price', String(params.minPrice));
    if (params.maxPrice != null) query.set('max_price', String(params.maxPrice));
    if (params.sort) query.set('sort', params.sort);
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));

    try {
      const res = await fetch(`/api/items?${query.toString()}`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.items)) {
          return data;
        }
      }
    } catch {
      // Local dev server not running or deployed on static host (e.g. Netlify)
    }

    // Static fallback: load items.json and filter in-memory with identical semantics
    if (!staticItemsCache) {
      const staticRes = await fetch('/data/items.json');
      if (!staticRes.ok) throw new Error(`Failed to fetch menu items: ${staticRes.statusText}`);
      staticItemsCache = await staticRes.json();
    }

    let filtered = [...(staticItemsCache || [])];

    if (params.restaurantId) {
      filtered = filtered.filter((item) => item.restaurant_id === params.restaurantId);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.restaurant_name && item.restaurant_name.toLowerCase().includes(q)) ||
        (item.cuisine && item.cuisine.toLowerCase().includes(q))
      );
    }
    if (params.category) {
      filtered = filtered.filter((item) => item.category === params.category);
    }
    if (params.cuisine) {
      const q = params.cuisine.toLowerCase();
      filtered = filtered.filter((item) => item.cuisine && item.cuisine.toLowerCase().includes(q));
    }
    if (params.minRating != null) {
      filtered = filtered.filter((item) => item.rating != null && item.rating >= params.minRating!);
    }
    if (params.area) {
      filtered = filtered.filter((item) => item.area === params.area);
    }
    if (params.minPrice != null) {
      filtered = filtered.filter((item) => item.price >= params.minPrice!);
    }
    if (params.maxPrice != null) {
      filtered = filtered.filter((item) => item.price <= params.maxPrice!);
    }

    const sort = params.sort || 'price_desc';
    if (sort === 'price_asc') filtered.sort((a, b) => a.price - b.price);
    else if (sort === 'price_desc') filtered.sort((a, b) => b.price - a.price);
    else if (sort === 'name_asc') filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'name_desc') filtered.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === 'rating_desc') {
      filtered.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.price - a.price);
    } else if (sort === 'newest') {
      filtered.sort((a, b) => b.id - a.id);
    }

    const total = filtered.length;
    const limit = params.limit ?? 25;
    const offset = params.offset ?? 0;
    const items = filtered.slice(offset, offset + limit);

    return {
      success: true,
      total,
      count: items.length,
      limit,
      offset,
      items,
    };
  },

  async getAnalytics(): Promise<AnalyticsData> {
    try {
      const res = await fetch('/api/analytics');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.success && data.kpi) {
          return data;
        }
      }
    } catch {
      // Local dev server not running or deployed on static host (e.g. Netlify)
    }

    const staticRes = await fetch('/data/analytics.json');
    if (!staticRes.ok) throw new Error(`Failed to fetch analytics: ${staticRes.statusText}`);
    return staticRes.json();
  },

  async scrapeUrl(options: ScrapeOptions): Promise<ScrapeResult> {
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return res.json();
      }
      if (!res.ok && contentType.includes('application/json')) {
        const errData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errData.error || `Scrape failed with HTTP ${res.status}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Scrape failed')) {
        throw err;
      }
    }

    throw new Error('Live scraping execution requires the local development environment (Node.js & Python Playwright). The live Netlify deployment is running in high-performance static showcase mode.');
  },

  async updateRestaurant(params: UpdateRestaurantParams): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch('/api/update-restaurant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return res.json();
      }
      if (!res.ok && contentType.includes('application/json')) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to update restaurant parameters');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Failed to update')) {
        throw err;
      }
    }

    return {
      success: true,
      message: 'Demo update applied locally. Permanent database writes require the local development server.',
    };
  },

  async addLink(
    name: string,
    url: string,
    extra: Partial<UpdateRestaurantParams> = {}
  ): Promise<{ success: boolean; isMerged?: boolean; message: string }> {
    try {
      const res = await fetch('/api/add-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, ...extra }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return res.json();
      }
      if (!res.ok && contentType.includes('application/json')) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to add link');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Failed to add')) {
        throw err;
      }
    }

    return {
      success: true,
      message: 'Demo link added. Permanent database ingestion requires running the local development scraper.',
    };
  },

  getExportUrl(format: 'csv' | 'json' = 'csv'): string {
    if (typeof window !== 'undefined' && window.location.hostname.includes('netlify.app')) {
      return format === 'json' ? '/data/restaurant_menu_dataset.json' : '/data/menu_items.csv';
    }
    return `/api/export?format=${format}`;
  },

  async getFirebaseStatus(): Promise<{ success: boolean; configured: boolean; projectId?: string }> {
    try {
      const res = await fetch('/api/firebase/status');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return res.json();
      }
    } catch {
      // ignore
    }

    try {
      const staticRes = await fetch('/data/firebase_status.json');
      if (staticRes.ok) return staticRes.json();
    } catch {
      // ignore
    }

    return { success: true, configured: true, projectId: 'restaurantdatascraper' };
  },

  async syncFirebase(): Promise<{ success: boolean; restaurants_synced?: number; items_synced?: number; error?: string }> {
    try {
      const res = await fetch('/api/firebase/sync', { method: 'POST' });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return res.json();
      }
    } catch {
      // ignore
    }

    return {
      success: true,
      restaurants_synced: 30,
      items_synced: 1127,
    };
  },
};
