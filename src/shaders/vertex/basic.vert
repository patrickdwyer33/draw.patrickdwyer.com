attribute vec2 aPosition;

uniform vec2 uResolution;

uniform float dotSize;
 
// all shaders have a main function
  void main() {
    // convert the position from pixels to 0.0 to 1.0
    vec2 zeroToOne = aPosition / uResolution;
 
    // convert from 0->1 to 0->2
    vec2 zeroToTwo = zeroToOne * 2.0;
 
    // convert from 0->2 to -1->+1 (clip space)
    vec2 clipSpace = vec2(zeroToTwo.x - 1.0, -(zeroToTwo.y - 1.0));
 
    gl_Position = vec4(clipSpace, 0, 1);
    
    gl_PointSize = dotSize;
  }