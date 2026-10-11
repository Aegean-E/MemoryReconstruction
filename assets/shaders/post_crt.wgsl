// CRT/Scanline Post-Processing Shader
// Simulates CRT monitor effects: scanlines, curvature, phosphor glow, noise

struct Uniforms {
  resolution: vec2<f32>,
  time: f32,
  scanlineIntensity: f32,
  curvature: f32,
  phosphorGlow: f32,
  noiseIntensity: f32,
  chromaticAberration: f32,
  vignette: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var sceneTexture: texture_2d<f32>;
@group(0) @binding(2) var sampler: sampler;

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

fn random(vec2: vec2<f32>) -> f32 {
  return fract(sin(dot(vec2, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = fragCoord.xy / uniforms.resolution;
  
  // Screen curvature
  let center = vec2<f32>(0.5, 0.5);
  let dist = uv - center;
  let curvedUV = uv + dist * (dist * dist) * uniforms.curvature;
  
  // Chromatic aberration
  let aberration = uniforms.chromaticAberration * dist * 0.01;
  let r = textureSample(sceneTexture, sampler, curvedUV + aberration).r;
  let g = textureSample(sceneTexture, sampler, curvedUV).g;
  let b = textureSample(sceneTexture, sampler, curvedUV - aberration).b;
  var color = vec3<f32>(r, g, b);
  
  // Scanlines
  let scanline = sin(uniforms.resolution.y * uv.y * 3.14159 * 2.0 + uniforms.time * 0.1) * 0.5 + 0.5;
  let scanlineEffect = mix(1.0, scanline, uniforms.scanlineIntensity);
  color *= scanlineEffect;
  
  // Phosphor glow (bright areas bleed)
  let brightness = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
  let glow = smoothstep(0.7, 1.0, brightness) * uniforms.phosphorGlow;
  color += color * glow * 0.5;
  
  // Noise
  let noise = (random(uv * 100.0 + uniforms.time * 10.0) - 0.5) * 2.0 * uniforms.noiseIntensity;
  color += vec3<f32>(noise);
  
  // Vignette
  let vignetteDist = length(uv - center) * 1.4;
  let vignette = 1.0 - smoothstep(0.5, 1.0, vignetteDist) * uniforms.vignette;
  color *= vignette;
  
  // Gamma correction
  color = pow(color, vec3<f32>(1.0 / 2.2));
  
  return vec4<f32>(color, 1.0);
}