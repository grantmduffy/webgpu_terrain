in vec2 uv;

void main(){
    frag_color = vec4(0., gl_FragCoord.z, texture(elevation, uv).y, 1.);
}
