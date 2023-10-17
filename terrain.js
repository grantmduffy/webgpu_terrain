// python -m http.server 8888
global_glsl += `
vec4 sample(sampler2D tex, vec2 uv){
    return texture2D(tex, uv);
}
`;

let simple_vertex_shader_src = `
attribute vec2 vert_pos;
varying vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
    xy = vert_pos;
}
`;

let background_fragment_shader_src = `
float t_filt = 0.5;

void main(){
    vec2 uv = gl_FragCoord.xy / tex_res;

    // [x: elevation, y: water level, z: sediment, w: none]
    vec4 b = sample(background_layer, uv);
    vec4 b_n = sample(background_layer, uv + vec2(0., 1.) / tex_res);
    vec4 b_s = sample(background_layer, uv + vec2(0., -1.) / tex_res);
    vec4 b_e = sample(background_layer, uv + vec2(1., 0.) / tex_res);
    vec4 b_w = sample(background_layer, uv + vec2(-1., 0.) / tex_res);
    gl_FragColor = b;

    // water flow
    vec4 flux = vec4(  // [n, s, e, w]
        clamp(b_n.x + b_n.y - b.x - b.y, -b.y / 4., b_n.y / 4.),
        clamp(b_s.x + b_s.y - b.x - b.y, -b.y / 4., b_s.y / 4.),
        clamp(b_e.x + b_e.y - b.x - b.y, -b.y / 4., b_e.y / 4.),
        clamp(b_w.x + b_w.y - b.x - b.y, -b.y / 4., b_w.y / 4.)
    ) * flow_rate;
    gl_FragColor.y += dot(flux, vec4(1.));

    // water velocity
    vec2 vel = vec2(
        flux.w - flux.z,   // flow in x
        flux.y - flux.x  // flow in y
    ) / 2. / (b.y + min_water_depth);
    float vel_mag = length(vel);

    // convect sediment
    // flux * (sediment / water_depth)
    gl_FragColor.z += dot(
        flux, 
        vec4(
            clamp(b_n.y == 0. ? 0. : b_n.z / b_n.y, 0., 1.), 
            clamp(b_s.y == 0. ? 0. : b_s.z / b_s.y, 0., 1.), 
            clamp(b_e.y == 0. ? 0. : b_e.z / b_e.y, 0., 1.), 
            clamp(b_w.y == 0. ? 0. : b_w.z / b_w.y, 0., 1.)
        )
    );
    gl_FragColor.z = max(gl_FragColor.z, 0.);
    
    float uptake = min(
        vel_mag * K_uptake,
        vel_mag * gl_FragColor.y * K_sat - gl_FragColor.z
    );
    gl_FragColor.z += uptake;
    gl_FragColor.x -= uptake;
    
    // world coord & cursor calculation
    vec2 xy = (2. * gl_FragCoord.xy / tex_res - 1.) * 100.;
    vec4 xyz = M_proj * vec4(xy, 0., 1.);
    xyz /= xyz.w;
    float len = length((xyz.xy + 1.) * resolution / 2. - mouse);
    float x = len / cursor;
    if (len < cursor && buttons == 1){
        gl_FragColor.x += cursor_elev_level * (1. -  x * x * (3. - 2. * x));
    }
    if (len < cursor && buttons == 2){
        // gl_FragColor.y += cursor_water_level * (1. -  x * x * (3. - 2. * x));
        gl_FragColor.z += cursor_water_level * (1. -  x * x * (3. - 2. * x));
        // gl_FragColor.z = 1.;
    }
    if (gl_FragColor.x + gl_FragColor.y <= 0.5){
        gl_FragColor.y = 0.5 - gl_FragColor.x;
    }
    if (gl_FragColor.x > 0.5){
        gl_FragColor.y += rain;
    }
    gl_FragColor.a = 0.;
    
}
`;

let camera_vertex_shader_src = `
attribute vec2 vert_pos;
varying vec2 uv;

void main(){

    // mat4 M_camera = mat4(1.);
    // mat4 M_proj = mat4(1.);

    vec4 world_coords = M_camera * vec4(vert_pos, 0., 1.);
    uv = (world_coords.xy / 100. + 1.) / 2.;
    float elevation = sample(background_layer, uv).x * 1.;
    world_coords.z = elevation;
    gl_Position = M_proj * world_coords;
}
`;

let camera_fragment_shader_src = `
varying vec2 uv;

void main(){
    float fog_amount = pow(gl_FragCoord.z, fog_gamma);
    vec3 normal = normalize(vec3(
        sample(background_layer, uv + vec2(1., 0.) / tex_res).x - sample(background_layer, uv - vec2(1., 0.) / tex_res).x,
        sample(background_layer, uv + vec2(0., 1.) / tex_res).x - sample(background_layer, uv - vec2(0., 1.) / tex_res).x,
        200. / 512.
    ));
    float val = max(dot(normal, sun_direction), 0.);
    gl_FragColor = sun_color * terrain_color;
    gl_FragColor.rgb *= clamp(val, 0.1, 1.0);
    gl_FragColor *= 1. - fog_amount;
    gl_FragColor += fog_amount * fog_color;
    gl_FragColor.a = 1.;

    // gl_FragColor = vec4(1., 0., 0., 1.);
}

`;

