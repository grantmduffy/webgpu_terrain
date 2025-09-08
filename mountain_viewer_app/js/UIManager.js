class UIManager {
    constructor(app) {
        this.app = app;
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Model dropdown handlers - map text content to file paths
        const modelMap = {
            'Mount Rainier': 'assets/rainier.gmd',
            'Mount St. Helens': 'assets/st_helens.gmd',
            'Zion Canyon': 'assets/zion.gmd',
            'The Enchantments': 'assets/enchantments.gmd',
            'Denali': 'assets/denali.gmd',
            'Grand Teton': 'assets/grand_teton.gmd',
            'Half Dome': 'assets/half_dome.gmd'
        };

        const modelLinks = document.querySelectorAll('.dropdown-item');
        modelLinks.forEach(link => {
            const modelName = link.textContent.trim();
            if (modelMap[modelName]) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.app.getDataLoader().loadFromUrl(modelMap[modelName], modelName);
                });
            }
        });

        // File input handler
        const fileSelector = document.getElementById('file-selector');
        if (fileSelector) {
            fileSelector.addEventListener('change', (event) => {
                this.app.getDataLoader().loadFromFile(event);
            });
        }

        // Render button handler
        const renderButton = document.getElementById('render');
        if (renderButton) {
            renderButton.addEventListener('click', () => {
                this.app.getRenderer().downloadRender();
            });
        }

        // Settings modal handlers
        const settingsResetBtn = document.querySelector('#settings_modal .btn-secondary');
        if (settingsResetBtn) {
            settingsResetBtn.addEventListener('click', () => {
                this.app.getRenderer().resetToDefaults();
            });
        }

        // Map modal handlers
        const mapResetBtn = document.querySelector('#map_modal .btn-secondary');
        if (mapResetBtn) {
            mapResetBtn.addEventListener('click', () => {
                this.app.getRenderer().resetToDefaults();
            });
        }

        // Background color picker
        const bgColorPicker = document.getElementById('background_color');
        if (bgColorPicker) {
            bgColorPicker.addEventListener('input', () => {
                this.app.getRenderer().updateBackgroundColor(bgColorPicker.value);
            });
        }

        // Uniform inputs
        const uniformInputs = document.getElementsByClassName('uniform-input');
        for (let i = 0; i < uniformInputs.length; i++) {
            uniformInputs[i].addEventListener('pointerdown', this.hideModal.bind(this));
            uniformInputs[i].addEventListener('pointerup', this.showModal.bind(this));
        }
    }

    hideModal() {
        const backdrop = document.getElementsByClassName('modal-backdrop')[0];
        const content = document.getElementsByClassName('modal-content')[0];
        if (backdrop) backdrop.hidden = true;
        if (content) {
            content.style.setProperty('opacity', '30%', 'important');
            content.style.setProperty('backdrop-filter', 'unset', 'important');
        }
    }

    showModal() {
        const backdrop = document.getElementsByClassName('modal-backdrop')[0];
        const content = document.getElementsByClassName('modal-content')[0];
        if (backdrop) backdrop.hidden = false;
        if (content) {
            content.style.setProperty('opacity', null);
            content.style.setProperty('backdrop-filter', null);
        }
    }

    showLoading(item) {
        const spinner = document.getElementById('loading-spinner');
        const status = document.getElementById('loading-status');
        if (status) status.innerText = 'Loading ' + item;
        if (spinner) spinner.style.display = 'unset';
        if (status) status.style.display = 'unset';
    }

    hideLoading() {
        const spinner = document.getElementById('loading-spinner');
        const status = document.getElementById('loading-status');
        if (spinner) spinner.style.display = 'none';
        if (status) status.style.display = 'none';
    }

    updateModelName(name) {
        const nameEl = document.getElementById('model_name');
        if (nameEl) nameEl.innerText = name;
    }

    showStatusMessage(message, type) {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `status-message ${type}`;
            statusEl.style.display = 'block';
        }
    }
}
