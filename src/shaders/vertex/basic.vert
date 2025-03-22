attribute vec2 aPosition;

uniform vec2 uResolution;

varying float vSize;
uniform float dotSize;
uniform float uEdgeSize;
 
// all shaders have a main function
  void main() {
    // convert the position from pixels to 0.0 to 1.0
    vec2 zeroToOne = aPosition / uResolution;
 
    // convert from 0->1 to 0->2
    vec2 zeroToTwo = zeroToOne * 2.0;
 
    // convert from 0->2 to -1->+1 (clip space)
    vec2 clipSpace = zeroToTwo - 1.0;
 
    gl_Position = vec4(clipSpace, 0, 1);

    vSize = 2.0 * sqrt(dotSize / 3.14159); // Calculate the diameter of the circle from the area
    
    gl_PointSize = vSize + uEdgeSize + 1.0;
  }