in vec2 uv;
in vec3 xyz;

void main(){
    frag_color = vec4(0., gl_FragCoord.z, texture(elevation, uv).y, 1.);
    if (xyz.z - .3 > texture(elevation, uv).x - (elev_range.y + elev_range.x) / 2.){
        frag_color.a = 0.0;
    }
}
