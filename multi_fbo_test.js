/*
textures:

value  | x | y | z | w |
       | r | g | b | a |
       | s | t | p | a | loc |
-------|---|---|---|---|-----|
low0   | u | v | - | - |  0  |
low1   | - | T | P | H |  1  |
high2  | u | v | - | - |  2  |
high3  | - | T | P | H |  3  |
mid    | r | r | - | U |  4  |
other  | s | T | z | w |  5  |
light  | g | l | h | d |  6  |

Velocity         | uv |  low0/high0.xy
Temperature      | T  |  low1/high1.t
Humidity         | H  |  low1/high1.a
Pressure         | P  |  low1/high1.p
Uplift           | U  |  mid.w
Sediment         | s  |  other.s
Surface Temp     | T  |  other.t
Elevation        | z  |  other.z
Water            | w  |  other.w
Surface Light    | g  |  light.x
Low Cloud Light  | l  |  light.y
High Cloud Light | h  |  light.z
Surface Depth    | d  |  light.w
Low/High Precip  | r  |  mid.xy

*/

let common_src = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

#define render_res vec2(640., 480.)

// simulation parameters
#define K_pressure 0.1
#define K_pressure_uplift 0.01
#define K_pressure_uplift_acc 10.
#define K_pressure_decay 0.999
#define K_uplift_damping 0.05
#define K_p_decay .9
#define K_smooth 1.0
#define K_elevation_strength 0.01

// thermal properties, Tao units in frames
#define T_eq_surface 1.
#define T_eq_shade 0.6
#define Tao_surface 100.
#define Tao_surface_to_air 3000.
#define Tao_air_from_surface 100.
#define Tao_radiation 5.
#define C_surface (Tao_surface_to_air / Tao_air_from_surface)
#define K0 (C_surface / Tao_surface)
#define K1 (1. / Tao_air_from_surface)
#define K2 (1. / Tao_radiation)
#define Q_in (T_eq_surface * K0)
#define Q_in_shade (T_eq_shade * K0)
#define freezing_temp 0.6

// surface properties
#define K_flow 1.2
#define K_flow_glacier 0.05

#define z_scale 0.1
#define water_scale 0.002
#define snow_scale 0.005
#define floating_ice_thickness 0.001

#define low_elev 0.04
#define high_elev 0.12
#define max_elev 0.3
#define cloud_transparency 0.05
#define rain_density 100.

#define cloud_threshold 0.6
#define cloud_sharpness 1.5
#define precip_threshold 0.8
#define shoreline_sharpness 1.0
#define rainbow_min 0.743
#define rainbow_max 0.766

#define ambient_color vec4( 30. / 255.,  40. / 255.,  45. / 255., 1.0)
#define sun_color     vec4(255. / 255., 255. / 255., 237. / 255., 1.0)
#define grass_color  vec4(122. / 255., 261. / 255., 112. / 255., 1.0)
#define water_color   vec4( 66. / 255., 135. / 255., 245. / 255., 1.0)
#define water_transparency 0.2

