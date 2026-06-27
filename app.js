/* AeroTV - Application JavaScript Logic */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const video = document.getElementById('videoPlayer');
  const playlistSelect = document.getElementById('playlistSelect');
  const addPlaylistBtn = document.getElementById('addPlaylistBtn');
  const customPlaylistContainer = document.getElementById('customPlaylistContainer');
  const customPlaylistUrlInput = document.getElementById('customPlaylistUrl');
  const loadCustomPlaylistBtn = document.getElementById('loadCustomPlaylist');
  const cancelCustomPlaylistBtn = document.getElementById('cancelCustomPlaylist');
  
  const searchInput = document.getElementById('channelSearch');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const categoryTabs = document.getElementById('categoryTabs');
  const channelList = document.getElementById('channelList');
  const channelListStatus = document.getElementById('channelListStatus');
  
  const playerContainer = document.getElementById('playerContainer');
  const playerSplash = document.getElementById('playerSplash');
  const playerLoading = document.getElementById('playerLoading');
  const playerError = document.getElementById('playerError');
  const errorMessage = document.getElementById('errorMessage');
  const retryStreamBtn = document.getElementById('retryStreamBtn');
  const proxyBtn = document.getElementById('proxyBtn');
  const statChannelsCount = document.getElementById('statChannelsCount');
  
  const activeChannelMeta = document.getElementById('activeChannelMeta');
  const headerChannelLogo = document.getElementById('headerChannelLogo');
  const headerChannelName = document.getElementById('headerChannelName');
  const headerChannelCategory = document.getElementById('headerChannelCategory');
  const headerChannelCountry = document.getElementById('headerChannelCountry');
  
  const channelDetailsCard = document.getElementById('channelDetailsCard');
  const detailsName = document.getElementById('detailsName');
  const detailsUrl = document.getElementById('detailsUrl');
  const detailsCategory = document.getElementById('detailsCategory');
  const detailsCountry = document.getElementById('detailsCountry');
  const detailsLanguage = document.getElementById('detailsLanguage');
  
  // Custom Controls
  const playPauseBtn = document.getElementById('playPauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  const volumeBtn = document.getElementById('volumeBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const statsToggleBtn = document.getElementById('statsToggleBtn');
  const favoriteToggleBtn = document.getElementById('favoriteToggleBtn');
  const pipBtn = document.getElementById('pipBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const playerControlsOverlay = document.getElementById('playerControlsOverlay');
  
  // Stats for Nerds
  const statsPanel = document.getElementById('statsForNerds');
  const closeStatsBtn = document.getElementById('closeStatsBtn');
  const statResolution = document.getElementById('statResolution');
  const statBitrate = document.getElementById('statBitrate');
  const statBuffer = document.getElementById('statBuffer');
  const statType = document.getElementById('statType');
  const statProxy = document.getElementById('statProxy');
  
  // Sidebar toggles
  const sidebar = document.getElementById('sidebar');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  const sidebarOpenBtn = document.getElementById('sidebarOpenBtn');
  
  // Modals & Themes
  const infoBtn = document.getElementById('infoBtn');
  const infoModal = document.getElementById('infoModal');
  const closeInfoModal = document.getElementById('closeInfoModal');
  const themeDropdown = document.getElementById('themeDropdown');
  const scanBtn = document.getElementById('scanBtn');
  const onlineToggle = document.getElementById('onlineToggle');

  // --- State Variables ---
  let channels = [];
  let isScanning = false;
  let showOnlineOnly = false;
  let favorites = JSON.parse(localStorage.getItem('aerotv_favorites')) || [];
  let customPlaylists = JSON.parse(localStorage.getItem('aerotv_custom_playlists')) || [];
  let currentPlaylistUrl = localStorage.getItem('aerotv_current_playlist') || playlistSelect.value;
  let activeChannel = null;
  let hlsInstance = null;
  let currentCategory = 'all';
  let isProxyEnabled = false;
  let statsInterval = null;
  let controlsTimeout = null;
  const MAX_RENDERED_CHANNELS = 250;

  // --- Sidebar Filters State ---
  let sidebarFilterCountry = 'all';
  let sidebarFilterLanguage = 'all';

  // --- Grid View State ---
  let currentViewMode = 'player'; // 'player' or 'grid'
  let gridCurrentPage = 1;
  const GRID_PAGE_SIZE = 12;
  let gridActiveHlsInstances = [];
  let gridFilterCategory = 'all';
  let gridFilterCountry = 'all';
  let gridFilterLanguage = 'all';

  // --- Core Initialization ---
  function init() {
    lucide.createIcons();
    setupEventListeners();
    loadTheme(localStorage.getItem('aerotv_theme') || 'theme-midnight-blue');
    loadSavedCustomPlaylists();
    
    // Select last active playlist in dropdown
    if (playlistSelect.querySelector(`option[value="${currentPlaylistUrl}"]`)) {
      playlistSelect.value = currentPlaylistUrl;
    } else if (customPlaylists.some(p => p.url === currentPlaylistUrl)) {
      addCustomOptionToDropdown(currentPlaylistUrl, currentPlaylistUrl);
      playlistSelect.value = currentPlaylistUrl;
    }
    
    fetchPlaylist(currentPlaylistUrl);
    setupVolume();
  }

  // --- Theme Manager ---
  function loadTheme(themeName) {
    document.body.className = '';
    document.body.classList.add(themeName);
    localStorage.setItem('aerotv_theme', themeName);
  }

  // --- Custom Playlist Dropdown Loading ---
  function loadSavedCustomPlaylists() {
    customPlaylists.forEach(playlist => {
      addCustomOptionToDropdown(playlist.name, playlist.url);
    });
  }

  function addCustomOptionToDropdown(name, url) {
    // Check if it already exists in select list to avoid duplicates
    let exists = false;
    for (let option of playlistSelect.options) {
      if (option.value === url) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      const option = document.createElement('option');
      option.value = url;
      option.textContent = name.length > 25 ? name.substring(0, 22) + '...' : name;
      playlistSelect.insertBefore(option, playlistSelect.querySelector('option[value="custom"]'));
    }
  }

  // --- M3U Playlist Downloader & Parser ---
  let playlistAbortController = null;

  async function fetchPlaylist(url) {
    if (playlistAbortController) {
      playlistAbortController.abort();
    }
    playlistAbortController = new AbortController();
    const signal = playlistAbortController.signal;

    showPlaylistStatus(true, 'Fetching playlist from server...');
    channels = [];
    isProxyEnabled = false;
    
    try {
      // Use local Node CORS proxy if stream URL fails or is cross-origin
      // For fetching playlist M3U itself, try fetching directly first, fallback to proxy
      let response;
      try {
        response = await fetch(url, { signal });
      } catch (corsError) {
        if (corsError.name === 'AbortError') throw corsError;
        console.warn('Direct fetch blocked by CORS. Trying local proxy...', corsError);
        const proxyUrl = `/proxy?url=${encodeURIComponent(url)}`;
        response = await fetch(proxyUrl, { signal });
      }
      
      if (!response.ok) throw new Error(`HTTP status ${response.status}`);
      const text = await response.text();
      parseM3U(text);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Error fetching playlist:', err);
      showPlaylistStatus(true, `Failed to load playlist: ${err.message}. Please check URL or connection.`, true);
    }
  }

  function parseM3U(m3uText) {
    showPlaylistStatus(true, 'Parsing streams...');
    
    // Country & Language Mapping Databases
    const countryMap = {
      'ad': 'Andorra', 'ae': 'United Arab Emirates', 'af': 'Afghanistan', 'ag': 'Antigua and Barbuda', 'ai': 'Anguilla',
      'al': 'Albania', 'am': 'Armenia', 'ao': 'Angola', 'aq': 'Antarctica', 'ar': 'Argentina', 'as': 'American Samoa',
      'at': 'Austria', 'au': 'Australia', 'aw': 'Aruba', 'ax': 'Åland Islands', 'az': 'Azerbaijan', 'ba': 'Bosnia and Herzegovina',
      'bb': 'Barbados', 'bd': 'Bangladesh', 'be': 'Belgium', 'bf': 'Burkina Faso', 'bg': 'Bulgaria', 'bh': 'Bahrain',
      'bi': 'Burundi', 'bj': 'Benin', 'bl': 'Saint Barthélemy', 'bm': 'Bermuda', 'bn': 'Brunei', 'bo': 'Bolivia',
      'bq': 'Caribbean Netherlands', 'br': 'Brazil', 'bs': 'Bahamas', 'bt': 'Bhutan', 'bv': 'Bouvet Island', 'bw': 'Botswana',
      'by': 'Belarus', 'bz': 'Belize', 'ca': 'Canada', 'cc': 'Cocos Islands', 'cd': 'Congo (DRC)', 'cf': 'Central African Republic',
      'cg': 'Congo', 'ch': 'Switzerland', 'ci': 'Côte d\'Ivoire', 'ck': 'Cook Islands', 'cl': 'Chile', 'cm': 'Cameroon',
      'cn': 'China', 'co': 'Colombia', 'cr': 'Costa Rica', 'cu': 'Cuba', 'cv': 'Cape Verde', 'cw': 'Curaçao', 'cx': 'Christmas Island',
      'cy': 'Cyprus', 'cz': 'Czech Republic', 'de': 'Germany', 'dj': 'Djibouti', 'dk': 'Denmark', 'dm': 'Dominica', 'do': 'Dominican Republic',
      'dz': 'Algeria', 'ec': 'Ecuador', 'ee': 'Estonia', 'eg': 'Egypt', 'eh': 'Western Sahara', 'er': 'Eritrea', 'es': 'Spain',
      'et': 'Ethiopia', 'fi': 'Finland', 'fj': 'Fiji', 'fk': 'Falkland Islands', 'fm': 'Micronesia', 'fo': 'Faroe Islands',
      'fr': 'France', 'ga': 'Gabon', 'gb': 'United Kingdom', 'gd': 'Grenada', 'ge': 'Georgia', 'gf': 'French Guiana',
      'gg': 'Guernsey', 'gh': 'Ghana', 'gi': 'Gibraltar', 'gl': 'Greenland', 'gm': 'Gambia', 'gn': 'Guinea', 'gp': 'Guadeloupe',
      'gq': 'Equatorial Guinea', 'gr': 'Greece', 'gs': 'South Georgia', 'gt': 'Guatemala', 'gu': 'Guam', 'gw': 'Guinea-Bissau',
      'gy': 'Guyana', 'hk': 'Hong Kong', 'hm': 'Heard Island', 'hn': 'Honduras', 'hr': 'Croatia', 'ht': 'Haiti', 'hu': 'Hungary',
      'id': 'Indonesia', 'ie': 'Ireland', 'il': 'Israel', 'im': 'Isle of Man', 'in': 'India', 'io': 'British Indian Ocean Territory',
      'iq': 'Iraq', 'ir': 'Iran', 'is': 'Iceland', 'it': 'Italy', 'je': 'Jersey', 'jm': 'Jamaica', 'jo': 'Jordan', 'jp': 'Japan',
      'ke': 'Kenya', 'kg': 'Kyrgyzstan', 'kh': 'Cambodia', 'ki': 'Kiribati', 'km': 'Comoros', 'kn': 'Saint Kitts and Nevis',
      'kp': 'North Korea', 'kr': 'South Korea', 'kw': 'Kuwait', 'ky': 'Cayman Islands', 'kz': 'Kazakhstan', 'la': 'Laos',
      'lb': 'Lebanon', 'lc': 'Saint Lucia', 'li': 'Liechtenstein', 'lk': 'Sri Lanka', 'lr': 'Liberia', 'ls': 'Lesotho',
      'lt': 'Lithuania', 'lu': 'Luxembourg', 'lv': 'Latvia', 'ly': 'Libya', 'ma': 'Morocco', 'mc': 'Monaco', 'md': 'Moldova',
      'me': 'Montenegro', 'mf': 'Saint Martin', 'mg': 'Madagascar', 'mh': 'Marshall Islands', 'mk': 'North Macedonia', 'ml': 'Mali',
      'mm': 'Myanmar', 'mn': 'Mongolia', 'mo': 'Macau', 'mp': 'Northern Mariana Islands', 'mq': 'Martinique', 'mr': 'Mauritania',
      'ms': 'Montserrat', 'mt': 'Malta', 'mu': 'Mauritius', 'mv': 'Maldives', 'mw': 'Malawi', 'mx': 'Mexico', 'my': 'Malaysia',
      'mz': 'Mozambique', 'na': 'Namibia', 'nc': 'New Caledonia', 'ne': 'Niger', 'nf': 'Norfolk Island', 'ng': 'Nigeria',
      'ni': 'Nicaragua', 'nl': 'Netherlands', 'no': 'Norway', 'np': 'Nepal', 'nr': 'Nauru', 'nu': 'Niue', 'nz': 'New Zealand',
      'om': 'Oman', 'pa': 'Panama', 'pe': 'Peru', 'pf': 'French Polynesia', 'pg': 'Papua New Guinea', 'ph': 'Philippines',
      'pk': 'Pakistan', 'pl': 'Poland', 'pm': 'Saint Pierre and Miquelon', 'pn': 'Pitcairn Islands', 'pr': 'Puerto Rico',
      'ps': 'Palestine', 'pt': 'Portugal', 'pw': 'Palau', 'py': 'Paraguay', 'qa': 'Qatar', 're': 'Réunion', 'ro': 'Romania',
      'rs': 'Serbia', 'ru': 'Russia', 'rw': 'Rwanda', 'sa': 'Saudi Arabia', 'sb': 'Solomon Islands', 'sc': 'Seychelles',
      'sd': 'Sudan', 'se': 'Sweden', 'sg': 'Singapore', 'sh': 'Saint Helena', 'si': 'Slovenia', 'sj': 'Svalbard',
      'sk': 'Slovakia', 'sl': 'Sierra Leone', 'sm': 'San Marino', 'sn': 'Senegal', 'so': 'Somalia', 'sr': 'Suriname',
      'ss': 'South Sudan', 'st': 'São Tomé and Príncipe', 'sv': 'El Salvador', 'sx': 'Sint Maarten', 'sy': 'Syria',
      'sz': 'Eswatini', 'tc': 'Turks and Caicos Islands', 'td': 'Chad', 'tf': 'French Southern Territories', 'tg': 'Togo',
      'th': 'Thailand', 'tj': 'Tajikistan', 'tk': 'Tokelau', 'tl': 'Timor-Leste', 'tm': 'Turkmenistan', 'tn': 'Tunisia',
      'to': 'Tonga', 'tr': 'Turkey', 'tt': 'Trinidad and Tobago', 'tv': 'Tuvalu', 'tw': 'Taiwan', 'tz': 'Tanzania',
      'ua': 'Ukraine', 'ug': 'Uganda', 'um': 'U.S. Outlying Islands', 'us': 'United States', 'uy': 'Uruguay', 'uz': 'Uzbekistan',
      'va': 'Vatican City', 'vc': 'Saint Vincent', 've': 'Venezuela', 'vg': 'British Virgin Islands', 'vi': 'U.S. Virgin Islands',
      'vn': 'Vietnam', 'vu': 'Vanuatu', 'wf': 'Wallis and Futuna', 'ws': 'Samoa', 'xk': 'Kosovo', 'ye': 'Yemen', 'yt': 'Mayotte',
      'za': 'South Africa', 'zm': 'Zambia', 'zw': 'Zimbabwe', 'uk': 'United Kingdom'
    };

    const countryToLanguageMap = {
      'nl': 'Dutch', 'be': 'Dutch', 'de': 'German', 'at': 'German', 'ch': 'German',
      'fr': 'French', 'it': 'Italian', 'es': 'Spanish', 'mx': 'Spanish', 'ar': 'Spanish',
      'co': 'Spanish', 've': 'Spanish', 'pe': 'Spanish', 'cl': 'Spanish', 'ec': 'Spanish',
      'py': 'Spanish', 'uy': 'Spanish', 'bo': 'Spanish', 'gt': 'Spanish', 'hn': 'Spanish',
      'sv': 'Spanish', 'ni': 'Spanish', 'cr': 'Spanish', 'pa': 'Spanish', 'cu': 'Spanish',
      'do': 'Spanish', 'pr': 'Spanish', 'pt': 'Portuguese', 'br': 'Portuguese', 'jp': 'Japanese',
      'cn': 'Chinese', 'tw': 'Chinese', 'hk': 'Chinese', 'ru': 'Russian', 'by': 'Russian',
      'ua': 'Ukrainian', 'in': 'Hindi', 'pk': 'Urdu', 'bd': 'Bengali', 'lk': 'Sinhala',
      'np': 'Nepali', 'th': 'Thai', 'vn': 'Vietnamese', 'kr': 'Korean', 'id': 'Indonesian',
      'my': 'Malay', 'ph': 'Tagalog', 'tr': 'Turkish', 'gr': 'Greek', 'cy': 'Greek',
      'pl': 'Polish', 'ro': 'Romanian', 'md': 'Romanian', 'hu': 'Hungarian', 'cz': 'Czech',
      'sk': 'Slovak', 'bg': 'Bulgarian', 'se': 'Swedish', 'no': 'Norwegian', 'dk': 'Danish',
      'fi': 'Finnish', 'ee': 'Estonian', 'lv': 'Latvian', 'lt': 'Lithuanian', 'il': 'Hebrew',
      'ir': 'Persian', 'af': 'Persian', 'sa': 'Arabic', 'eg': 'Arabic', 'ma': 'Arabic',
      'dz': 'Arabic', 'tn': 'Arabic', 'ly': 'Arabic', 'ye': 'Arabic', 'om': 'Arabic',
      'ae': 'Arabic', 'qa': 'Arabic', 'kw': 'Arabic', 'bh': 'Arabic', 'jo': 'Arabic',
      'lb': 'Arabic', 'sy': 'Arabic', 'iq': 'Arabic', 'sd': 'Arabic', 'so': 'Somali',
      'et': 'Amharic', 'ke': 'Swahili', 'tz': 'Swahili', 'ug': 'Swahili', 'ng': 'English',
      'gh': 'English', 'za': 'Afrikaans', 'ie': 'Irish', 'gb': 'English', 'uk': 'English',
      'us': 'English', 'ca': 'English', 'au': 'English', 'nz': 'English'
    };

    const lines = m3uText.split(/\r?\n/);
    let tempChannel = null;
    const parsedChannels = [];

    const isLanguagePlaylist = currentPlaylistUrl.includes('index.language') || currentPlaylistUrl.includes('nld.m3u');
    const isCountryPlaylist = currentPlaylistUrl.includes('index.country') || currentPlaylistUrl.includes('nl.m3u');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        // Extract channel metadata attributes using regexes
        const idMatch = line.match(/tvg-id="([^"]*)"/i);
        const logoMatch = line.match(/(?:tvg-logo|logo)="([^"]+)"/i);
        const categoryMatch = line.match(/(?:group-title|category)="([^"]+)"/i);
        const countryMatch = line.match(/(?:tvg-country|country)="([^"]+)"/i);
        const languageMatch = line.match(/(?:tvg-language|language)="([^"]+)"/i);

        const tvgId = idMatch ? idMatch[1] : '';
        let parsedCountry = countryMatch ? countryMatch[1] : '';
        let parsedLanguage = languageMatch ? languageMatch[1] : '';
        let parsedCategory = categoryMatch ? categoryMatch[1] : 'General';

        // Extract country code from tvg-id (e.g. TamadonTV.af@SD -> af)
        let countryCode = '';
        if (tvgId) {
          const cleanId = tvgId.split('@')[0];
          const parts = cleanId.split('.');
          if (parts.length > 1) {
            const code = parts[parts.length - 1].toLowerCase();
            if (code.length === 2) {
              countryCode = code;
            }
          }
        }

        // Apply dynamic mappings based on the playlist structure
        if (isLanguagePlaylist) {
          parsedLanguage = parsedCategory; // E.g., Abkhazian, Afrikaans, Albanian
          parsedCategory = 'General';
        } else if (isCountryPlaylist) {
          parsedCountry = parsedCategory; // E.g., Afghanistan, Albania, Algeria
          parsedCategory = 'General';
        }

        // Resolve Country Name from Country Code if not explicitly in headers
        if (!parsedCountry && countryCode) {
          parsedCountry = countryMap[countryCode] || countryCode.toUpperCase();
        }

        // Resolve Language Name from Country Code or Country Name if not explicitly in headers
        if (!parsedLanguage) {
          if (countryCode && countryToLanguageMap[countryCode]) {
            parsedLanguage = countryToLanguageMap[countryCode];
          } else if (parsedCountry && parsedCountry !== 'Global') {
            const mappedLang = Object.entries(countryMap).find(([code, name]) => name === parsedCountry);
            if (mappedLang && countryToLanguageMap[mappedLang[0]]) {
              parsedLanguage = countryToLanguageMap[mappedLang[0]];
            }
          }
        }

        tempChannel = {
          name: 'Unknown Channel',
          logo: logoMatch ? logoMatch[1] : '',
          category: parsedCategory || 'General',
          country: parsedCountry || 'Global',
          language: parsedLanguage || 'English',
          url: ''
        };
        
        // Name is usually after the last comma of the #EXTINF line
        const commaIndex = line.lastIndexOf(',');
        if (commaIndex !== -1) {
          tempChannel.name = line.substring(commaIndex + 1).trim() || tempChannel.name;
        }

        // Heuristic language refinements for multilingual countries
        const nameLower = tempChannel.name.toLowerCase();
        const idLower = tvgId.toLowerCase();
        let refinedLanguage = '';

        // 1. Check for language suffix in parentheses, e.g. "HBO (ENG)", "MTV (FRA)", "RTL (NLD)"
        const langSuffixMatch = tempChannel.name.match(/\(([a-z]{2,3})\)$/i);
        if (langSuffixMatch) {
          const code = langSuffixMatch[1].toLowerCase();
          const codeMap = {
            'en': 'English', 'eng': 'English',
            'es': 'Spanish', 'esp': 'Spanish',
            'fr': 'French', 'fra': 'French',
            'de': 'German', 'deu': 'German',
            'it': 'Italian', 'ita': 'Italian',
            'pt': 'Portuguese', 'por': 'Portuguese',
            'ru': 'Russian', 'rus': 'Russian',
            'ar': 'Arabic', 'ara': 'Arabic',
            'tr': 'Turkish', 'tur': 'Turkish',
            'nl': 'Dutch', 'nld': 'Dutch',
            'hi': 'Hindi', 'hin': 'Hindi',
            'zh': 'Chinese', 'zho': 'Chinese',
            'cn': 'Chinese', 'zho-cn': 'Chinese',
            'ta': 'Tamil', 'tam': 'Tamil',
            'te': 'Telugu', 'tel': 'Telugu',
            'ml': 'Malayalam', 'mal': 'Malayalam',
            'kn': 'Kannada', 'kan': 'Kannada',
            'pa': 'Punjabi', 'pan': 'Punjabi',
            'ur': 'Urdu', 'urd': 'Urdu',
            'ms': 'Malay', 'msa': 'Malay',
            'tl': 'Tagalog', 'tgl': 'Tagalog'
          };
          if (codeMap[code]) {
            refinedLanguage = codeMap[code];
          }
        }

        // 2. Specific multilingual country refinements
        if (!refinedLanguage) {
          // India
          if (countryCode === 'in' || tempChannel.country === 'India') {
            if (nameLower.includes('telugu') || idLower.includes('telugu')) refinedLanguage = 'Telugu';
            else if (nameLower.includes('tamil') || idLower.includes('tamil')) refinedLanguage = 'Tamil';
            else if (nameLower.includes('malayalam') || idLower.includes('malayalam')) refinedLanguage = 'Malayalam';
            else if (nameLower.includes('kannada') || idLower.includes('kannada')) refinedLanguage = 'Kannada';
            else if (nameLower.includes('bengali') || idLower.includes('bengali') || nameLower.includes('bangla') || idLower.includes('bangla')) refinedLanguage = 'Bengali';
            else if (nameLower.includes('marathi') || idLower.includes('marathi')) refinedLanguage = 'Marathi';
            else if (nameLower.includes('gujarati') || idLower.includes('gujarati')) refinedLanguage = 'Gujarati';
            else if (nameLower.includes('punjabi') || idLower.includes('punjabi')) refinedLanguage = 'Punjabi';
            else if (nameLower.includes('urdu') || idLower.includes('urdu')) refinedLanguage = 'Urdu';
            else if (nameLower.includes('odia') || idLower.includes('odia') || nameLower.includes('orissa')) refinedLanguage = 'Odia';
            else if (nameLower.includes('bhojpuri') || idLower.includes('bhojpuri')) refinedLanguage = 'Bhojpuri';
            else if (nameLower.includes('assamese') || idLower.includes('assamese')) refinedLanguage = 'Assamese';
            else if (nameLower.includes('english') || idLower.includes('english')) refinedLanguage = 'English';
            else if (nameLower.includes('hindi') || idLower.includes('hindi')) refinedLanguage = 'Hindi';
          }
          // Malaysia & Singapore
          else if (countryCode === 'my' || countryCode === 'sg' || tempChannel.country === 'Malaysia' || tempChannel.country === 'Singapore') {
            if (nameLower.includes('tamil') || idLower.includes('tamil')) refinedLanguage = 'Tamil';
            else if (nameLower.includes('chinese') || nameLower.includes('mandarin') || nameLower.includes('cantonese') || /[\u4e00-\u9fa5]/.test(tempChannel.name)) refinedLanguage = 'Chinese';
            else if (nameLower.includes('malay') || nameLower.includes('melayu') || idLower.includes('melayu') || nameLower.includes('tv1') || nameLower.includes('tv2') || nameLower.includes('tv3')) refinedLanguage = 'Malay';
            else if (nameLower.includes('english') || idLower.includes('english')) refinedLanguage = 'English';
          }
          // Philippines
          else if (countryCode === 'ph' || tempChannel.country === 'Philippines') {
            if (nameLower.includes('tagalog') || nameLower.includes('filipino') || idLower.includes('tagalog')) refinedLanguage = 'Tagalog';
            else if (nameLower.includes('cebuano') || nameLower.includes('bisaya')) refinedLanguage = 'Cebuano';
            else if (nameLower.includes('ilocano')) refinedLanguage = 'Ilocano';
            else if (nameLower.includes('english') || idLower.includes('english')) refinedLanguage = 'English';
          }
          // China, Hong Kong & Taiwan
          else if (countryCode === 'cn' || countryCode === 'hk' || countryCode === 'tw' || tempChannel.country === 'China' || tempChannel.country === 'Hong Kong' || tempChannel.country === 'Taiwan') {
            if (nameLower.includes('cantonese') || nameLower.includes('canton') || idLower.includes('canton') || nameLower.includes('粤')) refinedLanguage = 'Cantonese';
            else if (nameLower.includes('english') || idLower.includes('english')) refinedLanguage = 'English';
            else if (nameLower.includes('mandarin') || nameLower.includes('chinese') || /[\u4e00-\u9fa5]/.test(tempChannel.name)) refinedLanguage = 'Chinese';
          }
          // Canada
          else if (countryCode === 'ca' || tempChannel.country === 'Canada') {
            if (nameLower.includes('tva') || nameLower.includes('ici') || nameLower.includes('radio-canada') || nameLower.includes('tele') || nameLower.includes('français') || nameLower.includes('french')) {
              refinedLanguage = 'French';
            } else {
              refinedLanguage = 'English';
            }
          }
          // Switzerland
          else if (countryCode === 'ch' || tempChannel.country === 'Switzerland') {
            if (nameLower.includes('rts') || nameLower.includes('rouge') || nameLower.includes('leman')) refinedLanguage = 'French';
            else if (nameLower.includes('rsi') || nameLower.includes('teleticino')) refinedLanguage = 'Italian';
            else if (nameLower.includes('srf') || nameLower.includes('telebasel') || nameLower.includes('telezuri') || nameLower.includes('telem1')) refinedLanguage = 'German';
          }
          // Belgium
          else if (countryCode === 'be' || tempChannel.country === 'Belgium') {
            if (nameLower.includes('rtbf') || nameLower.includes('la une') || nameLower.includes('tipik') || nameLower.includes('la trois') || nameLower.includes('rtl')) refinedLanguage = 'French';
            else if (nameLower.includes('vrt') || nameLower.includes('een') || nameLower.includes('canvas') || nameLower.includes('vtm')) refinedLanguage = 'Dutch';
          }
          // Spain
          else if (countryCode === 'es' || tempChannel.country === 'Spain') {
            if (nameLower.includes('catalan') || nameLower.includes('catalunya') || nameLower.includes('3cat') || nameLower.includes('tv3') || nameLower.includes('324')) refinedLanguage = 'Catalan';
            else if (nameLower.includes('galicia') || nameLower.includes('tvg')) refinedLanguage = 'Galician';
            else if (nameLower.includes('basque') || nameLower.includes('etb')) refinedLanguage = 'Basque';
          }
        }

        if (refinedLanguage) {
          tempChannel.language = refinedLanguage;
        }
      } else if (line.startsWith('http') && tempChannel) {
        tempChannel.url = line;
        parsedChannels.push(tempChannel);
        tempChannel = null;
      }
    }

    channels = parsedChannels;
    statChannelsCount.textContent = channels.length;
    
    if (channels.length === 0) {
      showPlaylistStatus(true, 'No channels found in playlist.', true);
    } else {
      showPlaylistStatus(false);
      buildCategoryTabs();
      buildSidebarFilters();
      renderChannelList();
      buildGridFilters();
      if (currentViewMode === 'grid') {
        renderGrid();
      }
    }
  }

  function showPlaylistStatus(show, text = '', isError = false) {
    if (show) {
      channelListStatus.classList.remove('hidden');
      channelList.classList.add('hidden');
      
      const spinner = channelListStatus.querySelector('.spinner');
      const textSpan = channelListStatus.querySelector('span');
      
      textSpan.textContent = text;
      if (isError) {
        spinner.classList.add('hidden');
        textSpan.style.color = '#ef4444';
      } else {
        spinner.classList.remove('hidden');
        textSpan.style.color = '';
      }
    } else {
      channelListStatus.classList.add('hidden');
      channelList.classList.remove('hidden');
    }
  }

  // --- View Mode Switcher ---
  function switchViewMode(mode) {
    currentViewMode = mode;
    const playerWrapper = document.querySelector('.player-wrapper');
    const gridViewWrapper = document.getElementById('gridViewWrapper');
    const playerViewBtn = document.getElementById('playerViewBtn');
    const gridViewBtn = document.getElementById('gridViewBtn');

    if (mode === 'grid') {
      playerWrapper.classList.add('hidden');
      gridViewWrapper.classList.remove('hidden');
      playerViewBtn.classList.remove('active');
      gridViewBtn.classList.add('active');
      
      // Stop main player to save bandwidth
      if (video && !video.paused) {
        video.pause();
        playPauseBtn.querySelector('i, svg').setAttribute('data-lucide', 'play');
        lucide.createIcons();
      }
      
      // Preserve the previous page number, search input, and dropdown filters
      renderGrid();
    } else {
      playerWrapper.classList.remove('hidden');
      gridViewWrapper.classList.add('hidden');
      playerViewBtn.classList.add('active');
      gridViewBtn.classList.remove('active');
      
      // Destroy grid players to free up CPU
      destroyGridVideos();
    }
  }

  // --- Destroy Grid Videos ---
  function destroyGridVideos() {
    gridActiveHlsInstances.forEach(hls => {
      try {
        hls.destroy();
      } catch (e) {
        console.error('Error destroying Hls instance:', e);
      }
    });
    gridActiveHlsInstances = [];
    
    const videos = document.querySelectorAll('.grid-card-video');
    videos.forEach(v => {
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch (e) {}
    });
  }

  // --- Dynamic Sidebar Filters Builder ---
  function buildSidebarFilters() {
    const sidebarCountrySelect = document.getElementById('sidebarCountrySelect');
    const sidebarLanguageSelect = document.getElementById('sidebarLanguageSelect');
    
    if (!sidebarCountrySelect || !sidebarLanguageSelect) return;

    const countries = new Set();
    const languages = new Set();

    channels.forEach(ch => {
      if (ch.country) countries.add(ch.country.trim());
      if (ch.language) languages.add(ch.language.trim());
    });

    // Populate Sidebar Countries Select
    sidebarCountrySelect.innerHTML = '<option value="all">All Countries</option>';
    Array.from(countries).sort().forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sidebarCountrySelect.appendChild(opt);
    });

    // Populate Sidebar Languages Select
    sidebarLanguageSelect.innerHTML = '<option value="all">All Languages</option>';
    Array.from(languages).sort().forEach(l => {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      sidebarLanguageSelect.appendChild(opt);
    });

    sidebarFilterCountry = 'all';
    sidebarFilterLanguage = 'all';
    sidebarCountrySelect.value = 'all';
    sidebarLanguageSelect.value = 'all';
  }

  // --- Dynamic Cascading Filters ---
  function updateSidebarLanguageSelect(selectedCountry) {
    const sidebarLanguageSelect = document.getElementById('sidebarLanguageSelect');
    if (!sidebarLanguageSelect) return;

    // Filter channels by country first
    const filteredChannels = selectedCountry === 'all' 
      ? channels 
      : channels.filter(ch => ch.country === selectedCountry);

    // Get unique languages for these channels
    const languages = new Set();
    filteredChannels.forEach(ch => {
      if (ch.language) languages.add(ch.language.trim());
    });

    const currentVal = sidebarLanguageSelect.value;

    sidebarLanguageSelect.innerHTML = '<option value="all">All Languages</option>';
    Array.from(languages).sort().forEach(l => {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      sidebarLanguageSelect.appendChild(opt);
    });

    if (languages.has(currentVal)) {
      sidebarLanguageSelect.value = currentVal;
    } else {
      sidebarLanguageSelect.value = 'all';
      sidebarFilterLanguage = 'all';
    }
  }

  function updateGridLanguageSelect(selectedCountry) {
    const gridLanguageSelect = document.getElementById('gridLanguageSelect');
    if (!gridLanguageSelect) return;

    const filteredChannels = selectedCountry === 'all' 
      ? channels 
      : channels.filter(ch => ch.country === selectedCountry);

    const languages = new Set();
    filteredChannels.forEach(ch => {
      if (ch.language) languages.add(ch.language.trim());
    });

    const currentVal = gridLanguageSelect.value;

    gridLanguageSelect.innerHTML = '<option value="all">All Languages</option>';
    Array.from(languages).sort().forEach(l => {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      gridLanguageSelect.appendChild(opt);
    });

    if (languages.has(currentVal)) {
      gridLanguageSelect.value = currentVal;
    } else {
      gridLanguageSelect.value = 'all';
      gridFilterLanguage = 'all';
    }
  }

  // --- Dynamic Grid Filters Builder ---
  function buildGridFilters() {
    const gridCategorySelect = document.getElementById('gridCategorySelect');
    const gridCountrySelect = document.getElementById('gridCountrySelect');
    const gridLanguageSelect = document.getElementById('gridLanguageSelect');
    
    if (!gridCategorySelect || !gridCountrySelect || !gridLanguageSelect) return;

    // Categories, Countries, Languages
    const categories = new Set();
    const countries = new Set();
    const languages = new Set();

    channels.forEach(ch => {
      if (ch.category) categories.add(ch.category.trim());
      if (ch.country) countries.add(ch.country.trim());
      if (ch.language) languages.add(ch.language.trim());
    });

    // Populate Categories Select
    gridCategorySelect.innerHTML = '<option value="all">All Categories</option>';
    Array.from(categories).sort().forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      gridCategorySelect.appendChild(opt);
    });

    // Populate Countries Select
    gridCountrySelect.innerHTML = '<option value="all">All Countries</option>';
    Array.from(countries).sort().forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      gridCountrySelect.appendChild(opt);
    });

    // Populate Languages Select
    gridLanguageSelect.innerHTML = '<option value="all">All Languages</option>';
    Array.from(languages).sort().forEach(l => {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      gridLanguageSelect.appendChild(opt);
    });

    gridFilterCategory = 'all';
    gridFilterCountry = 'all';
    gridFilterLanguage = 'all';
    gridCategorySelect.value = 'all';
    gridCountrySelect.value = 'all';
    gridLanguageSelect.value = 'all';
    
    const gridSearch = document.getElementById('gridChannelSearch');
    if (gridSearch) gridSearch.value = '';
  }

  // --- Render Channel Grid Mode ---
  function renderGrid() {
    const container = document.getElementById('gridCardsContainer');
    const countBadge = document.getElementById('gridChannelsCount');
    const prevBtn = document.getElementById('gridPrevPage');
    const nextBtn = document.getElementById('gridNextPage');
    const pageInfo = document.getElementById('gridPaginationInfo');
    const searchInputGrid = document.getElementById('gridChannelSearch');

    if (!container) return;

    // Clean up previous videos first
    destroyGridVideos();
    container.innerHTML = '';

    const query = searchInputGrid ? searchInputGrid.value.toLowerCase().trim() : '';

    // 1. Filter channels
    let filtered = channels.filter(ch => {
      // Search Box Filter
      if (query !== '') {
        const inName = ch.name.toLowerCase().includes(query);
        const inCategory = ch.category.toLowerCase().includes(query);
        const inCountry = ch.country.toLowerCase().includes(query);
        if (!inName && !inCategory && !inCountry) return false;
      }
      // Category Filter
      if (gridFilterCategory !== 'all') {
        if (ch.category !== gridFilterCategory) return false;
      }
      // Country Filter
      if (gridFilterCountry !== 'all') {
        if (ch.country !== gridFilterCountry) return false;
      }
      // Language Filter
      if (gridFilterLanguage !== 'all') {
        if (ch.language !== gridFilterLanguage) return false;
      }
      return true;
    });

    // 2. Sort alphabetically
    filtered.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    if (countBadge) {
      countBadge.textContent = `${filtered.length} channels`;
    }

    // 3. Paginate
    const totalChannels = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalChannels / GRID_PAGE_SIZE));

    if (gridCurrentPage > totalPages) {
      gridCurrentPage = totalPages;
    }

    // Calculate blocks of 10 page numbers
    const currentBlock = Math.floor((gridCurrentPage - 1) / 10);
    const startPage = (currentBlock * 10) + 1;
    const endPage = Math.min(startPage + 9, totalPages);

    // Update Block buttons states
    if (prevBtn) prevBtn.disabled = startPage === 1;
    if (nextBtn) nextBtn.disabled = endPage === totalPages;

    // Render Page Number Buttons
    const pageNumbersContainer = document.getElementById('gridPageNumbers');
    if (pageNumbersContainer) {
      pageNumbersContainer.innerHTML = '';
      for (let p = startPage; p <= endPage; p++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `grid-page-btn ${p === gridCurrentPage ? 'active' : ''}`;
        pageBtn.textContent = p;
        pageBtn.addEventListener('click', () => {
          gridCurrentPage = p;
          renderGrid();
        });
        pageNumbersContainer.appendChild(pageBtn);
      }
    }

    const totalPagesEl = document.getElementById('gridPaginationTotal');
    if (totalPagesEl) {
      totalPagesEl.textContent = `of ${totalPages}`;
    }

    // Expose goto page function globally
    window.gotoGridPage = (pageNum) => {
      const val = parseInt(pageNum);
      if (!isNaN(val) && val >= 1 && val <= totalPages) {
        gridCurrentPage = val;
        renderGrid();
        return true;
      }
      alert(`Invalid page number. Please enter a page between 1 and ${totalPages}.`);
      return false;
    };

    if (totalChannels === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px; text-align: center; color: var(--text-secondary);">
          <i data-lucide="info" style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;"></i>
          <h3>No Channels Found</h3>
          <p>Try refining your search query or filters.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    const startIdx = (gridCurrentPage - 1) * GRID_PAGE_SIZE;
    const endIdx = Math.min(startIdx + GRID_PAGE_SIZE, totalChannels);
    const pageChannels = filtered.slice(startIdx, endIdx);

    const fragment = document.createDocumentFragment();

    pageChannels.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'grid-card';

      const fallbackLogo = `data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%234a5568%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><rect width=%2220%22 height=%2215%22 x=%222%22 y=%227%22 rx=%222%22 ry=%222%22/><path d=%22m17 2-5 5-5-5%22/></svg>`;

      card.innerHTML = `
        <div class="grid-card-player">
          <video class="grid-card-video" muted autoplay playsinline></video>
          <div class="grid-card-spinner"></div>
          <div class="grid-card-overlay">
            <div class="grid-card-top">
              <div class="grid-card-logo-wrapper">
                <img class="grid-card-logo" src="${ch.logo}" alt="" onerror="this.src='${fallbackLogo}'">
              </div>
              <span class="grid-card-badge">${ch.country || 'Global'}</span>
            </div>
            <div class="grid-card-center-play">
              <i data-lucide="play" style="width: 20px; height: 20px; fill: currentColor; margin-left: 2px;"></i>
            </div>
            <div class="grid-card-bottom" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div style="flex: 1; min-width: 0; padding-right: 8px; text-align: left;">
                <div class="grid-card-name" title="${ch.name}">${ch.name}</div>
                <div class="grid-card-meta">
                  <span>${ch.category || 'General'}</span>
                </div>
              </div>
              <button class="grid-card-play-btn btn btn-primary btn-sm" style="flex-shrink: 0; pointer-events: auto; display: flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 0.72rem; font-weight: 500; height: 26px; border-radius: 4px; cursor: pointer; background: var(--accent); color: white; border: none; z-index: 10;">
                <i data-lucide="play" style="width: 12px; height: 12px; fill: currentColor;"></i> Play
              </button>
            </div>
          </div>
        </div>
      `;

      // Select channel and switch view on click of play button
      const playBtn = card.querySelector('.grid-card-play-btn');
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Grid play button click captured for channel:', ch.name);
          try {
            selectChannel(ch);
            switchViewMode('player');
          } catch (err) {
            console.error('Failed to transition from grid play button:', err);
          }
        });
      }

      // Also support clicking the entire card container
      card.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Grid card click captured for channel:', ch.name);
        try {
          selectChannel(ch);
          switchViewMode('player');
        } catch (err) {
          console.error('Failed to transition from grid to player view:', err);
        }
      });

      fragment.appendChild(card);

      // Play video preview
      const videoEl = card.querySelector('.grid-card-video');
      const spinnerEl = card.querySelector('.grid-card-spinner');
      
      playGridCardStream(videoEl, ch.url, spinnerEl);
    });

    container.appendChild(fragment);
    lucide.createIcons();
  }

  // --- Play stream in Grid Card ---
  function playGridCardStream(videoEl, streamUrl, spinnerEl) {
    let playUrl = streamUrl;
    let isProxy = false;
    let hls = null;

    function loadHls(url) {
      if (hls) {
        hls.destroy();
        const idx = gridActiveHlsInstances.indexOf(hls);
        if (idx !== -1) gridActiveHlsInstances.splice(idx, 1);
      }
      
      if (Hls.isSupported()) {
        hls = new Hls({
          maxMaxBufferLength: 5, // small buffer for previews
          enableWorker: true,
          lowLatencyMode: true
        });
        hls.loadSource(url);
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoEl.play().catch(() => {});
          if (spinnerEl) spinnerEl.classList.add('hidden');
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR && !isProxy) {
            isProxy = true;
            const proxiedUrl = `/proxy?url=${encodeURIComponent(streamUrl)}`;
            loadHls(proxiedUrl);
          } else if (data.fatal) {
            if (spinnerEl) spinnerEl.classList.add('hidden');
            hls.destroy();
            const idx = gridActiveHlsInstances.indexOf(hls);
            if (idx !== -1) gridActiveHlsInstances.splice(idx, 1);
          }
        });
        gridActiveHlsInstances.push(hls);
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url;
        videoEl.addEventListener('loadedmetadata', () => {
          videoEl.play().catch(() => {});
          if (spinnerEl) spinnerEl.classList.add('hidden');
        }, { once: true });
        videoEl.addEventListener('error', () => {
          if (!isProxy) {
            isProxy = true;
            videoEl.src = `/proxy?url=${encodeURIComponent(streamUrl)}`;
            videoEl.play().catch(() => {});
          } else {
            if (spinnerEl) spinnerEl.classList.add('hidden');
          }
        }, { once: true });
      } else {
        if (spinnerEl) spinnerEl.classList.add('hidden');
      }
    }

    loadHls(playUrl);
  }

  // --- Dynamic Category Management ---
  function buildCategoryTabs() {
    // Get unique categories and filter out empty ones
    const categories = new Set();
    channels.forEach(ch => {
      if (ch.category) categories.add(ch.category.trim());
    });

    // Reset categories HTML but keep 'All' and 'Favorites'
    categoryTabs.innerHTML = `
      <button class="category-tab active" data-category="all">All</button>
      <button class="category-tab" data-category="favorites">
        <i data-lucide="star" style="width: 12px; height: 12px;"></i> Favorites
      </button>
    `;

    // Sort categories alphabetically and add top 10 categories (to keep it clean)
    const sortedCategories = Array.from(categories).sort();
    const categoriesToShow = sortedCategories.slice(0, 15);
    
    categoriesToShow.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'category-tab';
      btn.dataset.category = cat;
      btn.textContent = cat;
      categoryTabs.appendChild(btn);
    });

    // Reinitialize icons in tabs
    lucide.createIcons();

    // Re-bind click event to newly created tabs
    document.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category;
        renderChannelList();
      });
    });
  }

  // --- Channel Renderer (Responsive virtual paging) ---
  function renderChannelList() {
    channelList.innerHTML = '';
    
    const query = searchInput.value.toLowerCase().trim();
    
    // Filter Channels
    const filteredChannels = channels.filter(ch => {
      // 1. Online Only Filter
      if (showOnlineOnly && ch.isOnline !== true) return false;

      // 2. Category Filter
      if (currentCategory === 'favorites') {
        const isFav = favorites.some(fav => fav.url === ch.url);
        if (!isFav) return false;
      } else if (currentCategory !== 'all') {
        if (ch.category !== currentCategory) return false;
      }

      // Country & Language Dropdown Filters
      if (sidebarFilterCountry !== 'all' && ch.country !== sidebarFilterCountry) return false;
      if (sidebarFilterLanguage !== 'all' && ch.language !== sidebarFilterLanguage) return false;
      
      // 3. Search Box Filter
      if (query !== '') {
        const inName = ch.name.toLowerCase().includes(query);
        const inCategory = ch.category.toLowerCase().includes(query);
        const inCountry = ch.country.toLowerCase().includes(query);
        return inName || inCategory || inCountry;
      }
      
      return true;
    });

    // Pagination helper for performance
    const renderLimit = Math.min(filteredChannels.length, MAX_RENDERED_CHANNELS);
    
    if (filteredChannels.length === 0) {
      channelList.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">
          No channels match your filters.
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    
    for (let i = 0; i < renderLimit; i++) {
      const ch = filteredChannels[i];
      const div = document.createElement('div');
      
      const isActive = activeChannel && activeChannel.url === ch.url;
      const isFav = favorites.some(fav => fav.url === ch.url);
      
      div.className = `channel-item ${isActive ? 'active' : ''}`;
      
      // Get online status dot class
      let statusDotClass = 'status-untested';
      let statusTitle = 'Untested Channel';
      if (ch.isOnline === true) {
        statusDotClass = 'status-online';
        statusTitle = 'Online Stream';
      } else if (ch.isOnline === false) {
        statusDotClass = 'status-offline';
        statusTitle = 'Offline/Failed Stream';
      }

      // Load standard replacement SVG if image fails
      const fallbackLogo = `data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%234a5568%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><rect width=%2220%22 height=%2215%22 x=%222%22 y=%227%22 rx=%222%22 ry=%222%22/><path d=%22m17 2-5 5-5-5%22/></svg>`;
      
      div.innerHTML = `
        <div class="channel-logo-wrapper">
          <img class="channel-logo" src="${ch.logo}" alt="" onerror="this.src='${fallbackLogo}'">
        </div>
        <div class="channel-info">
          <div class="channel-name" title="${ch.name}">${ch.name}</div>
          <div class="channel-sub">
            <span class="status-dot ${statusDotClass}" title="${statusTitle}"></span>
            <span class="channel-badge">${ch.country || 'Global'}</span>
            <span>${ch.category || 'General'}</span>
          </div>
        </div>
        <button class="channel-fav-btn ${isFav ? 'is-favorite' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          <i data-lucide="star"></i>
        </button>
      `;

      // Select channel on click
      div.addEventListener('click', (e) => {
        if (e.target.closest('.channel-fav-btn')) {
          e.stopPropagation();
          toggleFavorite(ch, div.querySelector('.channel-fav-btn'));
          return;
        }
        selectChannel(ch);
      });

      fragment.appendChild(div);
    }

    channelList.appendChild(fragment);

    // If total exceeds max, show badge to refine search
    if (filteredChannels.length > MAX_RENDERED_CHANNELS) {
      const footerBadge = document.createElement('div');
      footerBadge.style.cssText = 'padding: 12px; font-size: 0.72rem; text-align: center; color: var(--text-secondary); border-top: 1px solid var(--border-color); margin-top: 8px;';
      footerBadge.textContent = `Showing first ${MAX_RENDERED_CHANNELS} of ${filteredChannels.length} channels. Type in search bar to narrow results.`;
      channelList.appendChild(footerBadge);
    }
    
    lucide.createIcons();
  }

  // --- Stream Status Scanner (Concurrent Workers) ---
  async function scanVisibleChannels() {
    if (isScanning) return;
    
    const query = searchInput.value.toLowerCase().trim();
    const listToScan = channels.filter(ch => {
      if (currentCategory === 'favorites') {
        return favorites.some(fav => fav.url === ch.url);
      } else if (currentCategory !== 'all') {
        return ch.category === currentCategory;
      }
      if (query !== '') {
        return ch.name.toLowerCase().includes(query) || 
               ch.category.toLowerCase().includes(query) || 
               ch.country.toLowerCase().includes(query);
      }
      return true;
    });

    if (listToScan.length === 0) return;
    
    isScanning = true;
    const scanBtnText = scanBtn.querySelector('span');
    scanBtn.classList.add('scanning');
    
    // Limit to top 60 matched channels to keep checks fast
    const limit = Math.min(listToScan.length, 60);
    console.log(`Starting scan of ${limit} channels...`);
    
    let scannedCount = 0;
    const concurrency = 8;
    let queueIndex = 0;

    async function worker() {
      while (queueIndex < limit) {
        const currentIndex = queueIndex++;
        const ch = listToScan[currentIndex];
        
        try {
          const res = await fetch(`/verify?url=${encodeURIComponent(ch.url)}`);
          if (res.ok) {
            const data = await res.json();
            ch.isOnline = data.online;
          } else {
            ch.isOnline = false;
          }
        } catch (err) {
          ch.isOnline = false;
        }

        scannedCount++;
        scanBtnText.textContent = `Scanning (${Math.round((scannedCount / limit) * 100)}%)`;
        
        if (scannedCount % 3 === 0 || scannedCount === limit) {
          renderChannelList();
        }
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, limit); i++) {
      workers.push(worker());
    }
    
    await Promise.all(workers);

    isScanning = false;
    scanBtn.classList.remove('scanning');
    scanBtnText.textContent = 'Scan Status';
    renderChannelList();
  }

  // --- Favorite Toggle Handler ---
  function toggleFavorite(channelObj, buttonElement) {
    const index = favorites.findIndex(fav => fav.url === channelObj.url);
    if (index === -1) {
      favorites.push(channelObj);
      buttonElement.classList.add('is-favorite');
      buttonElement.setAttribute('title', 'Remove from favorites');
    } else {
      favorites.splice(index, 1);
      buttonElement.classList.remove('is-favorite');
      buttonElement.setAttribute('title', 'Add to favorites');
    }
    localStorage.setItem('aerotv_favorites', JSON.stringify(favorites));
    
    // Update active channel star button color state if this channel is currently active
    if (activeChannel && activeChannel.url === channelObj.url) {
      updateFavoriteButtonState();
    }
    
    // If we're on the favorites tab, re-render list
    if (currentCategory === 'favorites') {
      renderChannelList();
    }
  }

  function updateFavoriteButtonState() {
    const isFav = favorites.some(fav => fav.url === activeChannel.url);
    if (isFav) {
      favoriteToggleBtn.classList.add('is-favorite');
      favoriteToggleBtn.querySelector('i, svg').setAttribute('data-lucide', 'star');
      favoriteToggleBtn.querySelector('i, svg').style.fill = '#fbbf24';
    } else {
      favoriteToggleBtn.classList.remove('is-favorite');
      favoriteToggleBtn.querySelector('i, svg').style.fill = 'none';
    }
    lucide.createIcons();
  }

  // --- Channel Player Implementation ---
  function selectChannel(channel) {
    activeChannel = channel;
    
    // Save state
    localStorage.setItem('aerotv_active_channel_url', channel.url);
    
    // Update active visual elements in list
    document.querySelectorAll('.channel-item').forEach(item => {
      const nameNode = item.querySelector('.channel-name');
      if (nameNode && nameNode.textContent === channel.name) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update Headings
    activeChannelMeta.classList.remove('hidden');
    headerChannelLogo.src = channel.logo;
    headerChannelName.textContent = channel.name;
    headerChannelCategory.textContent = channel.category || 'General';
    headerChannelCountry.textContent = channel.country || 'Global';
    
    // Update Detail card
    channelDetailsCard.classList.remove('hidden');
    detailsName.textContent = channel.name;
    detailsUrl.textContent = channel.url;
    detailsCategory.textContent = channel.category || '-';
    detailsCountry.textContent = channel.country || '-';
    detailsLanguage.textContent = channel.language || '-';
    
    // Hide splash screen
    playerSplash.classList.add('hidden');
    
    updateFavoriteButtonState();
    
    // Play Stream
    playStream(channel.url);
  }

  let networkRetryCount = 0;

  function playStream(streamUrl, forceProxy = false) {
    showVideoLoading(true);
    showVideoError(false);
    
    // Clean up current HLS instance
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    
    let playUrl = streamUrl;
    
    // Proxy URL calculation relative to server host
    if (forceProxy || isProxyEnabled) {
      playUrl = `/proxy?url=${encodeURIComponent(streamUrl)}`;
      isProxyEnabled = true;
    } else {
      isProxyEnabled = false;
    }

    // Playback engine selection: HLS.js vs Native browser engine
    if (Hls.isSupported()) {
      hlsInstance = new Hls({
        maxMaxBufferLength: 30, // Max buffer length 30s for live stream
        enableWorker: true,
        lowLatencyMode: true
      });
      
      hlsInstance.loadSource(playUrl);
      hlsInstance.attachMedia(video);
      
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        networkRetryCount = 0; // reset retries
        video.play().catch(e => {
          console.warn('Playback block protection triggered:', e);
          // Auto pause layout
          playPauseBtn.querySelector('i, svg').setAttribute('data-lucide', 'play');
          lucide.createIcons();
        });
        showVideoLoading(false);
        playPauseBtn.querySelector('i, svg').setAttribute('data-lucide', 'pause');
        lucide.createIcons();
      });

      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (networkRetryCount < 2) {
                networkRetryCount++;
                console.log(`Network error encountered. Retrying loading... (${networkRetryCount}/2)`);
                hlsInstance.startLoad();
              } else if (!isProxyEnabled) {
                console.log('Direct loading failed. Trying automatic fallback through CORS proxy...');
                networkRetryCount = 0;
                isProxyEnabled = true;
                playStream(streamUrl, true);
              } else {
                showVideoLoading(false);
                showVideoError(true, 'Failed to fetch stream. The broadcast might be offline or geoblocked.');
                hlsInstance.destroy();
                hlsInstance = null;
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error encountered. Attempting recovery...');
              hlsInstance.recoverMediaError();
              break;
            default:
              showVideoLoading(false);
              showVideoError(true, `HLS Player Error: ${data.details}`);
              hlsInstance.destroy();
              hlsInstance = null;
              break;
          }
        }
      });
      
      statType.textContent = 'HLS (hls.js)';
    } 
    // Fallback to Native Apple HLS stream support (Safari / iOS)
    else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playUrl;
      
      const onPlay = () => {
        networkRetryCount = 0;
        showVideoLoading(false);
        playPauseBtn.querySelector('i, svg').setAttribute('data-lucide', 'pause');
        lucide.createIcons();
      };
      
      const onError = (e) => {
        if (!isProxyEnabled) {
          console.log('Native loading failed. Trying automatic fallback through CORS proxy...');
          isProxyEnabled = true;
          video.removeEventListener('loadedmetadata', onPlay);
          video.removeEventListener('error', onError);
          playStream(streamUrl, true);
        } else {
          showVideoLoading(false);
          showVideoError(true, 'Native stream load error. Stream might be offline.');
        }
      };

      video.addEventListener('loadedmetadata', onPlay, { once: true });
      video.addEventListener('error', onError, { once: true });
      
      video.play().catch(e => console.warn('Native player block protection:', e));
      statType.textContent = 'Native HLS Player';
    } else {
      showVideoLoading(false);
      showVideoError(true, 'HLS playback is not supported on this browser.');
      statType.textContent = 'Unsupported';
    }

    startStatsMonitor();
  }

  function stopStream() {
    video.pause();
    
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    
    video.removeAttribute('src');
    video.load();
    
    activeChannel = null;
    localStorage.removeItem('aerotv_active_channel_url');
    
    document.querySelectorAll('.channel-item').forEach(item => {
      item.classList.remove('active');
    });
    
    activeChannelMeta.classList.add('hidden');
    channelDetailsCard.classList.add('hidden');
    
    playerSplash.classList.remove('hidden');
    showVideoLoading(false);
    showVideoError(false);
    
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
    
    statResolution.textContent = '0x0';
    statBitrate.textContent = 'N/A';
    statBuffer.textContent = '0.0s';
    
    playerContainer.classList.remove('controls-active');
    if (controlsTimeout) clearTimeout(controlsTimeout);
    
    console.log('Stream stopped and player reset.');
  }

  function showVideoLoading(show) {
    if (show) {
      playerLoading.classList.remove('hidden');
    } else {
      playerLoading.classList.add('hidden');
    }
  }

  function showVideoError(show, message = '') {
    if (show) {
      playerError.classList.remove('hidden');
      errorMessage.textContent = message;
      // Show stats info to explain failure
      if (message.includes('CORS') || message.includes('network') || message.includes('fetch')) {
        errorMessage.textContent = 'CORS Policy Block or stream offline. Cross-origin streaming requires proxy verification.';
      }
    } else {
      playerError.classList.add('hidden');
    }
  }

  // --- Volume System Controls ---
  function setupVolume() {
    // Fetch last saved volume
    const savedVol = localStorage.getItem('aerotv_volume') || 0.8;
    video.volume = savedVol;
    volumeSlider.value = savedVol;
    updateVolumeIcon(savedVol);
  }

  function updateVolumeIcon(vol) {
    const icon = volumeBtn.querySelector('i, svg');
    if (vol == 0) {
      icon.setAttribute('data-lucide', 'volume-x');
    } else if (vol < 0.4) {
      icon.setAttribute('data-lucide', 'volume');
    } else if (vol < 0.75) {
      icon.setAttribute('data-lucide', 'volume-1');
    } else {
      icon.setAttribute('data-lucide', 'volume-2');
    }
    lucide.createIcons();
  }

  // --- Stats for Nerds calculation interval ---
  function startStatsMonitor() {
    if (statsInterval) clearInterval(statsInterval);
    
    statsInterval = setInterval(() => {
      if (!video) return;
      
      // Resolution
      statResolution.textContent = video.videoWidth > 0 ? `${video.videoWidth}x${video.videoHeight}` : 'Calculating...';
      
      // Buffer length calculation
      let bufferLen = 0;
      const currentTime = video.currentTime;
      for (let i = 0; i < video.buffered.length; i++) {
        const start = video.buffered.start(i);
        const end = video.buffered.end(i);
        if (currentTime >= start && currentTime <= end) {
          bufferLen = end - currentTime;
          break;
        }
      }
      statBuffer.textContent = `${bufferLen.toFixed(1)}s`;
      
      // Proxy status
      statProxy.textContent = isProxyEnabled ? 'Enabled (Node CORS Proxy)' : 'Disabled';
      
      // Bitrate (only available when using hls.js)
      if (hlsInstance && hlsInstance.levels && hlsInstance.currentLevel >= 0) {
        const level = hlsInstance.levels[hlsInstance.currentLevel];
        if (level && level.bitrate) {
          statBitrate.textContent = `${(level.bitrate / 1000000).toFixed(2)} Mbps`;
        } else {
          statBitrate.textContent = 'Dynamic';
        }
      } else {
        statBitrate.textContent = 'N/A';
      }
    }, 1000);
  }

  // --- Video Controls Overlay Hide logic ---
  function resetControlsTimer() {
    playerContainer.classList.add('controls-active');
    document.body.style.cursor = 'default';
    
    if (controlsTimeout) clearTimeout(controlsTimeout);
    
    // Only hide controls if stream is playing and not hovering on slider control
    if (!video.paused) {
      controlsTimeout = setTimeout(() => {
        // If slider range selector is active, don't hide
        if (document.activeElement !== volumeSlider) {
          playerContainer.classList.remove('controls-active');
          if (document.fullscreenElement) {
            document.body.style.cursor = 'none'; // hide cursor on full-screen idle
          }
        }
      }, 3000);
    }
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    
    // View mode toggling
    document.getElementById('playerViewBtn').addEventListener('click', () => {
      switchViewMode('player');
    });

    document.getElementById('gridViewBtn').addEventListener('click', () => {
      switchViewMode('grid');
    });

    // Grid filters and pagination
    const gridSearch = document.getElementById('gridChannelSearch');
    if (gridSearch) {
      gridSearch.addEventListener('input', () => {
        gridCurrentPage = 1;
        renderGrid();
      });
    }

    const gridCategorySelect = document.getElementById('gridCategorySelect');
    if (gridCategorySelect) {
      gridCategorySelect.addEventListener('change', () => {
        gridFilterCategory = gridCategorySelect.value;
        gridCurrentPage = 1;
        renderGrid();
      });
    }

    const gridCountrySelect = document.getElementById('gridCountrySelect');
    if (gridCountrySelect) {
      gridCountrySelect.addEventListener('change', () => {
        gridFilterCountry = gridCountrySelect.value;
        updateGridLanguageSelect(gridFilterCountry);
        gridCurrentPage = 1;
        renderGrid();
      });
    }

    const gridLanguageSelect = document.getElementById('gridLanguageSelect');
    if (gridLanguageSelect) {
      gridLanguageSelect.addEventListener('change', () => {
        gridFilterLanguage = gridLanguageSelect.value;
        gridCurrentPage = 1;
        renderGrid();
      });
    }

    const sidebarCountrySelect = document.getElementById('sidebarCountrySelect');
    if (sidebarCountrySelect) {
      sidebarCountrySelect.addEventListener('change', () => {
        sidebarFilterCountry = sidebarCountrySelect.value;
        updateSidebarLanguageSelect(sidebarFilterCountry);
        renderChannelList();
      });
    }

    const sidebarLanguageSelect = document.getElementById('sidebarLanguageSelect');
    if (sidebarLanguageSelect) {
      sidebarLanguageSelect.addEventListener('change', () => {
        sidebarFilterLanguage = sidebarLanguageSelect.value;
        renderChannelList();
      });
    }

    const gridPrevPage = document.getElementById('gridPrevPage');
    if (gridPrevPage) {
      gridPrevPage.addEventListener('click', () => {
        const currentBlock = Math.floor((gridCurrentPage - 1) / 10);
        const startPage = (currentBlock * 10) + 1;
        if (startPage > 1) {
          gridCurrentPage = startPage - 1; // go to last page of previous block
          renderGrid();
        }
      });
    }

    const gridNextPage = document.getElementById('gridNextPage');
    if (gridNextPage) {
      gridNextPage.addEventListener('click', () => {
        const currentBlock = Math.floor((gridCurrentPage - 1) / 10);
        const startPage = (currentBlock * 10) + 1;
        const endPage = startPage + 9;
        gridCurrentPage = endPage + 1; // go to first page of next block
        renderGrid();
      });
    }

    const gridGotoPageBtn = document.getElementById('gridGotoPageBtn');
    const gridGotoPageInput = document.getElementById('gridGotoPageInput');
    if (gridGotoPageBtn && gridGotoPageInput) {
      const handleJump = () => {
        const pageNum = parseInt(gridGotoPageInput.value);
        if (window.gotoGridPage(pageNum)) {
          gridGotoPageInput.value = '';
        }
      };
      gridGotoPageBtn.addEventListener('click', handleJump);
      gridGotoPageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleJump();
        }
      });
    }

    // Dropdown Playlist Selector
    playlistSelect.addEventListener('change', () => {
      const val = playlistSelect.value;
      if (val === 'custom') {
        customPlaylistContainer.classList.remove('hidden');
      } else {
        customPlaylistContainer.classList.add('hidden');
        currentPlaylistUrl = val;
        localStorage.setItem('aerotv_current_playlist', val);
        fetchPlaylist(val);
      }
    });

    // Custom Playlist Actions
    addPlaylistBtn.addEventListener('click', () => {
      playlistSelect.value = 'custom';
      customPlaylistContainer.classList.remove('hidden');
      customPlaylistUrlInput.focus();
    });

    cancelCustomPlaylistBtn.addEventListener('click', () => {
      customPlaylistContainer.classList.add('hidden');
      playlistSelect.value = currentPlaylistUrl;
    });

    loadCustomPlaylistBtn.addEventListener('click', () => {
      const url = customPlaylistUrlInput.value.trim();
      if (!url) return;
      
      const playlistName = url.split('/').pop() || 'Custom Playlist';
      
      // Save to local custom playlists cache if new
      if (!customPlaylists.some(p => p.url === url)) {
        customPlaylists.push({ name: playlistName, url: url });
        localStorage.setItem('aerotv_custom_playlists', JSON.stringify(customPlaylists));
      }
      
      addCustomOptionToDropdown(playlistName, url);
      playlistSelect.value = url;
      customPlaylistContainer.classList.add('hidden');
      
      currentPlaylistUrl = url;
      localStorage.setItem('aerotv_current_playlist', url);
      fetchPlaylist(url);
    });

    // Search bar logic
    searchInput.addEventListener('input', () => {
      if (searchInput.value.trim().length > 0) {
        clearSearchBtn.classList.remove('hidden');
      } else {
        clearSearchBtn.classList.add('hidden');
      }
      renderChannelList();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearSearchBtn.classList.add('hidden');
      renderChannelList();
      searchInput.focus();
    });

    // Sidebar Close Open toggles
    sidebarCloseBtn.addEventListener('click', () => {
      sidebar.classList.add('collapsed');
      sidebarOpenBtn.classList.remove('hidden');
    });

    sidebarOpenBtn.addEventListener('click', () => {
      sidebar.classList.remove('collapsed');
      sidebarOpenBtn.classList.add('hidden');
    });

    // Themes Switcher Click
    document.querySelectorAll('.theme-option').forEach(opt => {
      opt.addEventListener('click', () => {
        loadTheme(opt.dataset.theme);
      });
    });

    // Help/About Modal
    infoBtn.addEventListener('click', () => {
      infoModal.classList.remove('hidden');
    });

    closeInfoModal.addEventListener('click', () => {
      infoModal.classList.add('hidden');
    });

    infoModal.addEventListener('click', (e) => {
      if (e.target === infoModal) {
        infoModal.classList.add('hidden');
      }
    });

    // Video Player Controls Logic
    playPauseBtn.addEventListener('click', () => {
      if (video.paused) {
        video.play().catch(err => console.error('Play failure:', err));
        playPauseBtn.querySelector('i, svg').setAttribute('data-lucide', 'pause');
      } else {
        video.pause();
        playPauseBtn.querySelector('i, svg').setAttribute('data-lucide', 'play');
      }
      lucide.createIcons();
      resetControlsTimer();
    });

    stopBtn.addEventListener('click', stopStream);

    reloadBtn.addEventListener('click', () => {
      if (activeChannel) {
        playStream(activeChannel.url);
      }
    });

    retryStreamBtn.addEventListener('click', () => {
      if (activeChannel) {
        playStream(activeChannel.url);
      }
    });

    proxyBtn.addEventListener('click', () => {
      if (activeChannel) {
        playStream(activeChannel.url, true);
      }
    });

    // Volume Adjustment Controls
    volumeSlider.addEventListener('input', (e) => {
      const vol = e.target.value;
      video.volume = vol;
      video.muted = false;
      localStorage.setItem('aerotv_volume', vol);
      updateVolumeIcon(vol);
    });

    volumeBtn.addEventListener('click', () => {
      if (video.muted || video.volume === 0) {
        video.muted = false;
        video.volume = localStorage.getItem('aerotv_volume') || 0.8;
        volumeSlider.value = video.volume;
      } else {
        video.muted = true;
        volumeSlider.value = 0;
      }
      updateVolumeIcon(video.muted ? 0 : video.volume);
    });

    // Favorite button inside custom overlay controls
    favoriteToggleBtn.addEventListener('click', () => {
      if (!activeChannel) return;
      
      // Find matching item card favorite button in list
      const favBtn = favoriteToggleBtn;
      toggleFavorite(activeChannel, favBtn);
    });

    // Picture in Picture Click
    pipBtn.addEventListener('click', async () => {
      try {
        if (video !== document.pictureInPictureElement) {
          await video.requestPictureInPicture();
        } else {
          await document.exitPictureInPicture();
        }
      } catch (err) {
        console.error('Picture-in-picture error:', err);
      }
    });

    // Fullscreen Toggles
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    playerContainer.addEventListener('dblclick', toggleFullscreen);

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        playerContainer.requestFullscreen().catch(err => {
          console.error(`Fullscreen request failed: ${err.message}`);
        });
        fullscreenBtn.querySelector('i, svg').setAttribute('data-lucide', 'minimize');
      } else {
        document.exitFullscreen();
        fullscreenBtn.querySelector('i, svg').setAttribute('data-lucide', 'maximize');
      }
      lucide.createIcons();
    }

    // Update fullscreen controls icons on esc or native exits
    document.addEventListener('fullscreenchange', () => {
      const icon = fullscreenBtn.querySelector('i, svg');
      if (document.fullscreenElement) {
        icon.setAttribute('data-lucide', 'minimize');
      } else {
        icon.setAttribute('data-lucide', 'maximize');
        document.body.style.cursor = 'default';
      }
      lucide.createIcons();
    });

    // Stats Toggle Panel
    statsToggleBtn.addEventListener('click', () => {
      statsPanel.classList.toggle('hidden');
    });

    closeStatsBtn.addEventListener('click', () => {
      statsPanel.classList.add('hidden');
    });

    // Overlay hide trigger setup
    playerContainer.addEventListener('mousemove', resetControlsTimer);
    playerContainer.addEventListener('mousedown', resetControlsTimer);
    playerContainer.addEventListener('touchstart', resetControlsTimer);
    
    video.addEventListener('play', () => {
      playPauseBtn.querySelector('i, svg').setAttribute('data-lucide', 'pause');
      lucide.createIcons();
      resetControlsTimer();
    });

    video.addEventListener('pause', () => {
      playPauseBtn.querySelector('i, svg').setAttribute('data-lucide', 'play');
      lucide.createIcons();
      playerContainer.classList.add('controls-active');
      if (controlsTimeout) clearTimeout(controlsTimeout);
    });

    // Scan controls
    scanBtn.addEventListener('click', scanVisibleChannels);
    onlineToggle.addEventListener('change', (e) => {
      showOnlineOnly = e.target.checked;
      renderChannelList();
    });
  }
  
  // Launch App
  init();
});
