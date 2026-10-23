import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  Utensils,
  DollarSign,
  Store,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BarChart,
  FileSpreadsheet,
  FileJson,
  Copy,
  Check,
  TrendingUp,
  Tag,
  Star,
  MapPin,
  Clock,
  ExternalLink,
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
import requests

url = "http://localhost:5173${api.getExportUrl('csv')}"
df = pd.read_csv(url)

print("Dataset Summary:")
print(df.info())
print("\\nPrice & Rating Statistics:")
print(df[['Price', 'Rating']].describe())
`;
    navigator.clipboard.writeText(pythonCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="analytics-dashboard">
      {/* KPI Cards Header */}
      {kpi && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon-wrap bg-blue">
              <Utensils size={20} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Harvested Dishes</span>
              <strong className="kpi-value">{kpi.totalItems}</strong>
              <span className="kpi-sub">Across active delivery menus</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-wrap bg-emerald">
              <DollarSign size={20} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Market Mean Price</span>
              <strong className="kpi-value">RM {kpi.avgPrice.toFixed(2)}</strong>
              <span className="kpi-sub">Std Dev: ±RM {kpi.stdDev.toFixed(2)}</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-wrap bg-purple">
              <TrendingUp size={20} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Median &amp; Spread (IQR)</span>
              <strong className="kpi-value">RM {kpi.medianPrice.toFixed(2)}</strong>
              <span className="kpi-sub">
                IQR: RM {kpi.iqr.toFixed(2)} (Q1: RM {kpi.q1.toFixed(2)} - Q3: RM {kpi.q3.toFixed(2)})
              </span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-wrap bg-amber">
              <Store size={20} />
            </div>
            <div className="kpi-data">
              <span className="kpi-label">Tracked Establishments</span>
              <strong className="kpi-value">
                {kpi.scrapedRestaurants} / {kpi.totalRestaurants}
              </strong>
              <span className="kpi-sub">1Borneo &amp; Alamesra corridor</span>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Visualizations Section */}
      {analytics && (
        <div className="charts-grid">
          {/* Chart 1: Price Distribution Histogram */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title-group">
                <BarChart size={18} />
                <div>
                  <h4>Dish Price Distribution (Histogram)</h4>
                  <p>Number of menu items grouped into Malaysian Ringgit price brackets</p>
                </div>
              </div>
            </div>

            <div className="histogram-container">
              {analytics.bins.map((bin) => {
                const total = kpi?.totalItems || 1;
                const pct = Math.round((bin.count / total) * 100);
                const maxBin = Math.max(...analytics.bins.map((b) => b.count), 1);
                const heightPct = Math.max(8, Math.round((bin.count / maxBin) * 100));

                return (
                  <div key={bin.label} className="histogram-col" title={`${bin.label}: ${bin.count} items (${pct}%)`}>
                    <div className="bar-wrapper">
                      <div
                        className="bar-fill"
                        style={{ height: `${heightPct}%` }}
                      >
                        <span className="bar-count">{bin.count}</span>
                      </div>
                    </div>
                    <span className="bin-label">{bin.label}</span>
                    <span className="bin-pct">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 2: Restaurant Pricing Benchmark */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title-group">
                <Store size={18} />
                <div>
                  <h4>Restaurant Price Spread &amp; Parameters</h4>
                  <p>Min, Average, and Max menu price benchmarks per brand</p>
                </div>
              </div>
            </div>

            <div className="rest-benchmarks">
              {analytics.restaurantBreakdown.map((r) => {
                const maxRange = 50;
                const minPct = Math.min(100, (r.min_price / maxRange) * 100);
                const avgPct = Math.min(100, (r.avg_price / maxRange) * 100);
                const maxPct = Math.min(100, (r.max_price / maxRange) * 100);

                return (
                  <div key={r.id} className="rest-benchmark-row">
                    <div className="rest-meta">
                      <div className="rest-meta-left">
                        <strong className="rest-name">{r.name}</strong>
                        {r.rating && (
                          <span className="rating-pill-sm">
                            <Star size={10} fill="currentColor" /> {r.rating}
                          </span>
                        )}
                        {r.area && (
                          <a
                            href={getGoogleMapsUrl({
                              lat: r.lat,
                              lon: r.lon,
                              address: r.address,
                              name: r.name,
                              area: r.area,
                            })}
                            target="_blank"
                            rel="noreferrer"
                            className="area-pill-sm area-link"
                            title={`Open ${r.name} in Google Maps`}
                          >
                            <MapPin size={9} />
                            <span>{r.area}</span>
                          </a>
                        )}
                      </div>
                      <span className="rest-items-badge">{r.item_count} dishes</span>
                    </div>

                    <div className="benchmark-bar-track">
                      {/* Price Range Span */}
                      <div
                        className="price-span"
                        style={{
                          left: `${minPct}%`,
                          width: `${Math.max(4, maxPct - minPct)}%`,
                        }}
                      ></div>

                      {/* Average Point */}
                      <div
                        className="price-avg-point"
                        style={{ left: `${avgPct}%` }}
                        title={`Average: RM ${r.avg_price.toFixed(2)}`}
                      >
                        <span className="avg-tooltip">RM {r.avg_price.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="benchmark-values">
                      <span>Min: RM {r.min_price.toFixed(2)}</span>
                      <span>Avg: RM {r.avg_price.toFixed(2)}</span>
                      <span>Max: RM {r.max_price.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 3: Top Categories Breakdown */}
          <div className="chart-card full-width">
            <div className="chart-header">
              <div className="chart-title-group">
                <Layers size={18} />
                <div>
                  <h4>Menu Category Volume &amp; Price Profile</h4>
                  <p>Dish diversity and average meal cost across major category classifications</p>
                </div>
              </div>
            </div>

            <div className="categories-grid">
              {analytics.categories.slice(0, 8).map((cat) => {
                const maxCatCount = analytics.categories[0]?.count || 1;
                const fillWidth = Math.max(10, Math.round((cat.count / maxCatCount) * 100));

                return (
                  <div key={cat.category} className="category-metric-card">
                    <div className="cat-top">
                      <strong className="cat-title">{cat.category}</strong>
                      <span className="cat-avg-tag">Avg RM {cat.avg_price.toFixed(2)}</span>
                    </div>
                    <div className="cat-bar-bg">
                      <div className="cat-bar-fill" style={{ width: `${fillWidth}%` }}></div>
                    </div>
                    <div className="cat-bottom">
                      <span>{cat.count} menu items</span>
                      <span>Range: RM {cat.min_price.toFixed(2)} - RM {cat.max_price.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Data Explorer & Master Table Section */}
      <div className="data-table-section">
        <div className="table-controls-header">
          <div className="table-title-group">
            <h3>Master Menu Dataset Explorer</h3>
            <span className="record-count-badge">
              {totalCount} matching {totalCount === 1 ? 'dish' : 'dishes'}
            </span>
          </div>

          {/* Export & Pandas Tools */}
          <div className="export-actions">
            <a
              href={api.getExportUrl('csv')}
              download="restaurant_menus_1borneo.csv"
              className="btn-export csv"
              title="Download entire dataset as CSV with ratings and locations"
            >
              <FileSpreadsheet size={15} />
              <span>Export CSV</span>
            </a>

            <a
              href={api.getExportUrl('json')}
              download="restaurant_menus_1borneo.json"
              className="btn-export json"
              title="Download entire dataset as JSON"
            >
              <FileJson size={15} />
              <span>Export JSON</span>
            </a>

            <button
              className="btn-export copy"
              onClick={handleCopyForPandas}
              title="Copy Python Pandas snippet to clipboard"
            >
              {copied ? <Check size={15} className="text-green" /> : <Copy size={15} />}
              <span>{copied ? 'Copied Code!' : 'Python Pandas'}</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search dishes, restaurants, cuisine tags..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
            />
            {searchQuery && (
              <button
                className="clear-search"
                onClick={() => {
                  setSearchQuery('');
                  setPage(0);
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div className="filter-group">
            <Filter size={15} className="filter-icon" />

            {/* Restaurant Filter */}
            <select
              value={selectedRestaurant}
              onChange={(e) => {
                setSelectedRestaurant(e.target.value);
                setPage(0);
              }}
              className="filter-select"
            >
              <option value="">All Restaurants</option>
              {restaurants
                .filter((r) => r.item_count > 0)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.item_count})
                  </option>
                ))}
            </select>

            {/* Cuisine Filter */}
            {availableCuisines.length > 0 && (
              <select
                value={selectedCuisine}
                onChange={(e) => {
                  setSelectedCuisine(e.target.value);
                  setPage(0);
                }}
                className="filter-select"
              >
                <option value="">All Cuisines</option>
                {availableCuisines.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            {/* Rating Filter */}
            <select
              value={minRating}
              onChange={(e) => {
                setMinRating(e.target.value);
                setPage(0);
              }}
              className="filter-select"
            >
              <option value="">Any Rating</option>
              <option value="4.0">⭐ 4.0 &amp; Above</option>
              <option value="4.5">⭐ 4.5 &amp; Above</option>
            </select>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(0);
              }}
              className="filter-select"
            >
              <option value="">All Categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Price Inputs */}
            <div className="price-inputs">
              <span className="price-label">RM</span>
              <input
                type="number"
                placeholder="Min"
                className="price-num"
                value={minPrice}
                onChange={(e) => {
                  setMinPrice(e.target.value);
                  setPage(0);
                }}
              />
              <span className="price-sep">-</span>
              <input
                type="number"
                placeholder="Max"
                className="price-num"
                value={maxPrice}
                onChange={(e) => {
                  setMaxPrice(e.target.value);
                  setPage(0);
                }}
              />
            </div>

            {/* Sort Selector */}
            <div className="sort-group">
              <ArrowUpDown size={15} />
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'rating_desc');
                  setPage(0);
                }}
                className="filter-select sort"
              >
                <option value="price_desc">Price: High to Low</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="rating_desc">Rating: High to Low</option>
                <option value="name_asc">Name: A to Z</option>
                <option value="name_desc">Name: Z to A</option>
              </select>
            </div>
          </div>
        </div>

        {/* Master Table */}
        <div className="table-responsive">
          <table className="master-table">
            <thead>
              <tr>
                <th>Dish / Menu Item</th>
                <th>Restaurant &amp; Rating</th>
                <th>Cuisine &amp; Hours</th>
                <th>Location / Coordinates</th>
                <th>Category</th>
                <th className="th-price">Price (MYR)</th>
                <th>Platform</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingItems ? (
                <tr>
                  <td colSpan={7} className="table-loading-cell">
                    <div className="loading-spinner-row">
                      <Sparkles size={18} className="spin-icon" />
                      <span>Loading records from SQLite...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty-cell">
                    <p>No dishes matched your filter criteria.</p>
                    <button
                      className="btn-reset-filters"
                      onClick={() => {
                        setSelectedRestaurant('');
                        setSelectedCategory('');
                        setSelectedCuisine('');
                        setMinRating('');
                        setSearchQuery('');
                        setMinPrice('');
                        setMaxPrice('');
                        setPage(0);
                      }}
                    >
                      Reset All Filters
                    </button>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="item-name-cell">
                        <strong className="item-name">{item.name}</strong>
                        {item.description && (
                          <span className="item-description" title={item.description}>
                            {item.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="table-rest-col">
                        <span className="restaurant-tag">{item.restaurant_name}</span>
                        {item.rating ? (
                          <span className="table-rating-pill">
                            <Star size={11} fill="currentColor" /> {item.rating}
                          </span>
                        ) : (
                          <span className="table-no-rating">Unrated</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="table-cuisine-col">
                        <span className="table-cuisine-text">{item.cuisine || 'General'}</span>
                        {item.opening_hours && (
                          <span className="table-hours-text" title={item.opening_hours}>
                            <Clock size={10} /> {item.opening_hours}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="table-location-col">
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
                          className="table-area-text area-link"
                          title={`Open ${item.restaurant_name} on Google Maps`}
                        >
                          <MapPin size={11} />
                          <span>{item.area || '1Borneo/Alamesra'}</span>
                          <ExternalLink size={9} className="link-ext-icon" />
                        </a>
                        {item.lat && item.lon ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`}
                            target="_blank"
                            rel="noreferrer"
                            className="table-coords-text coords-link"
                            title={`Google Maps Pin: ${item.lat}, ${item.lon}`}
                          >
                            📍 {item.lat.toFixed(3)}, {item.lon.toFixed(3)}
                          </a>
                        ) : item.address ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              item.address.toLowerCase().includes('kinabalu')
                                ? item.address
                                : `${item.address}, Kota Kinabalu`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="table-address-text address-link"
                            title={`Open in Google Maps: ${item.address}`}
                          >
                            <span>{item.address}</span>
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span className="category-pill">
                        <Tag size={11} />
                        {item.category || 'General'}
                      </span>
                    </td>
                    <td className="td-price">
                      <strong className="price-badge">
                        RM {item.price ? item.price.toFixed(2) : '0.00'}
                      </strong>
                    </td>
                    <td>
                      <span className={`source-badge ${item.source === 'grabfood' ? 'grab' : 'web'}`}>
                        {item.source === 'grabfood' ? '🛵 Grab' : '🌐 Web'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <span className="pagination-info">
              Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, totalCount)} of{' '}
              {totalCount} dishes
            </span>

            <div className="pagination-buttons">
              <button
                className="btn-page"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft size={16} />
                <span>Prev</span>
              </button>

              <span className="page-current">
                Page {page + 1} of {totalPages}
              </span>

              <button
                className="btn-page"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
