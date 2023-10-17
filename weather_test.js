// python -m http.server 8888

let screen_vs_src = `
attribute vec2 vert_pos;
varying vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
}
`;

let feedback_fs_src = `
// [u, v, p, T]

vec4 U, Un, Us, Ue, Uw, Unw, Usw, Une, Use;

void main(){
    vec2 loc = gl_FragCoord.xy / tex_res;

    // reverse convection
    U = texture2D(feedback_layer, loc);
    Un = texture2D(feedback_layer, loc + vec2(0., 1.) / tex_res);
    Us = texture2D(feedback_layer, loc + vec2(0., -1.) / tex_res);
    Ue = texture2D(feedback_layer, loc + vec2(1., 0.) / tex_res);
    Uw = texture2D(feedback_layer, loc + vec2(-1., 0.) / tex_res);
    U = (U + Un + Us + Ue + Uw) / 5.;
    loc -= dt * U.xy / tex_res;

    // sample neighbors
    U = texture2D(feedback_layer, loc);
    Un = texture2D(feedback_layer, loc + vec2(0., 1.) / tex_res);
    Us = texture2D(feedback_layer, loc + vec2(0., -1.) / tex_res);
    Ue = texture2D(feedback_layer, loc + vec2(1., 0.) / tex_res);
    Uw = texture2D(feedback_layer, loc + vec2(-1., 0.) / tex_res);
    Unw = texture2D(feedback_layer, loc + vec2(-1., 1.) / tex_res);
    Usw = texture2D(feedback_layer, loc + vec2(-1., -1.) / tex_res);
    Une = texture2D(feedback_layer, loc + vec2(1., 1.) / tex_res);
    Use = texture2D(feedback_layer, loc + vec2(1., -1.) / tex_res);

    // accumulate pressure
    U.z += 0.5 * Uw.x + 0.25 * Unw.x + 0.25 * Usw.x - 0.5 * Ue.x - 0.25 * Une.x - 0.25 * Use.x
    + 0.5 * Us.y + 0.25 * Usw.y + 0.25 * Use.y - 0.5 * Un.y - 0.25 * Unw.y - 0.25 * Une.y;

    U.z = U.z / 9. + Unw.z / 9. + Uw.z / 9. + Usw.z / 9. + Un.z / 9. + Us.z / 9. + Une.z / 9. + Ue.z / 9. + Use.z / 9.;

    // add pressure gradient
    U.xy += 1.0 * vec2(Uw.z - Ue.z, Us.z - Un.z);
    
    gl_FragColor = U;

    if ((length(mouse - gl_FragCoord.xy) < pen_size) && (buttons != 0)){
        gl_FragColor = vec4(0., 0.0, U.z, 1.);
    }
}
`

let display_fs_src = `
void main(){
    vec2 loc = gl_FragCoord.xy / tex_res;
    vec4 U = texture2D(feedback_layer, loc);
    gl_FragColor = vec4(vec3(U.w), 1.);
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
    add_uniform('decay_rate', 'float', 0.99, true, 0, 1);
    add_uniform('frame_i', 'int', 0);
    add_uniform('dt', 'float', 1.0, true, 0.1, 100);
    
    let rect_vert_buffer = create_buffer(new Float32Array(rect_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let rect_tri_buffer = create_buffer(new Uint16Array(rect_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let tex1 = create_texture(width, height, [1.0, 0.0, 0.0, 0.0]);
    tex1.name = 'tex1';
    let tex2 = create_texture(width, height, [1.0, 0.0, 0.0, 0.0]);
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
        display_fs_src,
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        true,
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