// python -m http.server 8888

let screen_vs_src = `
attribute vec2 vert_pos;
varying vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
}
`;

let feedback_fs_src = `
void main(){
    vec2 uv = gl_FragCoord.xy / tex_res;
    gl_FragColor = texture2D(feedback_layer, uv);
    gl_FragColor.xyz *= decay_rate;
    if ((length(mouse - gl_FragCoord.xy) < pen_size) && (buttons != 0)){
        gl_FragColor = pen_color;
    }
}
`

let display_fs_src = `
void main(){
    vec2 uv = gl_FragCoord.xy / resolution;
    gl_FragColor = texture2D(feedback_layer, uv);
}
`

var width = 0;
var height = 0;
var offset_x = 0;
var offset_y = 0;
const texture_res = 512;
const fps = 120;


function mouse_move(event){
    uniforms['mouse'].value[0] = event.clientX - offset_x;
    uniforms['mouse'].value[1] = event.srcElement.height - event.clientY + offset_y;
    uniforms['buttons'].value = event.buttons;
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

    add_uniform('pen_size', 'float', 30, true);
    add_uniform('tex_res', 'vec2', [width, height]);
    add_uniform('resolution', 'vec2', [width, height]);
    add_uniform('mouse', 'vec2', [0, 0]);
    add_uniform('buttons', 'int', 0);
    add_uniform('pen_color', 'vec4', [0, 1, 1, 1], true);
    add_uniform('decay_rate', 'float', 0.99, true, 0.8, 1);
    add_uniform('frame_i', 'int', 0);
    
    let rect_vert_buffer = create_buffer(new Float32Array(rect_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let rect_tri_buffer = create_buffer(new Uint16Array(rect_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let tex1 = create_texture(width, height, [0.0, 0.0, 0.0, 1.0]);
    tex1.name = 'tex1';
    let tex2 = create_texture(width, height, [0.0, 0.0, 0.0, 1.0]);
    tex2.name = 'tex2';

    add_layer(
        'feedback_layer',
        screen_vs_src,
        feedback_fs_src,
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        true,
        create_fbo(width, height),
        tex1,
        tex2,
        false,
        [0., 0., 0., 1.]
    );

    add_layer(
        'display_layer',
        screen_vs_src,
        feedback_fs_src,
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        false,
        null,
        null,
        null,
        false,
        [0., 0., 0., 1.]
    );

    compile_layers();

    let loop = function(){
        swap_textures();
        draw_layers();
        setTimeout(() =>{requestAnimationFrame(loop);}, 1000 / fps);
        uniforms['frame_i'].value++;
    }
    requestAnimationFrame(loop);


}