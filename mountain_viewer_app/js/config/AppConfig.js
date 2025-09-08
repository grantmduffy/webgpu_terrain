/**
 * Application Configuration
 * Central configuration management for the Mountain Viewer application
 */
class AppConfig {
    constructor() {
        this.config = {
            // Rendering settings
            rendering: {
                fps: 30,
                sunResolution: 512,
                elevationTextureOffset: 7,
                orthoFov: 100.0,
                orthoDepth: 800.0,
                meshResolution: {
                    width: 256,
                    height: 256
                }
            },

            // Camera settings
            camera: {
                initialZoom: -200,
                fov: 45,
                near: 0.1,
                far: 800.0
            },

            // Default shader uniforms
            shaderUniforms: {
                // Sun settings
                sunDirection: { value: 30.0, min: 0.0, max: 360.0, editable: true },
                sunElevation: { value: 15.0, min: 0.0, max: 90.0, editable: true },
                sunColor: { value: [1.0, 0.88, 0.54, 1.0], editable: true },
                sunIntensity: { value: 1.7, min: 0.0, max: 5.0, editable: true },

                // Ambient settings
                ambientColor: { value: [0.56, 0.75, 1.0, 1.0], editable: true },
                ambientIntensity: { value: 0.55, min: 0.0, max: 2.0, editable: true },

                // Rendering settings
                backgroundColor: { value: [0, 0, 0, 1], editable: true },
                exposure: { value: 2.2, min: 0.0, max: 10.0, editable: true },
                gamma: { value: 2.0, min: 0.0, max: 5.0, editable: true },

                // Terrain settings
                baseThickness: { value: 8.0, min: 0.0, max: 30.0, editable: true },
                ambientOcclusion: { value: 1.3, min: 0.0, max: 3.0, editable: true },

                // Shadow settings
                shadowSoftness: { value: 0.004, min: 0.0, max: 0.01, editable: true },
                shadowEps: { value: 0.001, min: 0.0, max: 0.01, editable: true },

                // Ambient occlusion settings
                aoEps: { value: 7.5, min: 0.0, max: 30.0, editable: true },
                aoPower: { value: 1.5, min: 0.0, max: 10.0, editable: true },

                // General settings
                eps: { value: 0.01, min: 0.0, max: 1.0, editable: true }
            },

            // UI settings
            ui: {
                loadingSpinnerDelay: 100, // ms
                modalAnimationDuration: 300, // ms
                tooltipDelay: 500 // ms
            },

            // Data loading settings
            dataLoading: {
                defaultModel: 'rainier.gmd',
                supportedFormats: ['.gmd', '.tiff', '.tif'],
                maxFileSize: 100 * 1024 * 1024, // 100MB
                chunkSize: 1024 * 1024 // 1MB chunks
            },

            // Map settings
            map: {
                defaultCenter: [47.7511, -121.7581], // Mount Rainier
                defaultZoom: 10,
                maxZoom: 18,
                minZoom: 3,
                tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors'
            },

            // Performance settings
            performance: {
                enablePerformanceMonitoring: false,
                maxFPS: 60,
                adaptiveQuality: true,
                memoryThreshold: 0.8 // 80% of available memory
            },

            // Development settings
            development: {
                enableDebugMode: false,
                enableShaderHotReload: false,
                logLevel: 'info', // 'debug', 'info', 'warn', 'error'
                showPerformanceStats: false
            }
        };

        // Load saved settings from localStorage
        this.loadSettings();
    }

    /**
     * Get a configuration value by path
     * @param {string} path - Dot-separated path to the config value
     * @returns {*} The configuration value
     */
    get(path) {
        return this.getNestedValue(this.config, path);
    }

    /**
     * Set a configuration value by path
     * @param {string} path - Dot-separated path to the config value
     * @param {*} value - The value to set
     */
    set(path, value) {
        this.setNestedValue(this.config, path, value);
        this.saveSettings();
    }

    /**
     * Get nested value from object using dot notation
     * @param {Object} obj - The object to search
     * @param {string} path - Dot-separated path
     * @returns {*} The value or undefined
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    /**
     * Set nested value in object using dot notation
     * @param {Object} obj - The object to modify
     * @param {string} path - Dot-separated path
     * @param {*} value - The value to set
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const savedSettings = localStorage.getItem('mountainViewer.settings');
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                this.mergeConfig(this.config, parsed);
            }
        } catch (error) {
            console.warn('Failed to load settings from localStorage:', error);
        }
    }

    /**
     * Save current settings to localStorage
     */
    saveSettings() {
        try {
            // Only save editable settings to avoid storing large default objects
            const editableSettings = this.extractEditableSettings();
            localStorage.setItem('mountainViewer.settings', JSON.stringify(editableSettings));
        } catch (error) {
            console.warn('Failed to save settings to localStorage:', error);
        }
    }

    /**
     * Extract only editable settings for persistence
     * @returns {Object} Object containing only editable settings
     */
    extractEditableSettings() {
        const editable = {};
        
        // Extract editable shader uniforms
        editable.shaderUniforms = {};
        Object.entries(this.config.shaderUniforms).forEach(([key, setting]) => {
            if (setting.editable) {
                editable.shaderUniforms[key] = { value: setting.value };
            }
        });

        // Add other user-configurable settings
        editable.development = { ...this.config.development };
        editable.performance = { ...this.config.performance };

        return editable;
    }

    /**
     * Merge saved config with default config
     * @param {Object} target - Target config object
     * @param {Object} source - Source config object
     */
    mergeConfig(target, source) {
        Object.keys(source).forEach(key => {
            if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                this.mergeConfig(target[key], source[key]);
            } else if (source[key] !== undefined) {
                target[key] = source[key];
            }
        });
    }

    /**
     * Reset all settings to defaults
     */
    resetToDefaults() {
        localStorage.removeItem('mountainViewer.settings');
        // Reload the page to get fresh defaults
        window.location.reload();
    }

    /**
     * Validate a configuration value
     * @param {string} path - Path to the setting
     * @param {*} value - Value to validate
     * @returns {boolean} True if valid
     */
    validateSetting(path, value) {
        const setting = this.getNestedValue(this.config, path);
        
        if (!setting || typeof setting !== 'object') {
            return true; // No validation rules defined
        }

        // Check min/max for numeric values
        if (typeof value === 'number' && setting.min !== undefined && value < setting.min) {
            return false;
        }
        if (typeof value === 'number' && setting.max !== undefined && value > setting.max) {
            return false;
        }

        // Check array length for color values
        if (Array.isArray(value) && Array.isArray(setting.value)) {
            if (value.length !== setting.value.length) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get all editable shader uniform configurations
     * @returns {Object} Editable shader uniforms
     */
    getEditableShaderUniforms() {
        const editable = {};
        Object.entries(this.config.shaderUniforms).forEach(([key, setting]) => {
            if (setting.editable) {
                editable[key] = setting;
            }
        });
        return editable;
    }

    /**
     * Export current configuration as JSON
     * @returns {string} JSON string of current config
     */
    exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Import configuration from JSON
     * @param {string} jsonConfig - JSON configuration string
     * @returns {boolean} True if successful
     */
    importConfig(jsonConfig) {
        try {
            const imported = JSON.parse(jsonConfig);
            this.mergeConfig(this.config, imported);
            this.saveSettings();
            return true;
        } catch (error) {
            console.error('Failed to import configuration:', error);
            return false;
        }
    }
}

// Create global config instance
window.AppConfig = AppConfig;
window.appConfig = new AppConfig();