let water_vertex_shader_src = `
attribute vec2 vert_pos;
varying vec2 uv;
varying vec3 xyz;

void main(){
    vec4 world_coords = M_camera * vec4(vert_pos, 0., 1.);
    uv = (world_coords.xy / 100. + 1.) / 2.;
    xyz = world_coords.xyz;
    float elevation = dot(sample(background_layer, uv).xy, vec2(1.));
    world_coords.z = elevation;
    gl_Position = M_proj * world_coords;
}
`;

let water_fragment_shader_src = `
varying vec2 uv;
varying vec3 xyz;

void main(){
    // [x: elevation, y: water level, z: sediment, w: none]
    vec4 b = sample(background_layer, uv);
    vec4 b_n = sample(background_layer, uv + vec2(0., 1.) / tex_res);
    vec4 b_s = sample(background_layer, uv + vec2(0., -1.) / tex_res);
    vec4 b_e = sample(background_layer, uv + vec2(1., 0.) / tex_res);
    vec4 b_w = sample(background_layer, uv + vec2(-1., 0.) / tex_res);

    // water flow
    vec4 flux = vec4(  // [n, s, e, w]
        clamp(b_n.x + b_n.y - b.x - b.y, -b.y / 4., b_n.y / 4.),
        clamp(b_s.x + b_s.y - b.x - b.y, -b.y / 4., b_s.y / 4.),
        clamp(b_e.x + b_e.y - b.x - b.y, -b.y / 4., b_e.y / 4.),
        clamp(b_w.x + b_w.y - b.x - b.y, -b.y / 4., b_w.y / 4.)
    ) * flow_rate;
    gl_FragColor.y += dot(flux, vec4(1.));

    // water velocity
    vec2 vel = vec2(
        flux.w - flux.z,   // flow in x
        flux.y - flux.x  // flow in y
    ) / 2. / (b.y + min_water_depth);

    float vel_mag = clamp(length(vel), 0., 1.);
    float saturation = b.z / (vel_mag * b.y * K_sat);
    gl_FragColor = vec4(
        0.,
        // vel_mag * 100., 
        b.z * 100., 
        // vel_mag * b.y * K_sat * 100.,
        // saturation,
        1., 
        0.5
    );

    vec3 normal = normalize(vec3(
        dot(b_e.xy, vec2(1.)) 
        - dot(b_w.xy, vec2(1.)),
        dot(b_n.xy, vec2(1.)) 
        - dot(b_s.xy, vec2(1.)),
        200. / 512.
    ));
    // float reflection_amount = 1. - dot(normalize(camera_position - xyz), normal);
    float reflection_amount = 0.0;
    gl_FragColor = reflection_amount * fog_color + (1. - reflection_amount) * water_color;
    float water_amount = b.g;
    // gl_FragColor = vec4(0., 0., b.z * .1, 1.);
    gl_FragColor.a = min(0.5, water_amount * 1.);

    // gl_FragColor = vec4(0., 1., 0., 1.);
}

`;

let test_fragment_shader_src = `
void main(){
    gl_FragColor = vec4(1., 0., 0., 0.1);
}

`;

var width = 0;
var height = 0;
var offset_x = 0;
var offset_y = 0;
var rot_pitch = 0;
var rot_yaw = 0;
const speed = 2;
const rot_speed = 5;
const vert_speed = 0.5;
var camera_height = 3.0;
let M_lookat = new Float32Array(16);
let M_perpective = new Float32Array(16);
let M_camera = new Float32Array(16);
var camera_position = [0, 0];
var rot_horizontal = 0;
const texture_res = 512;  // TODO: figure out why resolution can't excede canvas
const fps = 60;


function mouse_move(event){
    uniforms['mouse'].value[0] = event.clientX - offset_x;
    uniforms['mouse'].value[1] = event.srcElement.height - event.clientY + offset_y;
    uniforms['buttons'].value = event.buttons;
}

function on_keydown(event){
    v = [Math.cos(glMatrix.toRadian(rot_yaw)), Math.sin(glMatrix.toRadian(rot_yaw))];
    switch (event.keyCode){
        case 37:  // left
            rot_yaw += rot_speed;
            break;
        case 39:  // right
            rot_yaw -= rot_speed;
            break;
        case 38:  // up
            rot_pitch -= rot_speed;
            break;
        case 40:  // down
            rot_pitch += rot_speed;
            break;
        case 65:  // A
            camera_position[0] -= speed * v[1];
            camera_position[1] += speed * v[0];
            break;
        case 68:  // D
            camera_position[0] += speed * v[1];
            camera_position[1] -= speed * v[0];
            break;
        case 87:  // W
            camera_position[0] += speed * v[0];
            camera_position[1] += speed * v[1];
            break;
        case 83:  // S
            camera_position[0] -= speed * v[0];
            camera_position[1] -= speed * v[1];
            break;
        case 69:
            camera_height += vert_speed;
            break;
        case 81:
            camera_height -= vert_speed;
            break;
    }
}

