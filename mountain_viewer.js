global_glsl += `
#define pi 3.1495
// #define n_ao 10
// #define n_shadow 10
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

let sun_vs_src = `
attribute vec2 vert_pos;
varying vec2 uv;

void main(){
    uv = vert_pos + 0.5;
    vec4 world_coord = vec4(
        vert_pos * vec2(print_width, print_height), 
        texture2D(elevation, uv).x - (elev_range.y + elev_range.x) / 2.,
        1.
    );
    gl_Position = M_proj_sun * world_coord;
}
`;

let sun_fs_src = `
varying vec2 uv;

void main(){
    gl_FragColor = vec4(0., gl_FragCoord.z, texture2D(elevation, uv).y, 1.);
}
`;

let camera_vs_src = `
attribute vec2 vert_pos;
varying vec4 uv_sun;
varying vec4 world_coord;

void main(){
    vec2 uv = vert_pos + 0.5;
    world_coord = vec4(
        vert_pos * vec2(print_width, print_height), 
        texture2D(elevation, uv).x - (elev_range.y + elev_range.x) / 2.,
        1.
    );
    gl_Position = M_proj * world_coord;
    uv_sun = (M_proj_sun * world_coord) / 2. + 0.5;
}
`;

let camera_fs_src = `
varying vec4 uv_sun;
varying vec4 world_coord;

vec4 convert_colorspace(vec3 intensity){
    return vec4(1. - exp(-exposure * intensity), 1.);
}

vec2 world_to_uv(vec2 world){
    return world / vec2(print_width, print_height) + 0.5;
}

void main(){
    vec2 uv = world_to_uv(world_coord.xy);

    vec4 e = texture2D(elevation, uv);
    vec4 e_n = texture2D(elevation, world_to_uv(world_coord.xy + vec2(0., eps)));
    vec4 e_s = texture2D(elevation, world_to_uv(world_coord.xy + vec2(0., -eps)));
    vec4 e_e = texture2D(elevation, world_to_uv(world_coord.xy + vec2(eps, 0.)));
    vec4 e_w = texture2D(elevation, world_to_uv(world_coord.xy + vec2(-eps, 0.)));
    
    vec3 norm = vec3(
        (e_w.x - e_e.x) / (2. * eps),
        (e_s.x - e_n.x) / (2. * eps),
        1.
    );
    vec4 sun_vector = M_sun * vec4(0., 0., 1., 1.);
    
    vec3 rgb_intensity = ambient_intensity * ambient_color.rgb;

    // calculate ambient occlusion
    float z1 = texture2D(elevation, uv).x;
    float curvature = 0.;
    for (int i = 0; i < n_ao; i++){
        vec2 dir = ao_eps * pow(rand_2d(uv + float(i)), vec2(ao_power));
        float dir_len = length(dir);
        float z0 = texture2D(elevation, world_to_uv(world_coord.xy - dir)).x;
        float z2 = texture2D(elevation, world_to_uv(world_coord.xy + dir)).x;
        float f1 = (z2 - z0) / (2. * dir_len);
        float f2 = (z2 - 2. * z1 + z0) / (dir_len * dir_len);
        curvature += max(f2 / pow(1. + f1 * f1, 3. / 2.), 0.);
    }
    curvature /= float(n_ao);
    rgb_intensity *= exp(-curvature * ambient_occlusion);

    // shadow map
    float shadow_val = 0.;
    for (int i = 0; i < n_shadow; i++){
        float shadow_depth = texture2D(sun_layer, uv_sun.xy + shadow_softness * rand_2d(uv_sun.xy + float(i))).g - uv_sun.z + shadow_eps;
        shadow_val += float(shadow_depth > 0.);
    }
    shadow_val /= float(n_shadow);
    // float shadow_val = 1.;
    rgb_intensity += shadow_val * sun_color.rgb * sun_intensity * clamp(dot(norm, sun_vector.xyz), 0., 1.);
    
    // convert to rgb
    gl_FragColor = convert_colorspace(rgb_intensity);
    gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(gamma));

    // debugging
    // gl_FragColor = vec4(1., uv_sun.xy, 1.);
    // gl_FragColor = texture2D(sun_layer, (uv_sun.xy + shadow_eps * rand_2d(uv_sun.xy)) * canvas_res / sun_res)
}
`;

let wall_vs_src = `
attribute vec3 vert_pos;
attribute vec3 norm;
varying vec3 xyz;
varying vec3 norm_vec;
varying vec2 uv;

