// python -m http.server 8888

global_glsl += `
vec4 back_convect(){
    vec2 loc = gl_FragCoord.xy / tex_res;

    // reverse convection
    vec4 U  = texture2D(velocity_layer, loc);
    vec4 Un = texture2D(velocity_layer, loc + vec2(0., 1.) / tex_res);
    vec4 Us = texture2D(velocity_layer, loc + vec2(0., -1.) / tex_res);
    vec4 Ue = texture2D(velocity_layer, loc + vec2(1., 0.) / tex_res);
    vec4 Uw = texture2D(velocity_layer, loc + vec2(-1., 0.) / tex_res);
    vec4 U = (U + Un + Us + Ue + Uw) / 5.;
    vec4 out = loc.xyxy - dt * U / tex_res;

    return out;
}
`;

let screen_vs_src = `
attribute vec2 vert_pos;
varying vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
}
`;

let surface_fs_src = `
// [Z,  w,  s,  Ts?]
void main(){
    vec2 loc = gl_FragCoord.xy / tex_res;
    gl_FragColor = texture2D(surface_layer, loc);

    float x = length(mouse - gl_FragCoord.xy) / pen_size;
    if ((x < 1.) && (buttons == 1)){
        gl_FragColor.x += pen_weight * (1. -  x * x * (3. - 2. * x));
    }
}
`;

let velocity_fs_src = `
// [Ul, Vl, Uh, Vh ]
void main(){
    vec2 loc = gl_FragCoord.xy / tex_res;
    gl_FragColor = texture2D(velocity_layer, loc);
}
`;

let vapor_fs_src = `
// [Tl, Hl, Th, Hh ]
void main(){

    // convect 2D
    vec4 loc = back_convect(gl_FragCoord.xy / tex_res);
    gl_FragColor.xy = texture2D(vapor_layer, loc.xy).xy;
    gl_FragColor.zw = texture2D(vapor_layer, loc.zw).zw;

    // convect Z
    float W = clamp(texture2D(pressure_layer, (loc.xy + loc.zw) / 2.).z, -1., 1.);
    if (W > 0.){
        gl_FragColor.zw += W * (gl_FragColor.xy - gl_FragColor.zw);
    } else {
        gl_FragColor.xy -= W * (gl_FragColor.zw - gl_FragColor.xy);
    }
}
`;

let pressure_fs_src = `
// [Pl, Ph, W,  ?  ]
void main(){

    // convect 2D
    vec2 loc = gl_FragCoord.xy / tex_res;
    vec4 conv_loc = back_convect(loc);
    gl_FragColor.x = texture2D(pressure_layer, conv_loc.xy).x;
    gl_FragColor.y = texture2D(pressure_layer, conv_loc.zw).y;
    gl_FragColor.z = texture2D(pressure_layer, (conv_loc.xy + conv_loc.zw) / 2.).z;

    // [Ul, Vl, Uh, Vh]
    vec4 Un = texture2D(velocity_layer, loc + vec2(0., 1.));
    vec4 Us = texture2D(velocity_layer, loc + vec2(0., -1.));
    vec4 Ue = texture2D(velocity_layer, loc + vec2(1., 0.));
    vec4 Uw = texture2D(velocity_layer, loc + vec2(-1., 0.));

    vec4 Un = texture2D(velocity_layer, loc + vec2(0., 1.));
    vec4 Us = texture2D(velocity_layer, loc + vec2(0., -1.));
    vec4 Ue = texture2D(velocity_layer, loc + vec2(1., 0.));
    vec4 Uw = texture2D(velocity_layer, loc + vec2(-1., 0.));
    
    // smooth pressure
    gl_    
    
    // accumulate pressure
    gl_FragColor.xy += Uw.xz - Ue.xz + Us.yw - Un.yw;


}
`;

let display_fs_src = `
void main(){
    vec2 loc = gl_FragCoord.xy / tex_res;
    float z = texture2D(surface_layer, loc).x;
    gl_FragColor = vec4(vec3(z), 1.);
}
`;

