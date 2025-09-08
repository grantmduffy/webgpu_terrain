/**
 * InputHandler class manages all user input (mouse, touch, keyboard)
 */
class InputHandler {
    constructor() {
        this.renderer = null;
        
        // Mouse/touch state
        this.mouseDownPos = [0, 0];
        this.mousePos = [0, 0];
        this.mouseIsDown = false;
        this.lastDistance = null;
        
        // Bound event handlers
        this.boundHandlers = {
            mouseDown: this.handleMouseDown.bind(this),
            mouseMove: this.handleMouseMove.bind(this),
            mouseUp: this.handleMouseUp.bind(this),
            mouseOut: this.handleMouseUp.bind(this),
            mouseLeave: this.handleMouseMove.bind(this),
            wheel: this.handleWheel.bind(this),
            touchStart: this.handleTouchStart.bind(this),
            touchMove: this.handleTouchMove.bind(this),
            touchEnd: this.handleTouchEnd.bind(this)
        };
    }

    /**
     * Initialize input handling
     * @param {Renderer} renderer - The renderer instance
     */
    init(renderer) {
        this.renderer = renderer;
        this.attachEventListeners();
        console.log('InputHandler initialized');
    }

    /**
     * Attach event listeners to the canvas
     */
    attachEventListeners() {
        const canvas = this.renderer.canvas;
        
        // Mouse events
        canvas.addEventListener('mousedown', this.boundHandlers.mouseDown);
        canvas.addEventListener('mousemove', this.boundHandlers.mouseMove);
        canvas.addEventListener('mouseup', this.boundHandlers.mouseUp);
        canvas.addEventListener('mouseout', this.boundHandlers.mouseOut);
        canvas.addEventListener('mouseleave', this.boundHandlers.mouseLeave);
        canvas.addEventListener('wheel', this.boundHandlers.wheel);
        
        // Touch events
        canvas.addEventListener('touchstart', this.boundHandlers.touchStart);
        canvas.addEventListener('touchmove', this.boundHandlers.touchMove);
        canvas.addEventListener('touchend', this.boundHandlers.touchEnd);
        
        // Prevent context menu
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /**
     * Remove event listeners
     */
    detachEventListeners() {
        const canvas = this.renderer.canvas;
        
        // Mouse events
        canvas.removeEventListener('mousedown', this.boundHandlers.mouseDown);
        canvas.removeEventListener('mousemove', this.boundHandlers.mouseMove);
        canvas.removeEventListener('mouseup', this.boundHandlers.mouseUp);
        canvas.removeEventListener('mouseout', this.boundHandlers.mouseOut);
        canvas.removeEventListener('mouseleave', this.boundHandlers.mouseLeave);
        canvas.removeEventListener('wheel', this.boundHandlers.wheel);
        
        // Touch events
        canvas.removeEventListener('touchstart', this.boundHandlers.touchStart);
        canvas.removeEventListener('touchmove', this.boundHandlers.touchMove);
        canvas.removeEventListener('touchend', this.boundHandlers.touchEnd);
    }

    /**
     * Get normalized event coordinates and distance for touch
     * @param {Event} event - The input event
     * @returns {Array} [x, y, distance]
     */
    getEventCoordinates(event) {
        if (!this.renderer.gl) return [-1, -1, 0];

        let eventX, eventY;
        let distance = null;

        if (event.type.startsWith('mouse')) {
            eventX = event.offsetX / this.renderer.gl.canvas.width;
            eventY = event.offsetY / this.renderer.gl.canvas.height;
        } else {
            // Touch event
            if (event.touches.length === 2) {
                // Two-finger touch for pinch-to-zoom
                const [x1, y1] = [event.touches[0].clientX, event.touches[0].clientY];
                const [x2, y2] = [event.touches[1].clientX, event.touches[1].clientY];
                distance = Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
                eventX = 0.5 * (x1 + x2) / this.renderer.gl.canvas.width;
                eventY = 0.5 * (y1 + y2) / this.renderer.gl.canvas.height;
            } else {
                eventX = event.touches[0].clientX / this.renderer.gl.canvas.width;
                eventY = event.touches[0].clientY / this.renderer.gl.canvas.height;
            }
        }

        return [eventX, eventY, distance];
    }

    /**
     * Handle mouse down events
     * @param {MouseEvent} event
     */
    handleMouseDown(event) {
        const [eventX, eventY, distance] = this.getEventCoordinates(event);
        this.mouseIsDown = true;
        this.mouseDownPos[0] = eventX;
        this.mouseDownPos[1] = event.srcElement.height - eventY;
        this.lastDistance = distance;
        
        // Also trigger mouse move to update position immediately
        this.handleMouseMove(event);
    }

    /**
     * Handle mouse move events
     * @param {MouseEvent} event
     */
    handleMouseMove(event) {
        const [eventX, eventY, distance] = this.getEventCoordinates(event);
        
        if (uniforms && 'mouse' in uniforms && this.mouseIsDown) {
            const newX = eventX - this.mouseDownPos[0] + this.mousePos[0];
            const newY = (event.srcElement.height - eventY) - this.mouseDownPos[1] + this.mousePos[1];
            this.renderer.updateMousePosition(newX, newY);
        }

        // Handle pinch-to-zoom for touch
        if (distance !== null && this.lastDistance !== null) {
            const zoomDelta = 0.5 * (distance - this.lastDistance);
            this.renderer.updateZoom(zoomDelta);
        }
        this.lastDistance = distance;
    }

    /**
     * Handle mouse up events
     * @param {MouseEvent} event
     */
    handleMouseUp(event) {
        this.mouseIsDown = false;
        if (uniforms && 'mouse' in uniforms) {
            this.mousePos[0] = uniforms['mouse'].value[0];
            this.mousePos[1] = uniforms['mouse'].value[1];
        }
        this.lastDistance = null;
    }

    /**
     * Handle mouse wheel events
     * @param {WheelEvent} event
     */
    handleWheel(event) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -10 : 10; // Invert for natural scrolling
        this.renderer.updateZoom(delta);
    }

