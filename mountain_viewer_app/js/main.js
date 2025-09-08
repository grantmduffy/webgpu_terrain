/**
 * Application entry point
 * This file initializes the Mountain Viewer application
 */

// Global app instance
let app = null;

/**
 * Initialize the application when the page loads
 */
function init() {
    app = new App();
    app.init().catch(error => {
        console.error('Failed to start application:', error);
    });
}

// Make init function available globally for the HTML onload attribute
window.init = init;

// Also make the app instance available globally for debugging
window.app = app;

// Auto-start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
