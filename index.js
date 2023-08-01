let vertex_shader_src = `
precision mediump float;

attribute vec3 vert_pos;
attribute vec3 vert_color;
varying vec3 frag_color;
uniform mat4 M_world;
uniform mat4 M_view;
uniform mat4 M_proj;

void main(){
    frag_color = vert_color;
    gl_Position = M_proj * M_view * M_world * vec4(vert_pos, 1.);
}
`

let fragment_shader_src = `
precision mediump float;

varying vec3 frag_color;

void main(){
    gl_FragColor = vec4(frag_color, 1.);
}
`;

var mouse_x = 0.5;
var mouse_y = 0.5;

function mouse_move(event){
    if (event.buttons == 1){
        mouse_x = event.clientX / event.srcElement.width;
        mouse_y = 1 - event.clientY / event.srcElement.height;
        document.getElementById('text').innerText = 'x=' + mouse_x + ', y=' + mouse_y + ', button=' + event.buttons;
    }   
}

function init(){
    console.log('init');

    let canvas = document.getElementById('gl-canvas');
    let gl = canvas.getContext('webgl');
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CW);
    gl.cullFace(gl.BACK);

    console.log('using: ', gl);

    var vertex_shader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertex_shader, vertex_shader_src);
    gl.compileShader(vertex_shader);
    if (!gl.getShaderParameter(vertex_shader, gl.COMPILE_STATUS)){
        console.error('Failed to compile vertex shader:', gl.getShaderInfoLog(vertex_shader));
        return;
    }

    var fragment_shader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragment_shader, fragment_shader_src);
    gl.compileShader(fragment_shader);
    if (!gl.getShaderParameter(fragment_shader, gl.COMPILE_STATUS)){
        console.error('Failed to compile fragment shader:', gl.getShaderInfoLog(fragment_shader));
        return;
    }

    var program = gl.createProgram();
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
    
    var colors = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [1, 1, 0],
        [0, 1, 1],
        [1, 0, 1]
    ];

    var verts = [];
    var i = 0;
    for (var x = -1; x <= 1; x += 0.1){
        var row = [];
        for (var y = -1; y <= 1; y += 0.1){
            var v = [x, y, (i % colors.length) * 0.01, ...colors[i % colors.length]];
            // console.log(v);
            row.push(v);
            i++;
        }
        verts.push(row);
    }
    let n = verts.length;
    let m = verts[0].length;
    verts = verts.flat(2);
    // console.log(n, m);
    // console.log(verts);

    var tris = [];
    for (var i = 0; i < n - 1; i++){
        for (var j = 0; j < m - 1; j++){
            tri1 = [
                j + m * i, 
                j + m * (i + 1), 
                j + 1 + m * (i + 1),                
            ];
            tri2 = [
                j + m * i,
                j + 1 + m * (i + 1),
                j + 1 + m * i 
            ];
            tris.push(...tri1, ...tri2);
            // console.log(i, j, tri1, tri2);
        }
    }

    var vert_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vert_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

    var idx_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(tris), gl.STATIC_DRAW);

    var pos_attr_loc = gl.getAttribLocation(program, 'vert_pos');
    var color_attr_loc = gl.getAttribLocation(program, 'vert_color');
    gl.vertexAttribPointer(
        pos_attr_loc, // attr location
        3,            // # of elements per attr
        gl.FLOAT,     // dtype of attr
        gl.FALSE,     // normalized
        6 * 4,        // # of bytes per attr
        0             // offset to this attr
    );
    gl.vertexAttribPointer(
        color_attr_loc, // attr location
        3,              // # of elements per attr
        gl.FLOAT,       // dtype of attr
        gl.FALSE,       // normalized
        6 * 4,          // # of bytes per attr
        3 * 4           // offset to this attr
    );
    gl.enableVertexAttribArray(pos_attr_loc);
    gl.enableVertexAttribArray(color_attr_loc);
    
    gl.useProgram(program);
    

    var m_world_attr_loc = gl.getUniformLocation(program, 'M_world');
    var m_view_attr_loc = gl.getUniformLocation(program, 'M_view');
    var m_proj_attr_loc = gl.getUniformLocation(program, 'M_proj');
    var M_world = new Float32Array(16);
    var M_view = new Float32Array(16);
    var M_proj = new Float32Array(16);
    mat4.identity(M_world);
    mat4.lookAt(M_view, [0, 0, -5], [0, 0, 0], [0, 1, 0]);
    mat4.perspective(M_proj, glMatrix.toRadian(45), canvas.width / canvas.height, 0.1, 1000.0);

    gl.uniformMatrix4fv(m_world_attr_loc, gl.False, M_world);
    gl.uniformMatrix4fv(m_view_attr_loc, gl.False, M_view);
    gl.uniformMatrix4fv(m_proj_attr_loc, gl.False, M_proj);

    var angle_1 = 0;
    var angle_2 = 0;
    var I = new Float32Array(16);
    mat4.identity(I);
    var loop = function(){
        // angle = performance.now() / 1000 / 6 * 2 * Math.PI;
        // angle = 0;
        angle_1 = (mouse_x - 0.5) * 360 * Math.PI / 180
        angle_2 = (mouse_y - 0.5) * 360 * Math.PI / 180
        mat4.rotate(M_world, I, angle_1, [0, 1, 0]);
        mat4.rotate(M_world, M_world, angle_2, [1, 0, 0]);
        gl.uniformMatrix4fv(m_world_attr_loc, gl.False, M_world);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        // gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.drawElements(gl.TRIANGLES, tris.length, gl.UNSIGNED_SHORT, 0);
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    console.log('done.');

}