import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BarChart,
  FileSpreadsheet,
  FileJson,
  Copy,
  Check,
  Store,
  Layers,
  MapPin,
  Sliders,
} from 'lucide-react';
import { api } from '../api/client';
import type { AnalyticsData, MenuItem, Restaurant } from '../types';
import { getGoogleMapsUrl } from '../utils/maps';

interface AnalyticsDashboardProps {
  analytics: AnalyticsData | null;
  restaurants: Restaurant[];
  initialRestaurantFilter?: number | null;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  analytics,
  restaurants,
  initialRestaurantFilter = null,
}) => {
  // Filters & Pagination State
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>(
    initialRestaurantFilter ? String(initialRestaurantFilter) : ''
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedCuisine, setSelectedCuisine] = useState<string>('');
  const [minRating, setMinRating] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'rating_desc'>('price_desc');
  const [page, setPage] = useState<number>(0);
  const pageSize = 25;

  const [activeChartTab, setActiveChartTab] = useState<'distribution' | 'venues' | 'categories'>('distribution');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  const [items, setItems] = useState<MenuItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const [prevFilter, setPrevFilter] = useState<number | null>(initialRestaurantFilter);
  if (initialRestaurantFilter !== prevFilter) {
    setPrevFilter(initialRestaurantFilter);
    setSelectedRestaurant(initialRestaurantFilter ? String(initialRestaurantFilter) : '');
  }

  // Fetch Items when filters change
  useEffect(() => {
    let isCancelled = false;
    const fetchFilteredItems = async () => {
      setIsLoadingItems(true);
      try {
        const res = await api.getMenuItems({
          restaurantId: selectedRestaurant ? parseInt(selectedRestaurant, 10) : undefined,
          search: searchQuery.trim() || undefined,
          category: selectedCategory || undefined,
          cuisine: selectedCuisine || undefined,
          minRating: minRating ? parseFloat(minRating) : undefined,
          minPrice: minPrice ? parseFloat(minPrice) : undefined,
          maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
          sort: sortBy,
          limit: pageSize,
          offset: page * pageSize,
        });
        if (!isCancelled) {
          setItems(res.items);
          setTotalCount(res.total);
        }
      } catch (err) {
        console.error('Failed to fetch items:', err);
      } finally {
        if (!isCancelled) setIsLoadingItems(false);
      }
    };

    const debounceTimer = setTimeout(fetchFilteredItems, 200);
    return () => {
      isCancelled = true;
      clearTimeout(debounceTimer);
    };
  }, [selectedRestaurant, selectedCategory, selectedCuisine, minRating, searchQuery, minPrice, maxPrice, sortBy, page]);

  // Extract unique categories and cuisines
  const availableCategories = useMemo(() => {
    if (!analytics || !analytics.categories) return [];
    return analytics.categories.map((c) => c.category);
  }, [analytics]);

  const availableCuisines = useMemo(() => {
    const set = new Set<string>();
    for (const r of restaurants) {
      if (r.cuisine) {
        r.cuisine.split(',').forEach((c) => {
          const trimmed = c.trim();
          if (trimmed) set.add(trimmed);
        });
      }
    }
    return Array.from(set).sort();
  }, [restaurants]);

  const kpi = analytics?.kpi;
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleCopyForPandas = () => {
    const pythonCode = `# Quick Python Pandas Loader for GastroMine KK Dataset
import pandas as pd

url = "http://localhost:5173${api.getExportUrl('csv')}"
df = pd.read_csv(url)
print(df.info())
print(df[['Price', 'Rating']].describe())
`;
    navigator.clipboard.writeText(pythonCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasActiveFilters = Boolean(
    selectedRestaurant || selectedCategory || selectedCuisine || minRating || minPrice || maxPrice || searchQuery
  );

  const handleResetFilters = () => {
    setSelectedRestaurant('');
    setSelectedCategory('');
    setSelectedCuisine('');
    setMinRating('');
    setSearchQuery('');
    setMinPrice('');
    setMaxPrice('');
    setPage(0);
  };

  return (
    <div className="view-container">
      {/* Page Title & Minimal Actions */}
      <div className="view-header">
        <div>
          <h2 className="view-title">Market Analytics</h2>
          <p className="view-desc">
            Aggregated pricing distributions, IQR spreads, and master menu dish database.
          </p>
        </div>

        {/* Minimal Export Action Buttons */}
        <div className="export-btn-group">
          <a
            href={api.getExportUrl('csv')}
            download="restaurant_menus_1borneo.csv"
            className="btn-ghost-sm"
            title="Download CSV"
          >
            <FileSpreadsheet size={13} />
            <span>CSV</span>
          </a>

          <a
            href={api.getExportUrl('json')}
            download="restaurant_menus_1borneo.json"
            className="btn-ghost-sm"
            title="Download JSON"
          >
            <FileJson size={13} />
            <span>JSON</span>
          </a>

          <button
            type="button"
            className="btn-ghost-sm"
            onClick={handleCopyForPandas}
            title="Copy Python Pandas snippet"
          >
            {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Python'}</span>
          </button>
        </div>
      </div>

      {/* Minimalist Metric Strip (Stripe / Vercel style) */}
      {kpi && (
        <div className="metric-strip">
          <div className="metric-cell">
            <span className="metric-label">TOTAL DISHES</span>
            <span className="metric-val">{kpi.totalItems}</span>
            <span className="metric-sub">Across 10 venues</span>
          </div>

          <div className="metric-cell">
            <span className="metric-label">MEAN PRICE</span>
            <span className="metric-val">RM {kpi.avgPrice.toFixed(2)}</span>
            <span className="metric-sub">Std dev: ±RM {kpi.stdDev.toFixed(2)}</span>
          </div>

          <div className="metric-cell">
            <span className="metric-label">MEDIAN PRICE</span>
            <span className="metric-val">RM {kpi.medianPrice.toFixed(2)}</span>
            <span className="metric-sub">IQR: RM {kpi.iqr.toFixed(2)}</span>
          </div>

          <div className="metric-cell">
            <span className="metric-label">VENUES TRACKED</span>
            <span className="metric-val">
              {kpi.scrapedRestaurants} <span className="metric-dim">/ {kpi.totalRestaurants}</span>
            </span>
            <span className="metric-sub">1Borneo & Alamesra</span>
          </div>
        </div>
      )}

      {/* Visualizations Card with Segmented Switcher */}
      {analytics && (
        <div className="chart-wrapper-card">
          <div className="chart-top-bar">
            <div className="chart-tabs">
              <button
                type="button"
                className={`chart-tab ${activeChartTab === 'distribution' ? 'active' : ''}`}
                onClick={() => setActiveChartTab('distribution')}
              >
                <BarChart size={14} />
                <span>Price Distribution</span>
              </button>

              <button
                type="button"
                className={`chart-tab ${activeChartTab === 'venues' ? 'active' : ''}`}
                onClick={() => setActiveChartTab('venues')}
              >
                <Store size={14} />
                <span>Venue Ranges</span>
              </button>

              <button
                type="button"
                className={`chart-tab ${activeChartTab === 'categories' ? 'active' : ''}`}
                onClick={() => setActiveChartTab('categories')}
              >
                <Layers size={14} />
                <span>Categories</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Price Distribution Histogram */}
          {activeChartTab === 'distribution' && (
            <div className="tab-pane">
              <div className="histogram-minimal">
                {analytics.bins.map((bin) => {
                  const total = kpi?.totalItems || 1;
                  const pct = Math.round((bin.count / total) * 100);
                  const maxBin = Math.max(...analytics.bins.map((b) => b.count), 1);
                  const heightPct = Math.max(6, Math.round((bin.count / maxBin) * 100));

                  return (
                    <div
                      key={bin.label}
                      className="hist-col"
                      title={`${bin.label}: ${bin.count} dishes (${pct}%)`}
                    >
                      <div className="hist-bar-outer">
                        <div
                          className="hist-bar-inner"
                          style={{ height: `${heightPct}%` }}
                        >
                          <span className="hist-count">{bin.count}</span>
                        </div>
                      </div>
                      <span className="hist-label">{bin.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 2: Restaurant Spread & Benchmarks */}
          {activeChartTab === 'venues' && (
            <div className="tab-pane">
              <div className="venue-ranges-list">
                {analytics.restaurantBreakdown.map((r) => {
                  const maxRange = 50;
                  const minPct = Math.min(100, (r.min_price / maxRange) * 100);
                  const avgPct = Math.min(100, (r.avg_price / maxRange) * 100);
                  const maxPct = Math.min(100, (r.max_price / maxRange) * 100);

                  return (
                    <div key={r.id} className="venue-range-row">
                      <div className="venue-range-info">
                        <span className="venue-range-name">{r.name}</span>
                        <span className="venue-range-meta">
                          {r.rating ? `★ ${r.rating} · ` : ''}
                          {r.item_count} dishes
                        </span>
                      </div>

                      <div className="range-track-container">
                        <div
                          className="range-span"
                          style={{
                            left: `${minPct}%`,
                            width: `${Math.max(3, maxPct - minPct)}%`,
                          }}
                        />
                        <div
                          className="range-avg-marker"
                          style={{ left: `${avgPct}%` }}
                          title={`Avg: RM ${r.avg_price.toFixed(2)}`}
                        />
                      </div>

                      <div className="range-values-inline">
                        <span className="text-dim">RM {r.min_price.toFixed(0)}</span>
                        <strong>RM {r.avg_price.toFixed(2)}</strong>
                        <span className="text-dim">RM {r.max_price.toFixed(0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 3: Top Categories Breakdown */}
          {activeChartTab === 'categories' && (
            <div className="tab-pane">
              <div className="category-bars-list">
                {analytics.categories.slice(0, 10).map((cat) => {
                  const maxCatCount = analytics.categories[0]?.count || 1;
                  const fillWidth = Math.max(5, Math.round((cat.count / maxCatCount) * 100));

                  return (
                    <div key={cat.category} className="cat-minimal-row">
                      <div className="cat-minimal-info">
                        <span className="cat-minimal-title">{cat.category}</span>
                        <span className="cat-minimal-price">avg RM {cat.avg_price.toFixed(2)}</span>
                      </div>
                      <div className="cat-track">
                        <div className="cat-fill" style={{ width: `${fillWidth}%` }}></div>
                      </div>
                      <span className="cat-minimal-count">{cat.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Master Menu Dataset Explorer */}
      <div className="table-card">
        {/* Compact Filters Toolbar */}
        <div className="toolbar-row">
          <div className="toolbar-search">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search dishes or venues..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              className="toolbar-input"
            />
          </div>

          <div className="toolbar-filters">
            {/* Restaurant Filter */}
            <select
              value={selectedRestaurant}
              onChange={(e) => {
                setSelectedRestaurant(e.target.value);
                setPage(0);
              }}
              className="toolbar-select"
            >
              <option value="">All Venues</option>
              {restaurants
                .filter((r) => r.item_count > 0)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.item_count})
                  </option>
                ))}
            </select>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(0);
              }}
              className="toolbar-select"
            >
              <option value="">All Categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Sort Selector */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'rating_desc');
                setPage(0);
              }}
              className="toolbar-select"
            >
              <option value="price_desc">Price: High to Low</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="rating_desc">Rating: Highest</option>
              <option value="name_asc">Name: A to Z</option>
            </select>

            {/* More Filters Toggle */}
            <button
              type="button"
              className={`btn-ghost-sm ${showAdvancedFilters ? 'active' : ''}`}
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <Sliders size={12} />
              <span>Filter</span>
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                className="btn-ghost-sm text-dim"
                onClick={handleResetFilters}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Advanced Filters Drawer */}
        {showAdvancedFilters && (
          <div className="advanced-filters-bar">
            <div className="filter-item">
              <label>Cuisine</label>
              <select
                value={selectedCuisine}
                onChange={(e) => {
                  setSelectedCuisine(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">Any Cuisine</option>
                {availableCuisines.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-item">
              <label>Min Rating</label>
              <select
                value={minRating}
                onChange={(e) => {
                  setMinRating(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">Any</option>
                <option value="4.0">★ 4.0+</option>
                <option value="4.5">★ 4.5+</option>
              </select>
            </div>

            <div className="filter-item">
              <label>Min Price (RM)</label>
              <input
                type="number"
                placeholder="0"
                value={minPrice}
                onChange={(e) => {
                  setMinPrice(e.target.value);
                  setPage(0);
                }}
              />
            </div>

            <div className="filter-item">
              <label>Max Price (RM)</label>
              <input
                type="number"
                placeholder="100"
                value={maxPrice}
                onChange={(e) => {
                  setMaxPrice(e.target.value);
                  setPage(0);
                }}
              />
            </div>
          </div>
        )}

        {/* Minimalist Dishes Table */}
        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Dish</th>
                <th>Venue</th>
                <th>Category</th>
                <th>Rating</th>
                <th className="align-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingItems ? (
                <tr>
                  <td colSpan={5} className="table-loading-cell">
                    <Sparkles size={14} className="is-spinning" />
                    <span>Loading...</span>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty-cell">
                    <span>No dishes matched your criteria.</span>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        className="btn-tiny"
                        onClick={handleResetFilters}
                      >
                        Reset Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    {/* Dish Name */}
                    <td>
                      <div className="dish-cell">
                        <span className="dish-title">{item.name}</span>
                        {item.description && (
                          <span className="dish-sub" title={item.description}>
                            {item.description}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Venue */}
                    <td>
                      <div className="table-venue-link">
                        <span>{item.restaurant_name}</span>
                        {item.area && (
                          <a
                            href={getGoogleMapsUrl({
                              lat: item.lat,
                              lon: item.lon,
                              address: item.address,
                              name: item.restaurant_name,
                              area: item.area,
                            })}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-map-icon"
                            title={item.address || 'Open in Maps'}
                          >
                            <MapPin size={10} />
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Category */}
                    <td>
                      <span className="clean-tag">{item.category || 'General'}</span>
                    </td>

                    {/* Rating */}
                    <td>
                      {item.rating ? (
                        <span className="rating-text">★ {item.rating}</span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>

                    {/* Price */}
                    <td className="align-right">
                      <span className="clean-price">
                        RM {item.price ? item.price.toFixed(2) : '0.00'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Minimalist Pagination Bar */}
        {totalPages > 1 && (
          <div className="pagination-strip">
            <span className="pagination-text">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
            </span>

            <div className="pagination-nav">
              <button
                type="button"
                className="btn-page-icon"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>

              <span className="page-indicator">
                {page + 1} / {totalPages}
              </span>

              <button
                type="button"
                className="btn-page-icon"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
