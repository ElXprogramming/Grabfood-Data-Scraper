import React, { useState } from 'react';
import {
  Layers,
  Globe,
  GitMerge,
  Flame,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export const TechArchitecture: React.FC = () => {
  const [activeDiagram, setActiveDiagram] = useState<
    'topology' | 'interception' | 'dedup' | 'sync' | 'datamining'
  >('topology');

  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header">
        <div>
          <h2 className="view-title">System Architecture</h2>
          <p className="view-desc">
            Technical specifications, headless sniffing pipeline, deduplication logic, and cloud persistence.
          </p>
        </div>

        {/* Minimalist Segmented Nav */}
        <div className="subnav-segmented">
          <button
            type="button"
            className={`subnav-btn ${activeDiagram === 'topology' ? 'active' : ''}`}
            onClick={() => setActiveDiagram('topology')}
          >
            <Layers size={13} />
            <span>Topology</span>
          </button>

          <button
            type="button"
            className={`subnav-btn ${activeDiagram === 'interception' ? 'active' : ''}`}
            onClick={() => setActiveDiagram('interception')}
          >
            <Globe size={13} />
            <span>Sniffing</span>
          </button>

          <button
            type="button"
            className={`subnav-btn ${activeDiagram === 'dedup' ? 'active' : ''}`}
            onClick={() => setActiveDiagram('dedup')}
          >
            <GitMerge size={13} />
            <span>Deduplication</span>
          </button>

          <button
            type="button"
            className={`subnav-btn ${activeDiagram === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveDiagram('sync')}
          >
            <Flame size={13} />
            <span>Cloud Sync</span>
          </button>

          <button
            type="button"
            className={`subnav-btn ${activeDiagram === 'datamining' ? 'active' : ''}`}
            onClick={() => setActiveDiagram('datamining')}
          >
            <Sparkles size={13} />
            <span>Pipeline</span>
          </button>
        </div>
      </div>

      {/* VIEWPORT CARD */}
      <div className="arch-card">
        {/* DIAGRAM 1: TOPOLOGY */}
        {activeDiagram === 'topology' && (
          <div className="arch-inner">
            <div className="arch-tier-grid">
              <div className="arch-tier-item">
                <span className="tier-tag">Tier 1 · Client</span>
                <h4>React 19 & TypeScript</h4>
                <p>SPA frontend with reactive filtering, faceted search, and direct REST communication.</p>
                <div className="tier-pill-row">
                  <code>Vite 8 HMR</code>
                  <code>Lucide Icons</code>
                </div>
              </div>

              <div className="arch-tier-item">
                <span className="tier-tag">Tier 2 · Gateway</span>
                <h4>Vite API Middleware</h4>
                <p>Node.js HTTP middleware intercepting <code>/api/*</code> and managing child process execution.</p>
                <div className="tier-pill-row">
                  <code>vite-plugin-api.ts</code>
                  <code>IPC JSON</code>
                </div>
              </div>

              <div className="arch-tier-item">
                <span className="tier-tag">Tier 3 · Engine</span>
                <h4>Python Scraper Worker</h4>
                <p>Playwright Chromium engine with network response sniffing and multi-source parsers.</p>
                <div className="tier-pill-row">
                  <code>Playwright</code>
                  <code>BS4</code>
                  <code>pypdf</code>
                </div>
              </div>

              <div className="arch-tier-item">
                <span className="tier-tag">Tier 4 · Storage</span>
                <h4>Dual Persistence</h4>
                <p>Local SQLite 3 ACID storage with WAL mode, synchronized into Google Cloud Firestore.</p>
                <div className="tier-pill-row">
                  <code>menus.db</code>
                  <code>Firestore</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DIAGRAM 2: SNIFFING */}
        {activeDiagram === 'interception' && (
          <div className="arch-inner">
            <div className="arch-step-list">
              <div className="arch-step-item">
                <span className="step-badge">01</span>
                <div className="step-body">
                  <h4>Headless Context Launch</h4>
                  <p>Spawns Playwright Chromium with Kota Kinabalu coordinates (6.0360, 116.1297) and localized headers.</p>
                </div>
              </div>

              <div className="arch-step-item">
                <span className="step-badge">02</span>
                <div className="step-body">
                  <h4>Passive Network Sniffing</h4>
                  <p>Listens via <code>page.on(&apos;response&apos;)</code> for JSON responses containing GrabFood merchant catalog models.</p>
                </div>
              </div>

              <div className="arch-step-item">
                <span className="step-badge">03</span>
                <div className="step-body">
                  <h4>Recursive Menu Extraction</h4>
                  <p>Traverses nested categories, dish entities, pricing tiers, and currency symbols (MYR) with zero fragile DOM scraping.</p>
                </div>
              </div>

              <div className="arch-step-item">
                <span className="step-badge">04</span>
                <div className="step-body">
                  <h4>Batch Database Persistence</h4>
                  <p>Inserts normalized dishes into SQLite within an atomic transaction and executes deduplication.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DIAGRAM 3: DEDUPLICATION */}
        {activeDiagram === 'dedup' && (
          <div className="arch-inner">
            <div className="arch-spec-grid">
              <div className="spec-card">
                <span className="spec-label">Level 1</span>
                <h4>Exact URL & ID Matching</h4>
                <p>Matches delivery merchant IDs (e.g. <code>1-C7C2CTJFVCJVA6</code>) directly across records.</p>
              </div>

              <div className="spec-card">
                <span className="spec-label">Level 2</span>
                <h4>Normalized Text Similarity</h4>
                <p>Strips branch suffixes, punctuation, and applies Jaccard similarity &ge; 0.82 to match venue names.</p>
              </div>

              <div className="spec-card">
                <span className="spec-label">Level 3</span>
                <h4>Geospatial Haversine Bounding</h4>
                <p>Computes spherical surface distance: venues with similar names within &le;120m are automatically merged.</p>
              </div>
            </div>
          </div>
        )}

        {/* DIAGRAM 4: CLOUD SYNC */}
        {activeDiagram === 'sync' && (
          <div className="arch-inner">
            <div className="sync-specs">
              <div className="spec-card">
                <span className="spec-label">Local-First</span>
                <h4>SQLite Local Engine</h4>
                <p>Instant reads and writes with zero network latency, full offline capability during scraping.</p>
              </div>

              <div className="spec-card">
                <span className="spec-label">Cloud Replica</span>
                <h4>Google Cloud Firestore</h4>
                <p>Batched document writes (400 items/commit) sync scraped collections to <code>restaurantdatascraper</code>.</p>
              </div>
            </div>
          </div>
        )}

        {/* DIAGRAM 5: DATA SCIENCE PIPELINE */}
        {activeDiagram === 'datamining' && (
          <div className="arch-inner">
            <div className="pipeline-flow">
              <div className="flow-node">
                <span className="node-num">1</span>
                <span className="node-title">Raw Extraction</span>
                <span className="node-sub">Dishes & Prices</span>
              </div>
              <ArrowRight size={16} className="flow-arrow" />
              <div className="flow-node">
                <span className="node-num">2</span>
                <span className="node-title">IQR Filtering</span>
                <span className="node-sub">Anomaly Isolation</span>
              </div>
              <ArrowRight size={16} className="flow-arrow" />
              <div className="flow-node">
                <span className="node-num">3</span>
                <span className="node-title">TF-IDF NLP</span>
                <span className="node-sub">Culinary Tokens</span>
              </div>
              <ArrowRight size={16} className="flow-arrow" />
              <div className="flow-node">
                <span className="node-num">4</span>
                <span className="node-title">Apriori Mining</span>
                <span className="node-sub">Basket Rules</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
