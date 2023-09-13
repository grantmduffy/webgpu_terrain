let simple_vertex_shader_src = `
precision mediump float;

attribute vec2 vert_pos;
varying vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
    xy = vert_pos;
}
`

let background_fragment_shader_src = `
precision mediump float;

#define cursor 30.

uniform vec2 resolution;
uniform vec2 mouse;
uniform int buttons;
uniform sampler2D background_layer;
uniform mat4 M_proj;
varying vec2 xy;

void main(){
    vec4 xyz = M_proj * vec4(xy, 0., 1.);
    xyz /= xyz.w;
    gl_FragColor = texture2D(background_layer, gl_FragCoord.xy / resolution);
    float len = length((xyz.xy + 1.) * resolution / 2. - mouse);
    if (len < cursor && buttons == 1){
        gl_FragColor.rgb += 0.1 * (1. - len / cursor);
    }
}

`

let projection_vertex_shader_src = `
precision mediump float;

uniform mat4 M_proj;
attribute vec2 vert_pos;
varying vec2 uv;
uniform sampler2D background_layer;

void main(){
    uv = (vert_pos + 1.) / 2.;
    float z = texture2D(background_layer, uv).r;
    // gl_Position = M_proj * vec4(vert_pos, z, 1.);
    gl_Position = M_proj * vec4(vert_pos, 0., 1.);
}

`;


let display_fragment_shader_src = `
precision mediump float;

uniform vec2 resolution;
uniform vec2 mouse;
uniform int buttons;
uniform sampler2D background_layer;
uniform mat4 M_proj_inv;
uniform mat4 M_proj;
varying vec2 uv;

void main(){
    gl_FragColor = texture2D(background_layer, uv);
}
`

var mouse_x = 0;
var mouse_y = 0;
var buttons = 0;
var gl = null;
var width = 0;
var height = 0;
var offset_x = 0;
var offset_y = 0;
let M_lookat = new Float32Array(16);
var M_proj = new Float32Array(16);
let M_perpective = new Float32Array(16);
let M_proj_inv = new Float32Array(16);
var rot_horizontal = 0;

var layers = [];

function mouse_move(event){
    mouse_x = event.clientX - offset_x;
    mouse_y = event.srcElement.height - event.clientY + offset_y;
    buttons = event.buttons;
}

function on_keydown(event){
    if (event.keyCode == 37){
        mat4.rotate(M_lookat, M_lookat, glMatrix.toRadian(5), [0, 1, 0]);
    }
    if (event.keyCode == 39){
        mat4.rotate(M_lookat, M_lookat, glMatrix.toRadian(-5), [0, 1, 0]);
    }
    if (event.keyCode == 38){
        mat4.rotate(M_lookat, M_lookat, glMatrix.toRadian(-5), [1, 0, 0]);
    }
    if (event.keyCode == 40){
        mat4.rotate(M_lookat, M_lookat, glMatrix.toRadian(5), [1, 0, 0]);
    }
}

function setup_gl(canvas){
    width = canvas.width;
    height = canvas.height;
    let rect = canvas.getBoundingClientRect();
    offset_x = rect.left;
    offset_y = rect.top;
    gl = canvas.getContext('webgl');
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CW);
    gl.cullFace(gl.BACK);
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

function create_texture(active_texture, color=[0, 0, 0, 255]){
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + active_texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (color != null){
        color = new Uint8Array(Array(width * height).fill(color).flat());
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, color);
    return texture;
}

function creat_fbo(texture){
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
    gl.uniform2f(gl.getUniformLocation(program, 'mouse'), mouse_x, mouse_y);
    gl.uniform1i(gl.getUniformLocation(program, 'buttons'), buttons);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'M_proj'), gl.False, M_proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'M_proj_inv'), gl.False, M_proj_inv);
}

function add_layer(
        name, program, 
        vertex_buffer, tri_buffer, n_tris, fbo=null,        
        active_texture=null, texture1=null, texture2=null
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
        gl.clearColor(0, 0.5, 0.5, 1);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

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
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1]
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
    let texture0 = create_texture(1, [0, 0, 0, 255]);
    let texture1 = create_texture(2, [0, 0, 0, 255]);
    let background_fbo = creat_fbo(texture1);
    add_layer(
        'background_layer', 
        background_program,
        plane_vert_buffer,
        plane_tri_buffer,
        plane_tris.length,
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

    // mat4.identity(M_proj);
    mat4.lookAt(M_lookat, [0, 0, 3], [0, 0, 0], [0, 1, 0]);
    mat4.perspective(M_perpective, glMatrix.toRadian(45), width / height, 0.1, 1000.0);
    

    let loop = function(){
        mat4.multiply(M_proj, M_perpective, M_lookat);
        mat4.invert(M_proj_inv, M_proj);
        draw_layers();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);


}