// Particle Shader - GPU-accelerated particle system
// Supports point sprites, trails, and various particle types

struct Particle {
  position: vec2<f32>,
  velocity: vec2<f32>,
  color: vec4<f32>,
  size: f32,
  life: f32,
  maxLife: f32,
  rotation: f32,
  angularVelocity: f32,
  type: u32, // 0=circle, 1=square, 2=ring, 3=custom
  _padding: array<f32, 3>,
}

struct Uniforms {
  projection: mat3x3<f32>,
  view: mat3x3<f32>,
  time: f32,
  deltaTime: f32,
  resolution: vec2<f32>,
  gravity: vec2<f32>,
  wind: vec2<f32>,
  particleCount: u32,
  _padding: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var texture: texture_2d<f32>;
@group(0) @binding(3) var sampler: sampler;

// Vertex shader for instanced rendering
struct VertexInput {
  @location(0) quadPos: vec2<f32>,
  @location(1) quadUv: vec2<f32>,
  @builtin(instance_index) instanceIndex: u32,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) rotation: f32,
  @location(3) size: f32,
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  let particle = particles[input.instanceIndex];
  
  // Skip dead particles
  if (particle.life <= 0.0) {
    output.position = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return output;
  }
  
  // Calculate life ratio
  let lifeRatio = particle.life / particle.maxLife;
  
  // Apply rotation
  let cosRot = cos(particle.rotation);
  let sinRot = sin(particle.rotation);
  let rotMatrix = mat2x2<f32>(cosRot, -sinRot, sinRot, cosRot);
  
  // Scale quad by particle size
  let scaledQuad = input.quadPos * particle.size * lifeRatio;
  let rotatedQuad = rotMatrix * scaledQuad;
  
  // World position
  let worldPos = particle.position + rotatedQuad;
  
  // Transform to clip space
  let viewPos = (uniforms.view * vec3<f32>(worldPos, 1.0)).xy;
  let clipPos = (uniforms.projection * vec3<f32>(viewPos, 1.0)).xy;
  
  output.position = vec4<f32>(clipPos, 0.0, 1.0);
  output.uv = input.quadUv;
  output.color = particle.color;
  output.rotation = particle.rotation;
  output.size = particle.size;
  
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  // Sample particle texture
  let texColor = textureSample(texture, sampler, input.uv);
  
  // Apply color and alpha based on life
  let alpha = input.color.a * texColor.a;
  
  // Soft edges for circular particles
  let dist = length(input.uv - vec2<f32>(0.5, 0.5)) * 2.0;
  let edgeFade = 1.0 - smoothstep(0.8, 1.0, dist);
  
  return vec4<f32>(input.color.rgb * texColor.rgb, alpha * edgeFade);
}

// Compute shader for particle simulation (separate pipeline)
@group(1) @binding(0) var<uniform> simUniforms: Uniforms;
@group(1) @binding(1) var<storage, read_write> simParticles: array<Particle>;

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index >= simUniforms.particleCount) return;
  
  var particle = simParticles[index];
  
  // Skip dead particles
  if (particle.life <= 0.0) return;
  
  // Update life
  particle.life -= simUniforms.deltaTime;
  if (particle.life <= 0.0) {
    particle.life = 0.0;
    simParticles[index] = particle;
    return;
  }
  
  // Physics
  particle.velocity += simUniforms.gravity * simUniforms.deltaTime;
  particle.velocity += simUniforms.wind * simUniforms.deltaTime * 0.1;
  particle.position += particle.velocity * simUniforms.deltaTime;
  
  // Rotation
  particle.rotation += particle.angularVelocity * simUniforms.deltaTime;
  
  // Fade out over life
  let lifeRatio = particle.life / particle.maxLife;
  particle.color.a = particle.color.a * lifeRatio;
  particle.size *= 0.999; // Slight shrink
  
  simParticles[index] = particle;
}