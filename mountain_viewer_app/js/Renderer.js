/**
 * Renderer class handles all WebGL rendering operations
 */
class Renderer {
    constructor() {
        this.canvas = null;
        this.canvasContainer = null;
        this.gl = null;
        
        // Rendering state
        this.fps = 30;
        this.isRenderLoopRunning = false;
        
        // Matrices
        this.M_perspective = new Float32Array(16);
        this.M_ortho = new Float32Array(16);
        this.M_corners = new Float32Array(16);
        this.M_corners_proj = new Float32Array(16);
        this.M_sun_inv = new Float32Array(16);
        
        // Rendering parameters
        this.sun_res = 512;
        this.elevation_texture_offset = 7;
        this.ortho_fov = 100.0;
        this.ortho_depth = 800.0;
        
        // Mesh data
        this.rect_verts = null;
        this.rect_tris = null;
        this.wall_verts = null;
        this.wall_tris = null;
        
        // Camera state
        this.mouse_zoom = -200;
        this.mouse_pos = [0, 0];
        
        // Shader loader and sources
        this.shaderLoader = new ShaderLoader();
        this.shaderSources = null;
    }

    /**
     * Initialize global GLSL code
     */
    initializeGlobalGLSL() {
        // Ensure global_glsl is defined
        if (typeof global_glsl === 'undefined') {
            window.global_glsl = '';
        }
        
        // Add the missing GLSL constants and functions
        global_glsl += `
#define pi 3.1495
#define n_ao 3
#define n_shadow 2

float rand(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 rand_2d(vec2 co){
    float r = rand(co);
    return vec2(r, rand(vec2(co.x, r)));
}

vec3 rand_3d(vec2 co){
    float r = rand(co);
    return vec3(r, rand(vec2(co.x, r)), rand(vec2(co.y, r)));
}
`;
    }

    /**
     * Initialize the renderer
     */
    async init() {
        // Initialize global GLSL code first
        this.initializeGlobalGLSL();
        
        // Load shaders from external files
        try {
            this.shaderSources = await this.shaderLoader.loadAllShaders();
        } catch (error) {
            console.error('Failed to load shaders:', error);
            throw new Error('Shader loading failed: ' + error.message);
        }
        
        // Get canvas and container
        this.canvas = document.getElementById('gl-canvas');
        this.canvasContainer = document.getElementById('canvas-container');
        
        if (!this.canvas || !this.canvasContainer) {
            throw new Error('Canvas or canvas container not found');
        }

        // Setup WebGL context
        this.setupWebGL();
        
        // Generate meshes
        this.generateMeshes();
        
        // Setup uniforms
        this.setupUniforms();
        
        // Setup rendering layers
        this.setupLayers();
        
        // Compile shaders and programs
        compile_layers();
        
        console.log('Renderer initialized successfully');
    }

    /**
     * Setup WebGL context
     */
    setupWebGL() {
        setup_gl(this.canvas, null, true);
        this.gl = gl; // Use global gl from gl_layers.js
        
        const dpr = window.devicePixelRatio;
        mat4.perspective(this.M_perspective, glMatrix.toRadian(45), 
                        this.canvas.width / this.canvas.height, 0.1, this.ortho_depth);
    }

    /**
     * Generate mesh data
     */
    generateMeshes() {
        [this.rect_verts, this.rect_tris] = this.getMesh(1, 1, 256, 256);
        [this.wall_verts, this.wall_tris] = this.getWalls();
    }

