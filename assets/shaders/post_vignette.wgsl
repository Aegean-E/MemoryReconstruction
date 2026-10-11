// Vignette Post-Processing Shader
// Darkens edges of screen for cinematic effect

struct Uniforms {
  resolution: vec2<f32>,
  intensity: f32,
  smoothness: f32,
  color: vec3<f32>,
  _padding: f32,
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

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = fragCoord.xy / uniforms.resolution;
  let color = textureSample(sceneTexture, sampler, uv);
  
  // Calculate vignette
  let center = vec2<f32>(0.5, 0.5);
  let dist = distance(uv, center) * 2.0; // 0 at center, ~1.4 at corners
  let vignette = 1.0 - smoothstep(0.0, 1.0, pow(dist, uniforms.smoothness)) * uniforms.intensity;
  
  // Apply vignette color
  let vignetteColor = mix(color.rgb, uniforms.color, (1.0 - vignette) * 0.5);
  
  return vec4<f32>(vignetteColor * vignette, color.a);
}