in vec2 vert_pos;
out vec4 uv_sun;
out vec4 world_coord;

void main(){
    vec2 uv = vert_pos + 0.5;
    world_coord = vec4(
        vert_pos * vec2(print_width, print_height), 
        texture(elevation, uv).x - (elev_range.y + elev_range.x) / 2.,
        1.
    );
    gl_Position = M_proj * world_coord;
    uv_sun = (M_proj_sun * world_coord) / 2. + 0.5;
}
