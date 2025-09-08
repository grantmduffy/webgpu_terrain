in vec3 vert_pos;
in vec3 norm;
out vec3 xyz;
out vec3 norm_vec;
out vec2 uv;

void main(){
    float z;
    xyz = vec3(
        vert_pos.xy * vec2(print_width, print_height) / 2.,
        vert_pos.z * (elev_range.y - elev_range.x + base_thickness * 2.) / 2. - base_thickness
    );
    uv = (vert_pos.xy + 1.) / 2.;
    gl_Position = M_proj * vec4(xyz, 1.);
    norm_vec = norm;
}
