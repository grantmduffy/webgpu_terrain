let simple_vertex_shader_src = `
precision mediump float;

attribute vec2 vert_pos;
varying vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
    xy = vert_pos;
}
`;

let background_fragment_shader_src = `
precision mediump float;

#define cursor 100.

uniform vec2 resolution;
uniform vec2 tex_res;
uniform vec2 mouse;
uniform int buttons;
uniform sampler2D background_layer;
uniform mat4 M_proj;

void main(){
    vec2 xy = (2. * gl_FragCoord.xy / tex_res - 1.) * 100.;
    vec4 xyz = M_proj * vec4(xy, 0., 1.);
    xyz /= xyz.w;
    gl_FragColor = texture2D(background_layer, gl_FragCoord.xy / tex_res);
    float len = length((xyz.xy + 1.) * resolution / 2. - mouse);
    // gl_FragColor = vec4(1., 0., 1., 1.);
    if (len < cursor && buttons == 1){
        gl_FragColor.rgb += 0.1 * (1. - len / cursor);
        // gl_FragColor.rgb = vec3(4., 1., 0.);
    }
}
`;

let projection_vertex_shader_src = `
precision mediump float;

uniform mat4 M_proj;
attribute vec2 vert_pos;
varying vec2 uv;
uniform sampler2D background_layer;

void main(){
    uv = (vert_pos / 100. + 1.) / 2.;
    float z = texture2D(background_layer, uv).r;
    gl_Position = M_proj * vec4(vert_pos, 0., 1.);
}

`;


let display_fragment_shader_src = `
precision mediump float;

uniform vec2 mouse;
uniform int buttons;
uniform sampler2D background_layer;
varying vec2 uv;

void main(){
    gl_FragColor = texture2D(background_layer, uv);
    // gl_FragColor.a = 0.5;
}
`;

let radial_vertex_shader_src = `
precision mediump float;

attribute vec2 vert_pos;
uniform mat4 M_radial;
uniform mat4 M_proj;
uniform sampler2D background_layer;
varying vec2 uv;

void main(){
    vec4 world_coords = M_radial * vec4(vert_pos, 0., 1.);
    uv = (world_coords.xy / 100. + 1.) / 2.;
    float elevation = texture2D(background_layer, uv).x * 1.;
    world_coords.z = elevation;
    gl_Position = M_proj * world_coords;
}
`;

let radial_fragment_shader_src = `
precision mediump float;

varying vec2 uv;
uniform sampler2D background_layer;
uniform vec2 tex_res;

void main(){
    float val = texture2D(background_layer, uv + 1. / tex_res).x - texture2D(background_layer, uv - 1. / tex_res).x + 0.5;
    gl_FragColor = vec4(val, val, val, 1.);
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
let V_position = new Float32Array(2);
let V_direction = new Float32Array(2);
let M_lookat = new Float32Array(16);
var M_proj = new Float32Array(16);
let M_perpective = new Float32Array(16);
let M_radial = new Float32Array(16);
var rot_horizontal = 0;
const texture_res = 1024;

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
            V_position[0] -= speed * v[1];
            V_position[1] += speed * v[0];
            break;
        case 68:  // D
            V_position[0] += speed * v[1];
            V_position[1] -= speed * v[0];
            break;
        case 87:  // W
            V_position[0] += speed * v[0];
            V_position[1] += speed * v[1];
            break;
        case 83:  // S
            V_position[0] -= speed * v[0];
            V_position[1] -= speed * v[1];
            break;
    }
    document.getElementById('debug').innerText = `\
    p=(${V_position[0].toFixed(4)}, ${V_position[1].toFixed(4)})\n\
    rot=${rot_yaw.toFixed(4)}\n\
    v=(${Math.cos(glMatrix.toRadian(rot_yaw)).toFixed(4)}, \
    ${Math.sin(glMatrix.toRadian(rot_yaw)).toFixed(4)})`;
}

function setup_gl(canvas){
    width = canvas.width;
    height = canvas.height;
    let rect = canvas.getBoundingClientRect();
    offset_x = rect.left;
    offset_y = rect.top;
    gl = canvas.getContext('webgl');
    gl.getExtension("OES_texture_float");
    gl.getExtension("OES_texture_float_linear");
    gl.enable(gl.DEPTH_TEST);
    // gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CW);
    // gl.cullFace(gl.BACK);
}

function compile_shader(source, type){
    let shader = gl.createShader(type);
    gl.shaderSource(shader, source);
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

function create_texture(active_texture, color=[0, 0, 0, 255], width, height){
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + active_texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (color != null){
        // color = new Uint8Array(Array(width * height).fill(color).flat());
        color = new Float32Array(Array(width * height).fill([0., 1., 1.]).flat());
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, null);
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
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'M_radial'), gl.False, M_radial);
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

    let radial_vert_buffer = create_buffer(new Float32Array(radial_mesh.verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let radial_tri_buffer = create_buffer(new Uint16Array(radial_mesh.tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let radial_vertex_shader = compile_shader(radial_vertex_shader_src, gl.VERTEX_SHADER);
    let radial_fragment_shader = compile_shader(radial_fragment_shader_src, gl.FRAGMENT_SHADER);
    let radial_program = link_program(radial_vertex_shader, radial_fragment_shader);

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
    
    add_layer(
        'render_layer', 
        render_program, 
        plane_vert_buffer, 
        plane_tri_buffer, 
        plane_tris.length
    );

    add_layer(
        'radial_layer',
        radial_program,
        radial_vert_buffer,
        radial_tri_buffer,
        radial_mesh.tris.length,
        false
    );

    mat4.perspective(M_perpective, glMatrix.toRadian(45), width / height, 0.1, 1000.0);
    mat4.lookAt(M_lookat, [0, 0, 0], [1, 0, 0], [0, 0, 1]);

    let loop = function(){
        mat4.rotate(M_proj, M_lookat, glMatrix.toRadian(-rot_pitch), [0, 1, 0]);
        mat4.rotate(M_proj, M_proj, glMatrix.toRadian(-rot_yaw), [0, 0, 1]);
        mat4.translate(M_proj, M_proj, [-V_position[0], -V_position[1], -3]);
        mat4.multiply(M_proj, M_perpective, M_proj);

        mat4.identity(M_radial);
        mat4.translate(M_radial, M_radial, [V_position[0], V_position[1], 0]);
        mat4.rotate(M_radial, M_radial, glMatrix.toRadian(rot_yaw), [0, 0, 1]);
        
        draw_layers();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);


}