// python -m http.server 8888

let global_glsl = `
precision mediump float;

#define fog_color vec4(0.6745098039215687, 0.8392156862745098, 0.9490196078431372, 1.)

#define cursor 100.
#define fog_gamma 500.
#define min_water_depth 0.01
#define K_sat 0.01
#define K_uptake 0.0003
#define K_sediment_convection 0.001
#define cursor_water_level 0.002
#define cursor_elev_level 0.1
#define rain 0.00003

uniform vec2 resolution;
uniform vec2 tex_res;
uniform vec2 mouse;
uniform int buttons;
uniform sampler2D background_layer;
uniform mat4 M_proj;
uniform int frame_i;
uniform mat4 M_camera;
uniform vec3 sun_direction;
uniform vec4 sun_color;
uniform vec4 terrain_color;
uniform vec4 water_color;
uniform vec3 camera_position;

vec4 sample(sampler2D tex, vec2 uv){
    // return texture2D(tex, clamp(uv, 0., 1.));
    return texture2D(tex, uv);
}

vec2 get_water_velocity(vec2 uv){
    vec4 b = sample(background_layer, uv);
    vec4 b_n = sample(background_layer, uv + vec2(0., 1.) / tex_res);
    vec4 b_s = sample(background_layer, uv + vec2(0., -1.) / tex_res);
    vec4 b_e = sample(background_layer, uv + vec2(1., 0.) / tex_res);
    vec4 b_w = sample(background_layer, uv + vec2(-1., 0.) / tex_res);

    vec2 vel = vec2(clamp(b_s.x + b_s.y - b.x - b.y, -b.y / 4., b_s.y / 4.)
                  - clamp(b_n.x + b_n.y - b.x - b.y, -b.y / 4., b_n.y / 4.),
                    clamp(b_w.x + b_w.y - b.x - b.y, -b.y / 4., b_w.y / 4.)
                  - clamp(b_e.x + b_e.y - b.x - b.y, -b.y / 4., b_e.y / 4.));
    vel /= b.y + min_water_depth;
    return vel;
}

`;

let simple_vertex_shader_src = `
attribute vec2 vert_pos;
varying vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
    xy = vert_pos;
}
`;

let background_fragment_shader_src = `
float t_filt = 0.5;

void main(){
    vec2 uv = gl_FragCoord.xy / tex_res;
    vec4 b = sample(background_layer, uv);
    vec4 b_n = sample(background_layer, uv + vec2(0., 1.) / tex_res);
    vec4 b_s = sample(background_layer, uv + vec2(0., -1.) / tex_res);
    vec4 b_e = sample(background_layer, uv + vec2(1., 0.) / tex_res);
    vec4 b_w = sample(background_layer, uv + vec2(-1., 0.) / tex_res);

    // water flow
    b.y += .2 * (
            clamp(b_n.x + b_n.y - b.x - b.y, -b.y / 4., b_n.y / 4.)
        +  clamp(b_s.x + b_s.y - b.x - b.y, -b.y / 4., b_s.y / 4.)
        +  clamp(b_e.x + b_e.y - b.x - b.y, -b.y / 4., b_e.y / 4.)
        +  clamp(b_w.x + b_w.y - b.x - b.y, -b.y / 4., b_w.y / 4.)
        );
    gl_FragColor = b;

    // water velocity
    vec2 vel = get_water_velocity(uv);

    // convect sediment
    gl_FragColor.z = sample(background_layer, uv - vel * K_sediment_convection).z;
    
    float vel_mag = length(vel);
    float uptake = min(
        K_uptake * vel_mag, 
        K_sat * vel_mag - b.z
    );
    gl_FragColor.z += uptake;
    gl_FragColor.x -= uptake;

    vec2 xy = (2. * gl_FragCoord.xy / tex_res - 1.) * 100.;
    vec4 xyz = M_proj * vec4(xy, 0., 1.);
    xyz /= xyz.w;
    float len = length((xyz.xy + 1.) * resolution / 2. - mouse);
    float x = len / cursor;
    if (len < cursor && buttons == 1){
        gl_FragColor.x += cursor_elev_level * (1. -  x * x * (3. - 2. * x));
    }
    if (len < cursor && buttons == 2){
        gl_FragColor.y += cursor_water_level * (1. -  x * x * (3. - 2. * x));
    }
    gl_FragColor.y += rain;
    if (gl_FragColor.x <= 0.5){
        gl_FragColor.y = 0.5 - gl_FragColor.x;
    }
}
`;