void main(){
    float z;
    xyz = vec3(
        vert_pos.xy * vec2(print_width, print_height) / 2.,
        vert_pos.z * (elev_range.y - elev_range.x + base_thickness * 2.) / 2. - base_thickness
    );
    uv = (vert_pos.xy + 1.) / 2.;
    gl_Position = M_proj * vec4(xyz, 1.);
    norm_vec = norm;
}
`;

let wall_fs_src = `
varying vec3 norm_vec;
varying vec2 uv;
varying vec3 xyz;

vec4 convert_colorspace(vec3 intensity){
    return vec4(1. - exp(-exposure * intensity), 1.);
}

void main(){
    vec4 sun_vector = M_sun * vec4(0., 0., 1., 1.);
    vec3 rgb_intensity = ambient_intensity * ambient_color.rgb;
    rgb_intensity += sun_color.rgb * sun_intensity * clamp(dot(norm_vec, sun_vector.xyz), 0., 1.);
    gl_FragColor = convert_colorspace(rgb_intensity);
    gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(gamma));
    if (xyz.z > texture2D(elevation, uv).x - (elev_range.y + elev_range.x) / 2.){
        gl_FragColor.a = 0.0;
    }
}
`;

let debug_vs_src = `
attribute vec2 vert_pos;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
}
`;

let debug_fs_src = `
void main(){
    vec2 uv = gl_FragCoord.xy / canvas_res;
    gl_FragColor = vec4(1., uv, 1.);
    vec4 sun = texture2D(sun_layer, uv);
    gl_FragColor = mix(gl_FragColor * 0.5, sun, sun.a);
}
`;

let wall_sun_vs_src = `
attribute vec3 vert_pos;
attribute vec3 norm;
varying vec3 xyz;
varying vec3 norm_vec;
varying vec2 uv;

void main(){
    float z;
    xyz = vec3(
        vert_pos.xy * vec2(print_width, print_height) / 2.,
        vert_pos.z * (elev_range.y - elev_range.x + base_thickness * 2.) / 2. - base_thickness
    );
    uv = (vert_pos.xy + 1.) / 2.;
    gl_Position = M_proj_sun * vec4(xyz, 1.);
    norm_vec = norm;
}
`;

let wall_sun_fs_src = `
varying vec2 uv;
varying vec3 xyz;

