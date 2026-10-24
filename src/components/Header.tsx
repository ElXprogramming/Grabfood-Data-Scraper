import React from 'react';
import { Sparkles, BarChart2, Terminal, RefreshCw, Layers } from 'lucide-react';

interface HeaderProps {
  activeTab: 'scraper' | 'analytics' | 'datamining' | 'architecture';
  setActiveTab: (tab: 'scraper' | 'analytics' | 'datamining' | 'architecture') => void;
  itemCount: number;
  restaurantCount: number;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  itemCount,
  restaurantCount,
  onRefresh,
  isRefreshing = false,
}) => {
  return (
    <header className="app-header">
      <div className="header-inner">
        {/* Brand */}
        <div className="header-brand">
          <div className="brand-symbol">
            <Terminal size={18} />
          </div>
          <div className="brand-meta">
            <span className="brand-name">GastroMine</span>
            <span className="brand-tag">KK</span>
          </div>
        </div>

        {/* Minimalist Tabs Navigation */}
        <nav className="header-nav">
          <button
            className={`nav-link ${activeTab === 'scraper' ? 'active' : ''}`}
            onClick={() => setActiveTab('scraper')}
          >
            <Terminal size={15} />
            <span>Scraper</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart2 size={15} />
            <span>Analytics</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'datamining' ? 'active' : ''}`}
            onClick={() => setActiveTab('datamining')}
          >
            <Sparkles size={15} />
            <span>Mining Lab</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'architecture' ? 'active' : ''}`}
            onClick={() => setActiveTab('architecture')}
          >
            <Layers size={15} />
            <span>Architecture</span>
          </button>
        </nav>

        {/* Status / Quick Stats */}
        <div className="header-status">
          <div className="status-pill" title="Local SQLite & Cloud Firestore connected">
            <span className="status-dot"></span>
            <span className="status-label">
              {itemCount} dishes · {restaurantCount} venues
            </span>
          </div>

          <button
            className={`btn-ghost-icon ${isRefreshing ? 'is-spinning' : ''}`}
            onClick={onRefresh}
            title="Refresh database records"
            aria-label="Refresh database"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};
