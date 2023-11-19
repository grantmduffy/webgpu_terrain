var global_glsl = `
precision mediump float;
`;

var gl = null;
var layers = [];
var uniforms = {};


function hex2rgba(x){
    x = Number('0x' + x.slice(1));
    return [((x >> 16) & 0xff) / 255.0, ((x >> 8) & 0xff) / 255.0, (x & 0xff) / 255.0, 1.0];
}

function rgba2hex(vals){
    return '#' + vals.slice(0, -1).map(function(x){return Math.round(x * 255).toString(16).padStart(2, '0')}).join('');
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (color != null && Array.isArray(color)){
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

function add_uniform(name, type, value, input=false, min=null, max=null){
    uniforms[name] = {
        'type': type,
        'value': value,
        'input': input
    };
    global_glsl = global_glsl.concat('\nuniform ', type, ' ', name, ';');
    let inputs_el = document.getElementById('inputs');
    if (!input) return;
    switch (type){
        case 'vec4':
            html = `<div class="uniform-input"><label for="${name}">${name}: </label><input type="color" id="${name}" onchange="{
                uniforms['${name}'].value = hex2rgba(document.getElementById('${name}').value);
                document.getElementById('${name}_value').innerText = uniforms['${name}'].value.map(function(x){return x.toPrecision(2);}).join(', ');
            }" value="${rgba2hex(value)}"><label id="${name}_value">${uniforms[name].value}</label></div>`;
            inputs_el.innerHTML = inputs_el.innerHTML.concat(html);
            break;
        case 'float':
            if (min == null){
                html = `<div class="uniform-input"><label for="${name}">${name}: </label><input type="number" id="${name}" \
                onchange="uniforms['${name}'].value = parseFloat(document.getElementById('${name}').value)" value="${uniforms[name].value}" step="0.001"></div>`;
                inputs_el.innerHTML = inputs_el.innerHTML.concat(html);
            } else {
                step = (max - min) / 100.0
                html = `<div class="uniform-input"><label for="${name}">${name}: </label><input type="range" id="${name}" min="${min}" max="${max}" \
                onchange="{
                    uniforms['${name}'].value = parseFloat(document.getElementById('${name}').value);
                    document.getElementById('${name}_value').innerText = uniforms['${name}'].value.toPrecision(2);
                }" value="${uniforms[name].value}" step="${step}"><div id="${name}_value">${value}</div></div>`;
                inputs_el.innerHTML = inputs_el.innerHTML.concat(html);
            }
            break;
        case 'int':
            if (min == null){
                html = `<div class="uniform-input"><label for="${name}">${name}: </label><input type="number" id="${name}" \
                onchange="uniforms['${name}'].value = parseInt(document.getElementById('${name}').value)" value="${uniforms[name].value}" step="1"></div>`;
                inputs_el.innerHTML = inputs_el.innerHTML.concat(html);
            } else {
                html = `<div class="uniform-input"><label for="${name}">${name}: </label><input type="range" id="${name}" min="${min}" max="${max}" \
                onchange="{
                    uniforms['${name}'].value = parseInt(document.getElementById('${name}').value);
                    document.getElementById('${name}_value').innerText = uniforms['${name}'].value.toPrecision(2);
                }" value="${uniforms[name].value}" step="1"><div id="${name}_value">${value}</div></div>`;
                inputs_el.innerHTML = inputs_el.innerHTML.concat(html);
            }
            break;
    }
}

function set_uniforms(program){
    for (var name in uniforms){
        let uniform = uniforms[name];
        let loc = gl.getUniformLocation(program, name);
        switch (uniform.type) {
            case 'float':
                gl.uniform1f(loc, uniform.value);
                break;
            case 'int':
            case 'sampler2D':
                gl.uniform1i(loc, uniform.value);
                break;
            case 'vec2':
                gl.uniform2f(loc, ...uniform.value);
                break;
            case 'vec3':
                gl.uniform3f(loc, ...uniform.value);
                break;
            case 'vec4':
                gl.uniform4f(loc, ...uniform.value);
                break;
            case 'mat2':
                gl.uniformMatrix2fv(loc, gl.False, uniform.value);
                break;
            case 'mat3':
                gl.uniformMatrix3fv(loc, gl.False, uniform.value);
                break;
            case 'mat4':
                gl.uniformMatrix4fv(loc, gl.False, uniform.value);
                break;
        }
    }
}

function add_layer(
        name, vertex_shader_src, fragment_shader_src, 
        vertex_buffer, tri_buffer, n_tris, clear=true, fbo=null,        
        texture1=null, texture2=null, blend_alpha=true, clear_color=[0.5, 0.5, 0.5, 1.0]
    ){
    // let active_texture = (fbo == null) ? null : layers.length;
    layers.push({
        name: name,
        vertex_shader_src: vertex_shader_src,
        fragment_shader_src: fragment_shader_src,
        vertex_buffer: vertex_buffer,
        tri_buffer: tri_buffer,
        n_tris: n_tris,
        fbo: fbo,
        // active_texture: active_texture,
        sample_texture: texture1,
        fbo_texture: texture2,
        clear: clear,
        blend_alpha: blend_alpha,
        clear_color: clear_color
    });
}

function compile_layers(){

    // add sampler2D uniforms for each layer
    for (var i = 0; i < layers.length; i++){
        add_uniform(layers[i].name, 'sampler2D', i);
    }

    // compile programs for each layer
    for (var i = 0; i < layers.length; i++){
        let layer = layers[i];
        let vertex_shader = compile_shader(layer.vertex_shader_src, gl.VERTEX_SHADER);
        let fragment_shader = compile_shader(layer.fragment_shader_src, gl.FRAGMENT_SHADER);
        let program = link_program(vertex_shader, fragment_shader);
        layers[i].program = program;
    }

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
        
        gl.useProgram(layer.program);
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
        }

        // clear canvas
        if (layer.clear){
            // gl.clearColor(172 / 255, 214 / 255, 242 / 255, 1);
            gl.clearColor(...layer.clear_color);
            gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        }
        
        // draw
        gl.drawElements(gl.TRIANGLES, layer.n_tris * 3, gl.UNSIGNED_SHORT, 0);

    }
}