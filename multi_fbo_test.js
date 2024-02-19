/*
textures:

value  | x | y | z | w |
       | r | g | b | a |
       | s | t | p | a | loc |
-------|---|---|---|---|-----|
low0   | u | v | - | - |  0  |
low1   | - | T | P | H |  1  |
high2  | u | v | - | - |  2  |
high3  | - | T | P | H |  3  |
mid    | - | - | - | U |  4  |
other  | s | - | z | w |  5  |

Velocity    | uv |  low0/high0.xy
Temperature | T  |  low1/high1.t
Humidity    | H  |  low1/high1.a
Pressure    | P  |  low1/high1.p
Uplift      | U  |  mid.w
Sediment    | s  |  other.s
Elevation   | z  |  other.z
Water       | w  |  other.w

*/

let sim_vs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 vert_pos;
out vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
    xy = vert_pos * 0.5 + 0.5;
}

`;

let sim_fs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

#define K_pressure 0.1
#define K_pressure_uplift 0.01
#define K_pressure_uplift_acc 10.
#define K_pressure_decay 0.999
#define K_uplift_damping 0.05
#define K_p_decay .9
#define K_smooth 1.0
#define K_elevation_strength 0.01

uniform vec2 mouse_pos;
uniform int mouse_btns;
uniform int keys;
uniform vec2 sim_res;
uniform float pen_size;
uniform float pen_strength;
uniform int pen_type;
uniform vec2 pen_vel;

uniform sampler2D low0_t;
uniform sampler2D low1_t;
uniform sampler2D high0_t;
uniform sampler2D high1_t;
uniform sampler2D mid_t;
uniform sampler2D other_t;

in vec2 xy;
layout(location = 0) out vec4 low0_out;
layout(location = 1) out vec4 low1_out;
layout(location = 2) out vec4 high0_out;
layout(location = 3) out vec4 high1_out;
layout(location = 4) out vec4 mid_out;
layout(location = 5) out vec4 other_out;


// TODO: rename all variables to correct
void main(){

    // backward convection
    vec2 uv_low = texture(low0_t, xy).xy;
    vec2 uv_high = texture(high0_t, xy).xy;
    vec4 low0_n = texture(low0_t, xy + (vec2(0., 1.) - uv_low) / sim_res);
    vec4 low0_s = texture(low0_t, xy + (vec2(0., -1.) - uv_low) / sim_res);
    vec4 low0_e = texture(low0_t, xy + (vec2(1., 0.) - uv_low) / sim_res);
    vec4 low0_w = texture(low0_t, xy + (vec2(-1., 0.) - uv_low) / sim_res);
    vec4 high0_n = texture(high0_t, xy + (vec2(0., 1.) - uv_high) / sim_res);
    vec4 high0_s = texture(high0_t, xy + (vec2(0., -1.) - uv_high) / sim_res);
    vec4 high0_e = texture(high0_t, xy + (vec2(1., 0.) - uv_high) / sim_res);
    vec4 high0_w = texture(high0_t, xy + (vec2(-1., 0.) - uv_high) / sim_res);
    vec4 low1_n = texture(low1_t, xy + (vec2(0., 1.) - uv_low) / sim_res);
    vec4 low1_s = texture(low1_t, xy + (vec2(0., -1.) - uv_low) / sim_res);
    vec4 low1_e = texture(low1_t, xy + (vec2(1., 0.) - uv_low) / sim_res);
    vec4 low1_w = texture(low1_t, xy + (vec2(-1., 0.) - uv_low) / sim_res);
    vec4 high1_n = texture(high1_t, xy + (vec2(0., 1.) - uv_high) / sim_res);
    vec4 high1_s = texture(high1_t, xy + (vec2(0., -1.) - uv_high) / sim_res);
    vec4 high1_e = texture(high1_t, xy + (vec2(1., 0.) - uv_high) / sim_res);
    vec4 high1_w = texture(high1_t, xy + (vec2(-1., 0.) - uv_high) / sim_res);
    vec4 mid_n = texture(mid_t, xy + (vec2(0., K_smooth) - uv_high) / sim_res);
    vec4 mid_s = texture(mid_t, xy + (vec2(0., -K_smooth) - uv_high) / sim_res);
    vec4 mid_e = texture(mid_t, xy + (vec2(K_smooth, 0.) - uv_high) / sim_res);
    vec4 mid_w = texture(mid_t, xy + (vec2(-K_smooth, 0.) - uv_high) / sim_res);
    vec4 other_n = texture(other_t, xy + (vec2(0., 1.) - uv_high) / sim_res);
    vec4 other_s = texture(other_t, xy + (vec2(0., -1.) - uv_high) / sim_res);
    vec4 other_e = texture(other_t, xy + (vec2(1., 0.) - uv_high) / sim_res);
    vec4 other_w = texture(other_t, xy + (vec2(-1., 0.) - uv_high) / sim_res);
    
    // calculate divergence
    float div_low = low0_n.y - low0_s.y + low0_e.x - low0_w.x;
    float div_high = high0_n.y - high0_s.y + high0_e.x - high0_w.x;

    // calculate terrain gradient
    vec2 terrain_gradient = vec2(
        other_e.z - other_w.z,
        other_n.z - other_s.z
    );

    // calculate uplift from divergence
    float uplift = texture(mid_t, xy - uv_low / sim_res).w;

    // convection, low and high include uplift, mid is pure 2D
    low0_out  = texture(low0_t,  xy - uv_low  / sim_res) * clamp(1. + uplift, 0., 1.) 
              + texture(high0_t, xy - uv_low  / sim_res) * clamp(    -uplift, 0., 1.);
    low1_out  = texture(low1_t,  xy - uv_low  / sim_res) * clamp(1. + uplift, 0., 1.) 
              + texture(high1_t, xy - uv_low  / sim_res) * clamp(    -uplift, 0., 1.);
    high0_out = texture(high0_t, xy - uv_high / sim_res) * clamp(1. - uplift, 0., 1.)
              + texture(low0_t,  xy - uv_high / sim_res) * clamp(     uplift, 0., 1.);
    high1_out = texture(high1_t, xy - uv_high / sim_res) * clamp(1. - uplift, 0., 1.)
              + texture(low1_t,  xy - uv_high / sim_res) * clamp(     uplift, 0., 1.);
    mid_out = texture(mid_t, xy - (uv_low + uv_high) / sim_res);
    
    // accumulate pressure
    low1_out.p += -uplift - div_low + dot(uv_low, terrain_gradient) * K_pressure_uplift_acc;
    high1_out.p += uplift - div_high;
    
    // smooth pressure
    // TODO: improve filtering, maybe larger window
    low1_out.p = (low1_out.p + low1_n.p + low1_s.p + low1_e.p + low1_w.p) / 5.;
    high1_out.p = (high1_out.p + high1_n.p + high1_s.p + high1_e.p + high1_w.p) / 5.;
    low1_out.p = (1. - K_uplift_damping) * low1_out.p + K_uplift_damping * high1_out.p;
    high1_out.p = (1. - K_uplift_damping) * high1_out.p + K_uplift_damping * low1_out.p;
    low1_out.p *= K_pressure_decay;
    high1_out.p *= K_pressure_decay;

    // decend pressure
    // TODO: add uplift
    low0_out.x += (low1_w.p - low1_e.p) * K_pressure;
    low0_out.y += (low1_s.p - low1_n.p) * K_pressure;
    high0_out.x += (high1_w.p - high1_e.p) * K_pressure;
    high0_out.y += (high1_s.p - high1_n.p) * K_pressure;
    mid_out.w += (low1_out.p - high1_out.p) * K_pressure_uplift;
    
    // TODO: handle elevation, water, and erosion
    other_out = texture(other_t, xy);

    vec2 pen_vect = pen_vel * pen_strength;
    if ((length(mouse_pos - xy) < pen_size) && (mouse_btns == 1) && (keys == 0)){
        switch (pen_type){
        case 0:  // all velocity
            low0_out = vec4(pen_vect, 0., 1.);
            high0_out = vec4(pen_vect, 0., 1.);
            break;
        case 1:  // low velocity
            low0_out = vec4(pen_vect, 0., 1.);
            break;
        case 2:  // high velocity
            high0_out = vec4(pen_vect, 0., 1.);
            break;
        case 3:  // elevation
            float r = length(mouse_pos - xy) / pen_size;
            other_out.z += (2. * r * r * r - 3. * r * r + 1.) * pen_strength * K_elevation_strength;
            break;
        case 4:  // rain
            break;
        }
    }
    
    // clip elevation to 0-1 
    other_out.z = clamp(other_out.z, 0., 1.);
}

`;

