in vec3 norm_vec;
in vec2 uv;
in vec3 xyz;

vec4 convert_colorspace(vec3 intensity){
    return vec4(1. - exp(-exposure * intensity), 1.);
}

void main(){
    vec4 sun_vector = M_sun * vec4(0., 0., 1., 1.);
    vec3 rgb_intensity = ambient_intensity * ambient_color.rgb;
    rgb_intensity += sun_color.rgb * sun_intensity * clamp(dot(norm_vec, sun_vector.xyz), 0., 1.);
    frag_color = convert_colorspace(rgb_intensity);
    frag_color.rgb = pow(frag_color.rgb, vec3(gamma));
    if (xyz.z > texture(elevation, uv).x - (elev_range.y + elev_range.x) / 2.){
        frag_color.a = 0.0;
    }
}
