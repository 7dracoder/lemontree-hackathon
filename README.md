# 🍋 Lemontree Insights

### *Empowering Food Security through Data Intelligence*

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen?style=for-the-badge)](https://lemontreehackathon.vercel.app/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)

**Lemontree Insights** is a next-generation analytics ecosystem built to tackle food insecurity through data transparency and algorithmic intelligence. By aggregating disparate datasets—including real-time pantry operations, community feedback, and federal demographics—the platform provides a "single source of truth" for the food security vertical.

🔗 **Explore the Live Dashboard**: [https://lemontreehackathon.vercel.app/](https://lemontreehackathon.vercel.app/)

---

## 🌟 Key Highlights

-   🛰️ **Live Dataset**: Real-time integration with **14,178+** food resources.
-   🧠 **AI Assistant**: Integrated L.E.M.O.N. Assistant powered by GPT-4o-mini for natural language data interrogation.
-   📊 **Persona-Driven Design**: Specialized dashboards for Food Bank Managers, Donors, and Government Agencies.
-   🧩 **Intelligent Scoring**: Custom models for **Reliability (Risk)**, **Access Barriers**, and **Community Sentiment**.
-   🗺️ **Spatial Intelligence**: Unsupervised K-Means clustering to identify food deserts and resource-dense zones.

---

## 🚀 Core Dashboards

### 🏢 Food Bank Partner Dashboard
*Focus: Operational Integrity*
Highlights "High Risk" pantries where data may be outdated (Reliability Score). Directs maintenance staff to operational blind spots.

### 🤝 Donor Impact Dashboard
*Focus: Community & Resonance*
Visualizes the "Human Story" through sentiment analysis of neighbor reviews and tracks the ROI of contributions.

### 🏛️ Government Agency Dashboard
*Focus: Strategic Planning & Equity*
Identifies coverage gaps and provides data-backed recommendations for new pantry placements based on SNAP participation.

---

## 🛠️ Technical Stack (The "Engine")

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React (Vite) | High-performance component architecture. |
| **State** | TanStack Query v5 | Advanced data fetching, caching, and cursor loop logic. |
| **Data Viz** | Recharts & Mapbox | Interactive SVG charting and vector map tiling. |
| **Database** | Supabase (PostgreSQL) | Scalable backend with geometric extensions. |
| **AI Layer** | OpenAI GPT-4o-mini | Natural language interrogation of the live dataset. |
| **Clustering** | Web Workers | Offloading K-Means math to background threads. |

---

## ⚙️ Engineering Breakthroughs

### 🔄 Cursor-Based Pagination
Standard "Offset" pagination fails at scale. We implemented a **Cursor-Based Loop** that fetches 14,000+ records in efficient batches, ensuring constant performance regardless of dataset depth.

### 🛡️ Resilience & Reliability
-   **Exponential Backoff**: Automatic retry logic for data-heavy fetches on unstable connections.
-   **Render Stability**: Strict `useEffect` guards and React Context memoization prevent infinite render loops when handling high volumes of data.
-   **Anonymity-First NLP**: Community reviews are processed for sentiment while strictly preserving neighbor privacy.

---

## 💻 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🛡️ License
Built with passion for the Lemontree Hackathon 2024.
