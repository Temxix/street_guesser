// Street Guesser Game Logic

window.onerror = function (message, source, lineno, colno, error) {
    alert(`JS Error: ${message} at ${lineno}:${colno}`);
    return false;
};

// App State
let map;
let drawControl;
let drawnItems;
let activeBoundaryLayer = null; // Leaflet layer showing current boundary
let gameActive = false;
let streetData = {}; // Normalized name -> { originalNames: Set, features: [], guessed: false }
let totalStreetsCount = 0;
let guessedStreetsCount = 0;
let currentStreak = 0;
let gameTimer = null;
let gameStartTime = null;

// UI Elements
const startScreen = document.getElementById('start-screen');
const startGameBtn = document.getElementById('start-game-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const setupCard = document.getElementById('setup-card');
const gameControlsCard = document.getElementById('game-controls-card');
const statsCard = document.getElementById('stats-card');
const streetsListCard = document.getElementById('streets-list-card');
const streetsList = document.getElementById('streets-list');
const presetBtns = document.querySelectorAll('.btn-preset');
const drawModeBtn = document.getElementById('draw-mode-btn');
const guessInput = document.getElementById('guess-input');
const guessBtn = document.getElementById('guess-btn');
const giveupBtn = document.getElementById('giveup-btn');
const statScore = document.getElementById('stat-score');
const statTimer = document.getElementById('stat-timer');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

// Normalization lists
const STREET_REPLACEMENTS = [
    // Russian
    /\bулица\b/gi, /\bул\b/gi, /\bпроспект\b/gi, /\bпр-кт\b/gi, /\bпр\b/gi,
    /\bпереулок\b/gi, /\bпер\b/gi, /\bшоссе\b/gi, /\bш\b/gi, /\bбульвар\b/gi,
    /\bб-р\b/gi, /\bплощадь\b/gi, /\bпл\b/gi, /\bнабережная\b/gi, /\bнаб\b/gi,
    /\bпроезд\b/gi, /\bпр-д\b/gi, /\bтупик\b/gi, /\bтпк\b/gi, /\bаллея\b/gi,
    // English
    /\bstreet\b/gi, /\bst\b/gi, /\bavenue\b/gi, /\bave\b/gi, /\broad\b/gi,
    /\brd\b/gi, /\blane\b/gi, /\bln\b/gi, /\bdrive\b/gi, /\bdr\b/gi,
    /\bcourt\b/gi, /\bct\b/gi, /\bway\b/gi, /\bplace\b/gi, /\bpl\b/gi,
    /\bboulevard\b/gi, /\bblvd\b/gi, /\bterrace\b/gi, /\bter\b/gi,
    /\bparkway\b/gi, /\bpkwy\b/gi,
    // Punctuation and spaces
    /[.,\/#!$%\^&\*;:{}=\-_`~()]/g
];

// Initialize Map
function initMap() {
    // Default focus (London center)
    map = L.map('map', {
        zoomControl: false
    }).setView([51.505, -0.09], 13);

    // Place zoom control at top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Dark base tiles without labels (prevents cheating)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Setup Leaflet Draw features
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    drawControl = new L.Control.Draw({
        edit: {
            featureGroup: drawnItems,
            remove: false
        },
        draw: {
            polygon: {
                allowIntersection: false,
                showArea: true,
                drawError: {
                    color: '#ff3e6c',
                    message: '<strong>Error:</strong> Boundaries cannot intersect!'
                },
                shapeOptions: {
                    color: '#6c5ce7',
                    fillColor: '#6c5ce7',
                    fillOpacity: 0.15,
                    weight: 3
                }
            },
            // Disable other shapes
            polyline: false,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false
        }
    });

    // Add draw control to map so Leaflet Draw is fully initialized
    map.addControl(drawControl);

    // Listen to draw creation
    map.on(L.Draw.Event.CREATED, function (event) {
        const layer = event.layer;
        
        // Clear previous game and boundary drawings
        resetGame();
        drawnItems.clearLayers();
        
        drawnItems.addLayer(layer);
        activeBoundaryLayer = layer;
        
        // Fit view to drawn polygon
        map.fitBounds(layer.getBounds());
        
        // Prompt loading from drawn polygon coords
        const latlngs = layer.getLatLngs()[0];
        fetchStreetsForPolygon(latlngs);
    });
}

// Sidebar Toggle (Mobile Support)
sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
});

