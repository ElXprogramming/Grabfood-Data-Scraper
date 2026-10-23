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
  const [renderBrowser, setRenderBrowser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      time: new Date().toLocaleTimeString(),
      text: 'Scraper engine initialized and ready. Enter a GrabFood, Foodpanda, or website link above.',
      type: 'info',
    },
  ]);
  const [linkModalRestaurant, setLinkModalRestaurant] = useState<Restaurant | null>(null);
  const [modalUrl, setModalUrl] = useState('');
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
      addLog('Connecting to destination host & capturing menu responses...', 'info');
      const res = await api.scrapeUrl(url, restaurantName || undefined, renderBrowser);

      if (res.success) {
        setResult(res);
        addLog(
          `Success! Harvested ${res.itemsCount || 0} menu items from "${res.restaurantName}" in ${(
            (res.elapsedMs || 0) / 1000
          ).toFixed(1)}s`,
          'success'
        );
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

  const handleSaveModalLink = async () => {
    if (!linkModalRestaurant || !modalUrl.trim()) return;
    try {
      await api.addLink(linkModalRestaurant.name, modalUrl.trim());
      setModalSuccess(true);
      addLog(`Attached link to "${linkModalRestaurant.name}"`, 'success');
      setTimeout(() => {
        setModalSuccess(false);
        setLinkModalRestaurant(null);
        setModalUrl('');
        onScrapeSuccess();
      }, 1000);
    } catch (err: unknown) {
      alert(`Error saving link: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="scraper-studio">
      {/* Top Banner */}
      <div className="studio-hero">
        <div className="studio-hero-content">
          <div className="hero-badge">
            <Sparkles size={14} />
            <span>Automated Menu Extraction Pipeline</span>
          </div>
          <h2>Scrape Restaurant Menus in Real Time</h2>
          <p>
            Input any GrabFood store link, Foodpanda page, or official restaurant website to extract
            complete dish catalogs, prices, categories, and descriptions straight into your dataset.
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
                <span className="optional-tag">Optional (Auto-detected if left blank)</span>
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
                <span>Engine Settings</span>
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
                  <span className="checkbox-desc">Headless Chromium for JS-heavy sites</span>
                </div>
              </label>
            </div>
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
                  <span>Harvesting Menu Items...</span>
                </>
              ) : (
                <>
                  <Play size={19} fill="currentColor" />
                  <span>Start Scraping Menu</span>
                </>
              )}
            </button>

            <span className="responsible-note">
              🛡️ Adheres to rate-limits (2s host backoff) and stores structured records into SQLite.
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
                <h3>Extraction Completed: {result.restaurantName}</h3>
                <p>
                  Platform: <strong>{result.source}</strong> • Harvested{' '}
                  <strong>{result.itemsCount}</strong> menu dishes in{' '}
                  <strong>{((result.elapsedMs || 0) / 1000).toFixed(1)}s</strong>
                </p>
              </div>
            </div>

            <button
              className="btn-view-analytics"
              onClick={() => onNavigateToData()}
            >
              <Layers size={16} />
              <span>Explore in Analytics Dashboard</span>
            </button>
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
              <h3>Discovered Local Restaurants (1Borneo Hypermall & Alamesra)</h3>
              <p>
                Geolocated food establishments indexed via OpenStreetMap & Google Places. Click to
                auto-load links or inspect data coverage.
              </p>
            </div>
          </div>
        </div>

        <div className="discovered-table-container">
          <table className="discovered-table">
            <thead>
              <tr>
                <th>Restaurant Name</th>
                <th>Area</th>
                <th>Cuisine</th>
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
                    <span className="area-pill">{rest.area || '1Borneo / Alamesra'}</span>
                  </td>
                  <td>
                    <span className="cuisine-pill">{rest.cuisine || 'Restaurant'}</span>
                  </td>
                  <td>
                    {rest.item_count > 0 ? (
                      <span className="status-badge status-ok">
                        <CheckCircle2 size={13} />
                        {rest.item_count} items scraped
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
                          Scrape Link
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
                          Scrape Site
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-action-small btn-add-link"
                          onClick={() => {
                            setLinkModalRestaurant(rest);
                            setModalUrl('');
                          }}
                        >
                          <PlusCircle size={13} />
                          Attach Link
                        </button>
                      )}

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

      {/* Attach Link Modal */}
      {linkModalRestaurant && (
        <div className="modal-backdrop" onClick={() => setLinkModalRestaurant(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Attach Link to {linkModalRestaurant.name}</h3>
              <button
                className="modal-close"
                onClick={() => setLinkModalRestaurant(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                Provide a GrabFood URL, Foodpanda URL, or restaurant website URL. This will update
                the SQLite database record so you can scrape it anytime.
              </p>
              <input
                type="url"
                className="modal-input"
                placeholder="https://food.grab.com/my/en/restaurant/... or https://..."
                value={modalUrl}
                onChange={(e) => setModalUrl(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button
                className="btn-modal-cancel"
                onClick={() => setLinkModalRestaurant(null)}
              >
                Cancel
              </button>
              <button
                className="btn-modal-save"
                onClick={handleSaveModalLink}
                disabled={!modalUrl.trim() || modalSuccess}
              >
                {modalSuccess ? (
                  <>
                    <Check size={16} /> Saved!
                  </>
                ) : (
                  'Save & Link'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
