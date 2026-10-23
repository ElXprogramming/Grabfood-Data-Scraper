export interface Restaurant {
  id: number;
  name: string;
  area: string | null;
  website: string | null;
  grab_url: string | null;
  foodpanda_url: string | null;
  cuisine: string | null;
  rating: number | null;
  item_count: number;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
}

export interface MenuItem {
  id: number;
  restaurant_id: number;
  restaurant_name: string;
  category: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  source: string;
  scraped_at: string;
  area: string | null;
  cuisine: string | null;
}

export interface AnalyticsKPI {
  totalRestaurants: number;
  scrapedRestaurants: number;
  totalItems: number;
  avgPrice: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
  stdDev: number;
  q1: number;
  q3: number;
  iqr: number;
  lowerBound: number;
  upperBound: number;
}

export interface PriceBin {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface CategoryStat {
  category: string;
  count: number;
  avg_price: number;
  min_price: number;
  max_price: number;
}

export interface RestaurantStat {
  id: number;
  name: string;
  area: string | null;
  item_count: number;
  avg_price: number;
  min_price: number;
  max_price: number;
}

export interface KeywordStat {
  word: string;
  frequency: number;
}

export interface OutlierItem {
  id: number;
  name: string;
  price: number;
  category: string;
  restaurant_name: string;
}

export interface AnalyticsData {
  success: boolean;
  kpi: AnalyticsKPI;
  bins: PriceBin[];
  categories: CategoryStat[];
  restaurantBreakdown: RestaurantStat[];
  keywords: KeywordStat[];
  outliers: OutlierItem[];
}

export interface ScrapeResult {
  success: boolean;
  restaurantName?: string;
  source?: string;
  url?: string;
  itemsCount?: number;
  items?: Array<{
    name: string;
    price: number;
    description: string;
    category: string;
    currency: string;
  }>;
  assetsCount?: number;
  socials?: Record<string, string>;
  error?: string;
  elapsedMs?: number;
  rawStderr?: string;
}
