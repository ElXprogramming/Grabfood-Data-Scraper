import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ScraperStudio } from './components/ScraperStudio';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { DataMiningLab } from './components/DataMiningLab';
import { TechArchitecture } from './components/TechArchitecture';
import { api } from './api/client';
import type { Restaurant, AnalyticsData } from './types';
import './App.css';

export function App() {
  const [activeTab, setActiveTab] = useState<'scraper' | 'analytics' | 'datamining' | 'architecture'>('scraper');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [filteredRestaurantId, setFilteredRestaurantId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [restRes, analyticsRes] = await Promise.all([
        api.getRestaurants(),
        api.getAnalytics(),
      ]);
      if (restRes.success) {
        setRestaurants(restRes.restaurants);
      }
      if (analyticsRes.success) {
        setAnalytics(analyticsRes);
      }
    } catch (err) {
      console.error('Failed to load application data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      setIsRefreshing(true);
      try {
        const [restRes, analyticsRes] = await Promise.all([
          api.getRestaurants(),
          api.getAnalytics(),
        ]);
        if (!ignore) {
          if (restRes.success) setRestaurants(restRes.restaurants);
          if (analyticsRes.success) setAnalytics(analyticsRes);
        }
      } catch (err) {
        console.error('Failed to load application data:', err);
      } finally {
        if (!ignore) setIsRefreshing(false);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  const handleNavigateToData = (restaurantId?: number) => {
    if (restaurantId) {
      setFilteredRestaurantId(restaurantId);
    } else {
      setFilteredRestaurantId(null);
    }
    setActiveTab('analytics');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalItems = analytics?.kpi?.totalItems || 0;
  const totalRestaurants = restaurants.length;

  return (
    <div className="app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        itemCount={totalItems}
        restaurantCount={totalRestaurants}
        onRefresh={loadData}
        isRefreshing={isRefreshing}
      />

      <main className="app-main-content">
        {activeTab === 'scraper' && (
          <ScraperStudio
            restaurants={restaurants}
            onScrapeSuccess={loadData}
            onNavigateToData={handleNavigateToData}
            onNavigateToArch={() => {
              setActiveTab('architecture');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            analytics={analytics}
            restaurants={restaurants}
            initialRestaurantFilter={filteredRestaurantId}
          />
        )}

        {activeTab === 'datamining' && (
          <DataMiningLab analytics={analytics} />
        )}

        {activeTab === 'architecture' && (
          <TechArchitecture />
        )}
      </main>

      <footer className="app-footer">
        <span className="footer-text">
          GastroMine KK · 1Borneo & Alamesra Market Intelligence
        </span>
      </footer>
    </div>
  );
}

export default App;
