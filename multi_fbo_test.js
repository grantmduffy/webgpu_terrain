/*
textures:

value  | x | y | z | w |
       | r | g | b | a |
       | s | t | p | a | loc |
-------|---|---|---|---|-----|
low    | u | v | T | H |  0  |
high   | u | v | T | H |  1  |
mid    | - | - | P | U |  2  |
other  | s | - | z | w |  3  |

Velocity    | uv |  low/high.xy
Temperature | T  |  low/high.z
Humidity    | H  |  low/high.a
Pressure    | P  |  mid.p
Uplift      | U  |  mid.a
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
#define K_p_decay .9
#define K_smooth 1.0

uniform vec2 mouse_pos;
uniform int mouse_btns;
uniform vec2 res;
uniform float pen_size;
uniform float pen_strength;
uniform int pen_type;
uniform vec2 pen_vel;

uniform sampler2D low_t;
uniform sampler2D high_t;
uniform sampler2D mid_t;
uniform sampler2D other_t;

in vec2 xy;
layout(location = 0) out vec4 low_out;
layout(location = 1) out vec4 high_out;
layout(location = 2) out vec4 mid_out;
layout(location = 3) out vec4 other_out;


void main(){

    // backward convection
    vec2 uv_low = texture(low_t, xy).xy;
    vec2 uv_high = texture(high_t, xy).xy;
    vec4 low_n = texture(low_t, xy + (vec2(0., 1.) - uv_low) / res);
    vec4 low_s = texture(low_t, xy + (vec2(0., -1.) - uv_low) / res);
    vec4 low_e = texture(low_t, xy + (vec2(1., 0.) - uv_low) / res);
    vec4 low_w = texture(low_t, xy + (vec2(-1., 0.) - uv_low) / res);
    vec4 high_n = texture(high_t, xy + (vec2(0., 1.) - uv_high) / res);
    vec4 high_s = texture(high_t, xy + (vec2(0., -1.) - uv_high) / res);
    vec4 high_e = texture(high_t, xy + (vec2(1., 0.) - uv_high) / res);
    vec4 high_w = texture(high_t, xy + (vec2(-1., 0.) - uv_high) / res);
    vec4 mid_n = texture(mid_t, xy + (vec2(0., K_smooth) - uv_high) / res);
    vec4 mid_s = texture(mid_t, xy + (vec2(0., -K_smooth) - uv_high) / res);
    vec4 mid_e = texture(mid_t, xy + (vec2(K_smooth, 0.) - uv_high) / res);
    vec4 mid_w = texture(mid_t, xy + (vec2(-K_smooth, 0.) - uv_high) / res);
    
    // calculate divergence
    float div_low = low_n.y - low_s.y + low_e.x - low_w.x;
    float div_high = high_n.y - high_s.y + high_e.x - high_w.x;

    // calculate uplift from divergence
    float uplift = 0.5 * (div_high - div_low);

    // convection, low and high include uplift, mid is pure 2D
    low_out  = texture(low_t,  xy - uv_low  / res) * clamp(1. + uplift, 0., 1.) 
             + texture(high_t, xy - uv_low  / res) * clamp(    -uplift, 0., 1.);
    high_out = texture(high_t, xy - uv_high / res) * clamp(1. - uplift, 0., 1.)
             + texture(low_t,  xy - uv_high / res) * clamp(     uplift, 0., 1.);
    mid_out = texture(mid_t, xy - (uv_low + uv_high) / res);
    mid_out.a = uplift;
    
    // accumulate pressure
    mid_out.p -= div_low + div_high;
    
    // smooth pressure
    // TODO: improve filtering, maybe larger window
    mid_out.p = (mid_out.p + mid_n.p + mid_s.p + mid_e.p + mid_w.p) / 5.;

    // decend pressure
    low_out.x += (mid_w.p - mid_e.p) * K_pressure;
    low_out.y += (mid_s.p - mid_n.p) * K_pressure;
    high_out.x += (mid_w.p - mid_e.p) * K_pressure;
    high_out.y += (mid_s.p - mid_n.p) * K_pressure;
    
    
    // handle elevation, water, and erosion
    other_out = vec4(0.5, 1., 0., 1.);

    vec2 pen_vect = pen_vel * pen_strength;
    switch (pen_type){
    case 0:  // all velocity
        if ((length(mouse_pos - xy) < pen_size) && (mouse_btns == 1)){
            low_out = vec4(pen_vect, 0., 1.);
            high_out = vec4(pen_vect, 0., 1.);
        }
        break;
    case 1:  // low velocity
        if ((length(mouse_pos - xy) < pen_size) && (mouse_btns == 1)){
            low_out = vec4(pen_vect, 0., 1.);
        }
        break;
    case 2:  // high velocity
        if ((length(mouse_pos - xy) < pen_size) && (mouse_btns == 1)){
            high_out = vec4(pen_vect, 0., 1.);
        }
        break;
    case 3:  // elevation
        break;
    case 4:  // rain
        break;
    }
}

`;

let render_vs_src = `#version 300 es
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

let render_fs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform int view_mode;
uniform sampler2D low_t;
uniform sampler2D high_t;
uniform sampler2D mid_t;
uniform sampler2D other_t;

in vec2 xy;
out vec4 frag_color;

vec4 low;
vec4 high;
vec4 mid;
float vel_low;
float vel_high;
float pressure;
float h_low;
float h_high;
float uplift;

void main(){
    switch (view_mode){
    case 0:
        low = texture(low_t, xy);
        mid = texture(mid_t, xy);
        vel_low = length(low.xy);
        pressure = mid.p;
        h_low = low.a;
        frag_color = vec4(pressure, vel_low, h_low, 1.);        
        break;
    case 1:
        low = texture(low_t, xy);
        high = texture(high_t, xy);
        mid = texture(mid_t, xy);
        vel_low = length(low.xy);
        vel_high = length(high.xy);
        pressure = mid.p;
        frag_color = vec4(pressure, vel_low, vel_high, 1.);
        break;
    case 2:
        low = texture(low_t, xy);
        high = texture(high_t, xy);
        mid = texture(mid_t, xy);
        vel_low = length(low.xy);
        vel_high = length(high.xy);
        uplift = 100. * mid.a;
        pressure = mid.p;
        frag_color = vec4(uplift, pressure, -uplift, 1.);
        break;
    }
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
const fps = 30;
const K_drag = 100;


function mouse_move(event){
    let new_x = event.offsetX / width;
    let new_y = 1 - event.offsetY / height;
    mouse_state.vel_x = (new_x - mouse_state.x) * K_drag;
    mouse_state.vel_y = (new_y - mouse_state.y) * K_drag;
    mouse_state.x = new_x;
    mouse_state.y = new_y;
    mouse_state.buttons = event.buttons;
}


function init(){
    canvas = document.getElementById('gl-canvas')
    setup_gl(canvas);
    [width, height] = [canvas.width, canvas.height];
    let pen_type_options = [];
    let pen_type_el = document.getElementById('pen-type');
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
    let render_vs = compile_shader(render_vs_src, gl.VERTEX_SHADER, '');
    let render_fs = compile_shader(render_fs_src, gl.FRAGMENT_SHADER, '');
    let render_program = link_program(render_vs, render_fs);

    // setup buffers
    let vertex_buffer = create_buffer(new Float32Array(screen_mesh[0].flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
    let tri_buffer = create_buffer(new Uint16Array(screen_mesh[1].flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tri_buffer)
    let sim_pos_attr_loc = gl.getAttribLocation(sim_program, 'vert_pos');
    gl.vertexAttribPointer(
        sim_pos_attr_loc, 2,
        gl.FLOAT, gl.FALSE,
        2 * 4, 0
    );
    gl.enableVertexAttribArray(sim_pos_attr_loc);
    let render_pos_attr_loc = gl.getAttribLocation(render_program, 'vert_pos');
    gl.vertexAttribPointer(
        render_pos_attr_loc, 2,
        gl.FLOAT, gl.FALSE,
        2 * 4, 0
    );
    gl.enableVertexAttribArray(render_pos_attr_loc);


    // textures
    let sim_fbo = gl.createFramebuffer();
    let sim_depthbuffer = gl.createRenderbuffer();
    let tex_names = ['low_t', 'high_t', 'mid_t', 'other_t'];
    let textures = [];
    for (var i = 0; i < tex_names.length; i++){
        textures.push({
            'name': tex_names[i],
            'in_tex': create_texture(width, height, [0, 0, 0, 0], i, 'repeat'),
            'out_tex': create_texture(width, height, [0, 0, 0, 0], i, 'repeat')
        });
    }

    // setup fbo
    gl.bindRenderbuffer(gl.RENDERBUFFER, sim_depthbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim_fbo);
    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1,
        gl.COLOR_ATTACHMENT2,
        gl.COLOR_ATTACHMENT3,
        // gl.COLOR_ATTACHMENT4,
        // gl.COLOR_ATTACHMENT5,
        // gl.COLOR_ATTACHMENT6,
        // gl.COLOR_ATTACHMENT7,
    ]);

    let loop = function(){

        // sim program
        gl.useProgram(sim_program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, sim_fbo);
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
        gl.uniform2f(gl.getUniformLocation(sim_program, 'res'), width, height);
        gl.uniform1i(gl.getUniformLocation(sim_program, 'pen_type'), pen_type_options.indexOf(pen_type_el.value));
        gl.uniform1f(gl.getUniformLocation(sim_program, 'pen_size'), document.getElementById('pen-size').value);
        gl.uniform1f(gl.getUniformLocation(sim_program, 'pen_strength'), document.getElementById('pen-strength').value);
        gl.uniform2f(gl.getUniformLocation(sim_program, 'pen_vel'), mouse_state.vel_x, mouse_state.vel_y);
        
        // draw
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, 3 * screen_mesh[1].length, gl.UNSIGNED_SHORT, 0);

        // draw render
        gl.useProgram(render_program);
        for (var i = 0; i < textures.length; i++){
            gl.uniform1i(gl.getUniformLocation(render_program, textures[i].name), i);
        }
        gl.uniform2f(gl.getUniformLocation(render_program, 'res'), width, height);
        gl.uniform1i(gl.getUniformLocation(render_program, 'view_mode'), view_mode_options.indexOf(view_mode_el.value));
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, 3 * screen_mesh[1].length, gl.UNSIGNED_SHORT, 0);

        // setTimeout(() =>{requestAnimationFrame(loop);}, 1000 / fps);
        requestAnimationFrame(loop);  // unlimited fps
    }
    requestAnimationFrame(loop);
}