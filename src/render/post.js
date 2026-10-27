import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.35 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.1, 1.0)));
      color.rgb *= mix(1.0 - uStrength, 1.0, v);
      gl_FragColor = color;
    }
  `,
};

// High quality: multisampled HDR render, ambient occlusion, bloom, vignette, then ACES in the
// output pass. Low quality skips the composer and draws straight to the screen.
export function createPostProcessing(renderer, scene, camera) {
  let composer = null;
  let bloom = null;
  let ao = null;
  let quality = "high";

  function build(width, height) {
    composer?.dispose();
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    ao = new GTAOPass(scene, camera, width, height);
    ao.blendIntensity = 0.7;
    ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1 });
    composer.addPass(ao);
    bloom = new UnrealBloomPass(new THREE.Vector2(width / 2, height / 2), 0.5, 0.4, 1.6);
    composer.addPass(bloom);
    composer.addPass(new ShaderPass(VignetteShader));
    composer.addPass(new OutputPass());
  }

  return {
    get quality() {
      return quality;
    },
    setQuality(value, width, height) {
      quality = value;
      renderer.shadowMap.type = value === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      // Post-processing cost grows with pixel count, so even High stops at 1.5x.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, value === "high" ? 1.5 : 1.25));
      this.resize(width, height);
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      if (quality !== "high") {
        composer?.dispose();
        composer = null;
        return;
      }
      const ratio = renderer.getPixelRatio();
      if (!composer) build(width * ratio, height * ratio);
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
    },
    render() {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
  };
}
