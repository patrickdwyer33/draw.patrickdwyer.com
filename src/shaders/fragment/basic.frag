precision mediump float;

varying float vSize;

void main() {
    float distance = length(2.0 * gl_PointCoord - 1.0);
    if (distance > 1.0) {
        discard;
    }
    float alpha = 1.0 - (1.0 - smoothstep(
        vSize - 2.0,
        vSize,
        distance * vSize
    ));
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
}