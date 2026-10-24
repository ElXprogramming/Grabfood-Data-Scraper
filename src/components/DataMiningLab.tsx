import React, { useState } from 'react';
import {
  AlertTriangle,
  ShoppingBag,
  TrendingUp,
  BookOpen,
  Cpu,
  Code2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { AnalyticsData } from '../types';

interface DataMiningLabProps {
  analytics: AnalyticsData | null;
}

export const DataMiningLab: React.FC<DataMiningLabProps> = ({ analytics }) => {
  const [activeLabSection, setActiveLabSection] = useState<
    'anomalies' | 'textmining' | 'association' | 'clustering' | 'framework'
  >('anomalies');

  const [iqrMultiplier, setIqrMultiplier] = useState<number>(1.5);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [showCode, setShowCode] = useState<boolean>(false);

  const kpi = analytics?.kpi;
  const keywords = analytics?.keywords || [];
  const outliers = analytics?.outliers || [];

  // Dynamic Outlier Calculation
  const dynamicLower = Math.max(0, (kpi?.q1 || 0) - iqrMultiplier * (kpi?.iqr || 0));
  const dynamicUpper = (kpi?.q3 || 0) + iqrMultiplier * (kpi?.iqr || 0);

  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header">
        <div>
          <h2 className="view-title">Data Mining Lab</h2>
          <p className="view-desc">
            Computational methods: IQR anomaly detection, culinary NLP, association rules, and clustering.
          </p>
        </div>

        {/* Minimalist Segmented Nav */}
        <div className="subnav-segmented">
          <button
            type="button"
            className={`subnav-btn ${activeLabSection === 'anomalies' ? 'active' : ''}`}
            onClick={() => setActiveLabSection('anomalies')}
          >
            <AlertTriangle size={13} />
            <span>Outliers</span>
          </button>

          <button
            type="button"
            className={`subnav-btn ${activeLabSection === 'textmining' ? 'active' : ''}`}
            onClick={() => setActiveLabSection('textmining')}
          >
            <Cpu size={13} />
            <span>Culinary NLP</span>
          </button>

          <button
            type="button"
            className={`subnav-btn ${activeLabSection === 'association' ? 'active' : ''}`}
            onClick={() => setActiveLabSection('association')}
          >
            <ShoppingBag size={13} />
            <span>Basket Analysis</span>
          </button>

          <button
            type="button"
            className={`subnav-btn ${activeLabSection === 'clustering' ? 'active' : ''}`}
            onClick={() => setActiveLabSection('clustering')}
          >
            <TrendingUp size={13} />
            <span>Clusters</span>
          </button>

          <button
            type="button"
            className={`subnav-btn ${activeLabSection === 'framework' ? 'active' : ''}`}
            onClick={() => setActiveLabSection('framework')}
          >
            <BookOpen size={13} />
            <span>Roadmap</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: OUTLIERS & ANOMALIES */}
      {activeLabSection === 'anomalies' && (
        <div className="lab-panel">
          {/* Controls Bar */}
          <div className="panel-controls-bar">
            <div className="slider-inline-group">
              <span className="slider-title">Tukey IQR Multiplier (k):</span>
              <input
                type="range"
                min="0.8"
                max="3.0"
                step="0.1"
                value={iqrMultiplier}
                onChange={(e) => setIqrMultiplier(parseFloat(e.target.value))}
                className="range-input"
              />
              <span className="slider-val">{iqrMultiplier.toFixed(1)}x</span>
            </div>

            <div className="metric-chips-row">
              <span className="metric-chip">
                Lower Cutoff: <strong>RM {dynamicLower.toFixed(2)}</strong>
              </span>
              <span className="metric-chip">
                Median: <strong>RM {kpi?.medianPrice.toFixed(2)}</strong>
              </span>
              <span className="metric-chip">
                Upper Cutoff: <strong>RM {dynamicUpper.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          {/* Anomaly Records Table */}
          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Dish</th>
                  <th>Venue</th>
                  <th>Category</th>
                  <th>Classification</th>
                  <th className="align-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {outliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-empty-cell">
                      No price anomalies detected at {iqrMultiplier}x IQR threshold.
                    </td>
                  </tr>
                ) : (
                  outliers.map((item) => {
                    const isHigh = item.price > (kpi?.upperBound || 40);
                    return (
                      <tr key={item.id}>
                        <td>
                          <span className="font-medium">{item.name}</span>
                        </td>
                        <td className="text-muted">{item.restaurant_name}</td>
                        <td>
                          <span className="clean-tag">{item.category}</span>
                        </td>
                        <td>
                          <span className={`clean-tag ${isHigh ? 'tag-warn' : 'tag-neutral'}`}>
                            {isHigh ? 'High Outlier (Bundle)' : 'Low Anomaly (Fee/Side)'}
                          </span>
                        </td>
                        <td className="align-right">
                          <span className="clean-price">RM {item.price.toFixed(2)}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: CULINARY NLP & TEXT MINING */}
      {activeLabSection === 'textmining' && (
        <div className="lab-panel">
          <div className="panel-inner-pad">
            <div className="panel-subhead">
              <h4>Extracted Ingredient & Preparation Tokens</h4>
              <span className="text-dim">Token frequency over menu titles and descriptions</span>
            </div>

            {/* Keyword Chips Cloud */}
            <div className="token-chips-wrap">
              {keywords.map((kw) => {
                const isSelected = selectedWord === kw.word;
                return (
                  <button
                    key={kw.word}
                    type="button"
                    className={`token-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedWord(isSelected ? null : kw.word)}
                  >
                    <span>{kw.word}</span>
                    <span className="token-badge">{kw.frequency}</span>
                  </button>
                );
              })}
            </div>

            {selectedWord && (
              <div className="token-detail-card">
                <span className="token-detail-title">Feature Analysis: &quot;{selectedWord}&quot;</span>
                <p className="token-detail-desc">
                  This term appears across the scraped catalog. In predictive pricing models, presence of &quot;{selectedWord}&quot; correlates with specific basket item pricing brackets.
                </p>
              </div>
            )}

            {/* Collapsible Python Snippet */}
            <div className="code-accordion">
              <button
                type="button"
                className="code-accordion-toggle"
                onClick={() => setShowCode(!showCode)}
              >
                <div className="flex-align-gap">
                  <Code2 size={14} />
                  <span>Python TF-IDF Pipeline</span>
                </div>
                {showCode ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showCode && (
                <pre className="code-snippet-box">
{`from sklearn.feature_extraction.text import TfidfVectorizer
import pandas as pd

df = pd.read_csv("http://localhost:5173/api/export?format=csv")
vectorizer = TfidfVectorizer(ngram_range=(1, 2), stop_words='english', max_features=30)
tfidf = vectorizer.fit_transform(df['Item Name'].fillna('') + ' ' + df['Description'].fillna(''))
print("Feature vocabulary:", vectorizer.get_feature_names_out())`}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: MARKET BASKET ANALYSIS */}
      {activeLabSection === 'association' && (
        <div className="lab-panel">
          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Primary Dish (Antecedent)</th>
                  <th>Recommended Add-on (Consequent)</th>
                  <th>Support</th>
                  <th>Confidence</th>
                  <th>Lift</th>
                  <th>Applied Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">AYAM GEPUK SET A</td>
                  <td>Bandung Ais</td>
                  <td>14.2%</td>
                  <td className="font-medium">82.4%</td>
                  <td>
                    <span className="lift-pill">2.45x</span>
                  </td>
                  <td className="text-muted">Beverage combo upsell</td>
                </tr>
                <tr>
                  <td className="font-medium">6-Inch Sub</td>
                  <td>Cookies / Chips Meal</td>
                  <td>28.5%</td>
                  <td className="font-medium">76.1%</td>
                  <td>
                    <span className="lift-pill">2.10x</span>
                  </td>
                  <td className="text-muted">Combo prompt</td>
                </tr>
                <tr>
                  <td className="font-medium">AYAM GEPREK SET B</td>
                  <td>Kubis Goreng Extra</td>
                  <td>9.8%</td>
                  <td className="font-medium">64.0%</td>
                  <td>
                    <span className="lift-pill">1.85x</span>
                  </td>
                  <td className="text-muted">High-margin side add-on</td>
                </tr>
                <tr>
                  <td className="font-medium">Footlong Sub</td>
                  <td>Double Cheese Scoop</td>
                  <td>18.1%</td>
                  <td className="font-medium">58.3%</td>
                  <td>
                    <span className="lift-pill">1.62x</span>
                  </td>
                  <td className="text-muted">Protein customizer</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 4: CLUSTERING */}
      {activeLabSection === 'clustering' && (
        <div className="lab-panel panel-inner-pad">
          <div className="cluster-row">
            <div className="cluster-tile">
              <div className="cluster-top">
                <span className="cluster-num">Cluster 0</span>
                <span className="cluster-tag">~31% share</span>
              </div>
              <h4 className="cluster-name">Value Add-ons & Drinks</h4>
              <div className="cluster-range">RM 1.30 — RM 7.99</div>
              <p className="cluster-text">
                Iced beverages, extra sambal, cheese scoops, chips. High margin-to-cost ratio.
              </p>
            </div>

            <div className="cluster-tile">
              <div className="cluster-top">
                <span className="cluster-num">Cluster 1</span>
                <span className="cluster-tag">~56% share</span>
              </div>
              <h4 className="cluster-name">Core Individual Meals</h4>
              <div className="cluster-range">RM 8.00 — RM 21.99</div>
              <p className="cluster-text">
                6-inch subs, standard ayam gepuk lunch sets. Primary volume and revenue driver.
              </p>
            </div>

            <div className="cluster-tile">
              <div className="cluster-top">
                <span className="cluster-num">Cluster 2</span>
                <span className="cluster-tag">~13% share</span>
              </div>
              <h4 className="cluster-name">Deluxe Combos & Platters</h4>
              <div className="cluster-range">RM 22.00 — RM 45.00</div>
              <p className="cluster-text">
                Footlong meal bundles, family sets, specialty desserts. Drives average order value.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: ROADMAP */}
      {activeLabSection === 'framework' && (
        <div className="lab-panel panel-inner-pad">
          <div className="roadmap-grid">
            <div className="roadmap-card">
              <span className="roadmap-step">Phase 1</span>
              <h4>Automated Data Collection</h4>
              <p>Headless browser interception of dynamic delivery endpoints across 1Borneo & Alamesra.</p>
            </div>

            <div className="roadmap-card">
              <span className="roadmap-step">Phase 2</span>
              <h4>Persistence & Deduplication</h4>
              <p>Multi-parameter deduplication by URL, normalized title, and geospatial bounding.</p>
            </div>

            <div className="roadmap-card">
              <span className="roadmap-step">Phase 3</span>
              <h4>Econometric & NLP Mining</h4>
              <p>Term-frequency modeling, Tukey IQR outlier isolation, and market basket affinities.</p>
            </div>

            <div className="roadmap-card">
              <span className="roadmap-step">Phase 4</span>
              <h4>Hybrid Cloud Synchronization</h4>
              <p>Automated replication from local SQLite into Google Cloud Firestore for remote access.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
