/**
 * MapView class handles the Leaflet map functionality for region selection
 */
class MapView {
    constructor() {
        this.dataLoader = null;
        this.leafletMap = null;
        this.selectionRectangle = null;
        this.selectedBounds = null;
        
        // Selection state
        this.isSelecting = false;
        this.selectionStart = null;
        this.isDrawing = false;
        this.isPanning = false;
        this.panStart = null;
    }

    /**
     * Initialize the map view
     * @param {DataLoader} dataLoader - The data loader instance
     */
    init(dataLoader) {
        this.dataLoader = dataLoader;
        this.setupMapModal();
        console.log('MapView initialized');
    }

    /**
     * Setup map modal event handlers
     */
    setupMapModal() {
        // Initialize map when modal is shown
        $('#map_modal').on('shown.bs.modal', () => {
            if (!this.leafletMap) {
                this.initializeMap();
            } else {
                // Invalidate size when modal is shown (required for Leaflet in modals)
                setTimeout(() => {
                    this.leafletMap.invalidateSize();
                }, 100);
            }
        });

        // Setup fetch elevation button
        const fetchBtn = document.getElementById('fetchElevationBtn');
        if (fetchBtn) {
            fetchBtn.addEventListener('click', () => this.fetchElevationData());
        }
    }

    /**
     * Initialize the Leaflet map
     */
    initializeMap() {
        const mapDiv = document.getElementById('map_div');
        if (!mapDiv) {
            console.error('Map container not found');
            return;
        }

        this.leafletMap = L.map('map_div', {
            center: [46.8523, -121.7603], // Mount Rainier area
            zoom: 10,
            zoomControl: true,
            scrollWheelZoom: true
        });
        
        // Add tile layer
        L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            maxZoom: 17,
            attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
        }).addTo(this.leafletMap);
        
        this.setupMapSelection();
    }

    /**
     * Setup map selection functionality
     */
    setupMapSelection() {
        if (!this.leafletMap) return;

        this.leafletMap.on('mousedown', (e) => {
            if (e.originalEvent.button === 0) { // Left click for selection
                this.isDrawing = true;
                this.selectionStart = e.latlng;
                
                if (this.selectionRectangle) {
                    this.leafletMap.removeLayer(this.selectionRectangle);
                }
                
                this.leafletMap.dragging.disable();
            } else if (e.originalEvent.button === 2) { // Right click for panning
                this.isPanning = true;
                this.panStart = e.containerPoint;
                this.leafletMap.getContainer().style.cursor = 'move';
                e.originalEvent.preventDefault(); // Prevent context menu on mousedown
            }
        });

        this.leafletMap.on('mousemove', (e) => {
            if (this.isDrawing) {
                if (this.selectionRectangle) {
                    this.leafletMap.removeLayer(this.selectionRectangle);
                }
                const bounds = L.latLngBounds(this.selectionStart, e.latlng);
                this.selectionRectangle = L.rectangle(bounds, {
                    className: 'leaflet-selection-rectangle',
                    fillOpacity: 0.1,
                    weight: 2
                }).addTo(this.leafletMap);
            } else if (this.isPanning) {
                if (this.panStart) {
                    const delta = e.containerPoint.subtract(this.panStart);
                    this.leafletMap.panBy(delta.multiplyBy(-1), { animate: false });
                    this.panStart = e.containerPoint;
                }
            }
        });

        this.leafletMap.on('mouseup', (e) => {
            if (e.originalEvent.button === 0 && this.isDrawing) { // Left click release
                this.isDrawing = false;
                this.selectedBounds = L.latLngBounds(this.selectionStart, e.latlng);
                this.leafletMap.dragging.enable();
                this.updateSelectionStatus();
            } else if (e.originalEvent.button === 2 && this.isPanning) { // Right click release
                this.isPanning = false;
                this.leafletMap.getContainer().style.cursor = '';
            }
        });

        // Prevent context menu on right click up
        this.leafletMap.on('contextmenu', (e) => {
            e.originalEvent.preventDefault();
        });
    }

    /**
     * Update the selection status display
     */
    updateSelectionStatus() {
        const statusEl = document.getElementById('statusMessage');
        if (!statusEl || !this.selectedBounds) return;

        const south = this.selectedBounds.getSouth().toFixed(6);
        const north = this.selectedBounds.getNorth().toFixed(6);
        const west = this.selectedBounds.getWest().toFixed(6);
        const east = this.selectedBounds.getEast().toFixed(6);
        
        statusEl.innerHTML = `
            <strong>Selected Region:</strong><br>
            North: ${north}°<br>
            South: ${south}°<br>
            East: ${east}°<br>
            West: ${west}°
        `;
        statusEl.className = 'status-message success';
        statusEl.style.display = 'block';
    }

    /**
     * Fetch elevation data for the selected region
     */
    async fetchElevationData() {
        if (!this.selectedBounds) {
            this.showStatusMessage('Please select a region on the map first.', 'error');
            return;
        }

        const datasetSelect = document.getElementById('datasetSelect');
        const dataset = datasetSelect ? datasetSelect.value : 'SRTMGL3';
        
        const south = this.selectedBounds.getSouth();
        const north = this.selectedBounds.getNorth();
        const west = this.selectedBounds.getWest();
        const east = this.selectedBounds.getEast();
        
        // Validate selection size
        const latDiff = Math.abs(north - south);
        const lngDiff = Math.abs(east - west);
        
        if (latDiff > 2 || lngDiff > 2) {
            this.showStatusMessage('Selected region is too large. Please select a smaller area (max 2° x 2°).', 'error');
            return;
        }

        this.showStatusMessage('Fetching elevation data...', 'loading');

        try {
            await this.dataLoader.loadFromOpenTopo({
                dataset: dataset,
                south: south,
                north: north,
                west: west,
                east: east
            });
            
            this.showStatusMessage('Elevation data loaded successfully!', 'success');
            
            // Close the modal after successful load
            $('#map_modal').modal('hide');
            
        } catch (error) {
            console.error('Error fetching elevation data:', error);
            this.showStatusMessage(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Show status message in the map interface
     * @param {string} message - Message to display
     * @param {string} type - Message type (success, error, loading)
     */
    showStatusMessage(message, type) {
        const statusEl = document.getElementById('statusMessage');
        if (!statusEl) return;

        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
        statusEl.style.display = 'block';
    }

    /**
     * Clear the current selection
     */
    clearSelection() {
        if (this.selectionRectangle && this.leafletMap) {
            this.leafletMap.removeLayer(this.selectionRectangle);
            this.selectionRectangle = null;
        }
        this.selectedBounds = null;
        this.updateSelectionStatus();
    }

    /**
     * Set the map center and zoom
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} zoom - Zoom level
     */
    setView(lat, lng, zoom = 10) {
        if (this.leafletMap) {
            this.leafletMap.setView([lat, lng], zoom);
        }
    }

    /**
     * Get the current map bounds
     * @returns {Object|null} Map bounds or null if map not initialized
     */
    getBounds() {
        return this.leafletMap ? this.leafletMap.getBounds() : null;
    }

    /**
     * Get the selected bounds
     * @returns {Object|null} Selected bounds or null if no selection
     */
    getSelectedBounds() {
        return this.selectedBounds;
    }

    /**
     * Check if a region is currently selected
     * @returns {boolean}
     */
    hasSelection() {
        return this.selectedBounds !== null;
    }

    /**
     * Destroy the map instance
     */
    destroy() {
        if (this.leafletMap) {
            this.leafletMap.remove();
            this.leafletMap = null;
        }
        this.clearSelection();
    }

    /**
     * Refresh the map (useful after modal resize)
     */
    refresh() {
        if (this.leafletMap) {
            setTimeout(() => {
                this.leafletMap.invalidateSize();
            }, 100);
        }
    }
}

// Make MapView available globally
window.MapView = MapView;
