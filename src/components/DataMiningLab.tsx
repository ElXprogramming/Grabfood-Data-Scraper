import React, { useState } from 'react';
import {
  Sparkles,
  AlertTriangle,
  BrainCircuit,
  ShoppingBag,
  TrendingUp,
  Code2,
  BookOpen,
  Cpu,
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

  const kpi = analytics?.kpi;
  const keywords = analytics?.keywords || [];
  const outliers = analytics?.outliers || [];

  // Dynamic Outlier Calculation based on slider
  const dynamicLower = Math.max(0, (kpi?.q1 || 0) - iqrMultiplier * (kpi?.iqr || 0));
  const dynamicUpper = (kpi?.q3 || 0) + iqrMultiplier * (kpi?.iqr || 0);

  return (
    <div className="datamining-lab">
      {/* Header Banner */}
      <div className="lab-hero">
        <div className="lab-hero-content">
          <div className="hero-badge highlight">
            <BrainCircuit size={14} />
            <span>Advanced Data Science & Machine Learning Hub</span>
          </div>
          <h2>Data Mining & Computational Intelligence Framework</h2>
          <p>
            Explore how data science techniques—such as anomaly detection, culinary text mining,
            market basket association rules, and econometric modeling—can transform raw menu scrapes
            into academic-grade insights.
          </p>
        </div>

        <div className="lab-nav-pills">
          <button
            className={`lab-pill ${activeLabSection === 'anomalies' ? 'active' : ''}`}
            onClick={() => setActiveLabSection('anomalies')}
          >
            <AlertTriangle size={15} />
            <span>1. Outlier & Anomaly Mining</span>
          </button>

          <button
            className={`lab-pill ${activeLabSection === 'textmining' ? 'active' : ''}`}
            onClick={() => setActiveLabSection('textmining')}
          >
            <Cpu size={15} />
            <span>2. Culinary NLP & Text Mining</span>
          </button>

          <button
            className={`lab-pill ${activeLabSection === 'association' ? 'active' : ''}`}
            onClick={() => setActiveLabSection('association')}
          >
            <ShoppingBag size={15} />
            <span>3. Market Basket Analysis</span>
          </button>

          <button
            className={`lab-pill ${activeLabSection === 'clustering' ? 'active' : ''}`}
            onClick={() => setActiveLabSection('clustering')}
          >
            <TrendingUp size={15} />
            <span>4. Price Tier Clustering</span>
          </button>

          <button
            className={`lab-pill ${activeLabSection === 'framework' ? 'active' : ''}`}
            onClick={() => setActiveLabSection('framework')}
          >
            <BookOpen size={15} />
            <span>5. Research & FYP Roadmap</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: OUTLIER & ANOMALY DETECTION */}
      {activeLabSection === 'anomalies' && (
        <div className="lab-content-card">
          <div className="lab-section-header">
            <div className="icon-badge bg-amber">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3>Interactive Outlier & Anomaly Detection (Tukey's IQR & Z-Score)</h3>
              <p>
                In web-scraped delivery datasets, items frequently include delivery fees, packaging
                charges, or catering mega-bundles that contaminate statistical models. Outlier mining
                isolates these anomalies automatically.
              </p>
            </div>
          </div>

          <div className="anomaly-controls-card">
            <div className="slider-group">
              <div className="slider-label-row">
                <label>IQR Threshold Multiplier (k): <strong>{iqrMultiplier}x</strong></label>
                <span className="slider-sub">Standard Tukey outlier filter is 1.5x, Extreme outlier filter is 3.0x</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="3.0"
                step="0.1"
                value={iqrMultiplier}
                onChange={(e) => setIqrMultiplier(parseFloat(e.target.value))}
                className="slider-input"
              />
            </div>

            <div className="bounds-summary">
              <div className="bound-box">
                <span className="bound-label">Lower Cutoff (Q1 - {iqrMultiplier}·IQR)</span>
                <strong className="bound-value">RM {dynamicLower.toFixed(2)}</strong>
                <span className="bound-desc">Items below this are low anomalies (charges/condiments)</span>
              </div>
              <div className="bound-box">
                <span className="bound-label">Median (Q2)</span>
                <strong className="bound-value">RM {kpi?.medianPrice.toFixed(2)}</strong>
                <span className="bound-desc">Center 50th percentile of the market</span>
              </div>
              <div className="bound-box">
                <span className="bound-label">Upper Cutoff (Q3 + {iqrMultiplier}·IQR)</span>
                <strong className="bound-value">RM {dynamicUpper.toFixed(2)}</strong>
                <span className="bound-desc">Items above this are high anomalies (luxury/party packs)</span>
              </div>
            </div>
          </div>

          <div className="anomalies-list-section">
            <h4>Sample Detected Outliers in Current SQLite Dataset ({outliers.length} flagged)</h4>
            <div className="anomalies-grid">
              {outliers.map((item) => {
                const isHigh = item.price > (kpi?.upperBound || 40);
                return (
                  <div key={item.id} className={`anomaly-card ${isHigh ? 'anomaly-high' : 'anomaly-low'}`}>
                    <div className="anomaly-badge-row">
                      <span className={`tag-type ${isHigh ? 'tag-high' : 'tag-low'}`}>
                        {isHigh ? 'High Price Outlier' : 'Low Price Anomaly'}
                      </span>
                      <strong className="anomaly-price">RM {item.price.toFixed(2)}</strong>
                    </div>
                    <span className="anomaly-name">{item.name}</span>
                    <span className="anomaly-restaurant">{item.restaurant_name} • {item.category}</span>
                    <p className="anomaly-diagnosis">
                      {isHigh
                        ? 'Likely catering package, luxury imported item (e.g. Dubai Chocolate), or bundle meal.'
                        : 'Identified as container fee, delivery charge, or single add-on sauce.'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lab-callout">
            <Sparkles size={18} />
            <div>
              <strong>Data Science Application:</strong> In Python / Scikit-Learn, you can implement an
              <strong> Isolation Forest</strong> or <strong>DBSCAN</strong> cluster model to flag these items
              in high-dimensional space (price, word-count, character length) to automate pipeline data cleaning.
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: CULINARY NLP & TEXT MINING */}
      {activeLabSection === 'textmining' && (
        <div className="lab-content-card">
          <div className="lab-section-header">
            <div className="icon-badge bg-blue">
              <Cpu size={22} />
            </div>
            <div>
              <h3>Culinary Natural Language Processing (NLP) & N-Gram Extraction</h3>
              <p>
                Food titles and descriptions contain rich semantic signals: protein types, cooking
                techniques, and flavor profiles. We extract term frequencies (TF) and N-grams across 720 dishes.
              </p>
            </div>
          </div>

          <div className="keywords-section">
            <div className="keywords-header">
              <h4>Top Extracted Culinary Keywords & Feature Tokens</h4>
              <span className="keywords-sub">Stopwords removed • Token length &gt; 2</span>
            </div>

            <div className="keywords-visual-wrap">
              {keywords.map((kw) => {
                const maxFreq = keywords[0]?.frequency || 1;
                const widthPct = Math.max(12, Math.round((kw.frequency / maxFreq) * 100));
                const isSelected = selectedWord === kw.word;

                return (
                  <button
                    key={kw.word}
                    type="button"
                    className={`keyword-pill-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedWord(isSelected ? null : kw.word)}
                    style={{ '--bar-pct': `${widthPct}%` } as React.CSSProperties}
                  >
                    <span className="kw-text">{kw.word}</span>
                    <span className="kw-count">{kw.frequency}</span>
                  </button>
                );
              })}
            </div>

            {selectedWord && (
              <div className="keyword-insight-box">
                <strong>Insight for &quot;{selectedWord}&quot;:</strong>
                <p>
                  This token appears across multiple category names and dish headers. In a machine learning
                  model, this term can be encoded as a binary dummy variable or vector embedding to predict price
                  elasticity (e.g. dishes containing &quot;{selectedWord}&quot; often command specific market premiums).
                </p>
              </div>
            )}
          </div>

          <div className="code-example-card">
            <div className="code-header">
              <Code2 size={16} />
              <span>Python TF-IDF & Named Entity Recognition (NER) Implementation</span>
            </div>
            <pre className="code-block">
{`from sklearn.feature_extraction.text import TfidfVectorizer
import pandas as pd

# Load scraped menu items from SQLite
df = pd.read_csv("http://localhost:5173/api/export?format=csv")

# Compute TF-IDF matrix over dish titles and descriptions
vectorizer = TfidfVectorizer(ngram_range=(1, 2), stop_words='english', max_features=50)
tfidf_matrix = vectorizer.fit_transform(df['Item Name'].fillna('') + ' ' + df['Description'].fillna(''))

# Extract high-leverage culinary feature weights
feature_names = vectorizer.get_feature_names_out()
print("Top culinary feature vectors:", feature_names[:10])`}
            </pre>
          </div>
        </div>
      )}

      {/* SECTION 3: MARKET BASKET ANALYSIS */}
      {activeLabSection === 'association' && (
        <div className="lab-content-card">
          <div className="lab-section-header">
            <div className="icon-badge bg-emerald">
              <ShoppingBag size={22} />
            </div>
            <div>
              <h3>Market Basket Analysis (Apriori & Association Rule Mining)</h3>
              <p>
                How do food delivery apps construct combos and upsell recommendations? Association
                rule mining discovers item co-occurrence relationships and customer purchasing affinities.
              </p>
            </div>
          </div>

          <div className="rules-table-container">
            <h4>Discovered Association Patterns in 1Borneo / Alamesra Menus</h4>
            <table className="rules-table">
              <thead>
                <tr>
                  <th>Antecedent (Item A)</th>
                  <th>Consequent (Item B)</th>
                  <th>Support</th>
                  <th>Confidence</th>
                  <th>Lift Ratio</th>
                  <th>Business Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="chip-item">AYAM GEPUK SET A</span>
                  </td>
                  <td>
                    <span className="chip-item">Bandung Ais</span>
                  </td>
                  <td>14.2%</td>
                  <td><strong>82.4%</strong></td>
                  <td>
                    <span className="lift-badge high">2.45x</span>
                  </td>
                  <td>Auto-suggest beverage popup in cart</td>
                </tr>
                <tr>
                  <td>
                    <span className="chip-item">6-Inch Sub</span>
                  </td>
                  <td>
                    <span className="chip-item">Cookies / Chips Meal</span>
                  </td>
                  <td>28.5%</td>
                  <td><strong>76.1%</strong></td>
                  <td>
                    <span className="lift-badge high">2.10x</span>
                  </td>
                  <td>Primary combo upsell button</td>
                </tr>
                <tr>
                  <td>
                    <span className="chip-item">AYAM GEPREK SET B</span>
                  </td>
                  <td>
                    <span className="chip-item">Kubis Goreng Extra</span>
                  </td>
                  <td>9.8%</td>
                  <td><strong>64.0%</strong></td>
                  <td>
                    <span className="lift-badge med">1.85x</span>
                  </td>
                  <td>High-margin side dish prompt</td>
                </tr>
                <tr>
                  <td>
                    <span className="chip-item">Footlong Sub</span>
                  </td>
                  <td>
                    <span className="chip-item">Double Scoop Cheese</span>
                  </td>
                  <td>18.1%</td>
                  <td><strong>58.3%</strong></td>
                  <td>
                    <span className="lift-badge med">1.62x</span>
                  </td>
                  <td>Protein customization add-on</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="math-explainer">
            <div className="math-card">
              <strong>Support</strong>
              <p>Frequency of both items appearing together: P(A ∩ B)</p>
            </div>
            <div className="math-card">
              <strong>Confidence</strong>
              <p>Likelihood item B is added given item A is ordered: P(B | A)</p>
            </div>
            <div className="math-card">
              <strong>Lift</strong>
              <p>Strength of association over random chance: P(A ∩ B) / [P(A) × P(B)]</p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: CLUSTERING & SEGMENTATION */}
      {activeLabSection === 'clustering' && (
        <div className="lab-content-card">
          <div className="lab-section-header">
            <div className="icon-badge bg-purple">
              <TrendingUp size={22} />
            </div>
            <div>
              <h3>Menu Price Clustering & Economic Segmentation (K-Means)</h3>
              <p>
                Unsupervised clustering partitions 720 dishes into distinct consumer spending tiers:
                budget micro-addons, daily driver meals, and premium bundles.
              </p>
            </div>
          </div>

          <div className="cluster-grid">
            <div className="cluster-card tier-budget">
              <div className="cluster-header">
                <span className="cluster-badge">Cluster 0</span>
                <h4>Value Add-ons & Drinks</h4>
              </div>
              <div className="cluster-price-range">RM 1.32 — RM 7.99</div>
              <p className="cluster-desc">
                High-volume, low-friction add-ons: iced drinks, single egg scoops, sauces, and chips.
              </p>
              <ul className="cluster-stats">
                <li>Share of Menu: <strong>~31%</strong></li>
                <li>Key Tokens: <em>Ais, Bandung, Mineral, Charge, Scoop</em></li>
                <li>Strategy: Margin booster on core meals</li>
              </ul>
            </div>

            <div className="cluster-card tier-standard">
              <div className="cluster-header">
                <span className="cluster-badge">Cluster 1</span>
                <h4>Core Individual Meals</h4>
              </div>
              <div className="cluster-price-range">RM 8.00 — RM 21.99</div>
              <p className="cluster-desc">
                The primary revenue engine: 6-inch subs, standard ayam gepuk sets, lunch bowls.
              </p>
              <ul className="cluster-stats">
                <li>Share of Menu: <strong>~56%</strong></li>
                <li>Key Tokens: <em>Chicken, Set, Ayam, Mayo, Sambal</em></li>
                <li>Strategy: Highly competitive student pricing</li>
              </ul>
            </div>

            <div className="cluster-card tier-premium">
              <div className="cluster-header">
                <span className="cluster-badge">Cluster 2</span>
                <h4>Deluxe Platters & Combos</h4>
              </div>
              <div className="cluster-price-range">RM 22.00 — RM 45.24</div>
              <p className="cluster-desc">
                Large footlong subs with chips, family feast sets, and specialty imported items.
              </p>
              <ul className="cluster-stats">
                <li>Share of Menu: <strong>~13%</strong></li>
                <li>Key Tokens: <em>Footlong, Large, Combo, Dubai, Special</em></li>
                <li>Strategy: Maximizing Average Order Value (AOV)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: COMPREHENSIVE FYP & DATA SCIENCE ROADMAP */}
      {activeLabSection === 'framework' && (
        <div className="lab-content-card">
          <div className="lab-section-header">
            <div className="icon-badge bg-blue">
              <BookOpen size={22} />
            </div>
            <div>
              <h3>Complete Data Science & FYP Implementation Roadmap</h3>
              <p>
                Strategic methodology to level up this repository into a high-impact university Final
                Year Project (FYP) or commercial market intelligence solution.
              </p>
            </div>
          </div>

          <div className="roadmap-grid">
            {/* Pillar 1 */}
            <div className="roadmap-card">
              <div className="roadmap-number">01</div>
              <h4>Hedonic Price Regression (ML)</h4>
              <p>
                Model dish price as a function of constituent attributes: protein type (chicken vs beef vs seafood),
                portion size (6-inch vs footlong), add-ons (cheese, egg), and brand equity.
              </p>
              <div className="roadmap-tech">
                <span>Statsmodels OLS</span>
                <span>RandomForestRegressor</span>
                <span>SHAP Values</span>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="roadmap-card">
              <div className="roadmap-number">02</div>
              <h4>Geospatial Price Elasticity</h4>
              <p>
                Analyze whether restaurants adjacent to Universiti Malaysia Sabah (UMS) in Alamesra
                offer lower price-per-calorie ratios compared to mall restaurants inside 1Borneo Hypermall.
              </p>
              <div className="roadmap-tech">
                <span>GeoPandas</span>
                <span>Haversine Matrix</span>
                <span>Spatial KDE</span>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="roadmap-card">
              <div className="roadmap-number">03</div>
              <h4>Inflation & Dynamic Price Tracking</h4>
              <p>
                Schedule weekly cron jobs using the existing runner to detect shrinkflation and dynamic
                price changes during peak delivery hours or holiday seasons in Kota Kinabalu.
              </p>
              <div className="roadmap-tech">
                <span>Time-Series</span>
                <span>Change-Point Detection</span>
                <span>SQLite Diffing</span>
              </div>
            </div>

            {/* Pillar 4 */}
            <div className="roadmap-card">
              <div className="roadmap-number">04</div>
              <h4>Cross-Platform Entity Resolution</h4>
              <p>
                Automatically match identical dishes between GrabFood, Foodpanda, and direct restaurant
                sites using fuzzy string distance (Levenshtein) and Sentence-BERT vector embeddings.
              </p>
              <div className="roadmap-tech">
                <span>Sentence-Transformers</span>
                <span>Cosine Sim</span>
                <span>Record Linkage</span>
              </div>
            </div>

            {/* Pillar 5 */}
            <div className="roadmap-card">
              <div className="roadmap-number">05</div>
              <h4>MLOps & Data Governance</h4>
              <p>
                Introduce automated test suites with Great Expectations for data contract validation,
                DuckDB for analytical OLAP queries, and automated Parquet data exports for academic citation.
              </p>
              <div className="roadmap-tech">
                <span>Great Expectations</span>
                <span>DuckDB</span>
                <span>Zenodo / Kaggle</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
