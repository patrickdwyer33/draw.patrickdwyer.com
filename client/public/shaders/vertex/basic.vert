attribute vec2 aPosition;
attribute vec4 aColor;

uniform vec2 uResolution;

uniform float dotSize;

varying vec4 vColor;

  void main() {
    vec2 zeroToOne = aPosition / uResolution;

    vec2 zeroToTwo = zeroToOne * 2.0;

    vec2 clipSpace = vec2(zeroToTwo.x - 1.0, -(zeroToTwo.y - 1.0));

    gl_Position = vec4(clipSpace, 0, 1);

    gl_PointSize = dotSize;

    vColor = aColor;
  }