function init(){

    let canvas = document.getElementById('gl-canvas');
    setup_gl(canvas);

    let plane_verts = [
        [-100, -100],
        [-100, 100],
        [100, -100],
        [100, 100]
    ];
    let plane_tris = [
        [0, 1, 3],
        [0, 3, 2]
    ];

    add_uniform('cursor', 'float', 40, true, 5, 100);
    add_uniform('fog_gamma', 'float', 500);
    add_uniform('min_water_depth', 'float', 0.2, true, 0, 1);
    add_uniform('K_sat', 'float', 3, true, 1, 10);
    add_uniform('K_uptake', 'float', 0.003, true, 0.0, 0.01);
    add_uniform('cursor_water_level', 'float', 0.002, true, 0.001, 0.1);
    add_uniform('cursor_elev_level', 'float', 0.1, true, -0.3, 0.3);
    add_uniform('rain', 'float', 0.0001, true, 0, 0.001);
    add_uniform('flow_rate', 'float', 0.2, true, 0, 1.0);
    add_uniform('resolution', 'vec2', [width, height]);
    add_uniform('tex_res', 'vec2', [texture_res, texture_res]);
    add_uniform('mouse', 'vec2', [0, 0]);
    add_uniform('buttons', 'int', 0);
    add_uniform('M_proj', 'mat4', new Float32Array(16))
    add_uniform('frame_i', 'int', 0)
    add_uniform('M_camera', 'mat4', new Float32Array(16));
    add_uniform('sun_direction', 'vec3', [0.766044443118978, 0, 0.6427876096865393]);
    add_uniform('sun_color', 'vec4', [0.99, 0.98, 0.83, 1], true);
    add_uniform('terrain_color', 'vec4', [0, 0.6, 0.1, 1], true);
    add_uniform('water_color', 'vec4', [0, 0.3, 0.6, 0.7], true);
    add_uniform('fog_color', 'vec4', [0.75, 0.8, 1.0, 1.0]);

    let plane_vert_buffer = create_buffer(new Float32Array(plane_verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let plane_tri_buffer = create_buffer(new Uint16Array(plane_tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);

    let camera_vert_buffer = create_buffer(new Float32Array(camera_mesh.verts.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let camera_tri_buffer = create_buffer(new Uint16Array(camera_mesh.tris.flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);

    add_layer(
        'background_layer',
        simple_vertex_shader_src,
        background_fragment_shader_src,
        plane_vert_buffer,
        plane_tri_buffer,
        plane_tris.length,
        true,
        create_fbo(texture_res, texture_res),
        create_texture(texture_res, texture_res),
        create_texture(texture_res, texture_res),
        false
    );

    add_layer(
        'terrain_layer',
        camera_vertex_shader_src,
        camera_fragment_shader_src,
        camera_vert_buffer,
        camera_tri_buffer,
        camera_mesh.tris.length,
        true, null, null, null, false, 
        uniforms['fog_color'].value
    );

    add_layer(
        'water_layer',
        water_vertex_shader_src,
        water_fragment_shader_src,
        camera_vert_buffer,
        camera_tri_buffer,
        camera_mesh.tris.length,
        false,
        null, null, null,
        true
    );
    
    compile_layers();

    mat4.perspective(M_perpective, glMatrix.toRadian(45), width / height, 0.1, 150.0);
    mat4.lookAt(M_lookat, [0, 0, 0], [1, 0, 0], [0, 0, 1]);

    let loop = function(){

        mat4.rotate(uniforms['M_proj'].value, M_lookat, glMatrix.toRadian(-rot_pitch), [0, 1, 0]);
        mat4.rotate(uniforms['M_proj'].value, uniforms['M_proj'].value, glMatrix.toRadian(-rot_yaw), [0, 0, 1]);
        mat4.translate(uniforms['M_proj'].value, uniforms['M_proj'].value, [-camera_position[0], -camera_position[1], -camera_height]);
        mat4.multiply(uniforms['M_proj'].value, M_perpective, uniforms['M_proj'].value);

        mat4.identity(uniforms['M_camera'].value);
        mat4.translate(uniforms['M_camera'].value, uniforms['M_camera'].value, [camera_position[0], camera_position[1], 0]);
        mat4.rotate(uniforms['M_camera'].value, uniforms['M_camera'].value, glMatrix.toRadian(rot_yaw), [0, 0, 1]);
        
        swap_textures();
        draw_layers();
        uniforms['frame_i'].value++;
        setTimeout(() =>{requestAnimationFrame(loop);}, 1000 / fps);
        // requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);


}