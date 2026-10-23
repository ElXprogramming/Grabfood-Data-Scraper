import type { Restaurant, MenuItem, AnalyticsData, ScrapeResult } from '../types';

export interface GetItemsParams {
  restaurantId?: number | null;
  search?: string;
  category?: string;
  area?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest';
  limit?: number;
  offset?: number;
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

  async scrapeUrl(url: string, name?: string, render: boolean = false): Promise<ScrapeResult> {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, name, render }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errData.error || `Scrape failed with HTTP ${res.status}`);
    }
    return res.json();
  },

  async addLink(name: string, url: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/add-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url }),
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
};
