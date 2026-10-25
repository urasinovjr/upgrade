export const vertex = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform vec4 uText;
uniform vec4 uDrops[8];
uniform vec3 uInk;
uniform float uPeak;
uniform float uUnderText;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    amplitude *= 0.5;
  }
  return value;
}

float textMask(vec2 p) {
  vec2 center = uText.xy + uText.zw * 0.5;
  vec2 gap = abs(p - center) - uText.zw * 0.5;
  float outside = length(max(gap, 0.0));
  return 1.0 - smoothstep(0.0, 48.0, outside);
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uResolution;
  vec2 q = p / 320.0;
  float t = uTime * 0.05;
  vec2 warp = vec2(fbm(q + vec2(0.0, t)), fbm(q + vec2(5.2, 1.3 - t)));
  float field = fbm(q * 1.3 + warp * 2.0 + vec2(t * 0.6, 0.0));
  float side = smoothstep(0.25, 0.85, vUv.x);
  float ambient = smoothstep(0.52, 0.82, field) * mix(0.25, 0.6, side);

  float drops = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 drop = uDrops[i];
    float age = uTime - drop.z;
    if (drop.w <= 0.0 || age < 0.0 || age > 7.0) continue;
    float radius = 24.0 + 150.0 * (1.0 - exp(-age * 0.8));
    vec2 offset = p - drop.xy;
    float wobble = fbm(offset / 70.0 + drop.z * 3.1 + warp) - 0.5;
    float reach = length(offset) / radius + wobble * 0.7;
    float body = 1.0 - smoothstep(0.15, 1.0, reach);
    float rim = smoothstep(0.65, 0.95, reach) * (1.0 - smoothstep(0.95, 1.15, reach));
    float fade = exp(-age * 0.45) * (1.0 - smoothstep(5.0, 7.0, age)) * smoothstep(0.0, 0.4, age);
    drops += (body + rim * 0.6) * fade * drop.w;
  }

  float density = clamp(ambient + drops, 0.0, 1.0) * uPeak;
  density = min(density, mix(uPeak, uUnderText, textMask(p)));
  gl_FragColor = vec4(uInk * density, density);
}
`;
