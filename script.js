// Global Variables
let map;
let routeLayer;
let startMarker;
let endMarker;
let userLocationMarker;
let searchTimeout;
let selectedStartIndex = -1;
let selectedEndIndex = -1;
let startCoords = null;
let endCoords = null;
let panelExpanded = false;

// Initialize Map
function initMap() {
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        tap: false
    }).setView([-6.2088, 106.8456], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Add zoom control with better position for mobile
    L.control.zoom({
        position: 'topright'
    }).addTo(map);

    setupAutocomplete();
    setupPanelToggle();
    setupEventListeners();
    showStatus('Peta siap digunakan! Masukkan lokasi untuk mencari rute.', 'info');

    // Handle touch events to prevent map interference
    document.getElementById('controlPanel').addEventListener('touchstart', function(e) {
        e.stopPropagation();
    });
}

// Setup panel toggle for mobile
function setupPanelToggle() {
    const panelHandle = document.getElementById('panelHandle');
    const controlPanel = document.getElementById('controlPanel');

    panelHandle.addEventListener('click', function() {
        panelExpanded = !panelExpanded;
        controlPanel.classList.toggle('expanded', panelExpanded);
    });

    // Auto-expand panel when focusing on inputs
    const inputs = document.querySelectorAll('.input-group input');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            if (!panelExpanded) {
                panelExpanded = true;
                controlPanel.classList.add('expanded');
            }
        });
    });
}

// Setup Event Listeners
function setupEventListeners() {
    document.getElementById('findRouteBtn').addEventListener('click', findRoute);
    document.getElementById('currentLocationBtn').addEventListener('click', getCurrentLocation);
    document.getElementById('centerMapBtn').addEventListener('click', centerMap);
    document.getElementById('clearRouteBtn').addEventListener('click', clearRoute);

    document.getElementById('startInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') findRoute();
    });

    document.getElementById('endInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') findRoute();
    });
}

// Show Status Notification
function showStatus(message, type = 'info') {
    const notification = document.getElementById('statusNotification');
    notification.textContent = message;
    notification.className = `status-notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Single Geocoding Function
async function geocode(address) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=id&addressdetails=1`
        );
        const data = await response.json();

        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                display_name: data[0].display_name
            };
        }
        return null;
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

// Geocoding Function - Multiple results
async function geocodeMultiple(address, limit = 5) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=${limit}&countrycodes=id&addressdetails=1`
        );
        const data = await response.json();

        return data.map(item => ({
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            display_name: item.display_name,
            name: item.name || item.display_name.split(',')[0],
            address: item.display_name
        }));
    } catch (error) {
        console.error('Geocoding error:', error);
        return [];
    }
}

// Show Autocomplete Suggestions
async function showSuggestions(inputId, dropdownId, query) {
    if (query.length < 3) {
        document.getElementById(dropdownId).style.display = 'none';
        return;
    }

    const results = await geocodeMultiple(query);
    const dropdown = document.getElementById(dropdownId);

    if (results.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = '';
    results.forEach((result, index) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `
            <div class="autocomplete-main">${result.name}</div>
            <div class="autocomplete-sub">${result.address}</div>
        `;

        item.addEventListener('click', () => {
            document.getElementById(inputId).value = result.address;
            dropdown.style.display = 'none';

            // Store selected coordinates
            if (inputId === 'startInput') {
                selectedStartIndex = index;
                startCoords = result;
            } else {
                selectedEndIndex = index;
                endCoords = result;
            }
        });

        dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
}

// Setup Autocomplete
function setupAutocomplete() {
    const startInput = document.getElementById('startInput');
    const endInput = document.getElementById('endInput');

    // Start input autocomplete
    startInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            showSuggestions('startInput', 'startDropdown', e.target.value);
        }, 300);
    });

    // End input autocomplete  
    endInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            showSuggestions('endInput', 'endDropdown', e.target.value);
        }, 300);
    });

    // Hide dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-group')) {
            document.getElementById('startDropdown').style.display = 'none';
            document.getElementById('endDropdown').style.display = 'none';
        }
    });

    // Handle keyboard navigation
    [startInput, endInput].forEach(input => {
        input.addEventListener('keydown', (e) => {
            const dropdownId = input.id === 'startInput' ? 'startDropdown' : 'endDropdown';
            const dropdown = document.getElementById(dropdownId);
            const items = dropdown.querySelectorAll('.autocomplete-item');

            if (items.length === 0) return;

            const currentSelected = dropdown.querySelector('.selected');
            let currentIndex = currentSelected ? Array.from(items).indexOf(currentSelected) : -1;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentIndex = Math.min(currentIndex + 1, items.length - 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentIndex = Math.max(currentIndex - 1, 0);
            } else if (e.key === 'Enter' && currentIndex >= 0) {
                e.preventDefault();
                items[currentIndex].click();
                return;
            } else if (e.key === 'Escape') {
                dropdown.style.display = 'none';
                return;
            }

            // Update selection
            items.forEach(item => item.classList.remove('selected'));
            if (currentIndex >= 0) {
                items[currentIndex].classList.add('selected');
            }
        });
    });
}

// Find Route Function
async function findRoute() {
    const startAddress = document.getElementById('startInput').value.trim();
    const endAddress = document.getElementById('endInput').value.trim();

    if (!startAddress || !endAddress) {
        showStatus('Mohon masukkan lokasi awal dan tujuan!', 'error');
        return;
    }

    document.getElementById('loadingOverlay').style.display = 'block';
    document.getElementById('controlPanel').classList.remove('expanded');
    panelExpanded = false;

    try {
        let finalStartCoords = startCoords;
        let finalEndCoords = endCoords;

        // If coordinates aren't stored from autocomplete, geocode manually
        if (!finalStartCoords || finalStartCoords.address !== startAddress) {
            finalStartCoords = await geocode(startAddress);
        }
        if (!finalEndCoords || finalEndCoords.address !== endAddress) {
            finalEndCoords = await geocode(endAddress);
        }

        if (!finalStartCoords || !finalEndCoords) {
            throw new Error('Lokasi tidak ditemukan. Gunakan alamat yang lebih spesifik.');
        }

        // Clear previous route
        clearRoute();

        // Add markers
        startMarker = L.marker([finalStartCoords.lat, finalStartCoords.lng], {
            title: 'Lokasi Awal'
        }).addTo(map).bindPopup(`📍 <strong>Awal:</strong><br>${startAddress}`);

        endMarker = L.marker([finalEndCoords.lat, finalEndCoords.lng], {
            title: 'Tujuan'
        }).addTo(map).bindPopup(`🎯 <strong>Tujuan:</strong><br>${endAddress}`);

        // Get route from OSRM
        const routeUrl = `https://router.project-osrm.org/route/v1/driving/${finalStartCoords.lng},${finalStartCoords.lat};${finalEndCoords.lng},${finalEndCoords.lat}?overview=full&geometries=geojson&steps=true`;
        const routeResponse = await fetch(routeUrl);
        const routeData = await routeResponse.json();

        if (routeData.routes && routeData.routes.length > 0) {
            const route = routeData.routes[0];

            // Draw route on map
            routeLayer = L.geoJSON(route.geometry, {
                style: {
                    color: '#4285f4',
                    weight: 5,
                    opacity: 0.8,
                    lineCap: 'round',
                    lineJoin: 'round'
                }
            }).addTo(map);

            // Fit map to show entire route
            const group = new L.featureGroup([startMarker, endMarker, routeLayer]);
            map.fitBounds(group.getBounds(), { padding: [20, 20] });

            // Show route information
            displayRouteInfo(route);
            showStatus('Rute berhasil ditemukan!', 'success');
        } else {
            throw new Error('Tidak dapat menemukan rute antara lokasi tersebut.');
        }

    } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
    }
}

