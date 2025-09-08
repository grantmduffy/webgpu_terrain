/**
 * Main Application class that orchestrates all components
 */
class App {
    constructor() {
        this.renderer = null;
        this.inputHandler = null;
        this.dataLoader = null;
        this.mapView = null;
        this.uiManager = null;
        
        this.isInitialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            // Warn if not running in Chrome
            const isChrome = navigator.userAgent.includes('Chrome');
            if (!isChrome) {
                alert('This page is only supported in Chrome, results in other browsers may vary.');
            }

            // Initialize core components
            this.renderer = new Renderer();
            this.inputHandler = new InputHandler();
            this.dataLoader = new DataLoader();
            this.mapView = new MapView();
            this.uiManager = new UIManager(this);

            // Initialize renderer first
            await this.renderer.init();

            // Initialize other components
            this.inputHandler.init(this.renderer);
            this.dataLoader.init(this.renderer);
            this.mapView.init(this.dataLoader);

            // Load default model
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('file')) {
                await this.dataLoader.loadFromDrive(urlParams.get('file'));
            } else {
                await this.dataLoader.loadFromUrl('assets/rainier.gmd', 'Mount Rainier');
            }

            // Start render loop
            this.renderer.startRenderLoop();

            this.isInitialized = true;
            console.log('Mountain Viewer App initialized successfully');

        } catch (error) {
            console.error('Failed to initialize Mountain Viewer App:', error);
            alert('Failed to initialize the application. Please check the console for details.');
        }
    }

    /**
     * Get the current renderer instance
     */
    getRenderer() {
        return this.renderer;
    }

    /**
     * Get the current data loader instance
     */
    getDataLoader() {
        return this.dataLoader;
    }

    /**
     * Get the current map view instance
     */
    getMapView() {
        return this.mapView;
    }

    /**
     * Get the current UI manager instance
     */
    getUIManager() {
        return this.uiManager;
    }

    /**
     * Check if the app is initialized
     */
    isReady() {
        return this.isInitialized;
    }
}

// Make App available globally
window.App = App;
