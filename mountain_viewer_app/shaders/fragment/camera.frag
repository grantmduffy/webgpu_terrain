in vec4 uv_sun;
in vec4 world_coord;

vec4 convert_colorspace(vec3 intensity){
    return vec4(1. - exp(-exposure * intensity), 1.);
}

vec2 world_to_uv(vec2 world){
    return world / vec2(print_width, print_height) + 0.5;
}

void main(){
    vec2 uv = world_to_uv(world_coord.xy);

    vec4 e = texture(elevation, uv);
    vec4 e_n = texture(elevation, world_to_uv(world_coord.xy + vec2(0., eps)));
    vec4 e_s = texture(elevation, world_to_uv(world_coord.xy + vec2(0., -eps)));
    vec4 e_e = texture(elevation, world_to_uv(world_coord.xy + vec2(eps, 0.)));
    vec4 e_w = texture(elevation, world_to_uv(world_coord.xy + vec2(-eps, 0.)));
    
    vec3 norm = vec3(
        (e_w.x - e_e.x) / (2. * eps),
        (e_s.x - e_n.x) / (2. * eps),
        1.
    );
    vec4 sun_vector = M_sun * vec4(0., 0., 1., 1.);
    
    vec3 rgb_intensity = ambient_intensity * ambient_color.rgb;

    // calculate ambient occlusion
    float z1 = texture(elevation, uv).x;
    float curvature = 0.;
    for (int i = 0; i < n_ao; i++){
        vec2 dir = ao_eps * pow(rand_2d(uv + float(i)), vec2(ao_power));
        float dir_len = length(dir);
        float z0 = texture(elevation, world_to_uv(world_coord.xy - dir)).x;
        float z2 = texture(elevation, world_to_uv(world_coord.xy + dir)).x;
        float f1 = (z2 - z0) / (2. * dir_len);
        float f2 = (z2 - 2. * z1 + z0) / (dir_len * dir_len);
        curvature += max(f2 / pow(1. + f1 * f1, 3. / 2.), 0.);
    }
    curvature /= float(n_ao);
    rgb_intensity *= exp(-curvature * ambient_occlusion);

    // shadow map
    float shadow_val = 0.;
    for (int i = 0; i < n_shadow; i++){
        float shadow_depth = texture(sun_layer, uv_sun.xy + shadow_softness * rand_2d(uv_sun.xy + float(i))).g - uv_sun.z + shadow_eps;
        shadow_val += float(shadow_depth > 0.);
    }
    shadow_val /= float(n_shadow);
    rgb_intensity += shadow_val * sun_color.rgb * sun_intensity * clamp(dot(norm, sun_vector.xyz), 0., 1.);
    
    // convert to rgb
    frag_color = convert_colorspace(rgb_intensity);
    frag_color.rgb = pow(frag_color.rgb, vec3(gamma));
}
