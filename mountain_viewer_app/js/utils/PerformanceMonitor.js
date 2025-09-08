/**
 * Performance Monitoring and Optimization System
 * Provides performance tracking, adaptive quality, and resource management
 */
class PerformanceMonitor {
    constructor() {
        this.isEnabled = window.appConfig?.get('performance.enablePerformanceMonitoring') || false;
        this.maxFPS = window.appConfig?.get('performance.maxFPS') || 60;
        this.adaptiveQuality = window.appConfig?.get('performance.adaptiveQuality') || true;
        this.memoryThreshold = window.appConfig?.get('performance.memoryThreshold') || 0.8;
        
        // Performance metrics
        this.metrics = {
            fps: 0,
            frameTime: 0,
            memoryUsage: 0,
            gpuMemoryUsage: 0,
            renderTime: 0,
            loadTime: 0,
            qualityLevel: 1.0
        };

        // Frame timing
        this.frameCount = 0;
        this.lastFrameTime = performance.now();
        this.frameTimes = [];
        this.maxFrameHistory = 60; // Keep 1 second of frame data at 60fps

        // Quality levels
        this.qualityLevels = {
            LOW: 0.5,
            MEDIUM: 0.75,
            HIGH: 1.0,
            ULTRA: 1.25
        };

        // Performance thresholds
        this.thresholds = {
            targetFPS: 30,
            lowFPSThreshold: 20,
            highMemoryThreshold: 0.8,
            criticalMemoryThreshold: 0.9
        };

        // Lazy loading state
        this.lazyLoadQueue = [];
        this.isProcessingQueue = false;
        this.loadingStates = new Map();

        // Initialize if enabled
        if (this.isEnabled) {
            this.initialize();
        }
    }

    /**
     * Initialize performance monitoring
     */
    initialize() {
        this.setupPerformanceObserver();
        this.startMonitoring();
        this.setupMemoryMonitoring();
        logger.info('Performance monitoring initialized');
    }

