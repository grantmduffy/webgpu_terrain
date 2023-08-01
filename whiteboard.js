let vertex_shader_src = `
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
uniform sampler2D texture0;

void main(){
    // gl_FragColor = vec4(gl_FragCoord.xy / resolution, 1., 1.);
    // gl_FragColor = texture2D(texture0, vec2(0.5));
    gl_FragColor = texture2D(texture0, gl_FragCoord.xy / resolution);
    if ((length(gl_FragCoord.xy - mouse) < 30.) && (buttons == 1)){
            gl_FragColor = vec4(vec3(0.5), 1.);
    }
}
`;

var mouse_x = 0.5;
var mouse_y = 0.5;
var buttons = 0;

function mouse_move(event){
    mouse_x = event.clientX;
    mouse_y = event.srcElement.height - event.clientY;
    buttons = event.buttons;
    document.getElementById('text').innerText = buttons;
}

function init(){
    console.log('init');

    // setup webgl
    let canvas = document.getElementById('gl-canvas');
    let gl = canvas.getContext('webgl');
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CW);
    gl.cullFace(gl.BACK);

    // compile vertex shader
    var vertex_shader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertex_shader, vertex_shader_src);
    gl.compileShader(vertex_shader);
    if (!gl.getShaderParameter(vertex_shader, gl.COMPILE_STATUS)){
        console.error('Failed to compile vertex shader:', gl.getShaderInfoLog(vertex_shader));
        return;
    }

    // compile fragment shader
    var fragment_shader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragment_shader, fragment_shader_src);
    gl.compileShader(fragment_shader);
    if (!gl.getShaderParameter(fragment_shader, gl.COMPILE_STATUS)){
        console.error('Failed to compile fragment shader:', gl.getShaderInfoLog(fragment_shader));
        return;
    }

    // link program
    var program = gl.createProgram();
    gl.attachShader(program, fragment_shader);
    gl.attachShader(program, vertex_shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)){
        console.error('Failed to link program:', gl.getProgramInfoLog(program));
        return;
    }

    // validate/use program
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)){
        console.error('Failed to validate program:', gl.getProgramInfoLog(program));
        return;
    }
    gl.useProgram(program);

    // setup vertex buffer
    var verts = [
        -1, -1,
        -1, 1,
        1, -1,
        1, 1
    ];
    var vert_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vert_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

    // seteup index buffer
    var tris = [
        0, 1, 3,
        0, 3, 2
    ];
    var idx_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(tris), gl.STATIC_DRAW);

    // setup vertex attributes
    var pos_attr_loc = gl.getAttribLocation(program, 'vert_pos');
    gl.vertexAttribPointer(
        pos_attr_loc, // attr location
        2,            // # of elements per attr
        gl.FLOAT,     // dtype of attr
        gl.FALSE,     // normalized
        2 * 4,        // # of bytes per attr
        0             // offset to this attr
    );
    gl.enableVertexAttribArray(pos_attr_loc);
    
    // setup uniforms
    var pos_attr_res = gl.getUniformLocation(program, 'resolution');
    gl.uniform2f(pos_attr_res, canvas.width, canvas.height);
    var pos_attr_mouse = gl.getUniformLocation(program, 'mouse');
    var pos_attr_buttons = gl.getUniformLocation(program, 'buttons');

    var texture0 = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 255, 255, 255]));
    var image = new Image();
    image.src = 'whiteboard.jpg';
    image.addEventListener('load', function() {
        gl.bindTexture(gl.TEXTURE_2D, texture0);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, image);
    })
    
    // run loop
    var loop = function(){
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.uniform2f(pos_attr_mouse, mouse_x, mouse_y);
        gl.uniform1i(pos_attr_buttons, buttons);
        gl.drawElements(gl.TRIANGLES, tris.length, gl.UNSIGNED_SHORT, 0);
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

}