let projection_vertex_shader_src = `
attribute vec2 vert_pos;
varying vec2 uv;

void main(){
    uv = (vert_pos / 100. + 1.) / 2.;
    gl_Position = M_proj * vec4(vert_pos, 0., 1.);
}

`;

let display_fragment_shader_src = `
varying vec2 uv;

void main(){
    gl_FragColor = sample(background_layer, uv);
    // gl_FragColor.a = 0.5;
}
`;

let camera_vertex_shader_src = `
attribute vec2 vert_pos;
varying vec2 uv;

void main(){
    vec4 world_coords = M_camera * vec4(vert_pos, 0., 1.);
    uv = (world_coords.xy / 100. + 1.) / 2.;
    float elevation = sample(background_layer, uv).x * 1.;
    world_coords.z = elevation;
    gl_Position = M_proj * world_coords;
}
`;

let camera_fragment_shader_src = `
varying vec2 uv;

void main(){
    float fog_amount = pow(gl_FragCoord.z, fog_gamma);
    vec3 normal = normalize(vec3(
        sample(background_layer, uv + vec2(1., 0.) / tex_res).x - sample(background_layer, uv - vec2(1., 0.) / tex_res).x,
        sample(background_layer, uv + vec2(0., 1.) / tex_res).x - sample(background_layer, uv - vec2(0., 1.) / tex_res).x,
        200. / 512.
    ));
    float val = max(dot(normal, sun_direction), 0.);
    gl_FragColor = sun_color * terrain_color;
    gl_FragColor.rgb *= clamp(val, 0.1, 1.0);
    gl_FragColor *= 1. - fog_amount;
    gl_FragColor += fog_amount * fog_color;
    gl_FragColor.a = 1.;
}

`;

let water_vertex_shader_src = `
attribute vec2 vert_pos;
varying vec2 uv;
varying vec3 xyz;

void main(){
    vec4 world_coords = M_camera * vec4(vert_pos, 0., 1.);
    uv = (world_coords.xy / 100. + 1.) / 2.;
    xyz = world_coords.xyz;
    float elevation = dot(sample(background_layer, uv).xy, vec2(1.));
    world_coords.z = elevation;
    gl_Position = M_proj * world_coords;
}
`;

let water_fragment_shader_src = `
varying vec2 uv;
varying vec3 xyz;

#define water_color vec4(0., 0., 1., 0.5)
#define sediment_color vec4(0.8, 0.3, 0., 1.)

void main(){
    vec4 b = sample(background_layer, uv);
    vec4 b_n = sample(background_layer, uv + vec2(0., 1.) / tex_res);
    vec4 b_s = sample(background_layer, uv + vec2(0., -1.) / tex_res);
    vec4 b_e = sample(background_layer, uv + vec2(1., 0.) / tex_res);
    vec4 b_w = sample(background_layer, uv + vec2(-1., 0.) / tex_res);

    // vec2 vel = get_water_velocity(uv);
    // float vel_mag = length(vel);
    // float sediment = b.z / K_sat;
    // if (sediment <= 1.){
    //     gl_FragColor = (1. - sediment) * water_color + sediment * sediment_color;
    // } else {
    //     gl_FragColor = vec4(1., 0., 0., 1.);
    // }
    
    
    vec3 normal = normalize(vec3(
        dot(b_e.xy, vec2(1.)) 
        - dot(b_w.xy, vec2(1.)),
        dot(b_n.xy, vec2(1.)) 
        - dot(b_s.xy, vec2(1.)),
        200. / 512.
    ));
    float reflection_amount = 1. - dot(normalize(camera_position - xyz), normal);
    gl_FragColor = reflection_amount * fog_color + (1. - reflection_amount) * water_color;
    float water_amount = sample(background_layer, uv).g;
    // gl_FragColor = vec4(0., 0., b.z * .1, 1.);
    gl_FragColor.a = min(0.5, water_amount * 1.);
}

`;

let test_fragment_shader_src = `
void main(){
    gl_FragColor = vec4(1., 0., 0., 0.1);
}

`;


