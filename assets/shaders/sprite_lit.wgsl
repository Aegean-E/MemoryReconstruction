// Lit Sprite Shader - 2D sprites with normal mapping and dynamic lighting
// Supports multiple point lights, spot lights, and ambient occlusion

struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) color: vec4<f32>,
  @location(3) normal: vec2<f32>,
  @location(4) tangent: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) normal: vec2<f32>,
  @location(3) tangent: vec2<f32>,
  @location(4) worldPos: vec2<f32>,
}

struct Light {
  position: vec2<f32>,
  color: vec3<f32>,
  radius: f32,
  intensity: f32,
  type: u32, // 0=point, 1=spot, 2=directional
  direction: vec2<f32>,
  innerAngle: f32,
  outerAngle: f32,
  castShadows: u32,
}

struct Uniforms {
  projection: mat3x3<f32>,
  view: mat3x3<f32>,
  model: mat3x3<f32>,
  time: f32,
  resolution: vec2<f32>,
  ambientLight: vec3<f32>,
  ambientIntensity: f32,
  lightCount: u32,
  _padding: array<f32, 3>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> lights: array<Light>;
@group(0) @binding(2) var albedoMap: texture_2d<f32>;
@group(0) @binding(3) var normalMap: texture_2d<f32>;
@group(0) @binding(4) var roughnessMap: texture_2d<f32>;
@group(0) @binding(5) var sampler: sampler;
@group(0) @binding(6) var shadowMap: texture_2d<f32>;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  let worldPos = (uniforms.model * vec3<f32>(input.position, 1.0)).xy;
  let viewPos = (uniforms.view * vec3<f32>(worldPos, 1.0)).xy;
  let clipPos = (uniforms.projection * vec3<f32>(viewPos, 1.0)).xy;
  
  output.position = vec4<f32>(clipPos, 0.0, 1.0);
  output.uv = input.uv;
  output.color = input.color;
  output.normal = input.normal;
  output.tangent = input.tangent;
  output.worldPos = worldPos;
  
  return output;
}

fn calculateLighting(
  worldPos: vec2<f32>,
  normal: vec3<f32>,
  albedo: vec3<f32>,
  roughness: f32,
  viewDir: vec2<f32>
) -> vec3<f32> {
  var lighting = uniforms.ambientLight * uniforms.ambientIntensity * albedo;
  
  for (var i = 0u; i < uniforms.lightCount; i++) {
    let light = lights[i];
    let lightDir = light.position - worldPos;
    let distance = length(lightDir);
    
    if (distance > light.radius) continue;
    
    let normalizedLightDir = lightDir / distance;
    let attenuation = 1.0 - smoothstep(0.0, light.radius, distance);
    attenuation *= attenuation; // Quadratic falloff
    
    // Spot light angle check
    if (light.type == 1u) {
      let spotFactor = dot(normalize(-lightDir), normalize(light.direction));
      let outerCos = cos(light.outerAngle);
      let innerCos = cos(light.innerAngle);
      let spot = smoothstep(outerCos, innerCos, spotFactor);
      if (spot == 0.0) continue;
      attenuation *= spot;
    }
    
    // Diffuse (Lambert)
    let nDotL = max(dot(normal.xy, normalizedLightDir), 0.0);
    let diffuse = albedo * light.color * nDotL * attenuation * light.intensity;
    
    // Specular (Blinn-Phong approximation)
    let halfDir = normalize(normalizedLightDir + viewDir);
    let nDotH = max(dot(normal.xy, halfDir), 0.0);
    let specular = pow(nDotH, 32.0 * (1.0 - roughness) + 1.0);
    let specularColor = light.color * specular * attenuation * light.intensity * 0.5;
    
    lighting += diffuse + specularColor;
  }
  
  return lighting;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  // Sample textures
  let albedo = textureSample(albedoMap, sampler, input.uv);
  let normalSample = textureSample(normalMap, sampler, input.uv);
  let roughness = textureSample(roughnessMap, sampler, input.uv).r;
  
  // Discard transparent
  if (albedo.a < 0.01) {
    discard;
  }
  
  // Apply vertex color
  let baseColor = albedo.rgb * input.color.rgb;
  let alpha = albedo.a * input.color.a;
  
  // Unpack normal map (stored as RGB, convert to -1..1)
  let normal = normalSample.rgb * 2.0 - 1.0;
  
  // View direction (assuming camera at origin in view space)
  let viewDir = normalize(-input.worldPos);
  
  // Calculate lighting
  let lighting = calculateLighting(input.worldPos, normal, baseColor, roughness, viewDir);
  
  // Gamma correction
  let gammaCorrected = pow(lighting, vec3<f32>(1.0 / 2.2));
  
  // Time-based effects
  let pulse = sin(uniforms.time * 3.0) * 0.02 + 0.98;
  
  return vec4<f32>(gammaCorrected * pulse, alpha);
}