global_glsl += `
#define eps 0.001
#define pi 3.1495
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

void main(){
    vec4 e = texture2D(elevation, uv);
    vec4 e_n = texture2D(elevation, uv + vec2(0., eps));
    vec4 e_s = texture2D(elevation, uv + vec2(0., -eps));
    vec4 e_e = texture2D(elevation, uv + vec2(eps, 0.));
    vec4 e_w = texture2D(elevation, uv + vec2(-eps, 0.));

    float curvature = clamp(0.01 * (e_n.x + e_s.x + e_e.x + e_w.x - 4. * e.x) / eps, 0., 1.);
    
    vec3 norm = vec3(
        (e_w.x - e_e.x) / (2. * eps * print_width),
        (e_s.x - e_n.x) / (2. * eps * print_height),
        1.
    );
    vec4 sun_vector = M_sun * vec4(0., 0., 1., 1.);
    float sun_intensity = clamp(dot(norm, sun_vector.xyz), 0., 1.);

    // shadow map
    if (uv_sun.z - eps > texture2D(sun_layer, uv_sun.xy * canvas_res / sun_res).g){
        sun_intensity = 0.;
    }
    
    gl_FragColor = vec4(sun_intensity * sun_color.rgb + (1. - sun_intensity) * ambient_color.rgb, 1.);
    gl_FragColor.xyz *= exp(-curvature * ambient_occlusion);
}
`;

let fps = 60;
var rect_tris, rect_verts;
var camera_dist = 100.;
let M_perpective = new Float32Array(16);
let M_ortho = new Float32Array(16);
let sun_res = 2048;
let elevation_texture_offset = 7;
let ortho_fov = 100.;
let ortho_depth = 500.;
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
        let w = uniforms['print_width'].value;
        let h = uniforms['print_height'].value;
        ortho_fov = ((w ** 2 + h ** 2) ** 0.5) / 2.0;
        console.log(ortho_fov);
        mat4.ortho(M_ortho, -ortho_fov, ortho_fov, -ortho_fov, ortho_fov, 0., ortho_depth);
    });
    file_reader.readAsArrayBuffer(file);
}


function load_data(buffer){
    let shape = new Uint16Array(buffer.slice(0, 4));
    let range = new Float32Array(buffer.slice(4, 12));
    let size = new Float32Array(buffer.slice(12, 20))
    let img_data = new Float32Array(buffer.slice(20));
    let img_data_rgba = new Float32Array(img_data.length * 4);
    for (i = 0; i < img_data.length; i++){
        img_data_rgba[i * 4] = img_data[i];
        img_data_rgba[i * 4 + 3] = 1.0;
    }
    uniforms['print_width'].value = size[0];
    uniforms['print_height'].value = size[1];
    uniforms['elev_range'].value = range;
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

function init(){
    let canvas = document.getElementById('gl-canvas');
    setup_gl(canvas);
    let aspect_ratio = canvas.width / canvas.height;

    [rect_verts, rect_tris] = get_mesh(1, 1, 256, 256);

    let elevation_texture = create_texture(1, 1, null, elevation_texture_offset);

    mat4.ortho(M_ortho, -ortho_fov, ortho_fov, -ortho_fov, ortho_fov, 0., ortho_depth);
    mat4.perspective(M_perpective, glMatrix.toRadian(45), canvas.width / canvas.height, 0.1, 300.0);
    
    add_uniform('elevation', 'sampler2D', elevation_texture_offset);
    add_uniform('canvas_res', 'vec2', [canvas.width, canvas.height])
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
    add_uniform('sun_color', 'vec4', [0.99, 0.98, 0.83, 1], true);
    add_uniform('ambient_color', 'vec4', [0.18, 0.27, 0.33, 1.0], true);
    add_uniform('ambient_occlusion', 'float', 0.15, true, 0., 1.);

    let rect_vert_buffer = create_buffer(new Float32Array(rect_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let rect_tri_buffer = create_buffer(new Uint16Array(rect_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    
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

    compile_layers();

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
        
        mat4.identity(uniforms['M_proj_sun'].value);
        mat4.translate(uniforms['M_proj_sun'].value, uniforms['M_proj_sun'].value, [0, 0, -200]);
        mat4.rotate(uniforms['M_proj_sun'].value, uniforms['M_proj_sun'].value, glMatrix.toRadian(uniforms['sun_elevation'].value - 90), [1, 0, 0]);
        mat4.rotate(uniforms['M_proj_sun'].value, uniforms['M_proj_sun'].value, glMatrix.toRadian(uniforms['sun_direction'].value), [0, 0, 1]);
        mat4.multiply(uniforms['M_proj_sun'].value, M_ortho, uniforms['M_proj_sun'].value);

    }
    requestAnimationFrame(loop);

}