let render2d_vs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 vert_pos;
out vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, .99, 1.);
    xy = vert_pos * 0.5 + 0.5;
}

`;

let render2d_fs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform int view_mode;
uniform sampler2D low0_t;
uniform sampler2D low1_t;
uniform sampler2D high0_t;
uniform sampler2D high1_t;
uniform sampler2D mid_t;
uniform sampler2D other_t;
uniform float pen_size;
uniform vec2 mouse_pos;
uniform int mouse_btns;

in vec2 xy;
out vec4 frag_color;

vec4 low0;
vec4 low1;
vec4 high0;
vec4 high1;
vec4 mid;
vec4 other;
float vel_low;
float vel_high;
float pressure;
float h_low;
float h_high;
float uplift;
float elevation;

void main(){
    switch (view_mode){
    case 0:  // low velocity
        low0 = texture(low0_t, xy);
        low1 = texture(low1_t, xy);
        vel_low = length(low0.xy);
        pressure = low1.p * 10.;
        h_low = low1.a;
        frag_color = vec4(pressure, vel_low, h_low, 1.);        
        break;
    case 1:  // all velocity
        low0 = texture(low0_t, xy);
        low1 = texture(low1_t, xy);
        high0 = texture(high0_t, xy);
        high1 = texture(high1_t, xy);
        mid = texture(mid_t, xy);
        vel_low = length(low0.xy);
        vel_high = length(high0.xy);
        pressure = 0.5 * (low1.p + high1.p) * 10.;
        frag_color = vec4(pressure, vel_low, vel_high, 1.);
        break;
    case 2:  // uplift
        low1 = texture(low1_t, xy);
        high1 = texture(high1_t, xy);
        mid = texture(mid_t, xy);
        pressure = 0.5 * (low1.p + high1.p) * 10.;
        uplift = 100. * mid.w;
        frag_color = vec4(uplift, pressure, -uplift, 1.);
        break;
    case 3:  // elevation
        low0 = texture(low0_t, xy);
        high0 = texture(high0_t, xy);
        mid = texture(mid_t, xy);
        other = texture(other_t, xy);
        uplift = 100. * mid.w;
        elevation = other.z;
        frag_color = vec4(uplift, elevation, -uplift, 1.);
        break;
    }
    if (abs(length(mouse_pos - xy) - pen_size) < 0.001){
        frag_color = vec4(1.);
    }
}

`;

