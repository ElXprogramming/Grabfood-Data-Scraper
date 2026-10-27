import React, { useState } from 'react';
import {
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link as LinkIcon,
  ExternalLink,
  Terminal as TerminalIcon,
  Plus,
  Check,
  MapPin,
  Sliders,
  ChevronDown,
  ChevronUp,
  Edit2,
  Search,
  ArrowRight,
  Code,
} from 'lucide-react';
import { api } from '../api/client';
import type { Restaurant, ScrapeResult } from '../types';
import { getGoogleMapsUrl } from '../utils/maps';

interface ScraperStudioProps {
  restaurants: Restaurant[];
  onScrapeSuccess: () => void;
  onNavigateToData: (restaurantId?: number) => void;
  onNavigateToArch?: () => void;
}

interface LogEntry {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

const PRESETS = [
  {
    name: 'Subway - Alamesra',
    url: 'https://food.grab.com/my/en/restaurant/subway-alamesra-delivery/1-C7C2CTJFVCJVA6?',
    platform: 'GrabFood',
  },
  {
    name: 'Ayam Gepuk Bahru Alamesra',
    url: 'https://food.grab.com/my/en/restaurant/ayam-gepuk-bahru-alamesra-alamesra-plaza-permai-delivery/1-C6TYLVJDJXJHJJ?',
    platform: 'GrabFood',
  },
  {
    name: 'Ayam gepuk jowo kelate',
    url: 'https://app.grab.com/s/eDRLzAjH',
    platform: 'GrabFood',
  },
  {
    name: 'KFC Malaysia',
    url: 'https://kfc.com.my/',
    platform: 'Website',
  },
];

const AREA_PRESETS = {
  '1borneo': {
    lat: '6.036082',
    lon: '116.130047',
    area: '1borneo',
    address: '1Borneo Hypermall, Jalan Sulaman, Kota Kinabalu',
  },
  alamesra: {
    lat: '6.028450',
    lon: '116.126120',
    area: 'alamesra',
    address: 'Plaza Permai, Alamesra, Kota Kinabalu',
  },
} as const;


export const ScraperStudio: React.FC<ScraperStudioProps> = ({
  restaurants,
  onScrapeSuccess,
  onNavigateToData,
  onNavigateToArch,
}) => {
  const [url, setUrl] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [rating, setRating] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [openingHours, setOpeningHours] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [area, setArea] = useState('');
  const [renderBrowser, setRenderBrowser] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showDishesPreview, setShowDishesPreview] = useState(false);
  const [tableSearch, setTableSearch] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      time: new Date().toLocaleTimeString(),
      text: 'Scraper engine ready. Awaiting URL input.',
      type: 'info',
    },
  ]);

  // Modal State for editing restaurant metadata
  const [editRestaurant, setEditRestaurant] = useState<Restaurant | null>(null);
  const [modalUrl, setModalUrl] = useState('');
  const [modalRating, setModalRating] = useState('');
  const [modalCuisine, setModalCuisine] = useState('');
  const [modalHours, setModalHours] = useState('');
  const [modalAddress, setModalAddress] = useState('');
  const [modalLat, setModalLat] = useState('');
  const [modalLon, setModalLon] = useState('');
  const [modalArea, setModalArea] = useState('');
  const [modalSuccess, setModalSuccess] = useState(false);

  // Platform detector
  const detectPlatform = (targetUrl: string) => {
    const low = targetUrl.toLowerCase();
    if (low.includes('grab.com')) return { name: 'GrabFood', color: 'badge-grab' };
    if (low.includes('foodpanda')) return { name: 'Foodpanda', color: 'badge-panda' };
    if (low.startsWith('http://') || low.startsWith('https://')) {
      return { name: 'Web Menu', color: 'badge-web' };
    }
    return null;
  };

  const detectedPlatform = detectPlatform(url);

  const addLog = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        time: new Date().toLocaleTimeString(),
        text,
        type,
      },
    ]);
  };

  const handleStartScraping = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) {
      setError('Please provide a valid menu URL.');
      return;
    }

    setIsLoading(true);
    setShowLogs(true);
    setError(null);
    setResult(null);

    const platformLabel = detectedPlatform ? detectedPlatform.name : 'Target';
    addLog(`Initiating scraping task for ${platformLabel}: ${url}`, 'info');

    if (renderBrowser) {
      addLog('Headless browser engine enabled (--render) for client-side JS.', 'info');
    }

    try {
      addLog('Fetching DOM & intercepting menu payloads...', 'info');
      const res = await api.scrapeUrl({
        url,
        name: restaurantName || undefined,
        rating: rating ? parseFloat(rating) : undefined,
        cuisine: cuisine || undefined,
        opening_hours: openingHours || undefined,
        address: address || undefined,
        lat: lat ? parseFloat(lat) : undefined,
        lon: lon ? parseFloat(lon) : undefined,
        area: area || undefined,
        render: renderBrowser,
      });

      if (res.success) {
        setResult(res);

        if (res.isMerged) {
          addLog(
            `Deduplicated: Matched venue "${res.restaurantName}" (ID #${res.restaurantId}). Merged records.`,
            'warn'
          );
        }

        addLog(
          `Success: Parsed ${res.itemsCount || 0} dishes from "${res.restaurantName}" in ${(
            (res.elapsedMs || 0) / 1000
          ).toFixed(1)}s`,
          'success'
        );

        onScrapeSuccess();
      } else {
        const errMsg = res.error || 'Failed to extract items from the provided link.';
        setError(errMsg);
        addLog(`Error: ${errMsg}`, 'error');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unexpected scraper error.';
      setError(errMsg);
      addLog(`Failed execution: ${errMsg}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPreset = (preset: (typeof PRESETS)[0]) => {
    setUrl(preset.url);
    setRestaurantName(preset.name);
    setRenderBrowser(preset.platform === 'Website');
    setError(null);
    addLog(`Preset selected: ${preset.name}`, 'info');
  };

  const handleOpenEditModal = (r: Restaurant) => {
    setEditRestaurant(r);
    setModalUrl(r.grab_url || r.website || r.foodpanda_url || '');
    setModalRating(r.rating != null ? String(r.rating) : '');
    setModalCuisine(r.cuisine || '');
    setModalHours(r.opening_hours || '');
    setModalAddress(r.address || '');
    setModalLat(r.lat != null ? String(r.lat) : '');
    setModalLon(r.lon != null ? String(r.lon) : '');
    setModalArea(r.area || '');
    setModalSuccess(false);
  };

  const handleSaveModal = async () => {
    if (!editRestaurant) return;
    try {
      await api.updateRestaurant({
        id: editRestaurant.id,
        rating: modalRating ? parseFloat(modalRating) : undefined,
        cuisine: modalCuisine || undefined,
        opening_hours: modalHours || undefined,
        address: modalAddress || undefined,
        lat: modalLat ? parseFloat(modalLat) : undefined,
        lon: modalLon ? parseFloat(modalLon) : undefined,
        area: modalArea || undefined,
      });

      if (modalUrl.trim()) {
        await api.addLink(editRestaurant.name, modalUrl.trim());
      }

      setModalSuccess(true);
      addLog(`Updated metadata for "${editRestaurant.name}"`, 'success');
      setTimeout(() => {
        setModalSuccess(false);
        setEditRestaurant(null);
        onScrapeSuccess();
      }, 700);
    } catch (err: unknown) {
      alert(`Error saving updates: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleQuickPin = (location: keyof typeof AREA_PRESETS) => {
    const preset = AREA_PRESETS[location];
    setLat(preset.lat);
    setLon(preset.lon);
    setArea(preset.area);
    setAddress(preset.address);
  };


  // Filtered restaurants for table
  const filteredRestaurants = restaurants.filter((r) => {
    if (!tableSearch) return true;
    const query = tableSearch.toLowerCase();
    return (
      r.name.toLowerCase().includes(query) ||
      (r.area && r.area.toLowerCase().includes(query)) ||
      (r.cuisine && r.cuisine.toLowerCase().includes(query))
    );
  });

  return (
    <div className="view-container">
      {/* Page Title & Minimal Action Bar */}
      <div className="view-header">
        <div>
          <h2 className="view-title">Scraper Studio</h2>
          <p className="view-desc">
            Harvest menu items, pricing, and spatial coordinates into local SQLite and Cloud Firestore.
          </p>
        </div>
        {onNavigateToArch && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onNavigateToArch}
            title="Inspect GrabFood headless scraper source code and architecture"
          >
            <Code size={13} />
            <span>GrabFood Scraper Source</span>
            <ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* Scraper Input Command Bar */}
      <div className="command-card">
        <form onSubmit={handleStartScraping}>
          <div className="command-bar">
            <div className="command-input-wrap">
              <LinkIcon size={16} className="command-icon" />
              <input
                type="url"
                className="command-input"
                placeholder="Enter GrabFood, Foodpanda, or restaurant menu URL..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                disabled={isLoading}
                required
              />
              {detectedPlatform && (
                <span className={`platform-pill ${detectedPlatform.color}`}>
                  {detectedPlatform.name}
                </span>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading || !url.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="is-spinning" />
                  <span>Harvesting...</span>
                </>
              ) : (
                <>
                  <Play size={14} fill="currentColor" />
                  <span>Scrape</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Presets & Options Toggle */}
          <div className="command-footer">
            <div className="presets-list">
              <span className="presets-caption">Presets:</span>
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="preset-chip"
                  onClick={() => handleApplyPreset(p)}
                >
                  {p.name.replace(' - Alamesra', '')}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={`btn-ghost-toggle ${showOptions ? 'active' : ''}`}
              onClick={() => setShowOptions(!showOptions)}
            >
              <Sliders size={13} />
              <span>Options</span>
              {showOptions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* Collapsible Options Drawer */}
          {showOptions && (
            <div className="options-drawer">
              <div className="drawer-grid">
                <div className="form-item">
                  <label>Venue Name Override</label>
                  <input
                    type="text"
                    placeholder="Auto-detected if blank"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <div className="form-item">
                  <label>Rating (1.0 - 5.0)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="5.0"
                    placeholder="e.g. 4.6"
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>Cuisine Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Fast Food, Halal"
                    value={cuisine}
                    onChange={(e) => setCuisine(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>Operating Hours</label>
                  <input
                    type="text"
                    placeholder="e.g. 10:00 - 22:00"
                    value={openingHours}
                    onChange={(e) => setOpeningHours(e.target.value)}
                  />
                </div>

                <div className="form-item span-2">
                  <label>Street Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Ground Floor, 1Borneo Hypermall"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="e.g. 6.036082"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="e.g. 116.130047"
                    value={lon}
                    onChange={(e) => setLon(e.target.value)}
                  />
                </div>
              </div>

              <div className="drawer-actions">
                <label className="checkbox-compact">
                  <input
                    type="checkbox"
                    checked={renderBrowser}
                    onChange={(e) => setRenderBrowser(e.target.checked)}
                    disabled={isLoading}
                  />
                  <span>Render JavaScript with Headless Chromium</span>
                </label>

                <div className="pin-presets">
                  <button
                    type="button"
                    className="btn-tiny"
                    onClick={() => handleQuickPin('1borneo')}
                  >
                    Pin 1Borneo
                  </button>
                  <button
                    type="button"
                    className="btn-tiny"
                    onClick={() => handleQuickPin('alamesra')}
                  >
                    Pin Alamesra
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="alert-box error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}
        </form>
      </div>

      {/* Result Notification Card */}
      {result && result.success && (
        <div className="result-banner">
          <div className="result-banner-left">
            <CheckCircle2 size={18} className="text-success" />
            <div className="result-summary">
              <div className="result-headline">
                <strong>{result.restaurantName}</strong>
                <span className="dot-sep">·</span>
                <span>{result.itemsCount} dishes harvested</span>
                <span className="dot-sep">·</span>
                <span className="text-muted">{((result.elapsedMs || 0) / 1000).toFixed(1)}s</span>
                {result.isMerged && (
                  <span className="merged-tag">Deduplicated</span>
                )}
              </div>
              <div className="result-meta-inline">
                {result.rating && <span>★ {result.rating}</span>}
                {result.cuisine && <span>{result.cuisine}</span>}
                {result.area && <span>📍 {result.area}</span>}
              </div>
            </div>
          </div>

          <div className="result-banner-actions">
            {result.items && result.items.length > 0 && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowDishesPreview(!showDishesPreview)}
              >
                {showDishesPreview ? 'Hide Dishes' : `Preview (${Math.min(result.items.length, 6)})`}
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onNavigateToData(result.restaurantId)}
            >
              <span>View in Analytics</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Expandable Preview Dishes Grid */}
      {result && showDishesPreview && result.items && (
        <div className="preview-container">
          <div className="preview-items-grid">
            {result.items.slice(0, 6).map((item, idx) => (
              <div key={idx} className="preview-mini-card">
                <div className="mini-card-head">
                  <span className="mini-category">{item.category || 'General'}</span>
                  <span className="mini-price">RM {item.price.toFixed(2)}</span>
                </div>
                <div className="mini-name">{item.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compact / Collapsible Status & Logs Drawer */}
      <div className="terminal-strip">
        <button
          type="button"
          className="terminal-strip-toggle"
          onClick={() => setShowLogs(!showLogs)}
        >
          <div className="strip-left">
            <TerminalIcon size={14} />
            <span>Console Stream</span>
            <span className={`status-indicator ${isLoading ? 'active' : ''}`}>
              {isLoading ? 'Processing' : 'Standby'}
            </span>
          </div>
          <div className="strip-right">
            <span>{logs.length} events</span>
            {showLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        </button>

        {showLogs && (
          <div className="terminal-console">
            {logs.map((log) => (
              <div key={log.id} className={`console-line ${log.type}`}>
                <span className="console-time">{log.time}</span>
                <span className="console-msg">{log.text}</span>
              </div>
            ))}
            {isLoading && (
              <div className="console-line info">
                <span className="console-time">{new Date().toLocaleTimeString()}</span>
                <span className="console-msg is-loading">
                  <Loader2 size={11} className="is-spinning" /> Sniffing network payloads...
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Discovered Establishments (Minimalist Table) */}
      <div className="table-card">
        <div className="table-header-row">
          <div>
            <h3 className="table-title">Tracked Establishments</h3>
            <span className="table-sub">{filteredRestaurants.length} venues in 1Borneo & Alamesra</span>
          </div>

          <div className="table-search-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Filter venues..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="table-search-input"
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Venue</th>
                <th>Location</th>
                <th>Rating</th>
                <th>Menu Status</th>
                <th>Source</th>
                <th className="align-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRestaurants.map((rest) => (
                <tr key={rest.id}>
                  {/* Venue Name & Cuisine */}
                  <td>
                    <div className="venue-cell">
                      <span className="venue-name">{rest.name}</span>
                      <span className="venue-sub">
                        {rest.cuisine || 'General Dining'}
                        {rest.avg_price ? ` · avg RM ${rest.avg_price.toFixed(2)}` : ''}
                      </span>
                    </div>
                  </td>

                  {/* Location & Map Link */}
                  <td>
                    <div className="location-cell">
                      <a
                        href={getGoogleMapsUrl({
                          lat: rest.lat,
                          lon: rest.lon,
                          address: rest.address,
                          name: rest.name,
                          area: rest.area,
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="map-link-chip"
                        title={rest.address || 'Open in Google Maps'}
                      >
                        <MapPin size={11} />
                        <span>{rest.area || '1Borneo/Alamesra'}</span>
                        <ExternalLink size={10} className="icon-ext" />
                      </a>
                    </div>
                  </td>

                  {/* Rating */}
                  <td>
                    {rest.rating ? (
                      <span className="rating-text">
                        ★ {rest.rating}
                      </span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>

                  {/* Menu Status */}
                  <td>
                    {rest.item_count > 0 ? (
                      <span className="badge-status-ready">
                        {rest.item_count} items
                      </span>
                    ) : (
                      <span className="badge-status-empty">
                        Unscraped
                      </span>
                    )}
                  </td>

                  {/* Source Links */}
                  <td>
                    <div className="sources-cell">
                      {rest.grab_url ? (
                        <a
                          href={rest.grab_url}
                          target="_blank"
                          rel="noreferrer"
                          className="source-link"
                        >
                          GrabFood <ExternalLink size={10} />
                        </a>
                      ) : rest.website ? (
                        <a
                          href={rest.website}
                          target="_blank"
                          rel="noreferrer"
                          className="source-link"
                        >
                          Web <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="align-right">
                    <div className="action-button-group">
                      {/* Scrape button if url available */}
                      {rest.grab_url || rest.website ? (
                        <button
                          type="button"
                          className="btn-cell-action"
                          onClick={() => {
                            setUrl((rest.grab_url || rest.website)!);
                            setRestaurantName(rest.name);
                            setRenderBrowser(!rest.grab_url);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          title="Load URL and scrape"
                        >
                          Scrape
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-cell-action highlight"
                          onClick={() => handleOpenEditModal(rest)}
                          title="Attach delivery URL"
                        >
                          <Plus size={12} /> Attach
                        </button>
                      )}


                      {/* Edit metadata */}
                      <button
                        type="button"
                        className="btn-cell-icon"
                        onClick={() => handleOpenEditModal(rest)}
                        title="Edit metadata & GPS"
                      >
                        <Edit2 size={12} />
                      </button>

                      {/* View dishes in analytics */}
                      {rest.item_count > 0 && (
                        <button
                          type="button"
                          className="btn-cell-action secondary"
                          onClick={() => onNavigateToData(rest.id)}
                          title="Explore dishes"
                        >
                          View
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Location & Metadata Modal */}
      {editRestaurant && (
        <div className="modal-backdrop" onClick={() => setEditRestaurant(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Venue: {editRestaurant.name}</h3>
              <button
                className="btn-close"
                onClick={() => setEditRestaurant(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-grid">
                <div className="form-item span-2">
                  <label>Store URL (GrabFood, Foodpanda, Website)</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={modalUrl}
                    onChange={(e) => setModalUrl(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>Rating (1.0 - 5.0)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="5.0"
                    placeholder="4.6"
                    value={modalRating}
                    onChange={(e) => setModalRating(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>Cuisine Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Fast Food"
                    value={modalCuisine}
                    onChange={(e) => setModalCuisine(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>Operating Hours</label>
                  <input
                    type="text"
                    placeholder="e.g. 10:00 - 22:00"
                    value={modalHours}
                    onChange={(e) => setModalHours(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>Area</label>
                  <select
                    value={modalArea}
                    onChange={(e) => setModalArea(e.target.value)}
                  >
                    <option value="">Select Area</option>
                    <option value="1borneo">1Borneo Hypermall</option>
                    <option value="alamesra">Alamesra</option>
                  </select>
                </div>

                <div className="form-item span-2">
                  <label>Street Address</label>
                  <input
                    type="text"
                    placeholder="Lot number, floor, building"
                    value={modalAddress}
                    onChange={(e) => setModalAddress(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="6.036082"
                    value={modalLat}
                    onChange={(e) => setModalLat(e.target.value)}
                  />
                </div>

                <div className="form-item">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="116.130047"
                    value={modalLon}
                    onChange={(e) => setModalLon(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-preset-pins">
                <span className="text-dim">Preset Coordinates:</span>
                {(['1borneo', 'alamesra'] as const).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    className="btn-tiny"
                    onClick={() => {
                      setModalLat(AREA_PRESETS[loc].lat);
                      setModalLon(AREA_PRESETS[loc].lon);
                      setModalArea(AREA_PRESETS[loc].area);
                    }}
                  >
                    {loc === '1borneo' ? '1Borneo' : 'Alamesra'}
                  </button>
                ))}
              </div>

            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setEditRestaurant(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveModal}
                disabled={modalSuccess}
              >
                {modalSuccess ? (
                  <>
                    <Check size={14} /> Saved!
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
