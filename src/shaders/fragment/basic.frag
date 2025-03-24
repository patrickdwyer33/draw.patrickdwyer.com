precision mediump float;

varying float vSize;

void main() {
    float distance = length(2.0 * gl_PointCoord - 1.0);
    if (distance > 1.0) {
        discard;
    }
    // Use a smoother falloff function for better anti-aliasing
    float alpha = 1.0 - smoothstep(0.0, 1.0, distance);
    alpha = pow(alpha, 2.0); // Add a slight falloff curve
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
}