var mouse_x = 0;
var mouse_y = 0;
var buttons = 0;
var gl = null;
var width = 0;
var height = 0;
var offset_x = 0;
var offset_y = 0;
var rot_pitch = 0;
var rot_yaw = 0;
const speed = 2;
const rot_speed = 5;
const vert_speed = 0.5;
let camera_position = new Float32Array(2);
var camera_height = 3.0;
let V_direction = new Float32Array(2);
let M_lookat = new Float32Array(16);
var M_proj = new Float32Array(16);
let M_perpective = new Float32Array(16);
let M_camera = new Float32Array(16);
// let sun_color = new Float32Array([0, 0, 0, 1]);
let sun_color = new Float32Array([253 / 255, 251 / 255, 211 / 255, 1]);
let terrain_color = new Float32Array([0, 154 / 255, 23 / 255, 1]);
let water_color = new Float32Array([0 / 255, 80 / 255, 150 / 255, 0.7]);
let sun_direction = new Float32Array([0.766044443118978, 0, 0.6427876096865393]);
// let sun_direction = new Float32Array([0, 0, 1]);
var rot_horizontal = 0;
var frame_i = 0;
const texture_res = 512;
const fps = 60;

var layers = [];

function mouse_move(event){
    mouse_x = event.clientX - offset_x;
    mouse_y = event.srcElement.height - event.clientY + offset_y;
    buttons = event.buttons;
}

function on_keydown(event){
    v = [Math.cos(glMatrix.toRadian(rot_yaw)), Math.sin(glMatrix.toRadian(rot_yaw))];
    switch (event.keyCode){
        case 37:  // left
            rot_yaw += rot_speed;
            break;
        case 39:  // right
            rot_yaw -= rot_speed;
            break;
        case 38:  // up
            rot_pitch -= rot_speed;
            break;
        case 40:  // down
            rot_pitch += rot_speed;
            break;
        case 65:  // A
            camera_position[0] -= speed * v[1];
            camera_position[1] += speed * v[0];
            break;
        case 68:  // D
            camera_position[0] += speed * v[1];
            camera_position[1] -= speed * v[0];
            break;
        case 87:  // W
            camera_position[0] += speed * v[0];
            camera_position[1] += speed * v[1];
            break;
        case 83:  // S
            camera_position[0] -= speed * v[0];
            camera_position[1] -= speed * v[1];
            break;
        case 69:
            camera_height += vert_speed;
            break;
        case 81:
            camera_height -= vert_speed;
            break;
    }
    // document.getElementById('debug').innerText = `\
    // p=(${V_position[0].toFixed(4)}, ${V_position[1].toFixed(4)})\n\
    // rot=${rot_yaw.toFixed(4)}\n\
    // v=(${Math.cos(glMatrix.toRadian(rot_yaw)).toFixed(4)}, \
    // ${Math.sin(glMatrix.toRadian(rot_yaw)).toFixed(4)})`;
}

function setup_gl(canvas){
    width = canvas.width;
    height = canvas.height;
    let rect = canvas.getBoundingClientRect();
    canvas.oncontextmenu = function(e) { e.preventDefault(); e.stopPropagation(); }
    offset_x = rect.left;
    offset_y = rect.top;
    gl = canvas.getContext('webgl');
    gl.getExtension("OES_texture_float");
    gl.getExtension("OES_texture_float_linear");
    gl.enable(gl.DEPTH_TEST);
    // gl.frontFace(gl.CCW);
    // gl.enable(gl.CULL_FACE);
    // gl.cullFace(gl.FRONT);
    // gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function compile_shader(source, type){
    let shader = gl.createShader(type);
    gl.shaderSource(shader, global_glsl + source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        console.error('Failed to compile vertex shader:', gl.getShaderInfoLog(shader));
        return;
    }
    return shader;
}

function link_program(vertex_shader, fragment_shader){
    let program = gl.createProgram();
    gl.attachShader(program, vertex_shader);
    gl.attachShader(program, fragment_shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)){
        console.error('Failed to link program:', gl.getProgramInfoLog(program));
        return;
    }
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)){
        console.error('Failed to validate program:', gl.getProgramInfoLog(program));
        return;
    }
    return program;
}

