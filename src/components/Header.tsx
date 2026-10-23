import React from 'react';
import { Database, Sparkles, BarChart3, Terminal, RefreshCw, Cpu } from 'lucide-react';

interface HeaderProps {
  activeTab: 'scraper' | 'analytics' | 'datamining';
  setActiveTab: (tab: 'scraper' | 'analytics' | 'datamining') => void;
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
      <div className="header-top">
        <div className="brand-group">
          <div className="brand-icon">
            <Cpu className="icon-pulse" size={26} />
          </div>
          <div className="brand-text">
            <div className="brand-title-row">
              <h1 className="brand-title">GastroMine KK</h1>
              <span className="badge-fyp">FYP Data Studio</span>
            </div>
            <p className="brand-subtitle">
              Automated GrabFood & Web Menu Scraping • 1Borneo / Alamesra Market Intelligence
            </p>
          </div>
        </div>

        <div className="header-status">
          <div className="db-pill">
            <Database size={15} className="pill-icon" />
            <span className="db-status-dot"></span>
            <span className="db-text">
              SQLite Active: <strong>{itemCount}</strong> items • <strong>{restaurantCount}</strong> restaurants
            </span>
          </div>

          <button
            className={`btn-refresh ${isRefreshing ? 'rotating' : ''}`}
            onClick={onRefresh}
            title="Refresh database records"
            aria-label="Refresh database"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <nav className="header-nav">
        <button
          className={`nav-btn ${activeTab === 'scraper' ? 'active' : ''}`}
          onClick={() => setActiveTab('scraper')}
        >
          <Terminal size={17} />
          <span>Scraper Studio</span>
          <span className="nav-badge">Live Scraping</span>
        </button>

        <button
          className={`nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={17} />
          <span>Data & Analytics</span>
          <span className="nav-badge">{itemCount} Records</span>
        </button>

        <button
          className={`nav-btn ${activeTab === 'datamining' ? 'active' : ''}`}
          onClick={() => setActiveTab('datamining')}
        >
          <Sparkles size={17} />
          <span>Data Mining & Science Lab</span>
          <span className="nav-badge highlight">AI / ML</span>
        </button>
      </nav>
    </header>
  );
};
