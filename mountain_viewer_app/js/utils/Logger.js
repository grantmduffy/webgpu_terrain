/**
 * Centralized Logging System
 * Provides structured logging with different levels and optional remote reporting
 */
class Logger {
    constructor() {
        this.logLevel = this.getLogLevel();
        this.logHistory = [];
        this.maxHistorySize = 1000;
        this.remoteLoggingEnabled = false;
        this.remoteEndpoint = null;
        
        // Log levels in order of severity
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };

        // Initialize error boundary
        this.setupGlobalErrorHandling();
    }

    /**
     * Get current log level from config
     * @returns {number} Current log level
     */
    getLogLevel() {
        const configLevel = window.appConfig?.get('development.logLevel') || 'info';
        return this.levels[configLevel.toUpperCase()] || this.levels.INFO;
    }

    /**
     * Setup global error handling
     */
    setupGlobalErrorHandling() {
        // Handle uncaught errors
        window.addEventListener('error', (event) => {
            this.error('Uncaught Error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error?.stack
            });
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.error('Unhandled Promise Rejection', {
                reason: event.reason,
                stack: event.reason?.stack
            });
        });

        // Handle WebGL context lost
        const canvas = document.getElementById('gl-canvas');
        if (canvas) {
            canvas.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                this.error('WebGL Context Lost', {
                    statusMessage: event.statusMessage || 'Unknown reason'
                });
            });

            canvas.addEventListener('webglcontextrestored', () => {
                this.info('WebGL Context Restored');
            });
        }
    }

    /**
     * Log a debug message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    debug(message, data = {}) {
        this.log('DEBUG', message, data);
    }

    /**
     * Log an info message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    info(message, data = {}) {
        this.log('INFO', message, data);
    }

    /**
     * Log a warning message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    warn(message, data = {}) {
        this.log('WARN', message, data);
    }

    /**
     * Log an error message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    error(message, data = {}) {
        this.log('ERROR', message, data);
    }

    /**
     * Core logging method
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    log(level, message, data = {}) {
        const levelNum = this.levels[level];
        
        // Check if we should log this level
        if (levelNum < this.logLevel) {
            return;
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data,
            url: window.location.href,
            userAgent: navigator.userAgent
        };

        // Add to history
        this.addToHistory(logEntry);

        // Console output with styling
        this.outputToConsole(logEntry);

        // Send to remote endpoint if enabled
        if (this.remoteLoggingEnabled && levelNum >= this.levels.WARN) {
            this.sendToRemote(logEntry);
        }

        // Show user notification for errors
        if (level === 'ERROR') {
            this.showUserNotification(message, data);
        }
    }

    /**
     * Add log entry to history
     * @param {Object} logEntry - Log entry object
     */
    addToHistory(logEntry) {
        this.logHistory.push(logEntry);
        
        // Trim history if too large
        if (this.logHistory.length > this.maxHistorySize) {
            this.logHistory = this.logHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Output log entry to console with styling
     * @param {Object} logEntry - Log entry object
     */
    outputToConsole(logEntry) {
        const { level, message, data, timestamp } = logEntry;
        const timeStr = new Date(timestamp).toLocaleTimeString();
        
        const styles = {
            DEBUG: 'color: #888; font-weight: normal;',
            INFO: 'color: #2196F3; font-weight: normal;',
            WARN: 'color: #FF9800; font-weight: bold;',
            ERROR: 'color: #F44336; font-weight: bold;'
        };

        const hasData = Object.keys(data).length > 0;
        
        if (hasData) {
            console.groupCollapsed(
                `%c[${level}] ${timeStr} - ${message}`,
                styles[level]
            );
            console.log('Data:', data);
            console.groupEnd();
        } else {
            console.log(
                `%c[${level}] ${timeStr} - ${message}`,
                styles[level]
            );
        }
    }

    /**
     * Send log entry to remote endpoint
     * @param {Object} logEntry - Log entry object
     */
    async sendToRemote(logEntry) {
        if (!this.remoteEndpoint) return;

        try {
            await fetch(this.remoteEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(logEntry)
            });
        } catch (error) {
            // Don't log this error to avoid infinite loops
            console.warn('Failed to send log to remote endpoint:', error);
        }
    }

    /**
     * Show user-friendly error notification
     * @param {string} message - Error message
     * @param {Object} data - Error data
     */
    showUserNotification(message, data) {
        // Create or update error notification
        let notification = document.getElementById('error-notification');
        
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'error-notification';
            notification.className = 'error-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #f44336;
                color: white;
                padding: 16px;
                border-radius: 4px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                z-index: 10000;
                max-width: 400px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                line-height: 1.4;
            `;
            document.body.appendChild(notification);
        }

        // Create user-friendly message
        const userMessage = this.createUserFriendlyMessage(message, data);
        notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">Something went wrong</div>
            <div>${userMessage}</div>
            <button onclick="this.parentElement.remove()" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                padding: 4px 8px;
                border-radius: 2px;
                cursor: pointer;
                margin-top: 8px;
                float: right;
            ">Dismiss</button>
        `;

        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
    }

    /**
     * Create user-friendly error message
     * @param {string} message - Technical error message
     * @param {Object} data - Error data
     * @returns {string} User-friendly message
     */
    createUserFriendlyMessage(message, data) {
        // Map technical errors to user-friendly messages
        const errorMappings = {
            'Failed to load shader': 'There was a problem loading the 3D graphics. Please refresh the page.',
            'WebGL Context Lost': 'The 3D graphics system encountered an issue. Please refresh the page.',
            'Shader compilation error': 'There was a problem with the 3D graphics. Please refresh the page.',
            'Failed to load': 'Failed to load a required file. Please check your internet connection.',
            'Network error': 'Network connection issue. Please check your internet connection.',
            'Out of memory': 'The application is using too much memory. Please close other tabs and refresh.',
            'Uncaught Error': 'An unexpected error occurred. Please refresh the page.'
        };

        // Find matching error mapping
        for (const [key, userMessage] of Object.entries(errorMappings)) {
            if (message.includes(key)) {
                return userMessage;
            }
        }

        // Default user-friendly message
        return 'An unexpected error occurred. Please refresh the page and try again.';
    }

    /**
     * Get recent log history
     * @param {number} count - Number of recent entries to return
     * @returns {Array} Recent log entries
     */
    getRecentLogs(count = 50) {
        return this.logHistory.slice(-count);
    }

    /**
     * Get logs by level
     * @param {string} level - Log level to filter by
     * @returns {Array} Filtered log entries
     */
    getLogsByLevel(level) {
        return this.logHistory.filter(entry => entry.level === level);
    }

    /**
     * Export logs as JSON
     * @returns {string} JSON string of all logs
     */
    exportLogs() {
        return JSON.stringify(this.logHistory, null, 2);
    }

    /**
     * Clear log history
     */
    clearHistory() {
        this.logHistory = [];
        this.info('Log history cleared');
    }

    /**
     * Enable remote logging
     * @param {string} endpoint - Remote logging endpoint URL
     */
    enableRemoteLogging(endpoint) {
        this.remoteLoggingEnabled = true;
        this.remoteEndpoint = endpoint;
        this.info('Remote logging enabled', { endpoint });
    }

    /**
     * Disable remote logging
     */
    disableRemoteLogging() {
        this.remoteLoggingEnabled = false;
        this.remoteEndpoint = null;
        this.info('Remote logging disabled');
    }

    /**
     * Log performance metrics
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in milliseconds
     * @param {Object} metadata - Additional metadata
     */
    logPerformance(operation, duration, metadata = {}) {
        this.debug('Performance', {
            operation,
            duration: `${duration.toFixed(2)}ms`,
            ...metadata
        });
    }

    /**
     * Create a performance timer
     * @param {string} operation - Operation name
     * @returns {Function} Function to call when operation completes
     */
    startTimer(operation) {
        const startTime = performance.now();
        return (metadata = {}) => {
            const duration = performance.now() - startTime;
            this.logPerformance(operation, duration, metadata);
            return duration;
        };
    }
}

// Create global logger instance
window.Logger = Logger;
window.logger = new Logger();
