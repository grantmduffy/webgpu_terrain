global_glsl += `
#define eps 0.001
#define pi 3.1495
#define N_AMBIENT_OCCLUSION 0
#define N_SHADOW 1

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
varying vec2 uv;
varying vec4 uv_sun;

void main(){
    uv = vert_pos + 0.5;
    vec4 world_coord = vec4(
        vert_pos * vec2(print_width, print_height), 
        texture2D(elevation, uv).x - (elev_range.y + elev_range.x) / 2.,
        1.
    );
    gl_Position = M_proj * world_coord;
    uv_sun = (M_proj_sun * world_coord) / 2. + 0.5;
}
`;

let camera_fs_src = `
varying vec2 uv;
varying vec4 uv_sun;

vec4 convert_colorspace(vec3 intensity){
    return vec4(1. - exp(-exposure * intensity), 1.);
}

void main(){
    vec4 e = texture2D(elevation, uv);
    vec4 e_n = texture2D(elevation, uv + vec2(0., eps));
    vec4 e_s = texture2D(elevation, uv + vec2(0., -eps));
    vec4 e_e = texture2D(elevation, uv + vec2(eps, 0.));
    vec4 e_w = texture2D(elevation, uv + vec2(-eps, 0.));
    
    vec3 norm = vec3(
        (e_w.x - e_e.x) / (2. * eps * print_width),
        (e_s.x - e_n.x) / (2. * eps * print_height),
        1.
    );
    vec4 sun_vector = M_sun * vec4(0., 0., 1., 1.);
    
    vec3 rgb_intensity = ambient_intensity * ambient_color.rgb;

    // shadow map
    float shadow_depth = texture2D(sun_layer, (uv_sun.xy + shadow_eps * rand_2d(uv_sun.xy)) * canvas_res / sun_res).g - uv_sun.z + eps;
    float shadow_val = float(shadow_depth > 0.);
    rgb_intensity += shadow_val * sun_color.rgb * sun_intensity * clamp(dot(norm, sun_vector.xyz), 0., 1.);
    
    // calculate ambient occlusion
    vec2 dir = ao_eps * pow(rand_2d(uv), vec2(4.));
    float dir_len = length(dir);
    float curvature = exp(-dir_len) * (2. * texture2D(elevation, uv).x - texture2D(elevation, uv + dir).x - texture2D(elevation, uv - dir).x) / dir_len;
    rgb_intensity *= exp(min(curvature, 0.) * ambient_occlusion);
    
    gl_FragColor = convert_colorspace(rgb_intensity);
    gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(gamma));
}
`;

wall_vs_src = `
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
        // vert_pos.z * (elev_range.y - elev_range.x + base_thickness) - 0.5 * (elev_range.y - elev_range.x) - base_thickness
    );
    uv = (vert_pos.xy + 1.) / 2.;
    gl_Position = M_proj * vec4(xyz, 1.);
    norm_vec = norm;
}
`;

