/**
 * DataLoader class handles loading elevation data from various sources
 */
class DataLoader {
    constructor() {
        this.renderer = null;
        
        // Constants
        this.UINT16_MAX = Math.pow(2, 16) - 1;
        this.EARTH_RADIUS = 6378137;
        
        // Loading state
        this.isLoading = false;
        this.currentModelName = '';
    }

    /**
     * Initialize the data loader
     * @param {Renderer} renderer - The renderer instance
     */
    init(renderer) {
        this.renderer = renderer;
        console.log('DataLoader initialized');
    }

    /**
     * Show loading indicator
     * @param {string} item - Name of the item being loaded
     */
    showLoading(item) {
        this.isLoading = true;
        const spinner = document.getElementById('loading-spinner');
        const status = document.getElementById('loading-status');
        
        if (spinner && status) {
            status.innerText = 'Loading ' + item;
            spinner.style.display = 'unset';
            status.style.display = 'unset';
        }
    }

    /**
     * Hide loading indicator
     */
    hideLoading() {
        this.isLoading = false;
        const spinner = document.getElementById('loading-spinner');
        const status = document.getElementById('loading-status');
        
        if (spinner && status) {
            spinner.style.display = 'none';
            status.style.display = 'none';
        }
    }

    /**
     * Show loading failure alert
     * @param {string} name - Name of the failed item
     */
    showLoadingFailure(name) {
        alert('Failed to load ' + name);
        this.hideLoading();
    }

    /**
     * Load elevation data from a URL
     * @param {string} path - Path to the data file
     * @param {string} name - Display name for the data
     * @returns {Promise}
     */
    async loadFromUrl(path, name = null) {
        if (!name) name = path;
        
        this.showLoading(name);
        
        return new Promise((resolve, reject) => {
            const req = new XMLHttpRequest();
            req.open('GET', path);
            req.responseType = 'arraybuffer';
            
            req.onreadystatechange = () => {
                if (req.readyState === 4) {
                    if (req.status === 200) {
                        try {
                            this.loadBinaryData(req.response);
                            this.updateModelName(name);
                            resolve();
                        } catch (err) {
                            console.error('Error loading data:', err);
                            this.showLoadingFailure(name);
                            reject(err);
                        }
                    } else {
                        this.showLoadingFailure(name);
                        reject(new Error(`HTTP ${req.status}: ${req.statusText}`));
                    }
                }
            };
            
            req.send();
        });
    }

    /**
     * Load elevation data from a file
     * @param {Event} event - File input change event
     * @returns {Promise}
     */
    async loadFromFile(event) {
        const file = event.target.files[0];
        if (!file || !file.name) {
            return Promise.reject(new Error('No file selected'));
        }

        this.showLoading(file.name);

        return new Promise((resolve, reject) => {
            const fileReader = new FileReader();
            
            fileReader.addEventListener('load', (event) => {
                try {
                    this.loadBinaryData(event.target.result);
                    this.updateModelName(file.name);
                    resolve();
                } catch (err) {
                    console.error('Error loading file:', err);
                    this.showLoadingFailure(file.name);
                    reject(err);
                }
            });
            
            fileReader.addEventListener('error', () => {
                this.showLoadingFailure(file.name);
                reject(new Error('File reading failed'));
            });
            
            fileReader.readAsArrayBuffer(file);
        });
    }