// Toast notification helper
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    // Auto remove toast
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Normalize street names for fuzzy matching
function normalizeName(name) {
    if (!name) return '';
    let clean = name.toLowerCase().trim();
    
    // Apply replacements
    STREET_REPLACEMENTS.forEach(regex => {
        clean = clean.replace(regex, ' ');
    });
    
    // Remove extra whitespace
    return clean.replace(/\s+/g, ' ').trim();
}

// Check if a point is inside a polygon (Ray-Casting Algorithm)
function isPointInPolygon(point, polygonCoords) {
    const x = point[1]; // Lng
    const y = point[0]; // Lat
    let inside = false;
    
    for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
        const xi = polygonCoords[i].lng;
        const yi = polygonCoords[i].lat;
        const xj = polygonCoords[j].lng;
        const yj = polygonCoords[j].lat;
        
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Fetch streets for custom drawn boundary
function fetchStreetsForPolygon(coords) {
    showLoading(true, 'Fetching streets inside your drawn area...');
    
    // Format coordinates for Overpass poly query
    // Poly query format: way(poly:"lat1 lon1 lat2 lon2 ...")
    const coordString = coords.map(c => `${c.lat} ${c.lng}`).join(' ');
    
    // Filter to driveable road classes only, to keep query size small
    const query = `[out:json][timeout:30];
    (
      way(poly:"${coordString}")[highway~"^(primary|secondary|tertiary|residential)$"][name];
    );
    out geom;`;
    
    executeOverpassQuery(query, coords);
}

// Fetch streets using Nominatim and bounding box
async function fetchStreetsForCity(cityName) {
    showLoading(true, `Searching for "${cityName}"...`);
    
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}&polygon_geojson=1&limit=1`, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!response.ok) throw new Error('Search failed');
        
        const data = await response.json();
        if (data.length === 0) {
            showToast('City not found. Try another search!', 'error');
            showLoading(false);
            return;
        }
        
        const result = data[0];
        const bbox = result.boundingbox.map(Number); // [minlat, maxlat, minlon, maxlon]
        
        // Calculate dimensions to prevent crashes on massive cities (e.g. London, Moscow)
        const latDiff = Math.abs(bbox[1] - bbox[0]);
        const lngDiff = Math.abs(bbox[3] - bbox[2]);
        
        if (latDiff > 0.08 || lngDiff > 0.1) {
            showToast('Area is too large! Please search for a specific district (e.g. "Soho, London" or "Chelsea").', 'error');
            showLoading(false);
            return;
        }
        
        // Remove previous boundary layer
        if (activeBoundaryLayer) {
            map.removeLayer(activeBoundaryLayer);
        }
        
        // If polygon geojson is provided, draw it
        if (result.geojson && (result.geojson.type === 'Polygon' || result.geojson.type === 'MultiPolygon')) {
            activeBoundaryLayer = L.geoJSON(result.geojson, {
                style: {
                    color: '#6c5ce7',
                    fillColor: '#6c5ce7',
                    fillOpacity: 0.1,
                    weight: 3
                }
            }).addTo(map);
            map.fitBounds(activeBoundaryLayer.getBounds());
        } else {
            // Fallback to bounding box rectangle
            const bounds = [[bbox[0], bbox[2]], [bbox[1], bbox[3]]];
            activeBoundaryLayer = L.rectangle(bounds, {
                color: '#6c5ce7',
                fillColor: '#6c5ce7',
                fillOpacity: 0.1,
                weight: 3
            }).addTo(map);
            map.fitBounds(bounds);
        }
        
        // Build Overpass Bounding Box query (south, west, north, east)
        // Filter to primary/secondary/tertiary/residential highways to ensure reasonable payload sizes
        const query = `[out:json][timeout:30];
        (
          way(${bbox[0]},${bbox[2]},${bbox[1]},${bbox[3]})[highway~"^(primary|secondary|tertiary|residential)$"][name];
        );
        out geom;`;
        
        loadingMessage.textContent = 'Extracting street grid from OpenStreetMap...';
        
        // For polygon containment filter
        let filterPoly = null;
        if (result.geojson && result.geojson.type === 'Polygon') {
            filterPoly = result.geojson.coordinates[0].map(c => ({ lat: c[1], lng: c[0] }));
        }
        
        executeOverpassQuery(query, filterPoly);
        
    } catch (err) {
        console.error(err);
        showToast('Error fetching city boundaries', 'error');
        showLoading(false);
    }
}

// Execute the Overpass API query and build the game state
async function executeOverpassQuery(query, filterPolygon = null) {
    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        
        if (!response.ok) throw new Error('Overpass API returned an error');
        
        const data = await response.json();
        
        if (!data.elements || data.elements.length === 0) {
            showToast('No streets found in this region. Try a larger area!', 'error');
            showLoading(false);
            return;
        }
        
        processStreetElements(data.elements, filterPolygon);
        
    } catch (err) {
        console.error(err);
        showToast('Failed to load street data. Please try again.', 'error');
        showLoading(false);
    }
}

const GEORGIAN_LATIN_MAP = {
    'ა': 'a', 'ბ': 'b', 'გ': 'g', 'დ': 'd', 'ე': 'e', 'в': 'v', 'ზ': 'z', 'თ': 't',
    'ი': 'i', 'კ': 'k', 'ლ': 'l', 'მ': 'm', 'ნ': 'n', 'ო': 'o', 'პ': 'p', 'ჟ': 'zh',
    'რ': 'r', 'ს': 's', 'ტ': 't', 'უ': 'u', 'ფ': 'p', 'ქ': 'k', 'ღ': 'gh', 'ყ': 'q',
    'შ': 'sh', 'ჩ': 'ch', 'ც': 'ts', 'ძ': 'dz', 'წ': 'ts', 'ჭ': 'ch', 'ხ': 'kh',
    'ჯ': 'j', 'ჰ': 'h', 'ვ': 'v'
};

const GEORGIAN_WORDS_MAP = {
    'ქუჩა': 'Street',
    'გამზირი': 'Avenue',
    'მოედანი': 'Square',
    'ჩიხი': 'Lane',
    'შესახვევი': 'Turn',
    'გასასვლელი': 'Passage',
    'აღმართი': 'Ascent',
    'გზატკეცილი': 'Highway'
};

const CYRILLIC_LATIN_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

const CYRILLIC_WORDS_MAP = {
    'улица': 'Street',
    'ул': 'St',
    'проспект': 'Avenue',
    'пр-кт': 'Ave',
    'пр': 'Ave',
    'переулок': 'Lane',
    'пер': 'Lane',
    'шоссе': 'Highway',
    'ш': 'Hwy',
    'бульвар': 'Boulevard',
    'б-р': 'Blvd',
    'площадь': 'Square',
    'пл': 'Sq',
    'набережная': 'Embankment',
    'наб': 'Emb',
    'проезд': 'Passage',
    'тупик': 'Dead End'
};

function autoTransliterate(text) {
    if (!text) return '';
    
    // Check for Georgian characters (range \u10A0-\u10FF)
    const hasGeorgian = /[\u10A0-\u10FF]/.test(text);
    if (hasGeorgian) {
        let result = text;
        for (let word in GEORGIAN_WORDS_MAP) {
            const regex = new RegExp(word, 'g');
            result = result.replace(regex, GEORGIAN_WORDS_MAP[word]);
        }
        let transliterated = '';
        for (let char of result) {
            const lower = char.toLowerCase();
            if (GEORGIAN_LATIN_MAP[lower] !== undefined) {
                transliterated += GEORGIAN_LATIN_MAP[lower];
            } else {
                transliterated += char;
            }
        }
        return transliterated.replace(/\b\w/g, c => c.toUpperCase());
    }
    
    // Check for Cyrillic characters (range \u0400-\u04FF)
    const hasCyrillic = /[\u0400-\u04FF]/.test(text);
    if (hasCyrillic) {
        let result = text;
        for (let word in CYRILLIC_WORDS_MAP) {
            const regex = new RegExp(`\\b${word}\\b|${word}`, 'gi');
            result = result.replace(regex, CYRILLIC_WORDS_MAP[word]);
        }
        let transliterated = '';
        for (let char of result) {
            const lower = char.toLowerCase();
            if (CYRILLIC_LATIN_MAP[lower] !== undefined) {
                if (char === char.toUpperCase() && char !== char.toLowerCase()) {
                    transliterated += CYRILLIC_LATIN_MAP[lower].toUpperCase();
                } else {
                    transliterated += CYRILLIC_LATIN_MAP[lower];
                }
            } else {
                transliterated += char;
            }
        }
        return transliterated.replace(/\b\w/g, c => c.toUpperCase());
    }
    
    return text;
}

// Process Overpass elements and organize them by normalized name
function processStreetElements(elements, filterPolygon) {
    streetData = {};
    totalStreetsCount = 0;
    guessedStreetsCount = 0;
    
    elements.forEach(el => {
        if (el.type !== 'way' || !el.tags) return;
        
        // Prefer English name, fallback to transliterated local name
        const originalName = el.tags.name;
        let englishName = el.tags["name:en"];
        
        if (!englishName && originalName) {
            englishName = autoTransliterate(originalName);
        }
        
        const displayName = englishName || originalName;
        
        if (!displayName) return; // Skip unnamed paths
        
        // Skip service/construction/private roads that shouldn't be guessed
        const highwayType = el.tags.highway;
        if (['service', 'construction', 'private', 'proposed'].includes(highwayType)) return;
        
        // If a polygon boundary filter is active, check if street vertices reside inside
        if (filterPolygon) {
            let hasVertexInside = false;
            if (el.geometry) {
                for (let pt of el.geometry) {
                    if (isPointInPolygon([pt.lat, pt.lon], filterPolygon)) {
                        hasVertexInside = true;
                        break;
                    }
                }
            }
            if (!hasVertexInside) return; // Skip if completely outside boundary
        }
        
        const normEnglish = englishName ? normalizeName(englishName) : null;
        const normLocal = originalName ? normalizeName(originalName) : null;
        const primaryNorm = normEnglish || normLocal;
        
        if (!primaryNorm) return;
        
        // Init collection for street
        if (!streetData[primaryNorm]) {
            streetData[primaryNorm] = {
                originalNames: new Set(),
                features: [],
                guessed: false,
                alternativeNorms: new Set()
            };
        }
        
        streetData[primaryNorm].originalNames.add(displayName);
        if (originalName) {
            streetData[primaryNorm].originalNames.add(originalName);
            if (normLocal) streetData[primaryNorm].alternativeNorms.add(normLocal);
        }
        if (englishName) {
            streetData[primaryNorm].originalNames.add(englishName);
            if (normEnglish) streetData[primaryNorm].alternativeNorms.add(normEnglish);
        }
        
        // Convert OSM geometry to Leaflet LatLng coordinates
        if (el.geometry) {
            const coords = el.geometry.map(pt => [pt.lat, pt.lon]);
            streetData[primaryNorm].features.push(coords);
        }
    });
    
    // Remove empty street names or streets with no features
    for (let key in streetData) {
        if (streetData[key].features.length === 0 || !key) {
            delete streetData[key];
        }
    }
    
    totalStreetsCount = Object.keys(streetData).length;
    
    if (totalStreetsCount === 0) {
        showToast('No valid streets found in boundary!', 'error');
        showLoading(false);
        return;
    }
    
    startGameSession();
}

// Start Game Session
function startGameSession() {
    gameActive = true;
    showLoading(false);
    showToast(`Successfully loaded ${totalStreetsCount} streets! Start guessing.`, 'success');
    
    // Reset side panels
    setupCard.classList.add('hidden');
    gameControlsCard.classList.remove('hidden');
    statsCard.classList.remove('hidden');
    streetsListCard.classList.remove('hidden');
    
    guessInput.disabled = false;
    guessBtn.disabled = false;
    guessInput.focus();
    
    // Reset stats display
    updateStatsDisplay();
    
    // Start Game Timer
    gameStartTime = Date.now();
    if (gameTimer) clearInterval(gameTimer);
    gameTimer = setInterval(updateTimer, 1000);
}

// Check Guess
function checkGuess() {
    if (!gameActive) return;
    
    const rawGuess = guessInput.value;
    const normGuess = normalizeName(rawGuess);
    
    if (!normGuess) return;
    
    guessInput.value = ''; // Clear input
    
    // Find matching street checking key and alternativeNorms
    let matchedStreet = null;
    for (let key in streetData) {
        const street = streetData[key];
        if (key === normGuess || street.alternativeNorms.has(normGuess)) {
            matchedStreet = street;
            break;
        }
    }
    
    if (matchedStreet) {
        if (matchedStreet.guessed) {
            showToast('You already guessed this street!', 'error');
            return;
        }
        
        // Set as guessed
        matchedStreet.guessed = true;
        guessedStreetsCount++;
        currentStreak++;
        
        // Update display
        updateStatsDisplay();

        // Highlight streak counter
        const streakValEl = document.getElementById('stat-streak');
        if (streakValEl) {
            streakValEl.classList.remove('streak-active');
            void streakValEl.offsetWidth; // Trigger reflow to restart CSS animation
            streakValEl.classList.add('streak-active');
        }

        // Confetti animation when guessing multiple streets in a row (3+)
        if (currentStreak >= 3) {
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 40 + Math.min(currentStreak * 10, 100),
                    spread: 60 + Math.min(currentStreak * 5, 40),
                    origin: { y: 0.8 },
                    colors: ['#00ff87', '#6c5ce7', '#ff9f43', '#ff3e6c', '#00d2d3']
                });
            }
        }
        
        // Render street segments on map with glowing green polyline
        const polylines = [];
        matchedStreet.features.forEach(geometry => {
            const poly = L.polyline(geometry, {
                color: '#00ff87',
                weight: 5,
                opacity: 0.85,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);
            
            // Add custom popup showing name
            const displayName = Array.from(matchedStreet.originalNames)[0]; // Primary name (English if available)
            poly.bindPopup(`<strong>${displayName}</strong>`);
            polylines.push(poly);
        });
        
        // Add to guessed list in Sidebar
        const displayName = Array.from(matchedStreet.originalNames)[0];
        const li = document.createElement('li');
        li.className = 'street-item';
        li.innerHTML = `<span>📍 ${displayName}</span>`;
        streetsList.insertBefore(li, streetsList.firstChild);
        
        // Zoom/pan map to the guessed street segments
        const group = new L.featureGroup(polylines);
        map.panTo(group.getBounds().getCenter());
        
        showToast(`Correct! Found: ${displayName}`, 'success');
        
        // Check win condition
        if (guessedStreetsCount === totalStreetsCount) {
            triggerWin();
        }
    } else {
        showToast('Street not found inside boundary!', 'error');
        currentStreak = 0;
        updateStatsDisplay();
    }
}

// Give Up
function giveUp() {
    if (!gameActive) return;
    
    gameActive = false;
    clearInterval(gameTimer);
    
    guessInput.disabled = true;
    guessBtn.disabled = true;
    
    let revealedCount = 0;
    
    // Reveal all remaining streets in red
    for (let key in streetData) {
        const street = streetData[key];
        if (!street.guessed) {
            revealedCount++;
            
            // Draw red segments
            street.features.forEach(geometry => {
                const poly = L.polyline(geometry, {
                    color: '#ff3e6c',
                    weight: 4,
                    opacity: 0.65
                }).addTo(map);
                
                const displayName = Array.from(street.originalNames)[0];
                poly.bindPopup(`<strong>${displayName} (Missed)</strong>`);
            });
            
            // Add to sidebar with different styling
            const displayName = Array.from(street.originalNames)[0];
            const li = document.createElement('li');
            li.className = 'street-item giveup-reveal';
            li.innerHTML = `<span>❌ ${displayName}</span>`;
            streetsList.appendChild(li);
        }
    }
    
    showToast(`Game over! You missed ${revealedCount} streets.`, 'error');
    
    // Reset game controls screen card
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-secondary';
    resetBtn.textContent = '🔄 Play Again';
    resetBtn.onclick = () => location.reload();
    gameControlsCard.appendChild(resetBtn);
    giveupBtn.remove();

    checkAndShowTrophy();
}

// Trigger Win Condition (confetti effect)
function triggerWin() {
    gameActive = false;
    clearInterval(gameTimer);
    guessInput.disabled = true;
    guessBtn.disabled = true;
    
    showToast('Congratulations! You guessed all streets! 🎉', 'success');
    
    // Canvas Confetti
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 }
        });
    }

    checkAndShowTrophy();
}

// Check if user guessed > 50% and show trophy modal
function checkAndShowTrophy() {
    const percentage = totalStreetsCount > 0 ? Math.round((guessedStreetsCount / totalStreetsCount) * 100) : 0;
    if (percentage >= 50) {
        setTimeout(() => {
            document.getElementById('trophy-percentage').textContent = percentage;
            document.getElementById('trophy-count').textContent = guessedStreetsCount;
            document.getElementById('trophy-total').textContent = totalStreetsCount;
            document.getElementById('trophy-modal').classList.remove('hidden');
            
            // Extra confetti burst for the trophy popup
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 80,
                    spread: 60,
                    origin: { y: 0.6 }
                });
            }
        }, 1200);
    }
}

// Update game stats in sidebar
function updateStatsDisplay() {
    statScore.textContent = `${guessedStreetsCount} / ${totalStreetsCount}`;
    const streakValEl = document.getElementById('stat-streak');
    if (streakValEl) {
        streakValEl.textContent = currentStreak;
    }
}

// Game Timer
function updateTimer() {
    const diff = Date.now() - gameStartTime;
    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    statTimer.textContent = `${mins}:${secs}`;
}

// Reset Game State for new rounds
function resetGame() {
    gameActive = false;
    if (gameTimer) clearInterval(gameTimer);
    streetData = {};
    totalStreetsCount = 0;
    guessedStreetsCount = 0;
    currentStreak = 0;
    streetsList.innerHTML = '';
    
    // Remove custom active boundary layers from map
    if (activeBoundaryLayer) {
        map.removeLayer(activeBoundaryLayer);
        activeBoundaryLayer = null;
    }
}

// Show Loading Overlay
function showLoading(show, message = '') {
    if (show) {
        loadingMessage.textContent = message;
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

// Set up UI Event Listeners
function setupEvents() {
    startGameBtn.addEventListener('click', () => {
        startScreen.classList.add('hidden');
    });
    
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const query = btn.getAttribute('data-query');
            if (query) {
                fetchStreetsForCity(query);
            }
        });
    });
    
    drawModeBtn.addEventListener('click', () => {
        // Programmatically trigger Leaflet Draw Polygon tool
        const polygonDrawer = new L.Draw.Polygon(map, {
            shapeOptions: {
                color: '#6c5ce7',
                fillColor: '#6c5ce7',
                fillOpacity: 0.15,
                weight: 3
            }
        });
        polygonDrawer.enable();
        showToast('Click on the map to start drawing boundaries. Double click to finish!', 'success');
    });
    
    guessBtn.addEventListener('click', checkGuess);
    
    guessInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            checkGuess();
        }
    });
    
    giveupBtn.addEventListener('click', giveUp);
    
    document.getElementById('close-trophy-btn').addEventListener('click', () => {
        document.getElementById('trophy-modal').classList.add('hidden');
    });
}

// Entry Point
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEvents();
});