wall_fs_src = `
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

let fps = 60;
var rect_tris, rect_verts;
var camera_dist = 100.;
let M_perpective = new Float32Array(16);
let M_ortho = new Float32Array(16);
let M_corners = new Float32Array(16);
let M_corners_proj = new Float32Array(16);
let M_sun_inv = new Float32Array(16);
let sun_res = 2048;
let elevation_texture_offset = 7;
let ortho_fov = 100.;
let ortho_depth = 800.;
var mouse_down_pos = [0, 0];
var mouse_pos = [0, 0];
var mouse_is_down = false;


function get_event_xy(event){
    var event_x, event_y;
    if (event.type.startsWith('mouse')){
        event_x = event.offsetX;
        event_y = event.offsetY;
    } else {
        event_x = event.touches[0].clientX;
        event_y = event.touches[0].clientY;
        // event.preventDefault();
    }
    return [event_x, event_y];
}

function mouse_move(event){
    var [event_x, event_y] = get_event_xy(event);
    if ('mouse' in uniforms && mouse_is_down){
        uniforms['mouse'].value[0] = event_x - mouse_down_pos[0] + mouse_pos[0];
        uniforms['mouse'].value[1] = (event.srcElement.height - event_y) - mouse_down_pos[1] + mouse_pos[1];    
    }
    if ('buttons' in uniforms){
        uniforms['buttons'].value = event.buttons;
    }
}

function mouse_down(event){
    var [event_x, event_y] = get_event_xy(event);
    mouse_is_down = true;
    mouse_down_pos[0] = event_x;
    mouse_down_pos[1] = event.srcElement.height - event_y;
}

function mouse_up(event){
    mouse_is_down = false;
    mouse_pos[0] = uniforms['mouse'].value[0];
    mouse_pos[1] = uniforms['mouse'].value[1];
}


function load_file(event){
    let file = event.target.files[0];
    console.log(file);
    let file_reader = new FileReader();
    file_reader.addEventListener('load', (event) =>{
        load_data(event.target.result);
        // TODO: figure out why this isn't working
        // let w = uniforms['print_width'].value;
        // let h = uniforms['print_height'].value;
        // ortho_fov = ((w ** 2 + h ** 2) ** 0.5) / 2.0;
        // mat4.ortho(M_ortho, -ortho_fov, ortho_fov, -ortho_fov, ortho_fov, 0., ortho_depth);
        name_el = document.getElementById('model_name');
        name_el.innerText = file.name;
    });
    file_reader.readAsArrayBuffer(file);
}


function load_url(path, name=null){
    let req = new XMLHttpRequest();
    req.open('GET', path);
    req.responseType = 'arraybuffer';
    req.onreadystatechange = function(){
        if (this.readyState == 4 && this.status == 200){
            load_data(req.response);
            if (name == null){
                name = path;
            }
            name_el = document.getElementById('model_name');
            name_el.innerText = name;
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
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}

function hide_modal(){
    console.log('hide modal');
    // document.getElementById('settings_modal').hidden = true;
    document.getElementsByClassName('modal-backdrop')[0].hidden = true;
    document.getElementsByClassName('modal-content')[0].style.setProperty('opacity', '30%', 'important');
    document.getElementsByClassName('modal-content')[0].style.setProperty('backdrop-filter', 'unset', 'important');
}

function show_modal(){
    console.log('show modal');
    // document.getElementById('settings_modal').hidden = false;
    document.getElementsByClassName('modal-backdrop')[0].hidden = false;
    document.getElementsByClassName('modal-content')[0].style.setProperty('opacity', null);
    document.getElementsByClassName('modal-content')[0].style.setProperty('backdrop-filter', null);
}

function init(){
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
    add_uniform('buttons', 'int', 0);
    add_uniform('ortho_depth', 'float', ortho_depth);
    add_uniform('elev_range', 'vec2', [0, 1]);

    // editable uniforms
    add_uniform('sun_direction', 'float', 30., true, 0., 360.);
    add_uniform('sun_elevation', 'float', 15., true, 0., 90.);
    add_uniform('sun_color', 'vec4', [1.0, 0.88, 0.54, 1.0], true);
    add_uniform('sun_intensity', 'float', 1.7, true, 0., 5.);
    add_uniform('ambient_color', 'vec4', [0.56, 0.75, 1.0, 1.0], true);
    add_uniform('ambient_intensity', 'float', .55, true, 0., 2.);
    add_uniform('exposure', 'float', 2.2, true, 0., 10.);
    add_uniform('ambient_occlusion', 'float', 0.004 , true, 0., 0.1);
    add_uniform('gamma', 'float', 2.0, true, 0.0, 5.0);
    add_uniform('base_thickness', 'float', 8., true, 0., 30.);
    add_uniform('shadow_softness', 'float', 0.5, true, 0., 1.);
    add_uniform('max_occlusion', 'float', 10., true, 0., 20.);
    add_uniform('ao_eps', 'float', 0.1, true, 0., 0.5);
    add_uniform('shadow_eps', 'float', 0.001, true, 0., 0.003);

    let rect_vert_buffer = create_buffer(new Float32Array(rect_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let rect_tri_buffer = create_buffer(new Uint16Array(rect_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let wall_vert_buffer = create_buffer(new Float32Array(wall_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let wall_tri_buffer = create_buffer(new Uint16Array(wall_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    
    add_layer(
        'sun_layer',
        sun_vs_src,
        sun_fs_src,
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        true,
        create_fbo(sun_res, sun_res),
        create_texture(sun_res, sun_res, [1., 0., 0., 1.]),
        create_texture(sun_res, sun_res, [0., 1., 0., 1.]),
        false
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

    compile_layers();
    load_url('rainier.gmd', 'Mount Rainier');

    let uniform_inputs = document.getElementsByClassName('uniform-input');
    for (var i = 0; i < uniform_inputs.length; i++){
        uniform_inputs[i].onpointerdown = hide_modal;
        uniform_inputs[i].onpointerup = show_modal;
    }

    let loop = function(){
        draw_layers();
        setTimeout(() =>{requestAnimationFrame(loop);}, 1000 / fps);

        mat4.identity(uniforms['M_proj'].value);
        mat4.translate(uniforms['M_proj'].value, uniforms['M_proj'].value, [0, 0, -200]);
        mat4.rotate(uniforms['M_proj'].value, uniforms['M_proj'].value, glMatrix.toRadian(-uniforms['mouse'].value[1] * 90 / canvas.height), [1, 0, 0]);
        mat4.rotate(uniforms['M_proj'].value, uniforms['M_proj'].value, glMatrix.toRadian((uniforms['mouse'].value[0] - 0.5) * 360 / canvas.width), [0, 0, 1]);
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