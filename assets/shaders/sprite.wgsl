// Sprite Shader - Basic 2D sprite rendering with lighting support
// Compatible with WebGPU (WGSL)

struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) color: vec4<f32>,
  @location(3) normal: vec2<f32>, // For normal mapping
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) normal: vec2<f32>,
  @location(3) worldPos: vec2<f32>,
}

struct Uniforms {
  projection: mat3x3<f32>,
  view: mat3x3<f32>,
  model: mat3x3<f32>,
  time: f32,
  resolution: vec2<f32>,
  ambientLight: vec3<f32>,
  ambientIntensity: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var sampler: sampler;
@group(0) @binding(3) var normalMap: texture_2d<f32>;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  // Apply transforms
  let worldPos = (uniforms.model * vec3<f32>(input.position, 1.0)).xy;
  let viewPos = (uniforms.view * vec3<f32>(worldPos, 1.0)).xy;
  let clipPos = (uniforms.projection * vec3<f32>(viewPos, 1.0)).xy;
  
  output.position = vec4<f32>(clipPos, 0.0, 1.0);
  output.uv = input.uv;
  output.color = input.color;
  output.normal = input.normal;
  output.worldPos = worldPos;
  
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  // Sample base texture
  let baseColor = textureSample(texture, sampler, input.uv);
  
  // Discard transparent pixels
  if (baseColor.a < 0.01) {
    discard;
  }
  
  // Apply vertex color
  let color = baseColor * input.color;
  
  // Simple lighting (would be expanded with light data)
  let ambient = uniforms.ambientLight * uniforms.ambientIntensity;
  let litColor = color.rgb * ambient;
  
  // Time-based effects (pulse, flicker, etc.)
  let pulse = sin(uniforms.time * 5.0) * 0.05 + 0.95;
  
  return vec4<f32>(litColor * pulse, color.a);
}