// python -m http.server 8888

let global_glsl = `
precision mediump float;
uniform vec2 tex_res;
uniform sampler2D feedback_layer;
uniform vec2 resolution;
`;

let screen_vs_src = `
attribute vec2 vert_pos;
varying vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
    xy = vert_pos;
}
`;

let feedback_fs_src = `
void main(){
    vec2 uv = gl_FragCoord.xy / tex_res;
    gl_FragColor = vec4(1., uv.x, uv.y, 1.);
    // gl_FragColor = vec4(1., 0., 0., 1.);
    // gl_FragColor = texture2D(feedback_layer, uv);
}
`

let display_fs_src = `
void main(){
    vec2 uv = gl_FragCoord.xy / resolution;
    gl_FragColor = texture2D(feedback_layer, uv);
    gl_FragColor.a = 1.;
    // gl_FragColor = vec4(uv.x, 1., uv.y, 1.);
    // gl_FragColor = texture2D(feedback_layer, vec2(0.));
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
var frame_i = 0;
const texture_res = 512;
const fps = 1;

var layers = [];

function mouse_move(event){
    mouse_x = event.clientX - offset_x;
    mouse_y = event.srcElement.height - event.clientY + offset_y;
    buttons = event.buttons;
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
    // gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function compile_shader(source, type){
    let shader = gl.createShader(type);
    gl.shaderSource(shader, global_glsl + source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        console.error('Failed to compile shader:', gl.getShaderInfoLog(shader));
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

function create_texture(width, height, color=[0, 0, 0, 1.0]){
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);  // use texture 0 temporarily
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    if (color != null){
        color = new Float32Array(Array(width * height).fill(color).flat());
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, color);
    return texture;
}

function create_fbo(width, height){
    let fbo = gl.createFramebuffer();
    let depthbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthbuffer);
    return fbo;
}

function set_uniforms(program){
    gl.uniform2f(gl.getUniformLocation(program, 'resolution'), width, height);
    gl.uniform2f(gl.getUniformLocation(program, 'tex_res'), texture_res, texture_res);
    gl.uniform2f(gl.getUniformLocation(program, 'mouse'), mouse_x, mouse_y);
    gl.uniform1i(gl.getUniformLocation(program, 'buttons'), buttons);
}

function add_layer(
        name, program, 
        vertex_buffer, tri_buffer, n_tris, clear=true, fbo=null,        
        texture1=null, texture2=null, blend_alpha=true, clear_color=[0.5, 0.5, 0.5, 1.0]
    ){
    let active_texture = (fbo == null) ? null : layers.length;
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
        clear: clear,
        blend_alpha: blend_alpha,
        clear_color: clear_color
    });
}

function swap_textures(l){
    for (let i = 0; i < layers.length; i++){
        let layer = layers[i];
        
        // swap textures
        [layers[i].sample_texture, layers[i].fbo_texture] = [layer.fbo_texture, layer.sample_texture];

        // setup textures and framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.fbo);
        if (layer.sample_texture != null){
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, layers[i].sample_texture);
            console.log('sample texture to', layers[i].sample_texture.name);
        }
    }
}

function draw_layers(){

    for (let i = 0; i < layers.length; i++){

        let layer = layers[i];
        
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
        
        // set layer texture uniforms for this program
        gl.useProgram(layer.program);
        for (j = 0; j < layers.length; j++){
            l = layers[j];
            if (l.sample_texture != null){
                let loc = gl.getUniformLocation(layer.program, l.name);
                if (loc != null){
                    gl.uniform1i(loc, j);
                }
            }
        }

        // set the rest of the uniforms
        set_uniforms(layer.program);
        
        // set alpha blend function
        if (layer.blend_alpha){
            gl.enable(gl.BLEND);
        } else {
            gl.disable(gl.BLEND);
        }

        // set fbo
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.fbo);
        if (layer.fbo != null){
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
                gl.TEXTURE_2D, layer.fbo_texture, 0
            );
            console.log('fbo texture to ', layer.fbo_texture.name);
        }

        // clear canvas
        if (layer.clear){
            // gl.clearColor(172 / 255, 214 / 255, 242 / 255, 1);
            gl.clearColor(...layer.clear_color);
            gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        }
        
        // console.log(layer.name, layer.clear, layer.blend_alpha, layer.fbo);
        if (layer.sample_texture != null){
            console.log(layer.sample_texture.name, layer.fbo_texture.name);
        }
        
        // draw
        gl.drawElements(gl.TRIANGLES, layer.n_tris * 3, gl.UNSIGNED_SHORT, 0);

    }
}

function init(){

    let canvas = document.getElementById('gl-canvas');
    setup_gl(canvas);

    rect_verts = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
    ];
    rect_tris = [
        [0, 1, 2],
        [0, 2, 3]
    ];

    let screen_vs = compile_shader(screen_vs_src, gl.VERTEX_SHADER);
    let rect_vert_buffer = create_buffer(new Float32Array(rect_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let rect_tri_buffer = create_buffer(new Uint16Array(rect_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let tex1 = create_texture(texture_res, texture_res, [1.0, 0.0, 0.0, 1.0]);
    tex1.name = 'tex1';
    let tex2 = create_texture(texture_res, texture_res, [0.0, 1.0, 0.0, 1.0]);
    tex2.name = 'tex2';

    add_layer(
        'feedback_layer',
        link_program(
            screen_vs,
            compile_shader(feedback_fs_src, gl.FRAGMENT_SHADER)
        ),
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        false,
        create_fbo(texture_res, texture_res),
        tex1,
        tex2,
        false,
        [1., 1., 0., 1.]
    );

    add_layer(
        'display_layer',
        link_program(
            screen_vs,
            compile_shader(display_fs_src, gl.FRAGMENT_SHADER)
        ),
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        true,
        null,
        null,
        null,
        false,
        [0., 1., 1., 1.]
    );

    let loop = function(){
        swap_textures();
        draw_layers();
        setTimeout(() =>{requestAnimationFrame(loop);}, 1000 / fps);
        // requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);


}