float rand(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 rand2d(vec2 co){
    float a = rand(co);
    return vec2(
        rand(vec2(co.x, a)),
        rand(vec2(co.y, a))
    );
}

float interp_elev(float z, float v_ground, float v_low, float v_high, float v_max){
    if (z < low_elev){  // below low clouds
        return z * (v_low - v_ground) / low_elev + v_ground;
    } else if (z < high_elev){  // between low and high clouds
        return (z - low_elev) * (v_high - v_low) / (high_elev - low_elev) + v_low;
    } else {  // above high clouds
        return (z - high_elev) * (v_max - v_high) / (max_elev - high_elev) + v_high;
    }
}

float interp_rain(float z, float v_ground, float v_low, float v_high, float v_max){
    float z0 = low_elev / 2.;
    float z1 = (low_elev + high_elev) / 2.;
    if (z < z0){  // below low clouds
        return z * (v_low - v_ground) / z0 + v_ground;
    } else if (z < z1){  // between low and high clouds
        return (z - z0) * (v_high - v_low) / (z1 - z0) + v_low;
    } else {  // above high clouds
        return (z - z1) * (v_max - v_high) / (high_elev - z1) + v_high;
    }
}

float get_cloud_density(float h, float t){
    return clamp((h - t - cloud_threshold) / (precip_threshold - cloud_threshold), 0., 1.);
}

float get_precip(float h, float t){
    return max(h - t - precip_threshold, 0.);
}

vec4 heatmap(float temp){
    // 0:   (0, 0, 1) x=0
    // fl:  (0, 0, 0) x=1
    // 2fl: (1, 0, 0) x=2
    // 3fl: (1, 1, 0) x=3
    // 4fl: (1, 1, 1) x=4
    float x = temp / freezing_temp;
    return float(mod(x, 0.25) > 0.01) * vec4(
        x - 1., 
        x - 2., 
        max(1. - x, x - 3.), 
        1.
    );
}

vec3 hsv2rgb(vec3 c){
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 get_rainbow(float cos_angle){
    float amt = (cos_angle - rainbow_min) / (rainbow_max - rainbow_min);
    float a = clamp(abs(2. * amt - 1.) - 1., 0., 1.);
    return mix(
        hsv2rgb(vec3(clamp(amt, 0., .72), 1., 1.)),
        vec3(1.),
        a
    );
}

vec4 get_ground_color(float temp){
    return temp > freezing_temp ? grass_color : vec4(0.5, 0.5, 0.5, 1.);
}

vec4 get_water_color(float temp, float sunlight, float cos_angle, float depth){
    vec4 white_color =  mix(ambient_color, sun_color, sunlight);
    return temp > freezing_temp ? vec4(
        white_color.rgb * water_color.rgb,
        ((1. - cos_angle) * (1. - water_transparency) + water_transparency) * clamp(depth * shoreline_sharpness, 0., 1.)
    ) : white_color;
}

`;

let sim_vs_src = `

in vec2 vert_pos;
out vec2 xy;

void main(){
    gl_Position = vec4(vert_pos, 0., 1.);
    xy = vert_pos * 0.5 + 0.5;
}

`;

let sim_fs_src = `

uniform vec2 mouse_pos;
uniform vec2 cursor_pos;
uniform int mouse_btns;
uniform int keys;
uniform vec2 sim_res;
uniform float pen_size;
uniform float pen_strength;
uniform int pen_type;
uniform vec2 pen_vel;
uniform mat4 M_sun;

uniform sampler2D low0_t;
uniform sampler2D low1_t;
uniform sampler2D high0_t;
uniform sampler2D high1_t;
uniform sampler2D mid_t;
uniform sampler2D other_t;
uniform sampler2D light_t;

in vec2 xy;
layout(location = 0) out vec4 low0_out;
layout(location = 1) out vec4 low1_out;
layout(location = 2) out vec4 high0_out;
layout(location = 3) out vec4 high1_out;
layout(location = 4) out vec4 mid_out;
layout(location = 5) out vec4 other_out;

// TODO: rename all variables to correct
void main(){

    // backward convection
    vec2 uv_low = texture(low0_t, xy).xy;
    vec2 uv_high = texture(high0_t, xy).xy;
    vec4 low0_n = texture(low0_t, xy + (vec2(0., 1.) - uv_low) / sim_res);
    vec4 low0_s = texture(low0_t, xy + (vec2(0., -1.) - uv_low) / sim_res);
    vec4 low0_e = texture(low0_t, xy + (vec2(1., 0.) - uv_low) / sim_res);
    vec4 low0_w = texture(low0_t, xy + (vec2(-1., 0.) - uv_low) / sim_res);
    vec4 high0_n = texture(high0_t, xy + (vec2(0., 1.) - uv_high) / sim_res);
    vec4 high0_s = texture(high0_t, xy + (vec2(0., -1.) - uv_high) / sim_res);
    vec4 high0_e = texture(high0_t, xy + (vec2(1., 0.) - uv_high) / sim_res);
    vec4 high0_w = texture(high0_t, xy + (vec2(-1., 0.) - uv_high) / sim_res);
    vec4 low1_n = texture(low1_t, xy + (vec2(0., 1.) - uv_low) / sim_res);
    vec4 low1_s = texture(low1_t, xy + (vec2(0., -1.) - uv_low) / sim_res);
    vec4 low1_e = texture(low1_t, xy + (vec2(1., 0.) - uv_low) / sim_res);
    vec4 low1_w = texture(low1_t, xy + (vec2(-1., 0.) - uv_low) / sim_res);
    vec4 high1_n = texture(high1_t, xy + (vec2(0., 1.) - uv_high) / sim_res);
    vec4 high1_s = texture(high1_t, xy + (vec2(0., -1.) - uv_high) / sim_res);
    vec4 high1_e = texture(high1_t, xy + (vec2(1., 0.) - uv_high) / sim_res);
    vec4 high1_w = texture(high1_t, xy + (vec2(-1., 0.) - uv_high) / sim_res);
    vec4 mid_n = texture(mid_t, xy + (vec2(0., K_smooth) - uv_high) / sim_res);
    vec4 mid_s = texture(mid_t, xy + (vec2(0., -K_smooth) - uv_high) / sim_res);
    vec4 mid_e = texture(mid_t, xy + (vec2(K_smooth, 0.) - uv_high) / sim_res);
    vec4 mid_w = texture(mid_t, xy + (vec2(-K_smooth, 0.) - uv_high) / sim_res);
    vec4 other_n = texture(other_t, xy + (vec2(0., 1.)) / sim_res);
    vec4 other_s = texture(other_t, xy + (vec2(0., -1.)) / sim_res);
    vec4 other_e = texture(other_t, xy + (vec2(1., 0.)) / sim_res);
    vec4 other_w = texture(other_t, xy + (vec2(-1., 0.)) / sim_res);
    
    // calculate divergence
    float div_low = low0_n.y - low0_s.y + low0_e.x - low0_w.x;
    float div_high = high0_n.y - high0_s.y + high0_e.x - high0_w.x;

    // calculate terrain gradient
    vec2 terrain_gradient = vec2(
        other_e.z - other_w.z,
        other_n.z - other_s.z
    );

    // calculate uplift from divergence
    float uplift = texture(mid_t, xy - uv_low / sim_res).w;

    // convection, low and high include uplift, mid is pure 2D
    low0_out  = texture(low0_t,  xy - uv_low  / sim_res) * clamp(1. + uplift, 0., 1.) 
              + texture(high0_t, xy - uv_low  / sim_res) * clamp(    -uplift, 0., 1.);
    low1_out  = texture(low1_t,  xy - uv_low  / sim_res) * clamp(1. + uplift, 0., 1.) 
              + texture(high1_t, xy - uv_low  / sim_res) * clamp(    -uplift, 0., 1.);
    high0_out = texture(high0_t, xy - uv_high / sim_res) * clamp(1. - uplift, 0., 1.)
              + texture(low0_t,  xy - uv_high / sim_res) * clamp(     uplift, 0., 1.);
    high1_out = texture(high1_t, xy - uv_high / sim_res) * clamp(1. - uplift, 0., 1.)
              + texture(low1_t,  xy - uv_high / sim_res) * clamp(     uplift, 0., 1.);
    mid_out = texture(mid_t, xy - (uv_low + uv_high) / sim_res);
    other_out = texture(other_t, xy);
    
    // accumulate pressure
    low1_out.p += -uplift - div_low + dot(uv_low, terrain_gradient) * K_pressure_uplift_acc;
    high1_out.p += uplift - div_high;
    
    // smooth pressure
    // TODO: improve filtering, maybe larger window
    low1_out.p = (low1_out.p + low1_n.p + low1_s.p + low1_e.p + low1_w.p) / 5.;
    high1_out.p = (high1_out.p + high1_n.p + high1_s.p + high1_e.p + high1_w.p) / 5.;
    low1_out.p = (1. - K_uplift_damping) * low1_out.p + K_uplift_damping * high1_out.p;
    high1_out.p = (1. - K_uplift_damping) * high1_out.p + K_uplift_damping * low1_out.p;
    low1_out.p *= K_pressure_decay;
    high1_out.p *= K_pressure_decay;

    // decend pressure
    low0_out.x += (low1_w.p - low1_e.p) * K_pressure;
    low0_out.y += (low1_s.p - low1_n.p) * K_pressure;
    high0_out.x += (high1_w.p - high1_e.p) * K_pressure;
    high0_out.y += (high1_s.p - high1_n.p) * K_pressure;
    mid_out.w += (low1_out.p - high1_out.p) * K_pressure_uplift;
    
    // flow water/ice
    float temp = interp_elev(other_out.z * z_scale + other_out.w * water_scale, other_out.t, low1_out.t, high1_out.t, 0.);
    float temp_n = interp_elev(other_n.z * z_scale + other_n.w * water_scale, other_n.t, low1_n.t, high1_n.t, 0.);
    float temp_s = interp_elev(other_s.z * z_scale + other_s.w * water_scale, other_s.t, low1_n.t, high1_s.t, 0.);
    float temp_e = interp_elev(other_e.z * z_scale + other_e.w * water_scale, other_e.t, low1_n.t, high1_e.t, 0.);
    float temp_w = interp_elev(other_w.z * z_scale + other_w.w * water_scale, other_w.t, low1_n.t, high1_w.t, 0.);
    float elev = water_scale * other_out.w + z_scale * other_out.z;
    vec4 flux = vec4(
        ((temp_n > freezing_temp) && (temp > freezing_temp) ? K_flow : K_flow_glacier) * clamp((water_scale * other_n.w + z_scale * other_n.z - elev) / 5., -water_scale * other_out.w / 5., water_scale * other_n.w / 5.) / water_scale,
        ((temp_s > freezing_temp) && (temp > freezing_temp) ? K_flow : K_flow_glacier) * clamp((water_scale * other_s.w + z_scale * other_s.z - elev) / 5., -water_scale * other_out.w / 5., water_scale * other_s.w / 5.) / water_scale,
        ((temp_e > freezing_temp) && (temp > freezing_temp) ? K_flow : K_flow_glacier) * clamp((water_scale * other_e.w + z_scale * other_e.z - elev) / 5., -water_scale * other_out.w / 5., water_scale * other_e.w / 5.) / water_scale,
        ((temp_w > freezing_temp) && (temp > freezing_temp) ? K_flow : K_flow_glacier) * clamp((water_scale * other_w.w + z_scale * other_w.z - elev) / 5., -water_scale * other_out.w / 5., water_scale * other_w.w / 5.) / water_scale
    );
    other_out.w += dot(flux, vec4(1.));

    // precipitation
    mid_out.x = get_precip(low1_out.a, low1_out.t);
    mid_out.y = get_precip(high1_out.a, high1_out.t);
    low1_out.a -= mid_out.x;
    high1_out.a -= mid_out.y;
    other_out.w += mid_out.x + mid_out.y;

    // handle temperature
    vec4 xyz = vec4(xy, other_out.z * z_scale, 1.);
    vec4 sun_coord = M_sun * xyz;
    vec4 light = texture(light_t, sun_coord.xy / 2. + 0.5);
    // other_out.t += Q_in - other_out.t * K0;
    other_out.t += (
        mix(Q_in_shade, Q_in, (sun_coord.z - light.a > 0.001 ? 0. : light.x))  // heat from sun
        - other_out.t * K0                                     // heat lost to radiation
        - (other_out.t - low1_out.t) * K1                      // heat lost to air via convection
    ) / C_surface;
    low1_out.t += (other_out.t - low1_out.t) * K1;                        // heat gained from ground
    high1_out.t -= high1_out.t * K2;                                      // heat lost to radiation
    vec2 pen_vect = pen_vel * pen_strength;
    if ((length(cursor_pos - xy) < pen_size) && (mouse_btns == 1) && (keys == 0)){
        switch (pen_type){
        case 0:  // all velocity
            low0_out = vec4(pen_vect, 0., 1.);
            high0_out = vec4(pen_vect, 0., 1.);
            break;
        case 1:  // low velocity
            low0_out = vec4(pen_vect, 0., 1.);
            break;
        case 2:  // high velocity
            high0_out = vec4(pen_vect, 0., 1.);
            break;
        case 3:  // elevation
            float r = length(cursor_pos - xy) / pen_size;
            other_out.z += (2. * r * r * r - 3. * r * r + 1.) * pen_strength * K_elevation_strength;
            // other_out.w += (2. * r * r * r - 3. * r * r + 1.) * pen_strength * K_elevation_strength;
            break;
        case 4:  // rain
            other_out.w += 10. * (2. * r * r * r - 3. * r * r + 1.) * pen_strength * K_elevation_strength;
            // other_out.w = pen_strength;
            break;
        }
        low1_out.a = 1.;
    }
    
    // clip values to 0-1 
    other_out.z = clamp(other_out.z, 0., 1.);
    other_out.w = max(0., other_out.w);
}

`;

let render2d_vs_src = `

in vec2 vert_pos;
out vec2 xy;
out vec3 xyz;

void main(){
    gl_Position = vec4(vert_pos, .99, 1.);
    xy = vert_pos * 0.5 + 0.5;
    xyz = vec3(xy, 0.);
}

`;

let render2d_fs_src = `

uniform int view_mode;
uniform sampler2D low0_t;
uniform sampler2D low1_t;
uniform sampler2D high0_t;
uniform sampler2D high1_t;
uniform sampler2D mid_t;
uniform sampler2D other_t;
uniform sampler2D light_t;
uniform float pen_size;
uniform vec2 mouse_pos;
uniform vec2 cursor_pos;
uniform int mouse_btns;
uniform vec2 sim_res;
uniform vec3 sun_dir;
uniform mat4 M_sun;
uniform vec2 camera_pos;

in vec2 xy;
in vec3 xyz;
out vec4 frag_color;

vec4 low0;
vec4 low1;
vec4 high0;
vec4 high1;
vec4 mid;
vec4 other;
vec4 other_n;
vec4 other_s;
vec4 other_e;
vec4 other_w;
vec4 light;
float vel_low;
float vel_high;
float pressure;
float h_low;
float h_high;
float uplift;
float elevation;
float temp;

void main(){
    switch (view_mode){
    case 0:  // low velocity
        low0 = texture(low0_t, xy);
        low1 = texture(low1_t, xy);
        vel_low = length(low0.xy);
        pressure = low1.p * 10.;
        h_low = low1.a;
        frag_color = vec4(pressure, vel_low, h_low, 1.);        
        break;
    case 1:  // all velocity
        low0 = texture(low0_t, xy);
        low1 = texture(low1_t, xy);
        high0 = texture(high0_t, xy);
        high1 = texture(high1_t, xy);
        mid = texture(mid_t, xy);
        vel_low = length(low0.xy);
        vel_high = length(high0.xy);
        pressure = 0.5 * (low1.p + high1.p) * 10.;
        frag_color = vec4(pressure, vel_low, vel_high, 1.);
        break;
    case 2:  // uplift
        low1 = texture(low1_t, xy);
        high1 = texture(high1_t, xy);
        mid = texture(mid_t, xy);
        pressure = 0.5 * (low1.p + high1.p) * 10.;
        uplift = 100. * mid.w;
        frag_color = vec4(uplift, pressure, -uplift, 1.);
        break;
    case 3:  // elevation
        low0 = texture(low0_t, xy);
        high0 = texture(high0_t, xy);
        mid = texture(mid_t, xy);
        other = texture(other_t, xy);
        uplift = 100. * mid.w;
        elevation = other.z;
        frag_color = vec4(uplift, elevation, -uplift, 1.);
        break;
    case 4:  // clouds
        frag_color = vec4(0., low1.a, high1.a, 1.);
        break;
    case 5:  // realistic
        other = texture(other_t, xy);
        other_n = texture(other_t, xy + vec2(0., 1.) / sim_res);
        other_s = texture(other_t, xy + vec2(0., -1.) / sim_res);
        other_e = texture(other_t, xy + vec2(1., 0.) / sim_res);
        other_w = texture(other_t, xy + vec2(-1., 0.) / sim_res);
        low1 = texture(low1_t, xy);
        high1 = texture(high1_t, xy);
        vec4 sun_coord = M_sun * vec4(xyz, 1.);
        light = texture(light_t, sun_coord.xy / 2. + 0.5 + rand2d(sun_coord.xy) / render_res);
        vec3 norm = normalize(vec3(z_scale * vec2(other_w.z - other_e.z, other_s.z - other_n.z) * sim_res, 1.));
        float sunlight = sun_coord.z - light.a > 0.001 ? 0. : clamp(dot(norm, sun_dir), 0., 1.) * light.x;
        temp = interp_elev(z_scale * other.z, other.t, low1.t, high1.t, 0.);
        frag_color = (sun_color * sunlight + ambient_color * (1. - sunlight)) * get_ground_color(temp);
        // frag_color = vec4(vec3(float(temp < freezing_temp)), 1.);
        break;
    case 6:  // temp
        other = texture(other_t, xy);
        low1 = texture(low1_t, xy);
        high1 = texture(high1_t, xy);
        temp = interp_elev(z_scale * other.z, other.t, low1.t, high1.t, 0.);
        frag_color = heatmap(temp);
        break;
    }
    if (abs(length(cursor_pos - xy) - pen_size) < 0.001){
        frag_color = vec4(1.);
    }
}

`;

let arrow_vs_src = `

uniform sampler2D low0_t;
uniform sampler2D high0_t;

in vec3 vert_pos;
out vec2 xy;

void main(){
    vec2 pos = vert_pos.xy;
    xy = pos * 0.5 + 0.5;
    float a = vert_pos.z;
    vec2 uv = texture(low0_t, xy).xy;
    gl_Position = vec4(pos + a * uv * 0.1, 0., 1.);
    // gl_Position = vec4(pos, 0., 1.);
}

`;

let arrow_fs_src = `

in vec2 xy;
out vec4 frag_color;

void main(){
    frag_color = vec4(1., 1., 1., 1.);
}

`;

let render3d_vs_src = `

uniform mat4 M_camera;
uniform sampler2D other_t;

in vec2 vert_pos;
out vec3 xyz;
out vec2 xy;

void main(){
    xy = vert_pos;
    vec4 other = texture(other_t, xy);
    float elevation = other.z * z_scale;
    xyz = vec3(vert_pos, elevation);
    gl_Position = M_camera * vec4(xyz, 1.);
}
`;

let water_vs_src = `

uniform mat4 M_camera;
uniform sampler2D other_t;
uniform sampler2D low1_t;
uniform sampler2D high1_t;

in vec2 vert_pos;
out vec3 xyz;
out vec2 xy;

void main(){
    xy = vert_pos;
    vec4 other = texture(other_t, xy);
    vec4 low1 = texture(low1_t, xy);
    vec4 high1 = texture(high1_t, xy);
    float elevation = other.z * z_scale;
    float temp = interp_elev(elevation, other.t, low1.t, high1.t, 0.);
    float water_depth = temp > freezing_temp ? other.w * water_scale : min(other.w * snow_scale, other.w * water_scale + floating_ice_thickness);
    // float water_depth = other.w * water_scale;
    xyz = vec3(vert_pos, elevation + water_depth);
    gl_Position = M_camera * vec4(xyz, 1.);
}

`;

let water_fs_src = `
uniform vec2 sim_res;
uniform sampler2D other_t;
uniform vec3 sun_dir;
uniform vec3 camera_pos;
uniform sampler2D light_t;
uniform mat4 M_sun;
uniform sampler2D low1_t;
uniform sampler2D high1_t;

in vec3 xyz;
in vec2 xy;
out vec4 frag_color;

void main(){
    vec4 other = texture(other_t, xy);
    vec4 other_n = texture(other_t, xy + vec2(0., 1.) / sim_res);
    vec4 other_s = texture(other_t, xy + vec2(0., -1.) / sim_res);
    vec4 other_e = texture(other_t, xy + vec2(1., 0.) / sim_res);
    vec4 other_w = texture(other_t, xy + vec2(-1., 0.) / sim_res);
    vec4 low1 = texture(low1_t, xy);
    vec4 high1 = texture(high1_t, xy);
    vec4 sun_coord = M_sun * vec4(xyz, 1.);
    vec4 light = texture(light_t, sun_coord.xy / 2. + 0.5 + rand2d(sun_coord.xy) / render_res);
    vec3 norm = normalize(vec3(z_scale * vec2(other_w.z - other_e.z, other_s.z - other_n.z) * sim_res, 1.));
    vec3 camera_vec = normalize(camera_pos - xyz);
    float cos_angle = dot(camera_vec, norm);
    float sunlight = sun_coord.z - light.a > 0.001 ? 0. : clamp(dot(norm, sun_dir), 0., 1.) * light.x;
    float temp = interp_elev(xyz.z, other.t, low1.t, high1.t, 0.);
    // frag_color = get_water_color(temp) * mix(ambient_color, sun_color, sunlight);
    // frag_color.a = (1. - cos_angle) * (1. - water_transparency) + water_transparency;
    // frag_color.a *= clamp(other.w * shoreline_sharpness, 0., 1.);

    frag_color = get_water_color(temp, sunlight, cos_angle, other.w);
}

`;

let cloud_plane_vs_src = `

uniform mat4 M_camera;
uniform mat4 M_camera_inv;
uniform float near;
uniform float far;

in vec3 vert_pos;
out vec4 xyz;

void main(){
    // gl_Position = vec4((vert_pos * 2. - 1.) * 0.98, 1.);
    vec4 xyz_close = M_camera_inv * vec4(vert_pos.xy * 2. - 1., -1., 1.);
    xyz_close /= xyz_close.w;
    vec4 xyz_far = M_camera_inv * vec4(vert_pos.xy * 2. - 1., 1., 1.);
    xyz_far /= xyz_far.w;
    xyz = vert_pos.z * (xyz_far - xyz_close) + xyz_close;
    xyz /= xyz.w;
    gl_Position = M_camera * xyz;
}
`;

let cloud_plane_fs_src = `

uniform sampler2D low0_t;
uniform sampler2D low1_t;
uniform sampler2D high0_t;
uniform sampler2D high1_t;
uniform sampler2D mid_t;
uniform sampler2D other_t;
uniform sampler2D light_t;
uniform int cloud_mode;
uniform float cloud_density;
uniform mat4 M_camera_inv;
uniform mat4 M_sun;
uniform float near;
uniform float far;
uniform vec2 sim_res;
uniform vec3 camera_pos;
uniform vec3 sun_dir;

in vec4 xyz;
out vec4 frag_color;

void main(){
    vec2 xy = xyz.xy;
    if (
               (xyz.x < 0.) 
            || (xyz.y < 0.) 
            || (xyz.x > 1.) 
            || (xyz.y > 1.)
            || (xyz.z < 0.)
            || (xyz.z > max_elev)
        ){
        discard;
    }
    float ground_temp = texture(other_t, xyz.xy).t;
    float low_temp = texture(low1_t, xyz.xy).t;
    float high_temp = texture(high1_t, xyz.xy).t;
    float temp = interp_elev(xyz.z, ground_temp, low_temp, high_temp, 0.);
    switch (cloud_mode){
        case 0:  // velocity

            break;
        case 1:  // uplift
            break;
        case 2:  // pressure
            break;
        case 3:  // realistic
            vec4 sun_coord = M_sun * xyz;
            vec4 light = texture(light_t, sun_coord.xy / 2. + 0.5 + rand2d(sun_coord.xy) / sim_res);
            float brightness = sun_coord.z > light.a ? 0. : clamp(
                (xyz.z - light.y) * (1. - light.x) / (light.z - light.y) + light.x, 
                light.x, 1.
            );
            float low_cloud = texture(low1_t, xyz.xy + rand2d(sun_coord.xy) / sim_res).a;
            float high_cloud = texture(high1_t, xyz.xy + rand2d(sun_coord.xy) / sim_res).a;
            float cloud = get_cloud_density(interp_elev(
                xyz.z, 0., low_cloud, high_cloud, 0.
            ), temp);
            vec2 precip = texture(mid_t, xyz.xy).xy;
            precip.x += precip.y;
            float rain = clamp(rain_density * interp_rain(xyz.z, precip.x, precip.x, precip.y, 0.), 0., 1.);
            float cos_angle = dot(sun_dir, normalize(camera_pos - xyz.xyz));
            vec3 light_color = mix(
                ambient_color.xyz, 
                sun_color.xyz * mix(
                    vec3(1.), 
                    get_rainbow(cos_angle), 
                    rain * (1. - cloud)
                ), brightness
            );
            frag_color = vec4(
                light_color,
                max(cloud, rain)
            );
            // frag_color = get_rainbow(cos_angle);
            break;
        case 4:  // temp
            frag_color = heatmap(temp);
            frag_color.a = 0.03 * float(temp > 0.5);
        default:
            break;
    }

}
`;

let sun_vs_src = `

uniform mat4 M_sun;
uniform sampler2D other_t;

in vec2 vert_pos;
out vec4 xyz;
out vec4 sun_coord;

void main(){
    float elevation = texture(other_t, vert_pos).z * z_scale;
    xyz = vec4(vert_pos, elevation, 1.);
    sun_coord = M_sun * xyz;
    gl_Position = sun_coord;
}

`;

let sun_fs_src = `

uniform sampler2D low1_t;
uniform sampler2D high1_t;
uniform sampler2D other_t;
uniform sampler2D mid_t;
uniform vec3 sun_dir;
uniform mat4 M_sun;

#define n_light_samples 80
#define cloud_start 0.1
#define cloud_density_sun 1.5
#define cloud_end_density 0.3

// out vec4 frag_color;
in vec4 xyz;  // surface point
in vec4 sun_coord;
layout(location = 0) out vec4 light_out;

void main(){

    light_out = vec4(1., 0., 0., 0.);
    for (int i = n_light_samples; i > 0; i--){
        float z_sample = xyz.z + (max_elev - xyz.z) * float(i) / float(n_light_samples);
        vec2 xy_sample = xyz.xy + 0.5 * (z_sample - xyz.z) * sun_dir.xy / sun_dir.z;
        float low_cloud = texture(low1_t, xy_sample).a;
        float high_cloud = texture(high1_t, xy_sample).a;
        float ground_temp = texture(other_t, xyz.xy).t;
        float low_temp = texture(low1_t, xyz.xy + 0.5 * (z_sample - xyz.z) * sun_dir.xy / sun_dir.z).t;
        float high_temp = texture(high1_t, xy_sample).t;
        float temp = interp_elev(z_sample, ground_temp, low_temp, high_temp, 0.);
        float cloud = get_cloud_density(interp_elev(
            z_sample, 0., low_cloud, high_cloud, 0.
        ), temp);

        // rain
        // vec2 precip = texture(mid_t, xy_sample).xy;
        // precip.x += precip.y;
        // float rain = clamp(rain_density * interp_rain(z_sample, precip.x, precip.x, precip.y, 0.), 0., 1.);
        // light_out.x *= (1. - cloud_density_sun * max(cloud, rain) * (max_elev - xyz.z));
        
        // no rain
        light_out.x *= (1. - cloud_density_sun * cloud * (max_elev - xyz.z));
        
        // cloud lower edge
        light_out.y = (cloud > cloud_start) && (light_out.x > cloud_end_density) ? z_sample : light_out.y;
        
        // cloud upper edge
        light_out.z = (cloud > cloud_start) && (light_out.z == 0.) ? z_sample : light_out.z;
    }

    light_out.a = sun_coord.z;  // for shaddow mapping
}
`;


var [width, height] = [1, 1];
let mouse_state = {
    x: 0.5,
    y: 0.5,
    physical_x: 0.5,
    physical_y: 0.5,
    vel_x: 0.0,
    vel_y: 0.0,
    buttons: 0
};
var canvas = null;
const fps = 10;
const K_drag = 100;
const sim_res = 512;
const render_width = 640;
const render_height = 480;
let M_camera = new Float32Array(16);
let M_camera_inv = new Float32Array(16);
let M_perspective = new Float32Array(16);
let M_sun = new Float32Array(16);
let camera_pos = [0.5, 0.5, 0.25];
let camera_rot = [45, 0];
// let camera_pos = [0.5, 0.5, 2];
// let camera_rot = [0, 0];
let near = 0.03
let far = 1.5
const PI = 3.14159
const walk_speed = 0.003;
const look_speed = 1.;
const vert_speed = 0.001;
const n_cloud_planes = 400;
const z_max = 0.3  // max_elev
const z_min = -0.01
let sun_dir = [3, 3, 1];
norm_vect(sun_dir);
var render_t0 = 0;
var fps_filtered = 0;
const fps_filt_const = 0.99;


function invert_vect(arr){
    let out = [];
    for (var i = 0; i < arr.length; i++){
        out.push(-arr[i]);
    }
    return out;
}


function norm_vect(arr){
    var mag = 0
    for (var i = 0; i < arr.length; i++){
        mag += arr[i] ** 2;
    }
    mag = mag ** 0.5;
    for (var i = 0; i < arr.length; i++){
        arr[i] = arr[i] / mag;
    }
}


function mouse_move(event){
    let new_x = event.offsetX / canvas.width;
    let new_y = 1 - event.offsetY / canvas.height;
    let [x, y] = get_cursor_point(new_x, new_y);
    mouse_state.physical_vel_x = (x - mouse_state.physical_x) * K_drag;
    mouse_state.physical_vel_y = (y - mouse_state.physical_y) * K_drag;
    mouse_state.physical_x = x;
    mouse_state.physical_y = y;
    mouse_state.vel_x = (new_x - mouse_state.x) * K_drag;
    mouse_state.vel_y = (new_y - mouse_state.y) * K_drag;
    mouse_state.x = new_x;
    mouse_state.y = new_y;
    mouse_state.buttons = event.buttons;
    if (event.shiftKey){
        mouse_state.keys = 1;
    } else if (event.ctrlKey){
        mouse_state.keys = 2;
    } else if (event.altKey){
        mouse_state.keys = 3;
    } else {
        mouse_state.keys = 0;
    }
    document.getElementById('debug').innerText = x.toFixed(2) + ', ' + y.toFixed(2);

    if (mouse_state.buttons == 1){
        if (mouse_state.keys == 1){
            // rotate camera
            camera_rot[0] -= mouse_state.vel_y * look_speed;
            camera_rot[1] += mouse_state.vel_x * look_speed;
        }
        if (mouse_state.keys == 2){
            // translate camera
            let t = camera_rot[1] * PI / 180;
            camera_pos[0] -= walk_speed * (mouse_state.vel_x * Math.cos(t) - mouse_state.vel_y * Math.sin(t));
            camera_pos[1] -= walk_speed * (mouse_state.vel_x * Math.sin(t) + mouse_state.vel_y * Math.cos(t));
        }
        if (mouse_state.keys == 3){
            camera_pos[2] -= vert_speed * mouse_state.vel_y;
        }
    
    }


}


function get_cursor_point(x, y){
    let uv0 = new Float32Array([x * 2 - 1, y * 2 - 1, -1, 1]);
    let uv1 = new Float32Array([x * 2 - 1, y * 2 - 1, 1, 1]);
    let xyz0 = new Float32Array(4);
    let xyz1 = new Float32Array(4);
    mat4.multiply(xyz0, M_camera_inv, uv0);
    mat4.multiply(xyz1, M_camera_inv, uv1);
    let t = -(xyz0[2] / xyz0[3]) / (xyz1[2] / xyz1[3] - xyz0[2] / xyz0[3]);
    let x_out = xyz0[0] / xyz0[3] + t * (xyz1[0] / xyz1[3] - xyz0[0] / xyz0[3]);
    let y_out = xyz0[1] / xyz0[3] + t * (xyz1[1] / xyz1[3] - xyz0[1] / xyz0[3]);
    return [x_out, y_out];
}


function get_arrows(n = 20){
    let out = [];
    for (var i = 0; i < n; i++){
        let x = 2 * i / (n - 1) - 1;
        for (var j = 0; j < n; j++){
            let y = 2 * j / (n - 1) - 1;
            out.push([x, y, 0, x, y, 1]);
        }
    }
    return out;
}


function get_grid_mesh(n = 512, m = 512){
    let out = [];
    for (var i = 0; i < n; i++){
        for (var j = 0; j < m; j++){
            let x0 = j / m;
            let y0 = i / n;
            let x1 = (j + 1) / m;
            let y1 = (i + 1) / n;
            // x0 += 0.1 / m;
            // y0 += 0.1 / n;
            out.push([
                x0, y0,
                x1, y0,
                x1, y1,
            ]);
            out.push([
                x0, y0,
                x1, y1,
                x0, y1
            ]);
        }
    }
    return out;
}


function get_cloud_planes(n=2){
    let out = [];
    for (var i = 0; i < n; i++){
        out.push([
            0., 0., 1. - i / (n - 1),
            0., 1., 1. - i / (n - 1),
            1., 1., 1. - i / (n - 1)
        ]);
        out.push([
            0., 0., 1. - i / (n - 1),
            1., 1., 1. - i / (n - 1),
            1., 0., 1. - i / (n - 1),
        ]);
    }
    return out;
}


function set_sun_matrix(M){

    // row 0
    M[0] = 2;
    M[1] = 0;
    M[2] = 0;
    M[3] = 0;

    // row 1
    M[4] = 0;
    M[5] = 2;
    M[6] = 0;
    M[7] = 0;

    // row 2
    M[8] = -sun_dir[0] / sun_dir[2];
    M[9] = -sun_dir[1] / sun_dir[2];
    M[10] = -2 / (z_max - z_min);
    M[11] = 0;

    // row 3
    M[12] = -1
    M[13] = -1
    M[14] = (z_max + z_min) / (z_max - z_min);
    M[15] = 1

}


function init(){
    canvas = document.getElementById('gl-canvas')
    setup_gl(canvas);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
    
    [width, height] = [canvas.width, canvas.height];
    let pen_type_options = [];
    let pen_type_el = document.getElementById('pen-type');
    let render_mode_el = document.getElementById('render-mode');
    for (var i = 0; i < pen_type_el.children.length; i++){
        pen_type_options.push(pen_type_el.children[i].value);
    }
    let view_mode_options = [];
    let view_mode_el = document.getElementById('view-mode');
    for (var i = 0; i < view_mode_el.children.length; i++){
        view_mode_options.push(view_mode_el.children[i].value);
    }
    let cloud_mode_options = [];
    let cloud_mode_el = document.getElementById('cloud-mode');
    for (var i = 0; i < cloud_mode_el.children.length; i++){
        cloud_mode_options.push(cloud_mode_el.children[i].value);
    }
    
    // compile shaders
    let sim_vs = compile_shader(common_src + sim_vs_src, gl.VERTEX_SHADER, '');
    let sim_fs = compile_shader(common_src + sim_fs_src, gl.FRAGMENT_SHADER, '');
    let sim_program = link_program(sim_vs, sim_fs);
    let render2d_vs = compile_shader(common_src + render2d_vs_src, gl.VERTEX_SHADER, '');
    let render2d_fs = compile_shader(common_src + render2d_fs_src, gl.FRAGMENT_SHADER, '');
    let render2d_program = link_program(render2d_vs, render2d_fs);
    let arrow_vs = compile_shader(common_src + arrow_vs_src, gl.VERTEX_SHADER, '');
    let arrow_fs = compile_shader(common_src + arrow_fs_src, gl.FRAGMENT_SHADER, '');
    let arrow_program = link_program(arrow_vs, arrow_fs);
    let render3d_vs = compile_shader(common_src + render3d_vs_src, gl.VERTEX_SHADER, '');
    let render3d_fs = compile_shader(common_src + render2d_fs_src, gl.FRAGMENT_SHADER, '');
    let render3d_program = link_program(render3d_vs, render3d_fs);
    let water_vs = compile_shader(common_src + water_vs_src, gl.VERTEX_SHADER, '');
    let water_fs = compile_shader(common_src + water_fs_src, gl.FRAGMENT_SHADER, '');
    let water_program = link_program(water_vs, water_fs);
    let cloud_plane_vs = compile_shader(common_src + cloud_plane_vs_src, gl.VERTEX_SHADER, '');
    let cloud_plane_fs = compile_shader(common_src + cloud_plane_fs_src, gl.FRAGMENT_SHADER, '');
    let cloud_plane_program = link_program(cloud_plane_vs, cloud_plane_fs);
    let sun_vs = compile_shader(common_src + sun_vs_src, gl.VERTEX_SHADER, '');
    let sun_fs = compile_shader(common_src + sun_fs_src, gl.FRAGMENT_SHADER, '');
    let sun_program = link_program(sun_vs, sun_fs);

    // setup buffers
    let vertex_buffer = create_buffer(new Float32Array(screen_mesh[0].flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let tri_buffer = create_buffer(new Uint16Array(screen_mesh[1].flat()), gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
    let sim_pos_attr_loc = gl.getAttribLocation(sim_program, 'vert_pos');
    gl.enableVertexAttribArray(sim_pos_attr_loc);
    let render2d_pos_attr_loc = gl.getAttribLocation(render2d_program, 'vert_pos');
    gl.enableVertexAttribArray(render2d_pos_attr_loc);
    arrows = get_arrows(50);
    let arrow_buffer = create_buffer(new Float32Array(arrows.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let arrow_pos_attr_loc = gl.getAttribLocation(arrow_program, 'vert_pos');
    gl.enableVertexAttribArray(arrow_pos_attr_loc);
    grid_mesh = get_grid_mesh(sim_res, sim_res);
    let grid_mesh_buffer = create_buffer(new Float32Array(grid_mesh.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let grid_mesh_attr_loc = gl.getAttribLocation(render3d_program, 'vert_pos');  // TODO: for other programs that use grid
    cloud_planes = get_cloud_planes(n_cloud_planes);
    let cloud_planes_buffer = create_buffer(new Float32Array(cloud_planes.flat()), gl.ARRAY_BUFFER, gl.STATIC_DRAW);
    let cloud_plane_pos_attr_loc = gl.getAttribLocation(cloud_plane_program, 'vert_pos');


    // textures
    let sim_fbo = gl.createFramebuffer();
    let sim_depthbuffer = gl.createRenderbuffer();
    let tex_names = ['low0_t', 'low1_t', 'high0_t', 'high1_t', 'mid_t', 'other_t'];
    let tex_defaults = [[0.3, 0, 0, 0], [0, 3, 0, 0], [0.3, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    let textures = [];
    for (var i = 0; i < tex_names.length; i++){
        textures.push({
            'name': tex_names[i],
            'in_tex': create_texture(sim_res, sim_res, tex_defaults[i], i, 'tile'),
            'out_tex': create_texture(sim_res, sim_res, tex_defaults[i], i, 'tile')
        });
    }
    
    // setup fbo
    gl.bindRenderbuffer(gl.RENDERBUFFER, sim_depthbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, sim_res, sim_res);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim_fbo);
    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0,
        gl.COLOR_ATTACHMENT1,
        gl.COLOR_ATTACHMENT2,
        gl.COLOR_ATTACHMENT3,
        gl.COLOR_ATTACHMENT4,
        gl.COLOR_ATTACHMENT5,
        // gl.COLOR_ATTACHMENT6,
        // gl.COLOR_ATTACHMENT7,
    ]);
    
    let sun_fbo = gl.createFramebuffer();
    let sun_depthbuffer = gl.createRenderbuffer();
    let sun_tex = create_texture(sim_res, sim_res, [1, 1, 1, 1], 6, 'tile');
    gl.bindRenderbuffer(gl.RENDERBUFFER, sun_depthbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, sim_res, sim_res);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sun_fbo);
    gl.drawBuffers([
        gl.COLOR_ATTACHMENT0
    ]);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, sun_tex, 0
    );
    gl.activeTexture(gl.TEXTURE0 + 6);
    gl.bindTexture(gl.TEXTURE_2D, sun_tex);

    let loop = function(){
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        // sim program
        gl.useProgram(sim_program);
        gl.viewport(0, 0, sim_res, sim_res);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tri_buffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, sim_fbo);
        gl.vertexAttribPointer(
            render2d_pos_attr_loc, 2,
            gl.FLOAT, gl.FALSE,
            2 * 4, 0
        );
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
        
        // set uniforms
        gl.uniform2f(gl.getUniformLocation(sim_program, 'mouse_pos'), mouse_state.x, mouse_state.y);
        gl.uniform2f(gl.getUniformLocation(sim_program, 'cursor_pos'), mouse_state.physical_x, mouse_state.physical_y);
        gl.uniform1i(gl.getUniformLocation(sim_program, 'mouse_btns'), mouse_state.buttons);
        gl.uniform1i(gl.getUniformLocation(sim_program, 'keys'), mouse_state.keys);
        gl.uniform2f(gl.getUniformLocation(sim_program, 'sim_res'), sim_res, sim_res);
        gl.uniform1i(gl.getUniformLocation(sim_program, 'pen_type'), pen_type_options.indexOf(pen_type_el.value));
        gl.uniform1f(gl.getUniformLocation(sim_program, 'pen_size'), document.getElementById('pen-size').value);
        gl.uniform1f(gl.getUniformLocation(sim_program, 'pen_strength'), document.getElementById('pen-strength').value);
        gl.uniform2f(gl.getUniformLocation(sim_program, 'pen_vel'), mouse_state.physical_vel_x, mouse_state.physical_vel_y);
        gl.uniform1i(gl.getUniformLocation(sim_program, 'light_t'), 6);
        gl.uniformMatrix4fv(gl.getUniformLocation(sim_program, 'M_sun'), gl.FALSE, M_sun);
        
        // draw
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, 3 * screen_mesh[1].length, gl.UNSIGNED_SHORT, 0);

        
        // draw sun layer
        set_sun_matrix(M_sun);
        // mat4.identity(M_sun);
        canvas.width = sim_res;
        canvas.height = sim_res;

        gl.useProgram(sun_program);
        for (var i = 0; i < textures.length; i++){
            gl.uniform1i(gl.getUniformLocation(sun_program, textures[i].name), i);
        }
        gl.uniformMatrix4fv(gl.getUniformLocation(sun_program, 'M_sun'), gl.FALSE, M_sun);
        gl.uniform3fv(gl.getUniformLocation(sun_program, 'sun_dir'), sun_dir)
        if (render_mode_el.value != 'sun'){
            gl.bindFramebuffer(gl.FRAMEBUFFER, sun_fbo);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, grid_mesh_buffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        gl.vertexAttribPointer(
            grid_mesh_attr_loc, 2,
            gl.FLOAT, gl.FALSE,
            2 * 4, 0
        );
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, grid_mesh.length * 3);

        if (render_mode_el.value == '2d'){

            canvas.width = sim_res;
            canvas.height = sim_res;
            
            // draw render2d
            gl.useProgram(render2d_program);
            for (var i = 0; i < textures.length; i++){
                gl.uniform1i(gl.getUniformLocation(render2d_program, textures[i].name), i);
            }
            gl.uniform2f(gl.getUniformLocation(render2d_program, 'sim_res'), sim_res, sim_res);
            gl.uniform1i(gl.getUniformLocation(render2d_program, 'view_mode'), view_mode_options.indexOf(view_mode_el.value));
            gl.uniform1f(gl.getUniformLocation(render2d_program, 'pen_size'), document.getElementById('pen-size').value);
            gl.uniform2f(gl.getUniformLocation(render2d_program, 'mouse_pos'), mouse_state.x, mouse_state.y);
            gl.uniform2f(gl.getUniformLocation(render2d_program, 'cursor_pos'), mouse_state.physical_x, mouse_state.physical_y);
            gl.uniform1i(gl.getUniformLocation(render2d_program, 'mouse_btns'), mouse_state.buttons);
            gl.uniform2f(gl.getUniformLocation(render2d_program, 'sim_res'), sim_res, sim_res);
            gl.uniform3fv(gl.getUniformLocation(render2d_program, 'sun_dir'), sun_dir)
            gl.uniform1i(gl.getUniformLocation(render2d_program, 'light_t'), 6);
            gl.uniformMatrix4fv(gl.getUniformLocation(render2d_program, 'M_sun'), gl.FALSE, M_sun);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
            gl.drawElements(gl.TRIANGLES, 3 * screen_mesh[1].length, gl.UNSIGNED_SHORT, 0);

            // draw arrows
            gl.useProgram(arrow_program);
            gl.bindBuffer(gl.ARRAY_BUFFER, arrow_buffer);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            gl.vertexAttribPointer(
                arrow_pos_attr_loc, 3,
                gl.FLOAT, gl.FALSE,
                3 * 4, 0
            );
            for (var i = 0; i < textures.length; i++){
                gl.uniform1i(gl.getUniformLocation(arrow_program, textures[i].name), i);
            }
            gl.drawArrays(gl.LINES, 0, arrows.length * 2);
        } else if (render_mode_el.value == '3d'){

            // drawing 3D
            // mat4.lookAt(M_camera, camera_pos, [0.5, 0.5, 0], [0, 0, 1]);
            mat4.identity(M_camera);
            mat4.rotateX(M_camera, M_camera, -camera_rot[0] * PI / 180);
            mat4.rotateZ(M_camera, M_camera, -camera_rot[1] * PI / 180);
            mat4.translate(M_camera, M_camera, invert_vect(camera_pos));
            mat4.perspective(M_perspective, 45 * PI / 180, render_width / render_height, near, far);
            mat4.multiply(M_camera, M_perspective, M_camera);
            mat4.invert(M_camera_inv, M_camera);
            
            canvas.width = render_width;
            canvas.height = render_height;

            gl.viewport(0, 0, render_width, render_height);
            gl.useProgram(render3d_program);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindBuffer(gl.ARRAY_BUFFER, grid_mesh_buffer);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            gl.vertexAttribPointer(
                grid_mesh_attr_loc, 2,
                gl.FLOAT, gl.FALSE,
                2 * 4, 0
            );
            gl.uniform2f(gl.getUniformLocation(render3d_program, 'sim_res'), sim_res, sim_res);
            gl.uniform1i(gl.getUniformLocation(render3d_program, 'view_mode'), view_mode_options.indexOf(view_mode_el.value));
            gl.uniform1f(gl.getUniformLocation(render3d_program, 'pen_size'), document.getElementById('pen-size').value);
            gl.uniform2f(gl.getUniformLocation(render3d_program, 'mouse_pos'), mouse_state.x, mouse_state.y);
            gl.uniform2f(gl.getUniformLocation(render3d_program, 'cursor_pos'), mouse_state.physical_x, mouse_state.physical_y);
            gl.uniform1i(gl.getUniformLocation(render3d_program, 'mouse_btns'), mouse_state.buttons);
            gl.uniformMatrix4fv(gl.getUniformLocation(render3d_program, 'M_camera'), gl.FALSE, M_camera);
            gl.uniform2f(gl.getUniformLocation(render3d_program, 'sim_res'), sim_res, sim_res);
            gl.uniform3fv(gl.getUniformLocation(render3d_program, 'sun_dir'), sun_dir)
            gl.uniform1i(gl.getUniformLocation(render3d_program, 'light_t'), 6);
            gl.uniformMatrix4fv(gl.getUniformLocation(render3d_program, 'M_sun'), gl.FALSE, M_sun);
            gl.uniform3f(gl.getUniformLocation(render3d_program, 'camera_pos'), camera_pos[0], camera_pos[1], camera_pos[2]);
            for (var i = 0; i < textures.length; i++){
                gl.uniform1i(gl.getUniformLocation(render3d_program, textures[i].name), i);
            }
            gl.clearColor(191/255, 240/255, 1, 1);
            gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, grid_mesh.length * 3);

            // draw water
            gl.useProgram(water_program);
            gl.enable(gl.BLEND);
            gl.uniform2f(gl.getUniformLocation(water_program, 'sim_res'), sim_res, sim_res);
            gl.uniform1i(gl.getUniformLocation(water_program, 'view_mode'), view_mode_options.indexOf(view_mode_el.value));
            gl.uniform1f(gl.getUniformLocation(water_program, 'pen_size'), document.getElementById('pen-size').value);
            gl.uniform2f(gl.getUniformLocation(water_program, 'mouse_pos'), mouse_state.x, mouse_state.y);
            gl.uniform2f(gl.getUniformLocation(water_program, 'cursor_pos'), mouse_state.physical_x, mouse_state.physical_y);
            gl.uniform1i(gl.getUniformLocation(water_program, 'mouse_btns'), mouse_state.buttons);
            gl.uniformMatrix4fv(gl.getUniformLocation(water_program, 'M_camera'), gl.FALSE, M_camera);
            gl.uniform2f(gl.getUniformLocation(water_program, 'sim_res'), sim_res, sim_res);
            gl.uniform3fv(gl.getUniformLocation(water_program, 'sun_dir'), sun_dir)
            gl.uniform1i(gl.getUniformLocation(water_program, 'light_t'), 6);
            gl.uniformMatrix4fv(gl.getUniformLocation(water_program, 'M_sun'), gl.FALSE, M_sun);
            gl.uniform3f(gl.getUniformLocation(water_program, 'camera_pos'), camera_pos[0], camera_pos[1], camera_pos[2]);
            for (var i = 0; i < textures.length; i++){
                gl.uniform1i(gl.getUniformLocation(water_program, textures[i].name), i);
            }
            gl.drawArrays(gl.TRIANGLES, 0, grid_mesh.length * 3);


            // draw plane clouds
            gl.useProgram(cloud_plane_program);
            // gl.disable(gl.DEPTH_TEST);
            gl.bindBuffer(gl.ARRAY_BUFFER, cloud_planes_buffer);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            gl.vertexAttribPointer(
                cloud_plane_pos_attr_loc, 3,
                gl.FLOAT, gl.FALSE,
                3 * 4, 0
            );
            gl.uniform2f(gl.getUniformLocation(cloud_plane_program, 'sim_res'), sim_res, sim_res);
            gl.uniform1i(gl.getUniformLocation(cloud_plane_program, 'view_mode'), view_mode_options.indexOf(view_mode_el.value));
            gl.uniform1f(gl.getUniformLocation(cloud_plane_program, 'pen_size'), document.getElementById('pen-size').value);
            gl.uniform2f(gl.getUniformLocation(cloud_plane_program, 'mouse_pos'), mouse_state.x, mouse_state.y);
            gl.uniform2f(gl.getUniformLocation(cloud_plane_program, 'cursor_pos'), mouse_state.physical_x, mouse_state.physical_y);
            gl.uniform1i(gl.getUniformLocation(cloud_plane_program, 'mouse_btns'), mouse_state.buttons);
            gl.uniform1i(gl.getUniformLocation(cloud_plane_program, 'cloud_mode'), cloud_mode_options.indexOf(cloud_mode_el.value));
            gl.uniformMatrix4fv(gl.getUniformLocation(cloud_plane_program, 'M_camera'), gl.FALSE, M_camera);
            gl.uniformMatrix4fv(gl.getUniformLocation(cloud_plane_program, 'M_camera_inv'), gl.FALSE, M_camera_inv);
            gl.uniformMatrix4fv(gl.getUniformLocation(cloud_plane_program, 'M_sun'), gl.FALSE, M_sun);
            gl.uniform2f(gl.getUniformLocation(cloud_plane_program, 'sim_res'), sim_res, sim_res);
            gl.uniform1f(gl.getUniformLocation(cloud_plane_program, 'cloud_density'), 200 / n_cloud_planes);
            gl.uniform1f(gl.getUniformLocation(cloud_plane_program, 'near'), near);
            gl.uniform1f(gl.getUniformLocation(cloud_plane_program, 'far'), far);
            gl.uniform3f(gl.getUniformLocation(cloud_plane_program, 'camera_pos'), camera_pos[0], camera_pos[1], camera_pos[2]);
            gl.uniform3fv(gl.getUniformLocation(cloud_plane_program, 'sun_dir'), sun_dir);
            for (var i = 0; i < textures.length; i++){
                gl.uniform1i(gl.getUniformLocation(cloud_plane_program, textures[i].name), i);
            }
            gl.uniform1i(gl.getUniformLocation(cloud_plane_program, 'light_t'), 6);
            gl.drawArrays(gl.TRIANGLES, 0, 3 * cloud_planes.length);
        } else if (render_mode_el.value == 'sun'){
            

        }

        let now = performance.now();
        fps_filtered = fps_filt_const * fps_filtered + (1 - fps_filt_const) * (1000 / (now - render_t0));
        // document.getElementById('debug').innerText = (fps_filtered).toFixed(2);
        render_t0 = now;
        // setTimeout(() =>{requestAnimationFrame(loop);}, 1000 / fps);
        requestAnimationFrame(loop);  // unlimited fps
    }
    requestAnimationFrame(loop);
}