    /**
     * Setup Performance Observer for detailed metrics
     */
    setupPerformanceObserver() {
        if ('PerformanceObserver' in window) {
            // Monitor navigation timing
            const navObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'navigation') {
                        this.metrics.loadTime = entry.loadEventEnd - entry.loadEventStart;
                        logger.debug('Page load time', { loadTime: this.metrics.loadTime });
                    }
                }
            });
            navObserver.observe({ entryTypes: ['navigation'] });

            // Monitor resource loading
            const resourceObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.name.includes('.vert') || entry.name.includes('.frag')) {
                        logger.debug('Shader load time', {
                            name: entry.name,
                            duration: entry.duration
                        });
                    }
                }
            });
            resourceObserver.observe({ entryTypes: ['resource'] });
        }
    }

    /**
     * Start continuous performance monitoring
     */
    startMonitoring() {
        const monitor = () => {
            if (!this.isEnabled) return;

            this.updateFPS();
            this.updateMemoryUsage();
            this.checkPerformanceThresholds();
            
            if (this.adaptiveQuality) {
                this.adjustQuality();
            }

            // Continue monitoring
            requestAnimationFrame(monitor);
        };

        requestAnimationFrame(monitor);
    }

    /**
     * Update FPS calculations
     */
    updateFPS() {
        const now = performance.now();
        const deltaTime = now - this.lastFrameTime;
        
        this.frameTimes.push(deltaTime);
        if (this.frameTimes.length > this.maxFrameHistory) {
            this.frameTimes.shift();
        }

        // Calculate average FPS over recent frames
        const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        this.metrics.fps = 1000 / avgFrameTime;
        this.metrics.frameTime = avgFrameTime;

        this.lastFrameTime = now;
        this.frameCount++;
    }

    /**
     * Update memory usage metrics
     */
    updateMemoryUsage() {
        if ('memory' in performance) {
            const memory = performance.memory;
            this.metrics.memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
        }

        // Estimate GPU memory usage (rough approximation)
        const canvas = document.getElementById('gl-canvas');
        if (canvas) {
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    // This is a rough estimate - actual GPU memory is hard to measure
                    const pixelCount = canvas.width * canvas.height;
                    const estimatedGPUMemory = pixelCount * 4 * 3; // Rough estimate for framebuffers
                    this.metrics.gpuMemoryUsage = estimatedGPUMemory / (1024 * 1024 * 1024); // Convert to GB
                }
            }
        }
    }

    /**
     * Setup memory monitoring with warnings
     */
    setupMemoryMonitoring() {
        if ('memory' in performance) {
            setInterval(() => {
                const memoryRatio = this.metrics.memoryUsage;
                
                if (memoryRatio > this.thresholds.criticalMemoryThreshold) {
                    logger.warn('Critical memory usage detected', {
                        usage: `${(memoryRatio * 100).toFixed(1)}%`,
                        recommendation: 'Consider reducing quality or reloading the page'
                    });
                    this.handleCriticalMemory();
                } else if (memoryRatio > this.thresholds.highMemoryThreshold) {
                    logger.warn('High memory usage detected', {
                        usage: `${(memoryRatio * 100).toFixed(1)}%`
                    });
                }
            }, 5000); // Check every 5 seconds
        }
    }

    /**
     * Check performance thresholds and take action
     */
    checkPerformanceThresholds() {
        // Check FPS
        if (this.metrics.fps < this.thresholds.lowFPSThreshold) {
            logger.warn('Low FPS detected', {
                currentFPS: this.metrics.fps.toFixed(1),
                targetFPS: this.thresholds.targetFPS
            });
        }

        // Check frame time consistency
        if (this.frameTimes.length > 10) {
            const frameTimeVariance = this.calculateVariance(this.frameTimes);
            if (frameTimeVariance > 100) { // High variance indicates stuttering
                logger.warn('Frame time inconsistency detected', {
                    variance: frameTimeVariance.toFixed(2)
                });
            }
        }
    }

    /**
     * Adjust quality based on performance
     */
    adjustQuality() {
        const currentFPS = this.metrics.fps;
        const targetFPS = this.thresholds.targetFPS;
        
        if (currentFPS < targetFPS * 0.8) {
            // Reduce quality
            this.metrics.qualityLevel = Math.max(0.5, this.metrics.qualityLevel - 0.1);
            this.applyQualitySettings();
            logger.info('Quality reduced due to low FPS', {
                newQuality: this.metrics.qualityLevel,
                currentFPS: currentFPS.toFixed(1)
            });
        } else if (currentFPS > targetFPS * 1.2 && this.metrics.qualityLevel < 1.0) {
            // Increase quality
            this.metrics.qualityLevel = Math.min(1.0, this.metrics.qualityLevel + 0.05);
            this.applyQualitySettings();
            logger.info('Quality increased due to good FPS', {
                newQuality: this.metrics.qualityLevel,
                currentFPS: currentFPS.toFixed(1)
            });
        }
    }

    /**
     * Apply quality settings to the renderer
     */
    applyQualitySettings() {
        const quality = this.metrics.qualityLevel;
        
        // Adjust mesh resolution
        const baseResolution = window.appConfig?.get('rendering.meshResolution') || { width: 256, height: 256 };
        const newResolution = {
            width: Math.floor(baseResolution.width * quality),
            height: Math.floor(baseResolution.height * quality)
        };

        // Adjust shadow resolution
        const baseSunRes = window.appConfig?.get('rendering.sunResolution') || 512;
        const newSunRes = Math.floor(baseSunRes * quality);

        // Apply settings if renderer is available
        if (window.app && window.app.renderer) {
            // These would need to be implemented in the renderer
            logger.debug('Applying quality settings', {
                meshResolution: newResolution,
                shadowResolution: newSunRes,
                qualityLevel: quality
            });
        }
    }

    /**
     * Handle critical memory situation
     */
    handleCriticalMemory() {
        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }

        // Reduce quality to minimum
        this.metrics.qualityLevel = 0.5;
        this.applyQualitySettings();

        // Clear caches
        if (window.app && window.app.renderer && window.app.renderer.shaderLoader) {
            window.app.renderer.shaderLoader.clearCache();
        }

        logger.error('Critical memory usage - applied emergency optimizations');
    }

    /**
     * Add item to lazy loading queue
     * @param {Function} loadFunction - Function to execute for loading
     * @param {string} id - Unique identifier for the item
     * @param {number} priority - Priority level (higher = more important)
     */
    addToLazyLoadQueue(loadFunction, id, priority = 0) {
        this.lazyLoadQueue.push({
            loadFunction,
            id,
            priority,
            timestamp: Date.now()
        });

        // Sort by priority
        this.lazyLoadQueue.sort((a, b) => b.priority - a.priority);

        // Process queue if not already processing
        if (!this.isProcessingQueue) {
            this.processLazyLoadQueue();
        }
    }

    /**
     * Process lazy loading queue
     */
    async processLazyLoadQueue() {
        if (this.isProcessingQueue || this.lazyLoadQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.lazyLoadQueue.length > 0) {
            // Check if we should pause processing due to performance
            if (this.metrics.fps < this.thresholds.lowFPSThreshold) {
                await this.waitForBetterPerformance();
            }

            const item = this.lazyLoadQueue.shift();
            this.loadingStates.set(item.id, 'loading');

            try {
                const timer = logger.startTimer(`Lazy load: ${item.id}`);
                await item.loadFunction();
                timer();
                
                this.loadingStates.set(item.id, 'loaded');
                logger.debug('Lazy loaded item', { id: item.id });
            } catch (error) {
                this.loadingStates.set(item.id, 'error');
                logger.error('Failed to lazy load item', { id: item.id, error });
            }

            // Small delay to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 16)); // ~1 frame at 60fps
        }

        this.isProcessingQueue = false;
    }

    /**
     * Wait for better performance before continuing
     */
    async waitForBetterPerformance() {
        return new Promise(resolve => {
            const checkPerformance = () => {
                if (this.metrics.fps >= this.thresholds.targetFPS) {
                    resolve();
                } else {
                    setTimeout(checkPerformance, 100);
                }
            };
            checkPerformance();
        });
    }

    /**
     * Show loading state indicator
     * @param {string} message - Loading message
     */
    showLoadingState(message) {
        let indicator = document.getElementById('performance-loading-indicator');
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'performance-loading-indicator';
            indicator.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 9999;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            document.body.appendChild(indicator);
        }

        indicator.innerHTML = `
            <div class="spinner" style="
                width: 16px;
                height: 16px;
                border: 2px solid #333;
                border-top: 2px solid #fff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            ${message}
        `;

        // Add CSS animation if not already added
        if (!document.getElementById('performance-spinner-style')) {
            const style = document.createElement('style');
            style.id = 'performance-spinner-style';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Hide loading state indicator
     */
    hideLoadingState() {
        const indicator = document.getElementById('performance-loading-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Calculate variance of an array of numbers
     * @param {Array<number>} values - Array of numbers
     * @returns {number} Variance
     */
    calculateVariance(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }

    /**
     * Get current performance metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Get performance report
     * @returns {Object} Detailed performance report
     */
    getPerformanceReport() {
        return {
            metrics: this.getMetrics(),
            thresholds: this.thresholds,
            qualityLevel: this.metrics.qualityLevel,
            frameHistory: [...this.frameTimes],
            loadingStates: Object.fromEntries(this.loadingStates),
            queueLength: this.lazyLoadQueue.length,
            isAdaptiveQualityEnabled: this.adaptiveQuality
        };
    }

    /**
     * Enable performance monitoring
     */
    enable() {
        this.isEnabled = true;
        this.initialize();
        logger.info('Performance monitoring enabled');
    }

    /**
     * Disable performance monitoring
     */
    disable() {
        this.isEnabled = false;
        logger.info('Performance monitoring disabled');
    }

    /**
     * Reset performance metrics
     */
    reset() {
        this.frameCount = 0;
        this.frameTimes = [];
        this.metrics.qualityLevel = 1.0;
        this.loadingStates.clear();
        this.lazyLoadQueue = [];
        logger.info('Performance metrics reset');
    }
}

// Create global performance monitor instance
window.PerformanceMonitor = PerformanceMonitor;
window.performanceMonitor = new PerformanceMonitor();
