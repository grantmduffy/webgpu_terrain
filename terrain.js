let simple_vertex_shader_src = `
precision mediump float;

attribute vec2 vert_pos;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
}
`

let fragment_shader_src = `
precision mediump float;

uniform vec2 resolution;
uniform vec2 mouse;
uniform int buttons;

void main(){
    gl_FragColor = vec4(gl_FragCoord.xy / resolution, 1., 1.);
    if (length(mouse - gl_FragCoord.xy) < 10.){
        gl_FragColor = vec4(0., 1., 0., 1.);
    }
}
`

var mouse_x = 0;
var mouse_y = 0;
var buttons = 0;
var gl = null;

var layers = [];

function mouse_move(event){
    mouse_x = event.clientX;
    mouse_y = event.srcElement.height - event.clientY;
    buttons = event.buttons;
}

function setup_gl(canvas){
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

function set_uniforms(program){
    gl.uniform2f(gl.getUniformLocation(program, 'mouse'), mouse_x, mouse_y);
    gl.uniform1i(gl.getUniformLocation(program, 'buttons'), buttons);
}

function add_layer(
        name, program, 
        vertex_buffer, tri_buffer, n_tris, fbo=null,        
        active_texture1=null, texture1=null, 
        active_texture2=null, texture2=null
    ){
    layers.push({
        name: name,
        program: program,
        vertex_buffer: vertex_buffer,
        tri_buffer: tri_buffer,
        n_tris: n_tris,
        fbo: fbo,
        sample_texture: (active_texture1, texture1),
        fbo_texture: (active_texture2, texture2)
    });
}

function draw_layer(layer){

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

    // bind frame buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.fbo);
    if (layer.fbo != null){
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layer.fbo_texture[1], 0);
    }
    
    // set layer texture uniforms for this program
    gl.useProgram(layer.program);
    for (i in layers){
        l = layers[i];
        if (l.sample_texture != null){
            gl.uniform1i(gl.getAttribLocation(layer.program, l.name), layer.sample_texture[0]);
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
    layer.sample_texture, layer.fbo_texture = layer.fbo_texture, layer.sample_texture;
}

function init(){

    let canvas = document.getElementById('gl-canvas');
    setup_gl(canvas);

    let vertex_shader = compile_shader(simple_vertex_shader_src, gl.VERTEX_SHADER);
    let fragment_shader = compile_shader(fragment_shader_src, gl.FRAGMENT_SHADER);
    let program = link_program(vertex_shader, fragment_shader);

    let plane_verts = [
        [-0.9, -0.9],
        [-0.9, 0.9],
        [0.9, -0.9],
        [0.9, 0.9]
    ];
    let plane_tris = [
        [0, 1, 3],
        [0, 3, 2]
    ];

    let plane_vert_buffer = create_buffer(new Float32Array(plane_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let plane_tri_buffer = create_buffer(new Uint16Array(plane_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);

    add_layer(
        'layer_A', program, 
        plane_vert_buffer, 
        plane_tri_buffer, 
        plane_tris.length
    );

    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program, 'resolution'), canvas.width, canvas.height);

    let loop = function(){
        for (i in layers){
            draw_layer(layers[i]);
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);


}