function create_buffer(data, type, draw_type){
    buffer = gl.createBuffer();
    gl.bindBuffer(type, buffer);
    gl.bufferData(type, data, draw_type);
    return buffer;
}

function create_texture(active_texture, color=[0, 0, 0, 1.0], width, height){
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + active_texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    if (color != null){
        // color = new Uint8Array(Array(width * height).fill(color).flat());
        color = new Float32Array(Array(width * height).fill(color).flat());
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, color);
    return texture;
}

function create_fbo(texture, width, height){
    let fbo = gl.createFramebuffer();
    let depthbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthbuffer);
    return fbo;
}

function set_uniforms(program){
    gl.uniform2f(gl.getUniformLocation(program, 'resolution'), width, height);
    gl.uniform2f(gl.getUniformLocation(program, 'tex_res'), texture_res, texture_res);
    gl.uniform2f(gl.getUniformLocation(program, 'mouse'), mouse_x, mouse_y);
    gl.uniform1i(gl.getUniformLocation(program, 'buttons'), buttons);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'M_proj'), gl.False, M_proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'M_camera'), gl.False, M_camera);
    gl.uniform4fv(gl.getUniformLocation(program, 'terrain_color'), terrain_color);
    gl.uniform4fv(gl.getUniformLocation(program, 'sun_color'), sun_color);
    gl.uniform3fv(gl.getUniformLocation(program, 'sun_direction'), sun_direction);
    gl.uniform4fv(gl.getUniformLocation(program, 'water_color'), water_color);
    gl.uniform1i(gl.getUniformLocation(program, 'frame_i'), frame_i);
    gl.uniform3f(gl.getUniformLocation(program, 'camera_position'), camera_position[0], camera_position[1], camera_height);
}

function add_layer(
        name, program, 
        vertex_buffer, tri_buffer, n_tris, clear=true, fbo=null,        
        active_texture=null, texture1=null, texture2=null,
    ){
    layers.push({
        name: name,
        program: program,
        vertex_buffer: vertex_buffer,
        tri_buffer: tri_buffer,
        n_tris: n_tris,
        fbo: fbo,
        active_texture: active_texture,
        sample_texture: texture1,
        fbo_texture: texture2,
        clear: clear
    });
}

function draw_layers(){

    for (i in layers){

        layer = layers[i];
        
        // bind buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, layer.vertex_buffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, layer.tri_buffer);
        let pos_attr_loc = gl.getAttribLocation(layer.program, 'vert_pos');
        gl.vertexAttribPointer(
            pos_attr_loc, 2,
            gl.FLOAT, gl.FALSE,
            2 * 4, 0
        );
        gl.enableVertexAttribArray(pos_attr_loc);

        // setup textures and framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.fbo);
        if (layer.sample_texture != null){
            gl.activeTexture(gl.TEXTURE0 + layer.active_texture);
            gl.bindTexture(gl.TEXTURE_2D, layer.sample_texture);
        }
        if (layer.fbo != null){
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layer.fbo_texture, 0);
        }
        
        // set layer texture uniforms for this program
        gl.useProgram(layer.program);
        for (j in layers){
            l = layers[j];
            if (l.sample_texture != null){
                let loc = gl.getUniformLocation(layer.program, l.name);
                if (loc != null){
                    gl.uniform1i(loc, l.active_texture);
                }
            }
        }

        // set the rest of the uniforms
        set_uniforms(layer.program);

        // clear canvas
        // gl.clearColor(1., 0., 0., 1.);
        if (layer.clear){
            gl.clearColor(172 / 255, 214 / 255, 242 / 255, 1);
            gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        }

        // draw
        gl.drawElements(gl.TRIANGLES, layer.n_tris * 3, gl.UNSIGNED_SHORT, 0);

        // swap textures
        [layers[i].sample_texture, layers[i].fbo_texture] = [layer.fbo_texture, layer.sample_texture];
    }
}