    /**
     * Setup uniforms
     */
    setupUniforms() {
        const elevation_texture = create_texture(1, 1, null, this.elevation_texture_offset);

        add_uniform('elevation', 'sampler2D', this.elevation_texture_offset);
        add_uniform('canvas_res', 'vec2', [this.canvas.width, this.canvas.height]);
        add_uniform('sun_res', 'vec2', [this.sun_res, this.sun_res]);
        add_uniform('print_width', 'float', 200.);
        add_uniform('print_height', 'float', 200.);
        add_uniform('M_proj', 'mat4', new Float32Array(16));
        add_uniform('M_proj_sun', 'mat4', new Float32Array(16));
        add_uniform('M_sun', 'mat4', new Float32Array(16));
        add_uniform('mouse', 'vec2', [0, 0]);
        add_uniform('ortho_depth', 'float', this.ortho_depth);
        add_uniform('elev_range', 'vec2', [0, 1]);

        // Editable uniforms
        add_uniform('sun_direction', 'float', 30., true, 0., 360.);
        add_uniform('sun_elevation', 'float', 15., true, 0., 90.);
        add_uniform('sun_color', 'vec4', [1.0, 0.88, 0.54, 1.0], true);
        add_uniform('sun_intensity', 'float', 1.7, true, 0., 5.);
        add_uniform('ambient_color', 'vec4', [0.56, 0.75, 1.0, 1.0], true);
        add_uniform('ambient_intensity', 'float', .55, true, 0., 2.);
        add_uniform('background_color', 'vec4', [0, 0, 0, 1], true);
        add_uniform('exposure', 'float', 2.2, true, 0., 10.);
        add_uniform('ambient_occlusion', 'float', 1.3, true, 0., 3.);
        add_uniform('gamma', 'float', 2.0, true, 0.0, 5.0);
        add_uniform('base_thickness', 'float', 8., true, 0., 30.);
        add_uniform('shadow_softness', 'float', 0.004, true, 0., 0.01);
        add_uniform('ao_eps', 'float', 7.5, true, 0., 30);
        add_uniform('ao_power', 'float', 1.5, true, 0, 10);
        add_uniform('shadow_eps', 'float', 0.001, true, 0., 0.01);
        add_uniform('eps', 'float', 0.01, true, 0., 1.);
    }