    /**
     * Handle touch start events
     * @param {TouchEvent} event
     */
    handleTouchStart(event) {
        event.preventDefault();
        const [eventX, eventY, distance] = this.getEventCoordinates(event);
        this.mouseIsDown = true;
        this.mouseDownPos[0] = eventX;
        this.mouseDownPos[1] = event.srcElement.height - eventY;
        this.lastDistance = distance;
        
        // Also trigger touch move to update position immediately
        this.handleTouchMove(event);
    }

    /**
     * Handle touch move events
     * @param {TouchEvent} event
     */
    handleTouchMove(event) {
        event.preventDefault();
        const [eventX, eventY, distance] = this.getEventCoordinates(event);
        
        if (uniforms && 'mouse' in uniforms && this.mouseIsDown) {
            const newX = eventX - this.mouseDownPos[0] + this.mousePos[0];
            const newY = (event.srcElement.height - eventY) - this.mouseDownPos[1] + this.mousePos[1];
            this.renderer.updateMousePosition(newX, newY);
        }

        // Handle pinch-to-zoom
        if (distance !== null && this.lastDistance !== null) {
            const zoomDelta = 0.5 * (distance - this.lastDistance);
            this.renderer.updateZoom(zoomDelta);
        }
        this.lastDistance = distance;
    }

    /**
     * Handle touch end events
     * @param {TouchEvent} event
     */
    handleTouchEnd(event) {
        event.preventDefault();
        this.mouseIsDown = false;
        if (uniforms && 'mouse' in uniforms) {
            this.mousePos[0] = uniforms['mouse'].value[0];
            this.mousePos[1] = uniforms['mouse'].value[1];
        }
        this.lastDistance = null;
    }

    /**
     * Reset input state
     */
    reset() {
        this.mouseDownPos = [0, 0];
        this.mousePos = [0, 0];
        this.mouseIsDown = false;
        this.lastDistance = null;
    }

    /**
     * Get current mouse position
     * @returns {Array} [x, y]
     */
    getMousePosition() {
        return [this.mousePos[0], this.mousePos[1]];
    }

    /**
     * Check if mouse is currently down
     * @returns {boolean}
     */
    isMouseDown() {
        return this.mouseIsDown;
    }
}

// Make InputHandler available globally
window.InputHandler = InputHandler;