void main(){
    gl_FragColor = vec4(0., gl_FragCoord.z, texture2D(elevation, uv).y, 1.);
    if (xyz.z - .3 > texture2D(elevation, uv).x - (elev_range.y + elev_range.x) / 2.){
        gl_FragColor.a = 0.0;
    }
    // gl_FragColor = vec4(1., uv, 1.);
}
`;

let fps = 60;
var rect_tris, rect_verts;
var camera_dist = 100.;
let M_perpective = new Float32Array(16);
let M_ortho = new Float32Array(16);
let M_corners = new Float32Array(16);
let M_corners_proj = new Float32Array(16);
let M_sun_inv = new Float32Array(16);
let sun_res = 512;
let elevation_texture_offset = 7;
let ortho_fov = 100.;
let ortho_depth = 800.;
var mouse_down_pos = [0, 0];
var mouse_pos = [0, 0];
var mouse_zoom = -200
var d_last = null;
var mouse_is_down = false;
let default_settings = [];
var download_dom = null;
var dummy_img = null;


function handle_scroll(event){
    mouse_zoom += event.wheelDelta;
    mouse_zoom = Math.min(0, mouse_zoom);
}


function get_event_xy(event){
    if (gl == null) return [-1, -1, 0];

    var event_x, event_y;
    var d = null;
    if (event.type.startsWith('mouse')){
        event_x = event.offsetX / gl.canvas.width;
        event_y = event.offsetY / gl.canvas.height;
    } else {
        
        // event.preventDefault();
        if (event.touches.length == 2){
            let [x1, y1] = [event.touches[0].clientX, event.touches[0].clientY];
            let [x2, y2] = [event.touches[1].clientX, event.touches[1].clientY];
            d = ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5;
            event_x = 0.5 * (x1 + x2) / gl.canvas.width;
            event_y = 0.5 * (y1 + y2) / gl.canvas.height;
        } else {
            event_x = event.touches[0].clientX / gl.canvas.width;
            event_y = event.touches[0].clientY / gl.canvas.height;
        }
    }
    return [event_x, event_y, d];
}

function mouse_move(event){
    var [event_x, event_y, d] = get_event_xy(event);
    if ('mouse' in uniforms && mouse_is_down){
        uniforms['mouse'].value[0] = event_x - mouse_down_pos[0] + mouse_pos[0];
        uniforms['mouse'].value[1] = (event.srcElement.height - event_y) - mouse_down_pos[1] + mouse_pos[1];    
    }
    // if ('buttons' in uniforms){
    //     uniforms['buttons'].value = event.buttons;
    // }
    if (d != null && d_last != null){
        mouse_zoom += 0.5 * (d - d_last);
    }
    d_last = d;
}

function mouse_down(event){
    var [event_x, event_y, d] = get_event_xy(event);
    mouse_is_down = true;
    mouse_down_pos[0] = event_x;
    mouse_down_pos[1] = event.srcElement.height - event_y;
    d_last = d;
}

function mouse_up(event){
    mouse_is_down = false;
    mouse_pos[0] = uniforms['mouse'].value[0];
    mouse_pos[1] = uniforms['mouse'].value[1];
    d_last = null;
}


function show_loading(item){
    let spinner = document.getElementById('loading-spinner');
    let status = document.getElementById('loading-status');
    status.innerText = 'Loading ' + item;
    spinner.style.display = 'unset';
    status.style.display = 'unset';
}


function hide_loading(){
    let spinner = document.getElementById('loading-spinner');
    let status = document.getElementById('loading-status');
    spinner.style.display = 'none';
    status.style.display = 'none';
}


function failed_to_load(name){
    alert('Failed to load ' + name);
    hide_loading();
}


function download_render(){
    if (gl == null) return;
    download_dom.href = gl.canvas.toDataURL('image/png');;
    download_dom.download = document.getElementById('model_name').innerText.toLowerCase().replace(' ', '_').replace(/[\W]+/g, '') + '.png';
    download_dom.click();
}


function load_file(event){
    let file = event.target.files[0];
    if (file.name === undefined){
        return;
    }
    show_loading(file.name);
    let file_reader = new FileReader();
    file_reader.addEventListener('load', (event) =>{
        try {
            load_data(event.target.result);
            name_el = document.getElementById('model_name');
            name_el.innerText = file.name;
        } catch (err) {
            console.log(err);
            failed_to_load(file.name);
        }
    });
    file_reader.readAsArrayBuffer(file);
}


function load_url(path, name=null){
    show_loading(name);
    let req = new XMLHttpRequest();
    req.open('GET', path);
    req.responseType = 'arraybuffer';
    req.onreadystatechange = function(){
        if (this.readyState == 4 && this.status == 200){
            try {
                load_data(req.response);
                if (name == null){
                    name = path;
                }
                name_el = document.getElementById('model_name');
                name_el.innerText = name;
            } catch (err) {
                console.llg(err);
                failed_to_load(name);
            }
        } else if (this.readyState == 4){
            failed_to_load(name);
        }
    }
    req.send();
}


function load_data(buffer){
    let shape = new Uint16Array(buffer.slice(0, 4));
    let range = new Float32Array(buffer.slice(4, 12));
    let size = new Float32Array(buffer.slice(12, 20))
    let img_data_compressed = new Uint8Array(buffer.slice(20));
    let img_data_decompressed = pako.inflate(img_data_compressed);
    let img_data = new Uint16Array(img_data_decompressed.buffer);
    let img_data_rgba = new Float32Array(img_data.length * 4);
    for (i = 0; i < img_data.length; i++){
        img_data_rgba[i * 4] = (range[1] - range[0]) * img_data[i] / (2 ** 16 - 1) + range[0];
        img_data_rgba[i * 4 + 3] = 1.0;
    }
    uniforms['print_width'].value = size[0];
    uniforms['print_height'].value = size[1];
    uniforms['elev_range'].value = range;
    let [w, h] = size;
    m = [-w / 2, -h / 2, 0, 1, w / 2, -h / 2, 0, 1, w / 2, h / 2, 0, 1, -w / 2, h / 2, 0, 1];
    for (var i = 0; i < 16; i++) M_corners[i] = m[i];
    create_texture(shape[1], shape[0], img_data_rgba, elevation_texture_offset);
    console.log(`new elevation data loaded (${shape[0]}x${shape[1]})`);
    hide_loading();
}


function get_mesh(width, height, n_width, n_height){
    let verts = [];
    for (var j = 0; j < n_width; j++){
        for (var i = 0; i < n_height; i++){
            verts.push([
                width * (i / (n_width - 1) - 0.5),
                height * (j / (n_height - 1) - 0.5)
            ]);
        }
    }
    let tris = [];
    for (var j = 0; j < n_height - 1; j++){
        for (var i = 0; i < n_width - 1; i++){
            let p1 = j * n_width + i;
            let p2 = j * n_width + i + 1;
            let p3 = (j + 1) * n_width + i + 1;
            let p4 = (j + 1) * n_width + i;
            tris.push([p1, p2, p3]);
            tris.push([p1, p3, p4]);
        }
    }
    return [verts, tris];
}

function get_walls(){
    return [
        [
            // 0-3
            [-1, -1, -1, 0, 0, -1],
            [1, -1, -1, 0, 0, -1],
            [1, 1, -1, 0, 0, -1],
            [-1, 1, -1, 0, 0, -1],

            // 4-7
            [-1, -1, -1, 0, -1, 0],
            [1, -1, -1, 0, -1, 0],
            [1, -1, 1, 0, -1, 0],
            [-1, -1, 1, 0, -1, 0],

            //8-11
            [1, -1, -1, 1, 0, 0],
            [1, 1, -1, 1, 0, 0],
            [1, 1, 1, 1, 0, 0],
            [1, -1, 1, 1, 0, 0],

            //12-15
            [1, 1, -1, 0, 1, 0],
            [-1, 1, -1, 0, 1, 0],
            [-1, 1, 1, 0, 1, 0],
            [1, 1, 1, 0, 1, 0],

            // 16-19
            [-1, 1, -1, -1, 0, 0],
            [-1, -1, -1, -1, 0, 0],
            [-1, -1, 1, -1, 0, 0],
            [-1, 1, 1, -1, 0, 0],

            // 20-23
            // [-1, -1, 1, 1, 0, 0],
            // [1, -1, 1, 1, 0, 0],
            // [1, 1, 1, 1, 0, 0],
            // [-1, 1, 1, 1, 0, 0]
        ], [
            [0, 2, 1],
            [0, 3, 2],

            [4, 5, 6],
            [4, 6, 7],

            [8, 9, 10],
            [8, 10, 11],

            [12, 13, 14],
            [12, 14, 15],

            [16, 17, 18],
            [16, 18, 19],

            // [20, 21, 22],
            // [20, 22, 23]
        ]
    ]
}

function update_canvas(entries){

    // console.log('update canvas');
    let entry = entries[0];
    let width;
    let height;
    let dpr = window.devicePixelRatio;
    if (entry.devicePixelContentBoxSize) {
        // NOTE: Only this path gives the correct answer
        // The other paths are imperfect fallbacks
        // for browsers that don't provide anyway to do this
        width = entry.devicePixelContentBoxSize[0].inlineSize;
        height = entry.devicePixelContentBoxSize[0].blockSize;
        dpr = 1; // it's already in width and height
    } else if (entry.contentBoxSize) {
        if (entry.contentBoxSize[0]) {
            width = entry.contentBoxSize[0].inlineSize;
            height = entry.contentBoxSize[0].blockSize;
        } else {
            width = entry.contentBoxSize.inlineSize;
            height = entry.contentBoxSize.blockSize;
        }
    } else {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
    }
    const displayWidth = Math.round(width * dpr);
    const displayHeight = Math.round(height * dpr);
    
    let canvas = entries[0].target;
    [canvas.width, canvas.height] = [displayWidth, displayHeight];
    mat4.perspective(M_perpective, glMatrix.toRadian(45), displayWidth / displayHeight, 0.1, ortho_depth);
    uniforms['canvas_res'].value = [displayWidth, displayHeight];
    // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}

function hide_modal(){
    // console.log('hide modal');
    // document.getElementById('settings_modal').hidden = true;
    document.getElementsByClassName('modal-backdrop')[0].hidden = true;
    document.getElementsByClassName('modal-content')[0].style.setProperty('opacity', '30%', 'important');
    document.getElementsByClassName('modal-content')[0].style.setProperty('backdrop-filter', 'unset', 'important');
}

function show_modal(){
    // console.log('show modal');
    // document.getElementById('settings_modal').hidden = false;
    document.getElementsByClassName('modal-backdrop')[0].hidden = false;
    document.getElementsByClassName('modal-content')[0].style.setProperty('opacity', null);
    document.getElementsByClassName('modal-content')[0].style.setProperty('backdrop-filter', null);
}

function reset_to_defaults(){
    for (var name in uniforms){
        let u = uniforms[name];
        if (u.input){
            u.value = u.default;
            let e = document.getElementById(name);
            if (e.type == 'color'){
                e.value = rgba2hex(u.default);
            } else {
                e.value = u.default;
            }
        }
    }
}

function init(){

    // warn if not running in chrome
    var isChrome = navigator.userAgent.includes('Chrome');
    if (!isChrome){
        alert('This page is only supported in Chrome, results in other browsers may vary.');
    }

    download_dom = document.getElementById('png-download');
    dummy_img = document.getElementById('dummy-img');

    let canvas = document.getElementById('gl-canvas');
    let observer = new ResizeObserver(update_canvas);
    observer.observe(canvas, {box: 'device-pixel-content-box'});
    setup_gl(canvas, cull=null, true);

    [rect_verts, rect_tris] = get_mesh(1, 1, 256, 256);
    [wall_verts, wall_tris] = get_walls();

    let elevation_texture = create_texture(1, 1, null, elevation_texture_offset);

    mat4.perspective(M_perpective, glMatrix.toRadian(45), canvas.width / canvas.height, 0.1, ortho_depth);
    
    add_uniform('elevation', 'sampler2D', elevation_texture_offset);
    add_uniform('canvas_res', 'vec2', [canvas.width, canvas.height]);
    add_uniform('sun_res', 'vec2', [sun_res, sun_res]);
    add_uniform('print_width', 'float', 200.);
    add_uniform('print_height', 'float', 200.);
    add_uniform('M_proj', 'mat4', new Float32Array(16));
    add_uniform('M_proj_sun', 'mat4', new Float32Array(16));
    add_uniform('M_sun', 'mat4', new Float32Array(16));
    add_uniform('mouse', 'vec2', [0, 0]);
    // add_uniform('buttons', 'int', 0);
    add_uniform('ortho_depth', 'float', ortho_depth);
    add_uniform('elev_range', 'vec2', [0, 1]);

    // editable uniforms
    add_uniform('sun_direction', 'float', 30., true, 0., 360.);
    add_uniform('sun_elevation', 'float', 15., true, 0., 90.);
    add_uniform('sun_color', 'vec4', [1.0, 0.88, 0.54, 1.0], true);
    add_uniform('sun_intensity', 'float', 1.7, true, 0., 5.);
    add_uniform('ambient_color', 'vec4', [0.56, 0.75, 1.0, 1.0], true);
    add_uniform('ambient_intensity', 'float', .55, true, 0., 2.);
    add_uniform('background_color', 'vec4', [0, 0, 0, 1], true);
    add_uniform('exposure', 'float', 2.2, true, 0., 10.);
    add_uniform('ambient_occlusion', 'float', 1.3 , true, 0., 3.);
    add_uniform('gamma', 'float', 2.0, true, 0.0, 5.0);
    add_uniform('base_thickness', 'float', 8., true, 0., 30.);
    add_uniform('shadow_softness', 'float', 0.004, true, 0., 0.01);
    add_uniform('ao_eps', 'float', 7.5, true, 0., 30);
    add_uniform('ao_power', 'float', 1.5, true, 0, 10);
    add_uniform('shadow_eps', 'float', 0.001, true, 0., 0.01);
    add_uniform('eps', 'float', 0.01, true, 0., 1.);
    // add_uniform('n_ao', 'int', 2, true, 0, 10);
    // add_uniform('n_shadow', 'int', 2, true, 0, 10);

    let rect_vert_buffer = create_buffer(new Float32Array(rect_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let rect_tri_buffer = create_buffer(new Uint16Array(rect_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let wall_vert_buffer = create_buffer(new Float32Array(wall_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let wall_tri_buffer = create_buffer(new Uint16Array(wall_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let sun_fbo = create_fbo(sun_res, sun_res);
    let sun_tex1 = create_texture(sun_res, sun_res, [1., 0., 0., 1.], 0, 'clamp');
    let sun_tex2 = create_texture(sun_res, sun_res, [0., 1., 0., 1.], 0, 'clamp');

    add_layer(
        'sun_layer',
        sun_vs_src,
        sun_fs_src,
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        true, sun_fbo,
        sun_tex1, sun_tex2,
        false,
    );

    add_layer(
        'wall_sun_layer',
        wall_sun_vs_src,
        wall_sun_fs_src,
        wall_vert_buffer,
        wall_tri_buffer,
        wall_tris.length,
        false, sun_fbo,
        sun_tex1, sun_tex2,
        true, [0, 1000, 0, 0],
        3, [['norm', 3]]
    );

    add_layer(
        'camera_layer',
        camera_vs_src,
        camera_fs_src,
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        true, null, null, null, false, [0., 0., 0., 1.]
    );

    add_layer(
        'wall_layer',
        wall_vs_src,
        wall_fs_src,
        wall_vert_buffer,
        wall_tri_buffer,
        wall_tris.length,
        false, null, null, null, true, [0, 0, 0, 1], 
        3, [['norm', 3]]
    )

    // add_layer(
    //     'debug_layer',
    //     debug_vs_src,
    //     debug_fs_src,
    //     create_buffer(new Float32Array(screen_mesh[0].flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW),
    //     create_buffer(new Uint16Array(screen_mesh[1].flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW),
    //     screen_mesh[1].length,
    //     true
    // );

    compile_layers();
    load_url('rainier.gmd', 'Mount Rainier');

    let uniform_inputs = document.getElementsByClassName('uniform-input');
    for (var i = 0; i < uniform_inputs.length; i++){
        uniform_inputs[i].onpointerdown = hide_modal;
        uniform_inputs[i].onpointerup = show_modal;
    }

    let bg_color_picker = document.getElementById('background_color');
    bg_color_picker.oninput = function(){
        layers[1].clear_color = hex2rgba(bg_color_picker.value);
    };


    let loop = function(){
        draw_layers();
        setTimeout(() =>{requestAnimationFrame(loop);}, 1000 / fps);

        mat4.identity(uniforms['M_proj'].value);
        mat4.translate(uniforms['M_proj'].value, uniforms['M_proj'].value, [0, 0, mouse_zoom]);
        mat4.rotate(uniforms['M_proj'].value, uniforms['M_proj'].value, glMatrix.toRadian(-uniforms['mouse'].value[1] * 360), [1, 0, 0]);
        mat4.rotate(uniforms['M_proj'].value, uniforms['M_proj'].value, glMatrix.toRadian((uniforms['mouse'].value[0] - 0.5) * 360), [0, 0, 1]);
        mat4.multiply(uniforms['M_proj'].value, M_perpective, uniforms['M_proj'].value);

        mat4.identity(uniforms['M_sun'].value);
        mat4.rotate(uniforms['M_sun'].value, uniforms['M_sun'].value, glMatrix.toRadian(180 - uniforms['sun_direction'].value), [0, 0, 1]);
        mat4.rotate(uniforms['M_sun'].value, uniforms['M_sun'].value, glMatrix.toRadian(uniforms['sun_elevation'].value - 90), [1, 0, 0]);
        mat4.invert(M_sun_inv, uniforms['M_sun'].value);
        mat4.multiply(M_corners_proj, M_sun_inv, M_corners);
        x_min = Math.min(M_corners_proj[0], M_corners_proj[4], M_corners_proj[8], M_corners_proj[12]) - (uniforms['elev_range'].value[1] - uniforms['elev_range'].value[0]) / 2;
        x_max = Math.max(M_corners_proj[0], M_corners_proj[4], M_corners_proj[8], M_corners_proj[12]) + (uniforms['elev_range'].value[1] - uniforms['elev_range'].value[0]) / 2;
        y_min = Math.min(M_corners_proj[1], M_corners_proj[5], M_corners_proj[9], M_corners_proj[13]) - (uniforms['elev_range'].value[1] - uniforms['elev_range'].value[0]) / 2;
        y_max = Math.max(M_corners_proj[1], M_corners_proj[5], M_corners_proj[9], M_corners_proj[13]) + (uniforms['elev_range'].value[1] - uniforms['elev_range'].value[0]) / 2;
        mat4.ortho(M_ortho, x_min, x_max, y_min, y_max, 0., ortho_depth);

        mat4.identity(uniforms['M_proj_sun'].value);
        mat4.translate(uniforms['M_proj_sun'].value, uniforms['M_proj_sun'].value, [0, 0, -200]);
        mat4.rotate(uniforms['M_proj_sun'].value, uniforms['M_proj_sun'].value, glMatrix.toRadian(uniforms['sun_elevation'].value - 90), [1, 0, 0]);
        mat4.rotate(uniforms['M_proj_sun'].value, uniforms['M_proj_sun'].value, glMatrix.toRadian(uniforms['sun_direction'].value), [0, 0, 1]);
        mat4.multiply(uniforms['M_proj_sun'].value, M_ortho, uniforms['M_proj_sun'].value);

    }
    requestAnimationFrame(loop);

}