// Display Route Information
function displayRouteInfo(route) {
    const distance = (route.distance / 1000).toFixed(1);
    const duration = Math.round(route.duration / 60);

    // Calculate estimated walking steps (average 1300 steps per km)
    const estimatedSteps = Math.round((route.distance / 1000) * 1300);

    document.getElementById('distance').textContent = `${distance} km`;
    document.getElementById('duration').textContent = `${duration} min`;
    document.getElementById('steps').textContent = estimatedSteps.toLocaleString();
    document.getElementById('infoPanel').style.display = 'block';
}

// Get Current Location
function getCurrentLocation() {
    if (!navigator.geolocation) {
        showStatus('Geolocation tidak didukung browser ini.', 'error');
        return;
    }

    showStatus('Mengambil lokasi Anda...', 'info');

    navigator.geolocation.getCurrentPosition(
        async function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            if (userLocationMarker) {
                map.removeLayer(userLocationMarker);
            }

            userLocationMarker = L.marker([lat, lng], {
                title: 'Lokasi Anda'
            }).addTo(map).bindPopup('📍 <strong>Lokasi Anda Saat Ini</strong>').openPopup();

            map.setView([lat, lng], 16);

            // Reverse geocode to get address
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                const data = await response.json();

                if (data.display_name) {
                    document.getElementById('startInput').value = data.display_name;
                    startCoords = {
                        lat: lat,
                        lng: lng,
                        address: data.display_name
                    };
                }
            } catch (error) {
                console.error('Reverse geocoding error:', error);
            }

            showStatus('Lokasi berhasil ditemukan!', 'success');
        },
        function(error) {
            let errorMessage = 'Tidak dapat mengakses lokasi GPS.';

            if (error.code === error.PERMISSION_DENIED) {
                errorMessage = 'Akses lokasi ditolak. Aktifkan GPS dan berikan izin.';
            }

            showStatus(errorMessage, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}

// Center Map
function centerMap() {
    map.setView([-6.2088, 106.8456], 11);
    showStatus('Peta dikembalikan ke posisi semula.', 'info');
}

// Clear Route
function clearRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }
    if (endMarker) {
        map.removeLayer(endMarker);
        endMarker = null;
    }

    document.getElementById('infoPanel').style.display = 'none';
    startCoords = null;
    endCoords = null;
    selectedStartIndex = -1;
    selectedEndIndex = -1;
}

// Initialize map when page loads
window.addEventListener('load', initMap);