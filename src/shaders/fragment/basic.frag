precision mediump float;

varying vec4 vColor;

void main() {
    float distance = length(2.0 * gl_PointCoord - 1.0);
    if (distance > 1.0) {
        discard;
    }
    gl_FragColor = vColor;
}