    /**
     * Setup rendering layers
     */
    setupLayers() {
        const rect_vert_buffer = create_buffer(new Float32Array(this.rect_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        const rect_tri_buffer = create_buffer(new Uint16Array(this.rect_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
        const wall_vert_buffer = create_buffer(new Float32Array(this.wall_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
        const wall_tri_buffer = create_buffer(new Uint16Array(this.wall_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
        const sun_fbo = create_fbo(this.sun_res, this.sun_res);
        const sun_tex1 = create_texture(this.sun_res, this.sun_res, [1., 0., 0., 1.], 0, 'clamp');
        const sun_tex2 = create_texture(this.sun_res, this.sun_res, [0., 1., 0., 1.], 0, 'clamp');

        add_layer('sun_layer', this.shaderSources.sun_vs, this.shaderSources.sun_fs,
                 rect_vert_buffer, rect_tri_buffer, this.rect_tris.length,
                 true, sun_fbo, sun_tex1, sun_tex2, false);

        add_layer('wall_sun_layer', this.shaderSources.wall_sun_vs, this.shaderSources.wall_sun_fs,
                 wall_vert_buffer, wall_tri_buffer, this.wall_tris.length,
                 false, sun_fbo, sun_tex1, sun_tex2, true, [0, 1000, 0, 0],
                 3, [['norm', 3]]);

        add_layer('camera_layer', this.shaderSources.camera_vs, this.shaderSources.camera_fs,
                 rect_vert_buffer, rect_tri_buffer, this.rect_tris.length,
                 true, null, null, null, false, [0., 0., 0., 1.]);

        add_layer('wall_layer', this.shaderSources.wall_vs, this.shaderSources.wall_fs,
                 wall_vert_buffer, wall_tri_buffer, this.wall_tris.length,
                 false, null, null, null, true, [0, 0, 0, 1],
                 3, [['norm', 3]]);
    }

    /**
     * Start the render loop
     */
    startRenderLoop() {
        if (this.isRenderLoopRunning) return;
        
        this.isRenderLoopRunning = true;
        const loop = () => {
            if (!this.isRenderLoopRunning) return;
            
            this.updateMatrices();
            this.handleCanvasResize();
            draw_layers();
            
            setTimeout(() => {
                requestAnimationFrame(loop);
            }, 1000 / this.fps);
        };
        
        requestAnimationFrame(loop);
    }

    /**
     * Stop the render loop
     */
    stopRenderLoop() {
        this.isRenderLoopRunning = false;
    }

    /**
     * Update transformation matrices
     */
    updateMatrices() {
        // Update projection matrix
        mat4.identity(uniforms['M_proj'].value);
        mat4.translate(uniforms['M_proj'].value, uniforms['M_proj'].value, [0, 0, this.mouse_zoom]);
        mat4.rotate(uniforms['M_proj'].value, uniforms['M_proj'].value, 
                   glMatrix.toRadian(-uniforms['mouse'].value[1] * 360), [1, 0, 0]);
        mat4.rotate(uniforms['M_proj'].value, uniforms['M_proj'].value, 
                   glMatrix.toRadian((uniforms['mouse'].value[0] - 0.5) * 360), [0, 0, 1]);
        mat4.multiply(uniforms['M_proj'].value, this.M_perspective, uniforms['M_proj'].value);

        // Update sun matrix
        mat4.identity(uniforms['M_sun'].value);
        mat4.rotate(uniforms['M_sun'].value, uniforms['M_sun'].value, 
                   glMatrix.toRadian(180 - uniforms['sun_direction'].value), [0, 0, 1]);
        mat4.rotate(uniforms['M_sun'].value, uniforms['M_sun'].value, 
                   glMatrix.toRadian(uniforms['sun_elevation'].value - 90), [1, 0, 0]);
        
        mat4.invert(this.M_sun_inv, uniforms['M_sun'].value);
        mat4.multiply(this.M_corners_proj, this.M_sun_inv, this.M_corners);
        
        const x_min = Math.min(this.M_corners_proj[0], this.M_corners_proj[4], 
                              this.M_corners_proj[8], this.M_corners_proj[12]) - 
                     (uniforms['elev_range'].value[1] - uniforms['elev_range'].value[0]) / 2;
        const x_max = Math.max(this.M_corners_proj[0], this.M_corners_proj[4], 
                              this.M_corners_proj[8], this.M_corners_proj[12]) + 
                     (uniforms['elev_range'].value[1] - uniforms['elev_range'].value[0]) / 2;
        const y_min = Math.min(this.M_corners_proj[1], this.M_corners_proj[5], 
                              this.M_corners_proj[9], this.M_corners_proj[13]) - 
                     (uniforms['elev_range'].value[1] - uniforms['elev_range'].value[0]) / 2;
        const y_max = Math.max(this.M_corners_proj[1], this.M_corners_proj[5], 
                              this.M_corners_proj[9], this.M_corners_proj[13]) + 
                     (uniforms['elev_range'].value[1] - uniforms['elev_range'].value[0]) / 2;
        
        mat4.ortho(this.M_ortho, x_min, x_max, y_min, y_max, 0., this.ortho_depth);

        mat4.identity(uniforms['M_proj_sun'].value);
        mat4.translate(uniforms['M_proj_sun'].value, uniforms['M_proj_sun'].value, [0, 0, -200]);
        mat4.rotate(uniforms['M_proj_sun'].value, uniforms['M_proj_sun'].value, 
                   glMatrix.toRadian(uniforms['sun_elevation'].value - 90), [1, 0, 0]);
        mat4.rotate(uniforms['M_proj_sun'].value, uniforms['M_proj_sun'].value, 
                   glMatrix.toRadian(uniforms['sun_direction'].value), [0, 0, 1]);
        mat4.multiply(uniforms['M_proj_sun'].value, this.M_ortho, uniforms['M_proj_sun'].value);
    }

    /**
     * Handle canvas resize
     */
    handleCanvasResize() {
        if (this.canvas.clientWidth !== this.canvasContainer.clientWidth || 
            this.canvas.clientHeight !== this.canvasContainer.clientHeight) {
            
            const rect = this.canvasContainer.getBoundingClientRect();
            const dpr = window.devicePixelRatio;
            
            this.canvas.style.top = rect.y + 'px';
            this.canvas.style.width = this.canvasContainer.clientWidth + 'px';
            this.canvas.style.height = this.canvasContainer.clientHeight + 'px';
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            
            mat4.perspective(this.M_perspective, glMatrix.toRadian(45), 
                           rect.width / rect.height, 0.1, this.ortho_depth);
            
            uniforms['canvas_res'].value[0] = this.canvas.width;
            uniforms['canvas_res'].value[1] = this.canvas.height;
        }
    }

    /**
     * Generate mesh data
     */
    getMesh(width, height, n_width, n_height) {
        const verts = [];
        for (let j = 0; j < n_width; j++) {
            for (let i = 0; i < n_height; i++) {
                verts.push([
                    width * (i / (n_width - 1) - 0.5),
                    height * (j / (n_height - 1) - 0.5)
                ]);
            }
        }
        
        const tris = [];
        for (let j = 0; j < n_height - 1; j++) {
            for (let i = 0; i < n_width - 1; i++) {
                const p1 = j * n_width + i;
                const p2 = j * n_width + i + 1;
                const p3 = (j + 1) * n_width + i + 1;
                const p4 = (j + 1) * n_width + i;
                tris.push([p1, p2, p3]);
                tris.push([p1, p3, p4]);
            }
        }
        
        return [verts, tris];
    }

    /**
     * Generate wall geometry
     */
    getWalls() {
        return [
            [
                // Bottom face (0-3)
                [-1, -1, -1, 0, 0, -1],
                [1, -1, -1, 0, 0, -1],
                [1, 1, -1, 0, 0, -1],
                [-1, 1, -1, 0, 0, -1],

                // Front face (4-7)
                [-1, -1, -1, 0, -1, 0],
                [1, -1, -1, 0, -1, 0],
                [1, -1, 1, 0, -1, 0],
                [-1, -1, 1, 0, -1, 0],

                // Right face (8-11)
                [1, -1, -1, 1, 0, 0],
                [1, 1, -1, 1, 0, 0],
                [1, 1, 1, 1, 0, 0],
                [1, -1, 1, 1, 0, 0],

                // Back face (12-15)
                [1, 1, -1, 0, 1, 0],
                [-1, 1, -1, 0, 1, 0],
                [-1, 1, 1, 0, 1, 0],
                [1, 1, 1, 0, 1, 0],

                // Left face (16-19)
                [-1, 1, -1, -1, 0, 0],
                [-1, -1, -1, -1, 0, 0],
                [-1, -1, 1, -1, 0, 0],
                [-1, 1, 1, -1, 0, 0]
            ], [
                [0, 2, 1], [0, 3, 2],
                [4, 5, 6], [4, 6, 7],
                [8, 9, 10], [8, 10, 11],
                [12, 13, 14], [12, 14, 15],
                [16, 17, 18], [16, 18, 19]
            ]
        ];
    }

    /**
     * Update camera zoom
     */
    updateZoom(delta) {
        this.mouse_zoom += delta;
        this.mouse_zoom = Math.min(0, this.mouse_zoom);
    }

    /**
     * Update mouse position
     */
    updateMousePosition(x, y) {
        this.mouse_pos[0] = x;
        this.mouse_pos[1] = y;
        uniforms['mouse'].value[0] = x;
        uniforms['mouse'].value[1] = y;
    }

    /**
     * Update corner matrix for elevation data
     */
    updateCorners(width, height) {
        const m = [-width / 2, -height / 2, 0, 1, width / 2, -height / 2, 0, 1, 
                   width / 2, height / 2, 0, 1, -width / 2, height / 2, 0, 1];
        for (let i = 0; i < 16; i++) {
            this.M_corners[i] = m[i];
        }
    }

    /**
     * Download current render as PNG
     */
    downloadRender() {
        if (!this.gl) return;
        
        const downloadDom = document.getElementById('png-download');
        const modelName = document.getElementById('model_name').innerText;
        
        downloadDom.href = this.canvas.toDataURL('image/png');
        downloadDom.download = modelName.toLowerCase().replace(' ', '_').replace(/[\W]+/g, '') + '.png';
        downloadDom.click();
    }
}

// Make Renderer available globally
window.Renderer = Renderer;
