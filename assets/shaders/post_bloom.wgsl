// Bloom Post-Processing Shader
// Extracts bright areas and applies Gaussian blur

struct Uniforms {
  resolution: vec2<f32>,
  threshold: f32,
  intensity: f32,
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
  
  // Extract bright areas
  let brightness = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let bloom = max(vec3<f32>(0.0), color.rgb - uniforms.threshold) * uniforms.intensity;
  
  return vec4<f32>(bloom, brightness > uniforms.threshold ? 1.0 : 0.0);
}