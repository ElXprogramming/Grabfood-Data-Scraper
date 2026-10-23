import React, { useState } from 'react';
import {
  Globe,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Compass,
  Link as LinkIcon,
  Sparkles,
  ExternalLink,
  Layers,
  Clock,
  Terminal as TerminalIcon,
  PlusCircle,
  Check,
  Star,
  MapPin,
  Tag,
  ShieldCheck,
  Sliders,
  ChevronDown,
  ChevronUp,
  Edit3,
} from 'lucide-react';
import { api } from '../api/client';
import type { Restaurant, ScrapeResult } from '../types';

interface ScraperStudioProps {
  restaurants: Restaurant[];
  onScrapeSuccess: () => void;
  onNavigateToData: (restaurantId?: number) => void;
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

export const ScraperStudio: React.FC<ScraperStudioProps> = ({
  restaurants,
  onScrapeSuccess,
  onNavigateToData,
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
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      time: new Date().toLocaleTimeString(),
      text: 'Scraper engine initialized with multi-parameter deduplication and metadata extraction.',
      type: 'info',
    },
  ]);

  // Modal State for attaching link or editing location
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

  // Auto-detect platform from URL
  const detectPlatform = (targetUrl: string) => {
    const low = targetUrl.toLowerCase();
    if (low.includes('grab.com')) return { name: 'GrabFood', color: 'badge-grab', icon: '🛵' };
    if (low.includes('foodpanda')) return { name: 'Foodpanda', color: 'badge-panda', icon: '🐼' };
    if (low.startsWith('http://') || low.startsWith('https://')) {
      return { name: 'Direct Website', color: 'badge-web', icon: '🌐' };
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
      setError('Please provide a valid restaurant or delivery URL.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    const platformLabel = detectedPlatform ? detectedPlatform.name : 'Target';
    addLog(`Initiating scraping task for ${platformLabel}: ${url}`, 'info');

    if (renderBrowser) {
      addLog('Headless Chromium engine enabled (--render) for dynamic JS rendering.', 'info');
    }

    try {
      addLog('Connecting to destination host & capturing menu and store metadata...', 'info');
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
            `🛡️ Deduplicated: Matched existing venue "${res.restaurantName}" (ID #${res.restaurantId}) across parameters. Data merged without creating duplicates.`,
            'warn'
          );
        }

        addLog(
          `Success! Harvested ${res.itemsCount || 0} menu items from "${res.restaurantName}" in ${(
            (res.elapsedMs || 0) / 1000
          ).toFixed(1)}s`,
          'success'
        );

        if (res.rating) addLog(`Attached rating: ⭐ ${res.rating}`, 'info');
        if (res.cuisine) addLog(`Attached cuisine tags: ${res.cuisine}`, 'info');
        if (res.openingHours) addLog(`Attached open hours: 🕒 ${res.openingHours}`, 'info');
        if (res.address || res.lat) {
          addLog(
            `Attached location: 📍 ${res.address || ''} (${res.lat || '?'}, ${res.lon || '?'})`,
            'info'
          );
        }

        addLog('Saved and indexed into local SQLite database (menus.db)', 'success');
        onScrapeSuccess();
      } else {
        const errMsg = res.error || 'Failed to extract items from the provided link.';
        setError(errMsg);
        addLog(`Scraping error: ${errMsg}`, 'error');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Scraper encountered an unexpected error.';
      setError(errMsg);
      addLog(`Failed execution: ${errMsg}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPreset = (preset: (typeof PRESETS)[0]) => {
    setUrl(preset.url);
    setRestaurantName(preset.name);
    if (preset.platform === 'Website') {
      setRenderBrowser(true);
    } else {
      setRenderBrowser(false);
    }
    setError(null);
    addLog(`Loaded preset for "${preset.name}" (${preset.platform})`, 'info');
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
      addLog(`Updated location & metadata parameters for "${editRestaurant.name}"`, 'success');
      setTimeout(() => {
        setModalSuccess(false);
        setEditRestaurant(null);
        onScrapeSuccess();
      }, 800);
    } catch (err: unknown) {
      alert(`Error saving updates: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleQuickPin = (location: '1borneo' | 'alamesra') => {
    if (location === '1borneo') {
      setLat('6.036082');
      setLon('116.130047');
      setArea('1borneo');
      setAddress('1Borneo Hypermall, Jalan Sulaman, Kota Kinabalu');
    } else {
      setLat('6.028450');
      setLon('116.126120');
      setArea('alamesra');
      setAddress('Plaza Permai, Alamesra, Kota Kinabalu');
    }
  };

  return (
    <div className="scraper-studio">
      {/* Top Banner */}
      <div className="studio-hero">
        <div className="studio-hero-content">
          <div className="hero-badge">
            <Sparkles size={14} />
            <span>Multi-Parameter Scraping & Deduplication Engine</span>
          </div>
          <h2>Scrape Restaurant Menus, Ratings & Locations</h2>
          <p>
            Extract menu dishes along with <strong>ratings</strong>, <strong>cuisine tags</strong>,{' '}
            <strong>operating hours</strong>, and <strong>geographical coordinates</strong>. Our engine
            automatically matches URLs, names, and spatial proximity to prevent duplicate records.
          </p>
        </div>

        <div className="hero-presets">
          <span className="preset-label">Quick Test Presets:</span>
          <div className="preset-buttons">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="preset-btn"
                onClick={() => handleApplyPreset(p)}
              >
                <span>{p.platform === 'GrabFood' ? '🛵' : '🌐'}</span>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Scraper Form Box */}
      <div className="scraper-card">
        <form onSubmit={handleStartScraping}>
          <div className="form-group url-input-group">
            <label htmlFor="scrape-url" className="form-label">
              <LinkIcon size={16} />
              <span>Target Menu URL</span>
              <span className="required-tag">Required</span>
            </label>

            <div className="input-with-badge">
              <input
                id="scrape-url"
                type="url"
                className="url-field"
                placeholder="https://food.grab.com/my/en/restaurant/... or https://restaurant.com/menu"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                disabled={isLoading}
                required
              />

              {detectedPlatform && (
                <div className={`detected-badge ${detectedPlatform.color}`}>
                  <span>{detectedPlatform.icon}</span>
                  <span>{detectedPlatform.name}</span>
                </div>
              )}
            </div>
          </div>

          <div className="form-row-dual">
            <div className="form-group flex-1">
              <label htmlFor="scrape-name" className="form-label">
                <span>Restaurant Name</span>
                <span className="optional-tag">Auto-detected from URL/metadata if omitted</span>
              </label>
              <input
                id="scrape-name"
                type="text"
                className="text-field"
                placeholder="e.g. Subway Alamesra"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="form-group options-group">
              <label className="form-label">
                <Globe size={16} />
                <span>Browser Rendering</span>
              </label>
              <label className="checkbox-card" title="Use Playwright Chromium to execute client-side JavaScript">
                <input
                  type="checkbox"
                  checked={renderBrowser}
                  onChange={(e) => setRenderBrowser(e.target.checked)}
                  disabled={isLoading}
                />
                <div className="checkbox-text">
                  <span className="checkbox-title">Dynamic JS Rendering (--render)</span>
                  <span className="checkbox-desc">Headless Chromium for JS-heavy web pages</span>
                </div>
              </label>
            </div>
          </div>

          {/* Collapsible Advanced Parameters & Location Input */}
          <div className="advanced-toggle-section">
            <button
              type="button"
              className="btn-toggle-advanced"
              onClick={() => setShowAdvancedParams(!showAdvancedParams)}
            >
              <Sliders size={15} />
              <span>Custom Restaurant Parameters & Location (Optional Override)</span>
              {showAdvancedParams ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {showAdvancedParams && (
              <div className="advanced-params-panel">
                <div className="params-row-3">
                  <div className="param-field">
                    <label>
                      <Star size={13} className="text-amber" /> Rating (1.0 - 5.0)
                    </label>
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

                  <div className="param-field">
                    <label>
                      <Tag size={13} /> Cuisine Tags
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Fast Food, Sandwich, Halal"
                      value={cuisine}
                      onChange={(e) => setCuisine(e.target.value)}
                    />
                  </div>

                  <div className="param-field">
                    <label>
                      <Clock size={13} /> Open Hours
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 08:00 - 22:00"
                      value={openingHours}
                      onChange={(e) => setOpeningHours(e.target.value)}
                    />
                  </div>
                </div>

                <div className="location-inputs-row">
                  <div className="param-field flex-2">
                    <label>
                      <MapPin size={13} className="text-blue" /> Physical Address
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ground Floor, 1Borneo Hypermall, Jalan Sulaman"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>

                  <div className="param-field">
                    <label>Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="e.g. 6.036082"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                    />
                  </div>

                  <div className="param-field">
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

                <div className="quick-pins-bar">
                  <span className="quick-pin-label">Quick Location Presets:</span>
                  <button
                    type="button"
                    className="btn-quick-pin"
                    onClick={() => handleQuickPin('1borneo')}
                  >
                    📍 Pin to 1Borneo Hypermall (6.0361, 116.1300)
                  </button>
                  <button
                    type="button"
                    className="btn-quick-pin"
                    onClick={() => handleQuickPin('alamesra')}
                  >
                    📍 Pin to Alamesra Plaza (6.0285, 116.1261)
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="alert-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="action-row">
            <button
              type="submit"
              className={`btn-scrape-primary ${isLoading ? 'loading' : ''}`}
              disabled={isLoading || !url.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 size={19} className="spin-icon" />
                  <span>Harvesting Menu & Location...</span>
                </>
              ) : (
                <>
                  <Play size={19} fill="currentColor" />
                  <span>Start Scraping Menu</span>
                </>
              )}
            </button>

            <span className="responsible-note">
              🛡️ Multi-parameter deduplication active (Matches by URL, ID, Normalized Name, and GPS &le;120m).
            </span>
          </div>
        </form>
      </div>

      {/* Scrape Result Highlights (Shown if scrape succeeded) */}
      {result && result.success && (
        <div className="result-card">
          <div className="result-header">
            <div className="result-title-group">
              <CheckCircle2 size={24} className="icon-success" />
              <div>
                <div className="result-title-row">
                  <h3>Extraction Completed: {result.restaurantName}</h3>
                  {result.isMerged ? (
                    <span className="badge-merged">
                      <ShieldCheck size={13} />
                      Deduplicated &amp; Merged with Existing Venue (ID #{result.restaurantId})
                    </span>
                  ) : (
                    <span className="badge-new">New Restaurant Added</span>
                  )}
                </div>
                <p>
                  Platform: <strong>{result.source}</strong> • Harvested{' '}
                  <strong>{result.itemsCount}</strong> menu dishes in{' '}
                  <strong>{((result.elapsedMs || 0) / 1000).toFixed(1)}s</strong>
                </p>
              </div>
            </div>

            <button
              className="btn-view-analytics"
              onClick={() => onNavigateToData(result.restaurantId)}
            >
              <Layers size={16} />
              <span>Explore in Analytics Dashboard</span>
            </button>
          </div>

          {/* Restaurant Parameter Badges */}
          <div className="result-params-row">
            {result.rating && (
              <span className="meta-badge rating">
                <Star size={12} fill="currentColor" />
                Rating: {result.rating} / 5.0
              </span>
            )}
            {result.cuisine && (
              <span className="meta-badge cuisine">
                <Tag size={12} />
                {result.cuisine}
              </span>
            )}
            {result.openingHours && (
              <span className="meta-badge hours">
                <Clock size={12} />
                {result.openingHours}
              </span>
            )}
            {(result.address || result.lat) && (
              <span className="meta-badge location">
                <MapPin size={12} />
                {result.address || `${result.lat}, ${result.lon}`}
              </span>
            )}
          </div>

          {result.items && result.items.length > 0 && (
            <div className="result-items-preview">
              <h4>Sample Parsed Dishes ({Math.min(result.items.length, 6)} of {result.items.length})</h4>
              <div className="preview-grid">
                {result.items.slice(0, 6).map((item, idx) => (
                  <div key={idx} className="preview-dish-card">
                    <div className="dish-top">
                      <span className="dish-category">{item.category || 'General'}</span>
                      <span className="dish-price">RM {item.price.toFixed(2)}</span>
                    </div>
                    <strong className="dish-name">{item.name}</strong>
                    {item.description && (
                      <p className="dish-desc">{item.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Terminal & Logs */}
      <div className="terminal-card">
        <div className="terminal-header">
          <div className="terminal-title">
            <TerminalIcon size={16} />
            <span>Execution Terminal & Network Log</span>
          </div>
          <span className="terminal-status">
            {isLoading ? 'Active Process' : 'Standby'}
          </span>
        </div>

        <div className="terminal-body">
          {logs.map((log) => (
            <div key={log.id} className={`log-line log-${log.type}`}>
              <span className="log-time">[{log.time}]</span>
              <span className="log-content">{log.text}</span>
            </div>
          ))}
          {isLoading && (
            <div className="log-line log-loading">
              <span className="log-time">[{new Date().toLocaleTimeString()}]</span>
              <span className="log-content">
                <Loader2 size={13} className="spin-inline" /> Fetching and analyzing DOM/JSON payload streams...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Discovered Restaurants in Area (1Borneo / Alamesra) */}
      <div className="discovered-section">
        <div className="section-header">
          <div className="section-title-group">
            <Compass size={20} />
            <div>
              <h3>Discovered Local Establishments (1Borneo Hypermall &amp; Alamesra)</h3>
              <p>
                Geolocated food establishments. You can attach delivery links, update ratings, or
                pin coordinates to enrich your dataset.
              </p>
            </div>
          </div>
        </div>

        <div className="discovered-table-container">
          <table className="discovered-table">
            <thead>
              <tr>
                <th>Restaurant Name</th>
                <th>Rating &amp; Cuisine</th>
                <th>Location / Address</th>
                <th>Scrape Status</th>
                <th>Available Links</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {restaurants.map((rest) => (
                <tr key={rest.id} className={rest.item_count > 0 ? 'row-scraped' : ''}>
                  <td>
                    <div className="restaurant-cell-name">
                      <strong>{rest.name}</strong>
                      {rest.avg_price && (
                        <span className="cell-subtext">Avg: RM {rest.avg_price.toFixed(2)}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="rating-cuisine-cell">
                      {rest.rating ? (
                        <span className="rating-pill">
                          <Star size={11} fill="currentColor" /> {rest.rating}
                        </span>
                      ) : (
                        <span className="no-rating-pill">Unrated</span>
                      )}
                      <span className="cuisine-pill">{rest.cuisine || 'Food & Dining'}</span>
                      {rest.opening_hours && (
                        <span className="hours-pill" title={rest.opening_hours}>
                          🕒 {rest.opening_hours}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="location-cell">
                      <span className="area-pill">{rest.area || '1Borneo / Alamesra'}</span>
                      {rest.lat && rest.lon ? (
                        <span className="coords-pill" title={`GPS: ${rest.lat}, ${rest.lon}`}>
                          📍 {rest.lat.toFixed(4)}, {rest.lon.toFixed(4)}
                        </span>
                      ) : (
                        <span className="no-coords-pill">No GPS coordinates</span>
                      )}
                      {rest.address && (
                        <span className="address-text" title={rest.address}>
                          {rest.address}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {rest.item_count > 0 ? (
                      <span className="status-badge status-ok">
                        <CheckCircle2 size={13} />
                        {rest.item_count} items
                      </span>
                    ) : (
                      <span className="status-badge status-pending">
                        <Clock size={13} />
                        Unscraped
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="links-cell">
                      {rest.grab_url && (
                        <a
                          href={rest.grab_url}
                          target="_blank"
                          rel="noreferrer"
                          className="link-chip grab"
                          title="Open GrabFood"
                        >
                          GrabFood <ExternalLink size={11} />
                        </a>
                      )}
                      {rest.website && (
                        <a
                          href={rest.website}
                          target="_blank"
                          rel="noreferrer"
                          className="link-chip web"
                          title="Open Website"
                        >
                          Website <ExternalLink size={11} />
                        </a>
                      )}
                      {!rest.grab_url && !rest.website && (
                        <span className="no-link-text">No URL attached</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="actions-cell">
                      {rest.grab_url ? (
                        <button
                          type="button"
                          className="btn-action-small btn-load"
                          onClick={() => {
                            setUrl(rest.grab_url!);
                            setRestaurantName(rest.name);
                            setRenderBrowser(false);
                            window.scrollTo({ top: 120, behavior: 'smooth' });
                          }}
                        >
                          Scrape
                        </button>
                      ) : rest.website ? (
                        <button
                          type="button"
                          className="btn-action-small btn-load"
                          onClick={() => {
                            setUrl(rest.website!);
                            setRestaurantName(rest.name);
                            setRenderBrowser(true);
                            window.scrollTo({ top: 120, behavior: 'smooth' });
                          }}
                        >
                          Scrape
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-action-small btn-add-link"
                          onClick={() => handleOpenEditModal(rest)}
                        >
                          <PlusCircle size={13} />
                          Attach
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn-action-small btn-edit-meta"
                        onClick={() => handleOpenEditModal(rest)}
                        title="Edit location, rating & metadata"
                      >
                        <Edit3 size={12} />
                      </button>

                      {rest.item_count > 0 && (
                        <button
                          type="button"
                          className="btn-action-small btn-view"
                          onClick={() => onNavigateToData(rest.id)}
                          title="View dishes in Analytics"
                        >
                          View ({rest.item_count})
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
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-title">
                <MapPin size={18} className="text-blue" />
                <h3>Attach Location &amp; Metadata: {editRestaurant.name}</h3>
              </div>
              <button
                className="modal-close"
                onClick={() => setEditRestaurant(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                Update the physical location coordinates, street address, rating, cuisine tags, and
                delivery store link for this restaurant.
              </p>

              <div className="modal-form-grid">
                <div className="form-group full-span">
                  <label>Store URL (GrabFood, Foodpanda, or Website)</label>
                  <input
                    type="url"
                    className="modal-input"
                    placeholder="https://food.grab.com/my/en/restaurant/... or https://..."
                    value={modalUrl}
                    onChange={(e) => setModalUrl(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Rating (1.0 - 5.0)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="5.0"
                    className="modal-input"
                    placeholder="e.g. 4.6"
                    value={modalRating}
                    onChange={(e) => setModalRating(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Cuisine Tags</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="e.g. Fast Food, Sandwich, Beverages"
                    value={modalCuisine}
                    onChange={(e) => setModalCuisine(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Operating Hours</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="e.g. 10:00 - 22:00"
                    value={modalHours}
                    onChange={(e) => setModalHours(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Area / District</label>
                  <select
                    className="modal-input"
                    value={modalArea}
                    onChange={(e) => setModalArea(e.target.value)}
                  >
                    <option value="">Select Area</option>
                    <option value="1borneo">1Borneo Hypermall</option>
                    <option value="alamesra">Alamesra</option>
                  </select>
                </div>

                <div className="form-group full-span">
                  <label>Street Address</label>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="e.g. Lot C-118, Concourse Floor, 1Borneo Hypermall"
                    value={modalAddress}
                    onChange={(e) => setModalAddress(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    className="modal-input"
                    placeholder="e.g. 6.036082"
                    value={modalLat}
                    onChange={(e) => setModalLat(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    className="modal-input"
                    placeholder="e.g. 116.130047"
                    value={modalLon}
                    onChange={(e) => setModalLon(e.target.value)}
                  />
                </div>
              </div>

              <div className="quick-pins-bar modal-pins">
                <span className="quick-pin-label">Set Preset GPS:</span>
                <button
                  type="button"
                  className="btn-quick-pin"
                  onClick={() => {
                    setModalLat('6.036082');
                    setModalLon('116.130047');
                    setModalArea('1borneo');
                  }}
                >
                  📍 1Borneo Coordinates
                </button>
                <button
                  type="button"
                  className="btn-quick-pin"
                  onClick={() => {
                    setModalLat('6.028450');
                    setModalLon('116.126120');
                    setModalArea('alamesra');
                  }}
                >
                  📍 Alamesra Coordinates
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-modal-cancel"
                onClick={() => setEditRestaurant(null)}
              >
                Cancel
              </button>
              <button
                className="btn-modal-save"
                onClick={handleSaveModal}
                disabled={modalSuccess}
              >
                {modalSuccess ? (
                  <>
                    <Check size={16} /> Saved Changes!
                  </>
                ) : (
                  'Save & Attach'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
