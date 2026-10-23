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

export const api = {
  async getRestaurants(): Promise<{ success: boolean; count: number; restaurants: Restaurant[] }> {
    const res = await fetch('/api/restaurants');
    if (!res.ok) throw new Error(`Failed to fetch restaurants: ${res.statusText}`);
    return res.json();
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

    const res = await fetch(`/api/items?${query.toString()}`);
    if (!res.ok) throw new Error(`Failed to fetch menu items: ${res.statusText}`);
    return res.json();
  },

  async getAnalytics(): Promise<AnalyticsData> {
    const res = await fetch('/api/analytics');
    if (!res.ok) throw new Error(`Failed to fetch analytics: ${res.statusText}`);
    return res.json();
  },

  async scrapeUrl(options: ScrapeOptions): Promise<ScrapeResult> {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errData.error || `Scrape failed with HTTP ${res.status}`);
    }
    return res.json();
  },

  async updateRestaurant(params: UpdateRestaurantParams): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/update-restaurant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to update restaurant parameters');
    }
    return res.json();
  },

  async addLink(
    name: string,
    url: string,
    extra: Partial<UpdateRestaurantParams> = {}
  ): Promise<{ success: boolean; isMerged?: boolean; message: string }> {
    const res = await fetch('/api/add-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, ...extra }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to add link');
    }
    return res.json();
  },

  getExportUrl(format: 'csv' | 'json' = 'csv'): string {
    return `/api/export?format=${format}`;
  },

  async getFirebaseStatus(): Promise<{ success: boolean; configured: boolean; projectId?: string }> {
    const res = await fetch('/api/firebase/status');
    if (!res.ok) return { success: false, configured: false };
    return res.json();
  },

  async syncFirebase(): Promise<{ success: boolean; restaurants_synced?: number; items_synced?: number; error?: string }> {
    const res = await fetch('/api/firebase/sync', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to sync to Firebase');
    }
    return res.json();
  },
};