function init(){

    let canvas = document.getElementById('gl-canvas');
    setup_gl(canvas);

    let plane_verts = [
        [-100, -100],
        [-100, 100],
        [100, -100],
        [100, 100]
    ];
    let plane_tris = [
        [0, 1, 3],
        [0, 3, 2]
    ];

    let plane_vert_buffer = create_buffer(new Float32Array(plane_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let plane_tri_buffer = create_buffer(new Uint16Array(plane_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    
    let simple_vertex_shader = compile_shader(simple_vertex_shader_src, gl.VERTEX_SHADER);
    let display_fragment_shader = compile_shader(display_fragment_shader_src, gl.FRAGMENT_SHADER);
    let projection_vertex_shader = compile_shader(projection_vertex_shader_src, gl.VERTEX_SHADER);
    let render_program = link_program(projection_vertex_shader, display_fragment_shader);

    let background_fragment_shader = compile_shader(background_fragment_shader_src, gl.FRAGMENT_SHADER);
    let background_program = link_program(simple_vertex_shader, background_fragment_shader);
    let texture0 = create_texture(1, [0., 0., 0., 1.], texture_res, texture_res);
    let texture1 = create_texture(2, [0., 0., 0., 1.], texture_res, texture_res);
    let background_fbo = create_fbo(texture1, texture_res, texture_res);

    let camera_vert_buffer = create_buffer(new Float32Array(camera_mesh.verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let camera_tri_buffer = create_buffer(new Uint16Array(camera_mesh.tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let camera_vertex_shader = compile_shader(camera_vertex_shader_src, gl.VERTEX_SHADER);
    let camera_fragment_shader = compile_shader(camera_fragment_shader_src, gl.FRAGMENT_SHADER);
    let camera_program = link_program(camera_vertex_shader, camera_fragment_shader);

    let water_vertex_shader = compile_shader(water_vertex_shader_src, gl.VERTEX_SHADER);
    let water_fragment_shader = compile_shader(water_fragment_shader_src, gl.FRAGMENT_SHADER);
    let water_program = link_program(water_vertex_shader, water_fragment_shader);

    let test_verts = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0, 0.5],
    ];
    let test_tris = [
        [0, 1, 2],
    ];
    let test_vert_buffer = create_buffer(new Float32Array(test_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let test_tri_buffer = create_buffer(new Uint16Array(test_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let test_fragment_shader = compile_shader(test_fragment_shader_src, gl.FRAGMENT_SHADER);
    let test_program = link_program(simple_vertex_shader, test_fragment_shader);

    add_layer(
        'background_layer', 
        background_program,
        plane_vert_buffer,
        plane_tri_buffer,
        plane_tris.length,
        true,
        background_fbo,
        0,
        texture0, 
        texture1
    );
    
    // add_layer(
    //     'render_layer', 
    //     render_program, 
    //     plane_vert_buffer, 
    //     plane_tri_buffer, 
    //     plane_tris.length
    // );

    add_layer(
        'camera_layer',
        camera_program,
        camera_vert_buffer,
        camera_tri_buffer,
        camera_mesh.tris.length,
        true
    );

    add_layer(
        'water_layer',
        water_program,
        camera_vert_buffer,
        camera_tri_buffer,
        camera_mesh.tris.length,
        false
    )

    // add_layer(
    //     'test_layer',
    //     test_program,
    //     test_vert_buffer,
    //     test_tri_buffer,
    //     test_tris.length,
    //     false
    // );

    mat4.perspective(M_perpective, glMatrix.toRadian(45), width / height, 0.1, 150.0);
    mat4.lookAt(M_lookat, [0, 0, 0], [1, 0, 0], [0, 0, 1]);

    let loop = function(){
        // document.getElementById('debug').innerText = `${V_position[0].toFixed(3)}, ${V_position[1].toFixed(3)}`

        mat4.rotate(M_proj, M_lookat, glMatrix.toRadian(-rot_pitch), [0, 1, 0]);
        mat4.rotate(M_proj, M_proj, glMatrix.toRadian(-rot_yaw), [0, 0, 1]);
        mat4.translate(M_proj, M_proj, [-camera_position[0], -camera_position[1], -camera_height]);
        mat4.multiply(M_proj, M_perpective, M_proj);

        mat4.identity(M_camera);
        mat4.translate(M_camera, M_camera, [camera_position[0], camera_position[1], 0]);
        mat4.rotate(M_camera, M_camera, glMatrix.toRadian(rot_yaw), [0, 0, 1]);
        
        draw_layers();
        frame_i++;
        // setTimeout(() =>{requestAnimationFrame(loop);}, 1000 / fps);
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);


}