# miscj-tv 📺

miscj-tv is a premium, modern, web-based IPTV (Internet Protocol Television) player designed for streaming free live television channels from around the world. Built with high performance, beautiful custom aesthetics, and a built-in CORS proxy, miscj-tv offers a seamless browser streaming experience.

---

## ✨ Features

* **🎨 Rich Aesthetics & Themes**: Choose from multiple pre-designed styles including **Midnight Blue**, **Cyberpunk 2077**, **Neon Purple**, and **Dark Glass**.
* **📺 Alphabetical Live Grid Video Wall**: A stunning visual board displaying all channels alphabetically. Each card previews the channel's live video stream simultaneously.
* **🔢 Advanced Pagination Controls**: Features block-based pagination (showing 10 pages at a time) with block skip buttons, jump-to-page input, and a total page count indicator.
* **🎛️ Interactive Cascading Filters**: Grid-level and sidebar-level filters for Category, Country, and Language. Selecting a country automatically restricts the Language dropdown to languages spoken in that country.
* **🌐 Global Playlists & Smart M3U Parser**: Pre-loaded with public-domain global playlists (All channels index, country-specific indexes, and language-specific indexes).
* **🧠 ISO EPG & Heuristic Language Extraction**: 
  * Parses EPG identifiers (`tvg-id`) to resolve country codes (e.g., `.nl` -> `Netherlands`, `.in` -> `India`).
  * Uses advanced name scanning to infer sub-languages and regional dialects for multilingual nations (India, Malaysia, Singapore, Philippines, China, Canada, Belgium, Switzerland, Spain).
  * Automatically handles standard parenthetical tags (e.g. `(ENG)` -> `English`, `(FRA)` -> `French`).
* **🔄 Context-Preserving Navigation**: Keeps your exact page number, search term, and dropdown states when moving from Grid Mode to the player and back.
* **⚡ HLS CORS Proxy**: Bypasses cross-origin media blockages automatically. Streams that fail direct playback are piped securely through a custom Node.js rewriting proxy.
* **⭐ Favorites System**: Save and load custom selections persistently.
* **📡 Radar Scanner**: Concurrently verifies streams' online/offline statuses.
* **📊 Stats for Nerds**: Displays resolution, buffer sizes, bitrates, and player engines.

---

## 🛠️ Tech Stack

* **Frontend**: HTML5, Vanilla CSS3 (custom CSS variables & responsive layout), JavaScript (ES6+).
* **Icons**: [Lucide Icons](https://lucide.dev/).
* **HLS Engine**: [Hls.js](https://github.com/video-dev/hls.js) for adaptive HTTP Live Streaming playback.
* **Backend**: Node.js HTTP & HTTPS modules (no heavy dependencies).

---

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) (v16.0.0 or higher recommended)

### Installation & Launch

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/free-tv-player.git
   cd free-tv-player
   ```

2. **Run the local server**:
   ```bash
   node server.js
   ```

3. **Access the application**:
   Open your browser and navigate to:
   [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

* `index.html` - Application layout, sidebar structure, and player containers.
* `style.css` - Custom styling rules, color palettes, responsive sidebars, and animations.
* `app.js` - Client-side state manager, playlist M3U parser, and custom HLS player logic.
* `server.js` - Lightweight Node.js server. Features a static file server, stream status verifier (`/verify`), and an HLS-compatible CORS rewrite proxy (`/proxy`).

---

## 🔒 Open Source License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to open a Pull Request or report issues on the GitHub repository.