let arrow_vs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D low0_t;
uniform sampler2D high0_t;

in vec3 vert_pos;
out vec2 xy;

void main(){
    vec2 pos = vert_pos.xy;
    xy = pos * 0.5 + 0.5;
    float a = vert_pos.z;
    vec2 uv = texture(low0_t, xy).xy;
    gl_Position = vec4(pos + a * uv * 0.1, 0., 1.);
    // gl_Position = vec4(pos, 0., 1.);
}

`;

let arrow_fs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 xy;
out vec4 frag_color;

void main(){
    frag_color = vec4(1., 1., 1., 1.);
}

`;

let render3d_vs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform mat4 M_camera;
uniform sampler2D other_t;

#define z_scale 0.1

in vec2 vert_pos;
out vec3 xyz;
out vec2 xy;

void main(){
    xy = vert_pos;
    vec4 other = texture(other_t, xy);
    float elevation = other.z * z_scale;
    xyz = vec3(vert_pos, elevation);
    gl_Position = M_camera * vec4(xyz, 1.);
}
`;

let render3d_fs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D low0_t;
uniform sampler2D high0_t;
uniform sampler2D mid_t;
uniform sampler2D other_t;


in vec3 xyz;
out vec4 frag_color;

void main(){
    vec2 xy = xyz.xy;
    vec4 low0 = texture(low0_t, xy);
    vec4 high0 = texture(high0_t, xy);
    vec4 mid = texture(mid_t, xy);
    vec4 other = texture(other_t, xy);
    float uplift = 100. * mid.w;
    float elevation = other.z;
    frag_color = vec4(uplift, elevation, -uplift, 1.);
}
`;