/*

sym|  meaning                |dependants
Z  |  elevation:             |Z, w, s
w  |  water depth            |Z, w, s, Hl, Hh, Tl, Th
s  |  suspended sediment     |Z, w, s
Ts |  surface temp?          |?
W  |  vertical velocity      |W, Pl, Ph, Ul, Uh, Vl, Vh
Ul |  U low altitude         |Ul, Vl, Pl
Uh |  U high altitude        |Uh, Vh, Ph
Vl |  V low altitude         |Ul, Vl, Pl
Vh |  V hgih altitude        |Uh, Vh, Ph
Pl |  pressure low           |Ul, Vl, Z, W
Ph |  pressure high          |Uh, Vh, W
Tl |  temp low altitude      |Ul, Vl, W, Tl, Th
Th |  temp high altitude     |Uh, Vh, W, Tl, Th
Hl |  humidity low altitude  |Ul, Vl, W, Hl, Hh
Hh |  humidity high altitude |Uh, Vh, W, Hl, Hh

surface_layer:  [Z,  w,  s,  Ts?]
velocity_layer: [Ul, Vl, Uh, Vh ]
vapor_layer:    [Tl, Hl, Th, Hh ]
pressure_layer: [Pl, Ph, W,  ?  ]

erotion:
flux = f(Z, w)
w_vel = f(Z, w)
uptake = f(w_vel, s, w)
Z += uptake
s -= uptake
w += flux

velocity convection/pressure gradient:
<Ul, Vl> = <Ul, Vl>(loc - <Ul, Vl>)
<Uh, Vh> = <Uh, Vh>(loc - <Uh, Vh>)
<Ul, Vl> -= <ddx, ddy>Pl
<Uh, Vh> -= <ddx, ddy>Ph

middle convection/pressure gradient:
W = W(loc - (<Ul, Vl> + <Uh, Vh>) / 2)
W -= Ph - Pl

vapor convection:
<Tl, Hl> = <Tl, Hl>(loc - <Ul, Vl>)
<Th, Hh> = <Th, Hh>(loc - <Uh, Vh>)

pressure:
Pl = Pl(loc - <Ul, Vl>)
Ph = Ph(loc - <Uh, Vh>)
Pl += -<dx, dy> * <Ul, Vl> + <Ul, Vl> * <dx, dy> Z - W
Ph += -<dx, dy> * <Uh, Vh> + W

*/

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

    add_uniform('pen_size', 'float', 30, true, 0, 50);
    add_uniform('pen_weight', 'float', 0.02, 0.01, 0.1);
    add_uniform('tex_res', 'vec2', [width, height]);
    add_uniform('resolution', 'vec2', [width, height]);
    add_uniform('mouse', 'vec2', [0, 0]);
    add_uniform('buttons', 'int', 0);
    add_uniform('pen_color', 'vec4', [0, 1, 1, 1], true);
    add_uniform('frame_i', 'int', 0);
    add_uniform('dt', 'float', 1.0, true, 0.1, 2);
    
    let rect_vert_buffer = create_buffer(new Float32Array(rect_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let rect_tri_buffer = create_buffer(new Uint16Array(rect_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    
    add_layer(
        'surface_layer',
        screen_vs_src,
        surface_fs_src,
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        true,
        create_fbo(width, height),
        create_texture(width, height, [0.0, 0.0, 0.0, 0.0]),
        create_texture(width, height, [0.0, 0.0, 0.0, 0.0]),
        false,
        [0., 0., 0., 0.]
    );

    add_layer(
        'velocity_layer',
        screen_vs_src,
        velocity_fs_src,
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        true,
        create_fbo(width, height),
        create_texture(width, height, [0.0, 0.0, 0.0, 0.0]),
        create_texture(width, height, [0.0, 0.0, 0.0, 0.0]),
        false,
        [0., 0., 0., 0.]
    );

    add_layer(
        'vapor_layer',
        screen_vs_src,
        vapor_fs_src,
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        true,
        create_fbo(width, height),
        create_texture(width, height, [0.0, 0.0, 0.0, 0.0]),
        create_texture(width, height, [0.0, 0.0, 0.0, 0.0]),
        false,
        [0., 0., 0., 0.]
    );

    add_layer(
        'pressure_layer',
        screen_vs_src,
        pressure_fs_src,
        rect_vert_buffer,
        rect_tri_buffer,
        rect_tris.length,
        true,
        create_fbo(width, height),
        create_texture(width, height, [0.0, 0.0, 0.0, 0.0]),
        create_texture(width, height, [0.0, 0.0, 0.0, 0.0]),
        false,
        [0., 0., 0., 0.]
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