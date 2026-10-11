// Light Shader - 2D dynamic lighting with shadows
// Renders light volumes and shadow casting

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
  shadowBias: f32,
  _padding: array<f32, 2>,
}

struct Uniforms {
  projection: mat3x3<f32>,
  view: mat3x3<f32>,
  time: f32,
  resolution: vec2<f32>,
  ambientColor: vec3<f32>,
  ambientIntensity: f32,
  lightCount: u32,
  _padding: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> lights: array<Light>;
@group(0) @binding(2) var occlusionMap: texture_2d<f32>;
@group(0) @binding(3) var normalMap: texture_2d<f32>;
@group(0) @binding(4) var sampler: sampler;

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

fn calculatePointLight(
  worldPos: vec2<f32>,
  normal: vec2<f32>,
  light: Light,
  occlusion: f32
) -> vec3<f32> {
  let lightDir = light.position - worldPos;
  let distance = length(lightDir);
  
  if (distance > light.radius) return vec3<f32>(0.0);
  
  let normalizedDir = lightDir / distance;
  let attenuation = 1.0 - smoothstep(0.0, light.radius, distance);
  attenuation *= attenuation; // Quadratic
  
  // Normal dot light (Lambert)
  let nDotL = max(dot(normal, normalizedDir), 0.0);
  
  // Shadow
  let shadow = light.castShadows == 1u ? occlusion : 1.0;
  
  return light.color * nDotL * attenuation * light.intensity * shadow;
}

fn calculateSpotLight(
  worldPos: vec2<f32>,
  normal: vec2<f32>,
  light: Light,
  occlusion: f32
) -> vec3<f32> {
  let lightDir = light.position - worldPos;
  let distance = length(lightDir);
  
  if (distance > light.radius) return vec3<f32>(0.0);
  
  let normalizedDir = lightDir / distance;
  let attenuation = 1.0 - smoothstep(0.0, light.radius, distance);
  attenuation *= attenuation;
  
  // Spot angle
  let spotDir = normalize(light.direction);
  let spotFactor = dot(-normalizedDir, spotDir);
  let outerCos = cos(light.outerAngle);
  let innerCos = cos(light.innerAngle);
  let spot = smoothstep(outerCos, innerCos, spotFactor);
  
  if (spot == 0.0) return vec3<f32>(0.0);
  
  let nDotL = max(dot(normal, normalizedDir), 0.0);
  let shadow = light.castShadows == 1u ? occlusion : 1.0;
  
  return light.color * nDotL * attenuation * spot * light.intensity * shadow;
}

fn calculateDirectionalLight(
  normal: vec2<f32>,
  light: Light
) -> vec3<f32> {
  let lightDir = normalize(-light.direction);
  let nDotL = max(dot(normal, lightDir), 0.0);
  return light.color * nDotL * light.intensity;
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = fragCoord.xy / uniforms.resolution;
  
  // Sample occlusion and normal maps
  let occlusion = textureSample(occlusionMap, sampler, uv).r;
  let normalSample = textureSample(normalMap, sampler, uv);
  let normal = normalSample.xy * 2.0 - 1.0; // Unpack
  
  // World position (reconstruct from UV)
  let worldPos = uv * uniforms.resolution;
  
  // Ambient
  var lighting = uniforms.ambientColor * uniforms.ambientIntensity;
  
  // Accumulate lights
  for (var i = 0u; i < uniforms.lightCount; i++) {
    let light = lights[i];
    
    switch (light.type) {
      case 0u: // Point
        lighting += calculatePointLight(worldPos, normal, light, occlusion);
      case 1u: // Spot
        lighting += calculateSpotLight(worldPos, normal, light, occlusion);
      case 2u: // Directional
        lighting += calculateDirectionalLight(normal, light);
      default:
        // No-op
    }
  }
  
  // Gamma correction
  lighting = pow(lighting, vec3<f32>(1.0 / 2.2));
  
  // Additive blending for lights
  return vec4<f32>(lighting, 1.0);
}