    /**
     * Load elevation data from Google Drive
     * @param {string} fileName - Name of the file to load
     * @returns {Promise}
     */
    async loadFromDrive(fileName) {
        const apiKey = 'AIzaSyDIAL8K5XVHkqJVMW5VNhKObOA-jiSrauU';
        const folderId = '1O-ZEV1dMVXO9e7Z9e710VGhNSJu74MBs';

        return new Promise((resolve, reject) => {
            const initApiClient = () => {
                gapi.client.init({
                    apiKey: apiKey
                }).then(() => {
                    return gapi.client.load('drive', 'v3');
                }).then(() => {
                    fetchFileByName();
                }).catch((error) => {
                    console.error('Error initializing Google API client:', error);
                    reject(error);
                });
            };

            const fetchFileByName = () => {
                gapi.client.drive.files.list({
                    q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
                    fields: 'files(id, name)',
                }).then((response) => {
                    const files = response.result.files;
                    if (files && files.length > 0) {
                        const file = files[0];
                        console.log('File found:', file);
                        fetchBinaryFile(file.id);
                    } else {
                        console.log('No files found with the specified name.');
                        reject(new Error('File not found'));
                    }
                }).catch((error) => {
                    console.error('Error fetching file by name:', error);
                    reject(error);
                });
            };

            const fetchBinaryFile = (fileId) => {
                const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
                fetch(url).then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.blob();
                }).then(blob => {
                    blob.name = fileName;
                    const fakeEvent = { target: { files: [blob] } };
                    this.loadFromFile(fakeEvent).then(resolve).catch(reject);
                }).catch(error => {
                    console.error('Error fetching binary file:', error);
                    reject(error);
                });
            };

            gapi.load('client', initApiClient);
        });
    }

    /**
     * Load elevation data from GeoTIFF blob
     * @param {Blob} blob - GeoTIFF data blob
     * @returns {Promise}
     */
    async loadFromGeoTiff(blob) {
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
            const image = await tiff.getImage();
            const rasters = await image.readRasters();
            const elevationData = rasters[0];
            const bbox = image.getBoundingBox();
            
            // Calculate physical dimensions
            const physical_height = this.EARTH_RADIUS * (bbox[3] - bbox[1]) * Math.PI / 180;
            const physical_width = this.EARTH_RADIUS * Math.cos(0.5 * (bbox[1] + bbox[3]) * Math.PI / 180) * (bbox[2] - bbox[0]) * Math.PI / 180;
            const w = 100.0;
            const h = w * physical_height / physical_width;
            const scale = h / physical_height;
            
            // Find elevation range
            const maxElev = elevationData.reduce((max, current) => {
                return (current > max) ? current : max;
            }, -Infinity);
            const minElev = elevationData.reduce((min, current) => {
                return (current < min) ? current : min;
            }, Infinity);

            // Update uniforms
            uniforms['print_width'].value = w;
            uniforms['print_height'].value = h;
            uniforms['elev_range'].value = [minElev * scale, maxElev * scale];

            // Convert elevation data to RGBA texture format
            const img_data_rgba = new Float32Array(elevationData.length * 4);
            for (let i = 0; i < elevationData.length; i++) {
                img_data_rgba[i * 4] = elevationData[i] * scale;
                img_data_rgba[i * 4 + 3] = 1.0;
            }
            
            // Update corner matrix
            this.renderer.updateCorners(w, h);
            
            // Create texture
            create_texture(image.getWidth(), image.getHeight(), img_data_rgba, this.renderer.elevation_texture_offset);
            
            this.hideLoading();
            console.log(`GeoTIFF elevation data loaded (${image.getWidth()}x${image.getHeight()})`);
            
        } catch (error) {
            console.error('Error loading GeoTIFF:', error);
            this.showLoadingFailure('GeoTIFF data');
            throw error;
        }
    }

    /**
     * Load binary elevation data (GMD format)
     * @param {ArrayBuffer} buffer - Binary data buffer
     */
    loadBinaryData(buffer) {
        try {
            // Parse GMD format
            const shape = new Uint16Array(buffer.slice(0, 4));
            const range = new Float32Array(buffer.slice(4, 12));
            const size = new Float32Array(buffer.slice(12, 20));
            const img_data_compressed = new Uint8Array(buffer.slice(20));
            
            // Decompress data
            const img_data_decompressed = pako.inflate(img_data_compressed);
            const img_data = new Uint16Array(img_data_decompressed.buffer);
            
            // Convert to RGBA texture format
            const img_data_rgba = new Float32Array(img_data.length * 4);
            for (let i = 0; i < img_data.length; i++) {
                img_data_rgba[i * 4] = (range[1] - range[0]) * img_data[i] / (this.UINT16_MAX) + range[0];
                img_data_rgba[i * 4 + 3] = 1.0;
            }
            
            // Update uniforms
            uniforms['print_width'].value = size[0];
            uniforms['print_height'].value = size[1];
            uniforms['elev_range'].value = range;
            
            // Update corner matrix
            this.renderer.updateCorners(size[0], size[1]);
            
            // Create texture
            create_texture(shape[1], shape[0], img_data_rgba, this.renderer.elevation_texture_offset);
            
            this.hideLoading();
            console.log(`Binary elevation data loaded (${shape[0]}x${shape[1]})`);
            
        } catch (error) {
            console.error('Error processing binary data:', error);
            throw error;
        }
    }

    /**
     * Update the model name in the UI
     * @param {string} name - New model name
     */
    updateModelName(name) {
        this.currentModelName = name;
        const nameElement = document.getElementById('model_name');
        if (nameElement) {
            nameElement.innerText = name;
        }
    }

    /**
     * Get the current model name
     * @returns {string}
     */
    getCurrentModelName() {
        return this.currentModelName;
    }

    /**
     * Check if currently loading
     * @returns {boolean}
     */
    isCurrentlyLoading() {
        return this.isLoading;
    }

    /**
     * Load elevation data from OpenTopography API
     * @param {Object} params - API parameters
     * @returns {Promise}
     */
    async loadFromOpenTopo(params = {}) {
        const defaultParams = {
            dataset: 'SRTMGL3',
            south: 46.82872428833321,
            north: 46.875682778386675,
            west: -121.8003717439927,
            east: -121.72343693320035,
            apiKey: 'b5c5195df91a52cf4c7cc63bfebec8d8'
        };
        
        const finalParams = { ...defaultParams, ...params };
        
        try {
            const apiUrl = new URL('https://portal.opentopography.org/API/globaldem');
            apiUrl.searchParams.append('demtype', finalParams.dataset);
            apiUrl.searchParams.append('south', finalParams.south);
            apiUrl.searchParams.append('north', finalParams.north);
            apiUrl.searchParams.append('west', finalParams.west);
            apiUrl.searchParams.append('east', finalParams.east);
            apiUrl.searchParams.append('outputFormat', 'GTiff');
            apiUrl.searchParams.append('API_Key', finalParams.apiKey);

            const response = await fetch(apiUrl.toString());
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            if (response.status === 204) {
                throw new Error('No elevation data available for this region');
            }

            const elevationBlob = await response.blob();
            await this.loadFromGeoTiff(elevationBlob);
            
        } catch (error) {
            console.error('Error fetching from OpenTopography:', error);
            throw error;
        }
    }
}

// Make DataLoader available globally
window.DataLoader = DataLoader;