var [width, height] = [1, 1];
let mouse_state = {
    x: 0.5,
    y: 0.5,
    vel_x: 0.0,
    vel_y: 0.0,
    buttons: 0
};
var canvas = null;
const fps = 10;
const K_drag = 100;
const sim_res = 512;
const render_width = 640;
const render_height = 480;
let M_camera = new Float32Array(16);
let M_perpective = new Float32Array(16);
let camera_pos = [0.5, 0.5, 0.25];
let camera_rot = [45, 0];
const PI = 3.14159
const walk_speed = 0.003;
const look_speed = 1.;
const vert_speed = 0.001;

function invert_vect(arr){
    let out = [];
    for (var i = 0; i < arr.length; i++){
        out.push(-arr[i]);
    }
    return out;
}


function mouse_move(event){
    let new_x = event.offsetX / canvas.width;
    let new_y = 1 - event.offsetY / canvas.height;
    mouse_state.vel_x = (new_x - mouse_state.x) * K_drag;
    mouse_state.vel_y = (new_y - mouse_state.y) * K_drag;
    mouse_state.x = new_x;
    mouse_state.y = new_y;
    mouse_state.buttons = event.buttons;
    if (event.shiftKey){
        mouse_state.keys = 1;
    } else if (event.ctrlKey){
        mouse_state.keys = 2;
    } else if (event.altKey){
        mouse_state.keys = 3;
    } else {
        mouse_state.keys = 0;
    }

    if (mouse_state.buttons == 1){
        if (mouse_state.keys == 1){
            // rotate camera
            camera_rot[0] -= mouse_state.vel_y * look_speed;
            camera_rot[1] += mouse_state.vel_x * look_speed;
        }
        if (mouse_state.keys == 2){
            // translate camera
            let t = camera_rot[1] * PI / 180;
            camera_pos[0] -= walk_speed * (mouse_state.vel_x * Math.cos(t) - mouse_state.vel_y * Math.sin(t));
            camera_pos[1] -= walk_speed * (mouse_state.vel_x * Math.sin(t) + mouse_state.vel_y * Math.cos(t));
        }
        if (mouse_state.keys == 3){
            camera_pos[2] -= vert_speed * mouse_state.vel_y;
        }
    
    }


}


function get_arrows(n = 20){
    let out = [];
    for (var i = 0; i < n; i++){
        let x = 2 * i / (n - 1) - 1;
        for (var j = 0; j < n; j++){
            let y = 2 * j / (n - 1) - 1;
            out.push([x, y, 0, x, y, 1]);
        }
    }
    return out;
}


function get_grid_mesh(n = 512, m = 512){
    let out = [];
    for (var i = 0; i < n; i++){
        for (var j = 0; j < m; j++){
            let x0 = j / m;
            let y0 = i / n;
            let x1 = (j + 1) / m;
            let y1 = (i + 1) / n;
            // x0 += 0.1 / m;
            // y0 += 0.1 / n;
            out.push([
                x0, y0,
                x1, y0,
                x1, y1,
            ]);
            out.push([
                x0, y0,
                x1, y1,
                x0, y1
            ]);
        }
    }
    return out;
}


