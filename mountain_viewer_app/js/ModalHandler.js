/**
 * Custom Modal Handler - Replaces Bootstrap modal functionality
 */
class ModalHandler {
    constructor() {
        this.activeModal = null;
        this.backdrop = null;
        this.init();
    }

    init() {
        // Handle modal triggers
        document.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-toggle="modal"]');
            if (trigger) {
                e.preventDefault();
                const targetId = trigger.getAttribute('data-target');
                if (targetId) {
                    this.show(targetId);
                }
            }

            // Handle close buttons
            const closeBtn = e.target.closest('[data-dismiss="modal"]');
            if (closeBtn) {
                e.preventDefault();
                this.hide();
            }

            // Handle backdrop clicks
            if (e.target.classList.contains('modal-backdrop')) {
                this.hide();
            }
        });

        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModal) {
                this.hide();
            }
        });

        // Handle dropdown toggles
        document.addEventListener('click', (e) => {
            const dropdownToggle = e.target.closest('[data-bs-toggle="dropdown"]');
            if (dropdownToggle) {
                e.preventDefault();
                this.toggleDropdown(dropdownToggle);
            }

            // Close dropdowns when clicking outside
            if (!e.target.closest('.dropdown')) {
                this.closeAllDropdowns();
            }
        });
    }

    show(modalId) {
        const modal = document.querySelector(modalId);
        if (!modal) return;

        // Create backdrop
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'modal-backdrop fade';
        document.body.appendChild(this.backdrop);

        // Show modal
        modal.style.display = 'block';
        modal.classList.add('show');
        
        // Trigger backdrop fade in
        setTimeout(() => {
            this.backdrop.classList.add('show');
        }, 10);

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        
        this.activeModal = modal;

        // Focus management
        modal.setAttribute('tabindex', '-1');
        modal.focus();
    }

    hide() {
        if (!this.activeModal) return;

        // Hide modal
        this.activeModal.classList.remove('show');
        
        // Hide backdrop
        if (this.backdrop) {
            this.backdrop.classList.remove('show');
        }

        // Clean up after animation
        setTimeout(() => {
            if (this.activeModal) {
                this.activeModal.style.display = 'none';
            }
            if (this.backdrop) {
                this.backdrop.remove();
                this.backdrop = null;
            }
            
            // Restore body scroll
            document.body.style.overflow = '';
            
            this.activeModal = null;
        }, 150); // Match CSS transition duration
    }

    toggleDropdown(toggle) {
        const dropdown = toggle.closest('.dropdown');
        const menu = dropdown.querySelector('.dropdown-menu');
        
        if (!menu) return;

        // Close other dropdowns
        this.closeAllDropdowns(dropdown);

        // Toggle current dropdown
        const isOpen = menu.classList.contains('show');
        if (isOpen) {
            menu.classList.remove('show');
            toggle.setAttribute('aria-expanded', 'false');
        } else {
            menu.classList.add('show');
            toggle.setAttribute('aria-expanded', 'true');
        }
    }

    closeAllDropdowns(except = null) {
        const dropdowns = document.querySelectorAll('.dropdown-menu.show');
        dropdowns.forEach(menu => {
            const dropdown = menu.closest('.dropdown');
            if (dropdown !== except) {
                menu.classList.remove('show');
                const toggle = dropdown.querySelector('[data-bs-toggle="dropdown"]');
                if (toggle) {
                    toggle.setAttribute('aria-expanded', 'false');
                }
            }
        });
    }

    // Static methods for programmatic access
    static show(modalId) {
        if (window.modalHandler) {
            window.modalHandler.show(modalId);
        }
    }

    static hide() {
        if (window.modalHandler) {
            window.modalHandler.hide();
        }
    }
}

// Initialize modal handler when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.modalHandler = new ModalHandler();
    });
} else {
    window.modalHandler = new ModalHandler();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModalHandler;
}
