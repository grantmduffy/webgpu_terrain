let sim_vs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 vert_pos;
out vec2 uv;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
    uv = vert_pos * 0.5 + 0.5;
}

`;

let sim_fs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 uv;
layout(location = 0) out vec4 low0;
layout(location = 1) out vec4 low1;
layout(location = 2) out vec4 high0;
layout(location = 3) out vec4 high1;
layout(location = 4) out vec4 other0;


void main(){
    low0 = vec4(1., uv, 1.);
    low1 = vec4(0., uv, 1.);
    high0 = vec4(uv, 1., 1.);
    high1 = vec4(uv, 0., 1.);
    other0 = vec4(0.5, 1., 0., 1.);
}

`;

let render_vs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 vert_pos;
out vec2 uv;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
    uv = vert_pos * 0.5 + 0.5;
}

`;

let render_fs_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 uv;
out vec4 frag_color;
uniform sampler2D low0;
uniform sampler2D low1;
uniform sampler2D high0;
uniform sampler2D high1;
uniform sampler2D other0;


void main(){
    frag_color = texture(low0, uv);
}

`;


function mouse_move(event){

}


function init(){
    let canvas = document.getElementById('gl-canvas')
    let [width, height] = [canvas.width, canvas.height];
    setup_gl(canvas);
    
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
    let tex_names = ['low0', 'low1', 'high0', 'high1', 'other0'];
    let textures = [];
    for (var i = 0; i < tex_names.length; i++){
        textures.push({
            'name': tex_names[i],
            'in_tex': create_texture(width, height, [0, 1, 0, 1], i),
            'out_tex': create_texture(width, height, [0, 0, 1, 1], i)
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
        gl.COLOR_ATTACHMENT4,
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
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, 3 * screen_mesh[1].length, gl.UNSIGNED_SHORT, 0);

        // draw render
        gl.useProgram(render_program);
        for (var i = 0; i < textures.length; i++){
            gl.uniform1i(gl.getUniformLocation(render_program, textures[i].name), i);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, 3 * screen_mesh[1].length, gl.UNSIGNED_SHORT, 0);

        console.log('draw');
    }
    setInterval(loop, 1000);
}