function init(){
    canvas = document.getElementById('gl-canvas')
    setup_gl(canvas);
    [width, height] = [canvas.width, canvas.height];
    let pen_type_options = [];
    let pen_type_el = document.getElementById('pen-type');
    let render_mode_el = document.getElementById('render-mode');
    for (var i = 0; i < pen_type_el.children.length; i++){
        pen_type_options.push(pen_type_el.children[i].value);
    }
    let view_mode_options = [];
    let view_mode_el = document.getElementById('view-mode');
    for (var i = 0; i < view_mode_el.children.length; i++){
        view_mode_options.push(view_mode_el.children[i].value);
    }
    
    // compile shaders
    let sim_vs = compile_shader(sim_vs_src, gl.VERTEX_SHADER, '');
    let sim_fs = compile_shader(sim_fs_src, gl.FRAGMENT_SHADER, '');
    let sim_program = link_program(sim_vs, sim_fs);
    let render2d_vs = compile_shader(render2d_vs_src, gl.VERTEX_SHADER, '');
    let render2d_fs = compile_shader(render2d_fs_src, gl.FRAGMENT_SHADER, '');
    let render2d_program = link_program(render2d_vs, render2d_fs);
    let arrow_vs = compile_shader(arrow_vs_src, gl.VERTEX_SHADER, '');
    let arrow_fs = compile_shader(arrow_fs_src, gl.FRAGMENT_SHADER, '');
    let arrow_program = link_program(arrow_vs, arrow_fs);
    let render3d_vs = compile_shader(render3d_vs_src, gl.VERTEX_SHADER, '');
    // let render3d_fs = compile_shader(render3d_fs_src, gl.FRAGMENT_SHADER, '');
    let render3d_fs = compile_shader(render2d_fs_src, gl.FRAGMENT_SHADER, '');
    let render3d_program = link_program(render3d_vs, render3d_fs);

    // setup buffers
    let vertex_buffer = create_buffer(new Float32Array(screen_mesh[0].flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let tri_buffer = create_buffer(new Uint16Array(screen_mesh[1].flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let sim_pos_attr_loc = gl.getAttribLocation(sim_program, 'vert_pos');
    gl.enableVertexAttribArray(sim_pos_attr_loc);
    let render2d_pos_attr_loc = gl.getAttribLocation(render2d_program, 'vert_pos');
    gl.enableVertexAttribArray(render2d_pos_attr_loc);
    arrows = get_arrows(50);
    let arrow_buffer = create_buffer(new Float32Array(arrows.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let arrow_pos_attr_loc = gl.getAttribLocation(arrow_program, 'vert_pos');
    gl.enableVertexAttribArray(arrow_pos_attr_loc);
    grid_mesh = get_grid_mesh(sim_res, sim_res);
    let grid_mesh_buffer = create_buffer(new Float32Array(grid_mesh.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let grid_mesh_attr_loc = gl.getAttribLocation(render3d_program, 'vert_pos');


    // textures
    let sim_fbo = gl.createFramebuffer();
    let sim_depthbuffer = gl.createRenderbuffer();
    let tex_names = ['low0_t', 'low1_t', 'high0_t', 'high1_t', 'mid_t', 'other_t'];
    let tex_defaults = [[0.1, 0, 0, 0], [0, 0, 0, 0], [0.1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    let textures = [];
    for (var i = 0; i < tex_names.length; i++){
        textures.push({
            'name': tex_names[i],
            'in_tex': create_texture(sim_res, sim_res, tex_defaults[i], i, 'tile'),
            'out_tex': create_texture(sim_res, sim_res, tex_defaults[i], i, 'tile')
        });
    }

    // setup fbo
    gl.bindRenderbuffer(gl.RENDERBUFFER, sim_depthbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, sim_res, sim_res);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim_fbo);
    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1,
        gl.COLOR_ATTACHMENT2,
        gl.COLOR_ATTACHMENT3,
        gl.COLOR_ATTACHMENT4,
        gl.COLOR_ATTACHMENT5,
        // gl.COLOR_ATTACHMENT6,
        // gl.COLOR_ATTACHMENT7,
    ]);
    
    let loop = function(){

        // sim program
        gl.useProgram(sim_program);
        gl.viewport(0, 0, sim_res, sim_res);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tri_buffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, sim_fbo);
        gl.vertexAttribPointer(
            render2d_pos_attr_loc, 2,
            gl.FLOAT, gl.FALSE,
            2 * 4, 0
        );
        for (var i = 0; i < textures.length; i++){

            // swap textures
            [textures[i].in_tex, textures[i].out_tex] = [textures[i].out_tex, textures[i].in_tex];

            // set active in textures (for all programs)
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, textures[i].in_tex);

            // set in texture uniforms for sim_program
            gl.uniform1i(gl.getUniformLocation(sim_program, textures[i].name), i);

            // set out textures for sim_fbo
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i,
                gl.TEXTURE_2D, textures[i].out_tex, 0
            );

        }
        
        // set uniforms
        gl.uniform2f(gl.getUniformLocation(sim_program, 'mouse_pos'), mouse_state.x, mouse_state.y);
        gl.uniform1i(gl.getUniformLocation(sim_program, 'mouse_btns'), mouse_state.buttons);
        gl.uniform1i(gl.getUniformLocation(sim_program, 'keys'), mouse_state.keys);
        gl.uniform2f(gl.getUniformLocation(sim_program, 'sim_res'), sim_res, sim_res);
        gl.uniform1i(gl.getUniformLocation(sim_program, 'pen_type'), pen_type_options.indexOf(pen_type_el.value));
        gl.uniform1f(gl.getUniformLocation(sim_program, 'pen_size'), document.getElementById('pen-size').value);
        gl.uniform1f(gl.getUniformLocation(sim_program, 'pen_strength'), document.getElementById('pen-strength').value);
        gl.uniform2f(gl.getUniformLocation(sim_program, 'pen_vel'), mouse_state.vel_x, mouse_state.vel_y);
        
        // draw
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, 3 * screen_mesh[1].length, gl.UNSIGNED_SHORT, 0);

        if (render_mode_el.value != '3d'){

            canvas.width = sim_res;
            canvas.height = sim_res;
            
            // draw render2d
            gl.useProgram(render2d_program);
            for (var i = 0; i < textures.length; i++){
                gl.uniform1i(gl.getUniformLocation(render2d_program, textures[i].name), i);
            }
            gl.uniform2f(gl.getUniformLocation(render2d_program, 'sim_res'), sim_res, sim_res);
            gl.uniform1i(gl.getUniformLocation(render2d_program, 'view_mode'), view_mode_options.indexOf(view_mode_el.value));
            gl.uniform1f(gl.getUniformLocation(render2d_program, 'pen_size'), document.getElementById('pen-size').value);
            gl.uniform2f(gl.getUniformLocation(render2d_program, 'mouse_pos'), mouse_state.x, mouse_state.y);
            gl.uniform1i(gl.getUniformLocation(render2d_program, 'mouse_btns'), mouse_state.buttons);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
            gl.drawElements(gl.TRIANGLES, 3 * screen_mesh[1].length, gl.UNSIGNED_SHORT, 0);

            // draw arrows
            gl.useProgram(arrow_program);
            gl.bindBuffer(gl.ARRAY_BUFFER, arrow_buffer);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            gl.vertexAttribPointer(
                arrow_pos_attr_loc, 3,
                gl.FLOAT, gl.FALSE,
                3 * 4, 0
            );
            for (var i = 0; i < textures.length; i++){
                gl.uniform1i(gl.getUniformLocation(arrow_program, textures[i].name), i);
            }
            gl.drawArrays(gl.LINES, 0, arrows.length * 2);
        } else {

            // drawing 3D
            // mat4.lookAt(M_camera, camera_pos, [0.5, 0.5, 0], [0, 0, 1]);
            // mat4.invert(M_camera, M_camera);
            mat4.identity(M_camera);
            mat4.rotateX(M_camera, M_camera, -camera_rot[0] * PI / 180);
            mat4.rotateZ(M_camera, M_camera, -camera_rot[1] * PI / 180);
            mat4.translate(M_camera, M_camera, invert_vect(camera_pos));
            mat4.perspective(M_perpective, 45 * PI / 180, render_width / render_height, 0.01, 10);
            mat4.multiply(M_camera, M_perpective, M_camera);
            // mat4.identity(M_camera);

            canvas.width = render_width;
            canvas.height = render_height;

            gl.viewport(0, 0, render_width, render_height);
            gl.useProgram(render3d_program);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindBuffer(gl.ARRAY_BUFFER, grid_mesh_buffer);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            gl.vertexAttribPointer(
                grid_mesh_attr_loc, 2,
                gl.FLOAT, gl.FALSE,
                2 * 4, 0
            );
            gl.uniform2f(gl.getUniformLocation(render3d_program, 'sim_res'), sim_res, sim_res);
            gl.uniform1i(gl.getUniformLocation(render3d_program, 'view_mode'), view_mode_options.indexOf(view_mode_el.value));
            gl.uniform1f(gl.getUniformLocation(render3d_program, 'pen_size'), document.getElementById('pen-size').value);
            gl.uniform2f(gl.getUniformLocation(render3d_program, 'mouse_pos'), mouse_state.x, mouse_state.y);
            gl.uniform1i(gl.getUniformLocation(render3d_program, 'mouse_btns'), mouse_state.buttons);
            gl.uniformMatrix4fv(gl.getUniformLocation(render3d_program, 'M_camera'), gl.FALSE, M_camera);
            for (var i = 0; i < textures.length; i++){
                gl.uniform1i(gl.getUniformLocation(render3d_program, textures[i].name), i);
            }
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, grid_mesh.length * 3);
        }

        // setTimeout(() =>{requestAnimationFrame(loop);}, 1000 / fps);
        requestAnimationFrame(loop);  // unlimited fps
    }
    requestAnimationFrame(loop);
}