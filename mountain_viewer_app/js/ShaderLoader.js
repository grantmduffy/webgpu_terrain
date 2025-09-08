/**
 * ShaderLoader class handles loading and managing external shader files
 */
class ShaderLoader {
    constructor() {
        this.shaderCache = new Map();
        this.loadPromises = new Map();
    }

    /**
     * Load a shader file from the given path
     * @param {string} path - Path to the shader file
     * @returns {Promise<string>} - Promise that resolves to shader source code
     */
    async loadShader(path) {
        // Check cache first
        if (this.shaderCache.has(path)) {
            return this.shaderCache.get(path);
        }

        // Check if we're already loading this shader
        if (this.loadPromises.has(path)) {
            return this.loadPromises.get(path);
        }

        // Create load promise
        const loadPromise = this.fetchShader(path);
        this.loadPromises.set(path, loadPromise);

        try {
            const shaderSource = await loadPromise;
            this.shaderCache.set(path, shaderSource);
            this.loadPromises.delete(path);
            return shaderSource;
        } catch (error) {
            this.loadPromises.delete(path);
            throw error;
        }
    }

    /**
     * Fetch shader source from file
     * @param {string} path - Path to the shader file
     * @returns {Promise<string>} - Promise that resolves to shader source code
     */
    async fetchShader(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load shader: ${path} (${response.status})`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Error loading shader from ${path}:`, error);
            throw new Error(`Failed to load shader: ${path}`);
        }
    }

    /**
     * Load all shaders for the renderer
     * @returns {Promise<Object>} - Promise that resolves to shader sources object
     */
    async loadAllShaders() {
        const shaderPaths = {
            sun_vs: 'shaders/vertex/sun.vert',
            sun_fs: 'shaders/fragment/sun.frag',
            camera_vs: 'shaders/vertex/camera.vert',
            camera_fs: 'shaders/fragment/camera.frag',
            wall_vs: 'shaders/vertex/wall.vert',
            wall_fs: 'shaders/fragment/wall.frag',
            wall_sun_vs: 'shaders/vertex/wall_sun.vert',
            wall_sun_fs: 'shaders/fragment/wall_sun.frag'
        };

        try {
            const shaderPromises = Object.entries(shaderPaths).map(async ([key, path]) => {
                const source = await this.loadShader(path);
                return [key, source];
            });

            const shaderEntries = await Promise.all(shaderPromises);
            const shaderSources = Object.fromEntries(shaderEntries);

            console.log('All shaders loaded successfully');
            return shaderSources;
        } catch (error) {
            console.error('Error loading shaders:', error);
            throw error;
        }
    }

    /**
     * Clear the shader cache
     */
    clearCache() {
        this.shaderCache.clear();
        this.loadPromises.clear();
    }

    /**
     * Reload a specific shader (useful for development)
     * @param {string} path - Path to the shader file
     * @returns {Promise<string>} - Promise that resolves to shader source code
     */
    async reloadShader(path) {
        this.shaderCache.delete(path);
        this.loadPromises.delete(path);
        return this.loadShader(path);
    }

    /**
     * Get cached shader source (synchronous)
     * @param {string} path - Path to the shader file
     * @returns {string|null} - Cached shader source or null if not cached
     */
    getCachedShader(path) {
        return this.shaderCache.get(path) || null;
    }

    /**
     * Check if a shader is cached
     * @param {string} path - Path to the shader file
     * @returns {boolean} - True if shader is cached
     */
    isShaderCached(path) {
        return this.shaderCache.has(path);
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache statistics
     */
    getCacheStats() {
        return {
            cachedShaders: this.shaderCache.size,
            loadingShaders: this.loadPromises.size,
            cachedPaths: Array.from(this.shaderCache.keys())
        };
    }
}

// Make ShaderLoader available globally
window.ShaderLoader = ShaderLoader;
