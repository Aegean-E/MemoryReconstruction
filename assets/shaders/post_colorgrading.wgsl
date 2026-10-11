// Color Grading Post-Processing Shader
// Supports LUT-based grading, film emulation, and artistic looks

struct Uniforms {
  resolution: vec2<f32>,
  exposure: f32,
  contrast: f32,
  saturation: f32,
  temperature: f32,    // -1 to 1 (cool to warm)
  tint: f32,           // -1 to 1 (green to magenta)
  shadows: f32,        // Lift
  midtones: f32,       // Gamma
  highlights: f32,     // Gain
  lutIntensity: f32,   // 0 to 1
  filmGrain: f32,
  vignette: f32,
  _padding: array<f32, 2>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var sceneTexture: texture_2d<f32>;
@group(0) @binding(2) var lutTexture: texture_3d<f32>;
@group(0) @binding(3) var sampler: sampler;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
    vec2<f32>(3.0, 3.0)
  );
  return vec4<f32>(positions[vertexIndex], 0.0, 1.0);
}

fn rgbToHsv(rgb: vec3<f32>) -> vec3<f32> {
  let cmax = max(max(rgb.r, rgb.g), rgb.b);
  let cmin = min(min(rgb.r, rgb.g), rgb.b);
  let delta = cmax - cmin;
  
  var h = 0.0;
  if (delta > 0.0) {
    if (cmax == rgb.r) h = 60.0 * fmod((rgb.g - rgb.b) / delta, 6.0);
    else if (cmax == rgb.g) h = 60.0 * ((rgb.b - rgb.r) / delta + 2.0);
    else h = 60.0 * ((rgb.r - rgb.g) / delta + 4.0);
  }
  
  let s = select(0.0, delta / cmax, cmax > 0.0);
  let v = cmax;
  
  return vec3<f32>(h / 360.0, s, v);
}

fn hsvToRgb(hsv: vec3<f32>) -> vec3<f32> {
  let h = hsv.x * 360.0;
  let s = hsv.y;
  let v = hsv.z;
  
  let c = v * s;
  let x = c * (1.0 - abs(fmod(h / 60.0, 2.0) - 1.0));
  let m = v - c;
  
  var rgb: vec3<f32>;
  if (h < 60.0) rgb = vec3<f32>(c, x, 0.0);
  else if (h < 120.0) rgb = vec3<f32>(x, c, 0.0);
  else if (h < 180.0) rgb = vec3<f32>(0.0, c, x);
  else if (h < 240.0) rgb = vec3<f32>(0.0, x, c);
  else if (h < 300.0) rgb = vec3<f32>(x, 0.0, c);
  else rgb = vec3<f32>(c, 0.0, x);
  
  return rgb + vec3<f32>(m);
}

fn applyTemperatureTint(color: vec3<f32>, temp: f32, tint: f32) -> vec3<f32> {
  // Temperature: shift toward orange (warm) or blue (cool)
  let tempShift = temp * 0.1;
  let tintShift = tint * 0.05;
  
  var result = color;
  result.r += tempShift;
  result.b -= tempShift;
  result.g += tintShift;
  
  return result;
}

fn applyLiftGammaGain(color: vec3<f32>, lift: f32, gamma: f32, gain: f32) -> vec3<f32> {
  // Lift (shadows)
  var result = color + vec3<f32>(lift);
  
  // Gamma (midtones)
  result = pow(max(result, vec3<f32>(0.0)), vec3<f32>(1.0 / max(gamma, 0.01)));
  
  // Gain (highlights)
  result *= vec3<f32>(gain);
  
  return result;
}

fn random(vec2: vec2<f32>) -> f32 {
  return fract(sin(dot(vec2, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = fragCoord.xy / uniforms.resolution;
  var color = textureSample(sceneTexture, sampler, uv).rgb;
  
  // Exposure
  color *= uniforms.exposure;
  
  // Temperature and tint
  color = applyTemperatureTint(color, uniforms.temperature, uniforms.tint);
  
  // Lift/Gamma/Gain
  color = applyLiftGammaGain(color, uniforms.shadows, uniforms.midtones, uniforms.highlights);
  
  // Contrast
  color = (color - 0.5) * uniforms.contrast + 0.5;
  
  // Saturation
  let luminance = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
  color = mix(vec3<f32>(luminance), color, uniforms.saturation);
  
  // LUT lookup (if intensity > 0)
  if (uniforms.lutIntensity > 0.0) {
    let lutColor = textureSample(lutTexture, sampler, color).rgb;
    color = mix(color, lutColor, uniforms.lutIntensity);
  }
  
  // Film grain
  if (uniforms.filmGrain > 0.0) {
    let grain = (random(uv * 1000.0) - 0.5) * 2.0 * uniforms.filmGrain * 0.02;
    color += vec3<f32>(grain);
  }
  
  // Vignette
  if (uniforms.vignette > 0.0) {
    let center = vec2<f32>(0.5, 0.5);
    let dist = length(uv - center) * 1.4;
    let vignette = 1.0 - smoothstep(0.5, 1.0, dist) * uniforms.vignette;
    color *= vignette;
  }
  
  // Clamp and gamma
  color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
  color = pow(color, vec3<f32>(1.0 / 2.2));
  
  return vec4<f32>(color, 1.0);
}