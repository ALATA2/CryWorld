import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { VoxelTerrain } from './marching_cubes.js';
import { WaterSystem } from './water_system.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ==========================================
// GAME STATE variables
// ==========================================
let scene, camera, renderer, clock;
let terrain, water, sky, sun, heightmapTexture, heightmapData, waterSystem;
const cameraPosUniform = { value: new THREE.Vector3() };
let controls;
let spear, pickaxe, manipulator, leftArm, rightArm, isDiggingAnim = false, animTime = 0;
let activeSlot = 3;
let clouds = [];
let gameStarted = false;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window);

// Movement flags & velocities
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const keyStates = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    Space: false,
    ShiftLeft: false,
    KeyQ: false
};

let isGrounded = false;
let isFlying = false;
const playerHeight = 1.8; // Camera height above ground
const gravity = 25.0; // Gravity acceleration (m/s^2)
const jumpForce = 10.0; // Jump power
const moveSpeed = 40.0; // Walk speed
const runSpeed = 70.0; // Shift-run speed (optional)

// Digging / Building continuous interaction state
let isDigging = false;
let isBuilding = false;
let lastInteractionTime = 0;
const interactionCooldown = 80; // ms between digs when holding mouse button

// Raycaster for terrain interaction
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

// DOM Elements
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const posInfo = document.getElementById('pos-info');
const fpsCounter = document.getElementById('fps-counter');
const crosshair = document.getElementById('crosshair');
let manipulatorHud;
let manipulatorRadius = 3.5;

// Background Ambient Music variables
let bgMusic = null;
const BGM_TARGET_VOLUME = 0.20; // Volume ambientale non troppo forte (20%)
let bgmCurrentVolume = 0.0;
let bgmPlaying = false;
let bgmMuted = (typeof localStorage !== 'undefined' && localStorage.getItem('cryworld_music_muted') === '1');

// FPS counting variables
let fpsLastTime = performance.now();
let fpsFrames = 0;

// Instanced mesh variables for environment objects
let instancedPalmsTrunk, instancedPalmsLeaves, instancedPalmsCoconuts;
let instancedPinesTrunk, instancedPinesFoliage;
let instancedPinesBTrunk, instancedPinesBFoliage;
let instancedRocks, instancedBushes;
let atlantisMistGroup = null;
let atlantisMistUniforms = null;

// Arrays containing positions and falling states of all environment objects
let palmInstances = [];
let pineInstances = [];
let rockInstances = [];
let bushInstances = [];

// Head bobbing & FOV speed effects variables
let bobTime = 0;
let lastBobY = 0;
let currentFov = 65;
const defaultFov = 65;
const runFov = 73;

// Initialize the game
init();
animate();

// ==========================================
// CORE INITIALIZATION
// ==========================================
function init() {
    // 1. Scene & Camera Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ce3ff); // Caribbean cyan horizon background
    scene.fog = new THREE.Fog(0x8ce3ff, 460, 1060); // Clear panoramic view across all 3 concentric rings up to the Ring of Mist

    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 45000);
    camera.rotation.order = 'YXZ'; // FPS style rotation order to prevent horizon slant/roll
    camera.position.set(0, 20, 45); // Start on beach slope

    clock = new THREE.Clock();

    // 2. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('game-canvas') });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio to 2 for performance
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // Optimize: Do not update shadows every frame!
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15; // Bright, sun-drenched exposure

    // 3. Lighting Setup (Next-Gen Tropical Golden Sunlight + Sky/Jungle Hemisphere Fill)
    const ambientLight = new THREE.AmbientLight(0xfff8ee, 0.55);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x88d4ff, 0x2d5e2e, 0.65);
    hemiLight.position.set(0, 300, 0);
    scene.add(hemiLight);

    // Warm golden-white tropical sunlight casting crisp shadows and water shimmer
    const dirLight = new THREE.DirectionalLight(0xfff2d6, 2.35);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 260;
    const d = 95;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0004;
    scene.add(dirLight);

    // 4. Sky and Sun Configuration (Photorealistic Tropical Sky with Volumetric Cumulus Clouds & Stars)
    const skyGeo = new THREE.SphereGeometry(1, 48, 24);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0b5ec9) }, // Deep azure zenith
            bottomColor: { value: new THREE.Color(0x9be2ff) }, // Luminous tropical horizon
            exponent: { value: 0.55 },
            sunDirection: { value: new THREE.Vector3() },
            starIntensity: { value: 0.0 },
            uTime: { value: 0.0 }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_Position.z = gl_Position.w; // Focus sky at infinity
            }
        `,
        fragmentShader: `
            varying vec3 vWorldPosition;
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            uniform float exponent;
            uniform vec3 sunDirection;
            uniform float starIntensity;
            uniform float uTime;

            // Fast hashes & 2D/3D Value Noise for volumetric cumulus clouds and stars
            float hash21(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            float noise2D(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash21(i);
                float b = hash21(i + vec2(1.0, 0.0));
                float c = hash21(i + vec2(0.0, 1.0));
                float d = hash21(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            float fbmCloud(vec2 p) {
                float v = 0.0;
                float amp = 0.5;
                mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
                for (int i = 0; i < 5; i++) {
                    v += amp * noise2D(p);
                    p = rot * p * 2.03 + vec2(13.7, 29.1);
                    amp *= 0.5;
                }
                return v;
            }

            float hash31(vec3 p) {
                p = fract(p * vec3(443.897, 441.423, 437.195));
                p += dot(p, p.yzx + 19.19);
                return fract((p.x + p.y) * p.z);
            }

            float getStars(vec3 dir) {
                vec3 p = dir * 260.0;
                vec3 id = floor(p);
                vec3 f = fract(p) - 0.5;
                float n = hash31(id);
                float star = 0.0;
                if (n > 0.955) {
                    vec3 offset = vec3(hash31(id + 1.0), hash31(id + 2.0), hash31(id + 3.0)) - 0.5;
                    float dist = length(f - offset * 0.65);
                    float brightness = fract(n * 137.45);
                    star = smoothstep(0.075, 0.01, dist) * (0.7 + 0.7 * brightness);
                }
                vec3 p2 = dir * 520.0;
                vec3 id2 = floor(p2);
                vec3 f2 = fract(p2) - 0.5;
                float n2 = hash31(id2);
                if (n2 > 0.982) {
                    vec3 offset2 = vec3(hash31(id2 + 1.0), hash31(id2 + 2.0), hash31(id2 + 3.0)) - 0.5;
                    float dist2 = length(f2 - offset2 * 0.65);
                    star += smoothstep(0.055, 0.008, dist2) * 0.6;
                }
                return star;
            }

            void main() {
                vec3 dir = normalize(vWorldPosition);
                vec3 sunDir = normalize(sunDirection);
                float h = dir.y;
                float sunGlow = max(0.0, dot(dir, sunDir));

                vec3 skyColor;
                if (h >= 0.0) {
                    skyColor = mix(bottomColor, topColor, pow(h, exponent));
                    // Warm golden atmospheric scattering near the horizon & sun
                    float horizonGlow = pow(1.0 - h, 3.5);
                    vec3 warmHorizon = vec3(1.0, 0.88, 0.68) * pow(sunGlow, 3.0) * 0.42 * (1.0 - starIntensity);
                    skyColor += warmHorizon * (0.5 + 0.5 * horizonGlow);
                } else {
                    vec3 abyssColor = vec3(0.003, 0.015, 0.035);
                    float abyssFactor = pow(clamp(-h * 4.5, 0.0, 1.0), 0.7);
                    skyColor = mix(bottomColor, abyssColor, abyssFactor);
                }
                
                // Add crisp stars in space when starIntensity > 0
                if (starIntensity > 0.0) {
                    float stars = getStars(dir);
                    vec3 starTint = mix(vec3(0.85, 0.93, 1.0), vec3(1.0, 0.92, 0.78), hash31(floor(dir * 260.0)));
                    skyColor += starTint * stars * starIntensity;
                }

                // Volumetric-Style Tropical Cumulus Clouds in Upper Hemisphere
                float cloudVis = (1.0 - starIntensity * 0.92) * smoothstep(0.015, 0.14, h);
                if (cloudVis > 0.001 && h > 0.01) {
                    // Project ray onto curved atmospheric cloud dome
                    vec2 cloudUV = dir.xz / (h + 0.13);
                    vec2 wind = vec2(uTime * 0.012, uTime * 0.005);

                    // Base billowing cumulus shape + fine cauliflower edges
                    float baseN = fbmCloud(cloudUV * 0.65 + wind);
                    float detailN = fbmCloud(cloudUV * 1.85 - wind * 1.4);
                    float cloudShape = baseN * 0.72 + detailN * 0.28;
                    float cloudDensity = smoothstep(0.47, 0.72, cloudShape);

                    if (cloudDensity > 0.001) {
                        // Directional sunlight self-shadowing sample toward the sun
                        vec2 sunStep = normalize(sunDir.xz + vec2(0.0001)) * 0.16;
                        float shadowSample = fbmCloud((cloudUV + sunStep) * 0.65 + wind);
                        float selfShadow = clamp((shadowSample - cloudShape) * 3.2 + 0.5, 0.0, 1.0);
                        float topLight = clamp(1.0 - selfShadow * 0.75 + detailN * 0.25, 0.0, 1.0);

                        // Silver lining Mie forward scattering near the sun
                        float mieLining = pow(sunGlow, 8.0) * (1.0 - cloudDensity * 0.5) * 0.65;

                        vec3 cloudBright = vec3(1.0, 0.98, 0.94); // Warm sunlit white-gold top
                        vec3 cloudShadow = vec3(0.62, 0.71, 0.82); // Soft tropical blue-grey base
                        vec3 cloudCol = mix(cloudShadow, cloudBright, topLight);
                        cloudCol += vec3(1.0, 0.90, 0.70) * mieLining;

                        // Blend distant horizon clouds gently into atmospheric horizon haze
                        float distFade = smoothstep(0.015, 0.22, h);
                        cloudCol = mix(bottomColor * 1.04, cloudCol, 0.35 + 0.65 * distFade);

                        skyColor = mix(skyColor, cloudCol, cloudDensity * cloudVis * 0.92);
                    }
                }

                // Brilliant Golden Sun Disk and Warm Mie Corona
                vec3 sunColor = vec3(1.0, 0.96, 0.86);
                skyColor += sunColor * smoothstep(0.9982, 0.9997, sunGlow) * 2.2; // Crisp sun disk
                skyColor += vec3(1.0, 0.88, 0.62) * pow(sunGlow, 18.0) * 0.38 * (1.0 - starIntensity * 0.6); // Warm inner corona
                skyColor += vec3(1.0, 0.82, 0.55) * pow(sunGlow, 4.5) * 0.14 * (1.0 - starIntensity * 0.7);  // Wide golden atmospheric glow
                
                gl_FragColor = vec4(skyColor, 1.0);
            }
        `,
        side: THREE.BackSide,
        depthWrite: false
    });
    sky = new THREE.Mesh(skyGeo, skyMat);
    sky.scale.setScalar(35000); // Scale comfortably inside 45km celestial clipping plane
    scene.add(sky);

    sun = new THREE.Vector3();
    const effectController = {
        elevation: 28.0, // Scenic golden tropical sun angle casting shimmering path across the lagoon
        azimuth: 195,    // Shining over the islands and ocean
        exposure: renderer.toneMappingExposure
    };

    function updateSky() {
        const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
        const theta = THREE.MathUtils.degToRad(effectController.azimuth);

        sun.setFromSphericalCoords(1, phi, theta);
        
        if (sky && sky.material && sky.material.uniforms) {
            sky.material.uniforms['sunDirection'].value.copy(sun);
        }
        
        dirLight.position.copy(sun).multiplyScalar(100);
        
        // Match fog to clear sky horizon blue
        scene.fog.color.setHex(0x8ce3ff);
        
        // Dynamically update water sunlight direction
        if (water) {
            water.material.uniforms['sunDirection'].value.copy(sun).normalize();
        }
    }
    updateSky();

    // 5. Planetary Spherical Ocean Setup (Next-Gen Bathymetric Turquoise Lagoon, Reefs & Shore Foam)
    const waterNormalsTexture = new THREE.TextureLoader().load('waternormals.jpg', function (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
    });

    const waterGeometry = new THREE.CircleGeometry(3200, 160);
    water = new Water(
        waterGeometry,
        {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals: waterNormalsTexture,
            sunDirection: sun,
            sunColor: 0xffe6b8, // Warm golden sunlight specular glints
            waterColor: 0x004e75, // Deep tropical ocean base color
            distortionScale: 1.8,
            alpha: 0.98,
            fog: scene.fog !== undefined
        }
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 120.0, 0); // Sea level at Y = 120.0 meters
    
    // Make water double-sided so you can see the surface from underneath and enable blending
    water.material.side = THREE.DoubleSide;
    water.material.transparent = true;

    // Optimize: Skip reflection rendering pass if camera is underwater (since reflections are invisible from below)
    const originalOnBeforeRender = water.onBeforeRender;
    water.onBeforeRender = function(renderer, scene, camera) {
        if (camera.position.y < 120.0) return; // Skip mirror pass!
        originalOnBeforeRender.call(this, renderer, scene, camera);
    };

    // Planetary Horizon Vertex Curvature for water
    water.material.uniforms['cameraPos'] = cameraPosUniform;
    water.material.vertexShader = `
        uniform vec3 cameraPos;
    ` + water.material.vertexShader;

    water.material.vertexShader = water.material.vertexShader.replace(
        'vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );',
        `vec3 curvedPos = position;
         vec4 worldV = modelMatrix * vec4(position, 1.0);
         float distH = length(worldV.xz - cameraPos.xz);
         float planetR = 1800000.0;
         if (distH < planetR) {
             float drop = planetR - sqrt(planetR * planetR - distH * distH);
             curvedPos.z -= drop;
         } else {
             curvedPos.z -= planetR;
         }
         mirrorCoord = modelMatrix * vec4( curvedPos, 1.0 );
         worldPosition = mirrorCoord.xyzw;
         mirrorCoord = textureMatrix * mirrorCoord;
         vec4 mvPosition = modelViewMatrix * vec4( curvedPos, 1.0 );`
    );

    // Flip normal when looking from below (enables wave shading, specular glints and highlights underwater)
    water.material.fragmentShader = water.material.fragmentShader.replace(
        'vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',
        `vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );
         if (eye.y < worldPosition.y) {
             surfaceNormal = -surfaceNormal;
         }`
    );

    // Bathymetric Turquoise Lagoon, Coral Reef Shadows, Shoreline Foam & Planetary Limb Glow
    water.material.fragmentShader = `
        uniform vec3 cameraPos;
        uniform sampler2D waterMaskTexture;
        uniform vec4 waterMaskBounds;
        uniform sampler2D heightmapTexture;

        float wHash21(vec2 p) {
            p = fract(p * vec2(127.1, 311.7));
            p += dot(p, p + 34.5);
            return fract(p.x * p.y);
        }
        float wNoise2(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(wHash21(i), wHash21(i + vec2(1.0, 0.0)), f.x),
                mix(wHash21(i + vec2(0.0, 1.0)), wHash21(i + vec2(1.0, 1.0)), f.x),
                f.y
            );
        }
        float wFbm(vec2 p) {
            float v = 0.0;
            v += 0.50 * wNoise2(p); p *= 2.04;
            v += 0.25 * wNoise2(p); p *= 2.02;
            v += 0.125 * wNoise2(p); p *= 2.03;
            v += 0.0625 * wNoise2(p);
            return v;
        }
    ` + water.material.fragmentShader;

    water.material.fragmentShader = water.material.fragmentShader.replace(
        'gl_FragColor = vec4( outgoingLight, alpha );',
        `// Check water mask over interior dry land (prevents ocean plane inside unflooded inland pits)
         vec2 maskUV = (worldPosition.xz - waterMaskBounds.xy) / waterMaskBounds.zw;
         float maskFade = 1.0;
         if (maskUV.x >= 0.0 && maskUV.x <= 1.0 && maskUV.y >= 0.0 && maskUV.y <= 1.0) {
             float maskVal = texture2D(waterMaskTexture, maskUV).r;
             if (maskVal < 0.02) {
                 discard;
             }
             maskFade = smoothstep(0.02, 0.30, maskVal);
         }

         float distAlpha = alpha;
         vec3 finalColor = outgoingLight;

         if (eye.y >= worldPosition.y) {
             // 1. High-precision Bathymetric Water Depth (0.0m .. 25.5m at 10cm accuracy symmetrically centered on Atlantis)
             float waterDepth = 25.5;
             vec2 hmUV = (worldPosition.xz - vec2(-1152.0, -1152.0)) / 2304.0;
             if (hmUV.x > 0.002 && hmUV.x < 0.998 && hmUV.y > 0.002 && hmUV.y < 0.998) {
                 float hmSample = texture2D(heightmapTexture, hmUV).r * 25.5;
                 float hmEdge = smoothstep(0.002, 0.04, hmUV.x) * smoothstep(0.998, 0.96, hmUV.x)
                              * smoothstep(0.002, 0.04, hmUV.y) * smoothstep(0.998, 0.96, hmUV.y);
                 waterDepth = mix(25.5, hmSample, hmEdge);
             }

             // 2. Physical Optical Water Coloring (Preserves 100% of 3D Wave Ripples & Reflections — Zero Patina!)
             vec3 sunDirN = normalize(sunDirection);
             vec3 viewDir = normalize(eye - worldPosition.xyz);
             float waveRipple = 0.80 + 0.45 * clamp(dot(surfaceNormal, sunDirN), 0.0, 1.0);

             // Subtle turquoise optical scattering in shallow reef water (1m - 12m), rich marine cobalt in deep water
             float shallowGlow = exp(-waterDepth * 0.22) * smoothstep(0.15, 2.2, waterDepth);
             float midReefGlow = exp(-waterDepth * 0.09) * smoothstep(0.5, 3.5, waterDepth);

             vec3 turquoiseScatter = vec3(0.0, 0.42, 0.46) * shallowGlow * waveRipple
                                   + vec3(0.0, 0.16, 0.28) * midReefGlow * waveRipple;

             // Keep outgoingLight's crisp wave normals & sky reflections intact, enriched with tropical turquoise depth
             finalColor = outgoingLight * mix(vec3(0.82, 0.96, 1.02), vec3(0.75, 1.12, 1.15), shallowGlow) + turquoiseScatter;

             // 3. Warm Golden Sunlight Shimmer Path across the waves
             vec3 halfVec = normalize(sunDirN + viewDir);
             float NdotH = max(0.0, dot(surfaceNormal, halfVec));
             float sunGlintCore = pow(NdotH, 240.0) * 2.4;
             float sunGlintPath = pow(NdotH, 36.0) * 0.30;
             finalColor += vec3(1.0, 0.90, 0.66) * (sunGlintCore + sunGlintPath);

             // 4. Delicate Lacy Shoreline Wave-Lap Foam (strictly 0.04m - 0.55m at the sand contact, zero milky sheet!)
             float foamNoise = wFbm(worldPosition.xz * 0.65 + vec2(time * 0.5, -time * 0.35));
             float lapWave   = 0.5 + 0.5 * sin(waterDepth * 9.0 - time * 5.0 + foamNoise * 3.0);
             float shoreLace = smoothstep(0.55, 0.06, waterDepth)
                             * smoothstep(0.0, 0.05, waterDepth)
                             * smoothstep(0.45, 0.80, foamNoise * 0.7 + lapWave * 0.45);
             finalColor = mix(finalColor, vec3(0.95, 0.98, 1.0), shoreLace * 0.48);

             // 5. Beer-Lambert Crystal Transparency at the Beach -> Solid Opaque in Deep Ocean
             float opticalAlpha = 1.0 - exp(-waterDepth * 0.38);
             distAlpha = clamp(mix(opticalAlpha, alpha, smoothstep(4.5, 11.0, waterDepth)), 0.0, alpha);
             distAlpha = max(distAlpha, shoreLace * 0.55) * maskFade;

             // 6. Sea-hugging Boundary Mist Ring around the 3rd Concentric Ring of Plato's Atlantis (r = 620m .. 855m)
             float rAtlantisW = length(worldPosition.xz);
             float seaMistBand = smoothstep(615.0, 685.0, rAtlantisW) * (1.0 - smoothstep(785.0, 860.0, rAtlantisW));
             if (seaMistBand > 0.001) {
                 float mistSwirl = wFbm(worldPosition.xz * 0.014 + vec2(time * 0.18, -time * 0.12));
                 float mistAmt = seaMistBand * (0.62 + 0.38 * mistSwirl);
                 finalColor = mix(finalColor, vec3(0.84, 0.94, 0.99), mistAmt * 0.88);
                 distAlpha = max(distAlpha, mistAmt * 0.95);
             }
         }

         // Atmospheric Rayleigh limb halo around the planetary spherical horizon (only visible from above water)
         float distH = length(worldPosition.xz - cameraPos.xz);
         float atmoLimb = smoothstep(1600.0, 2750.0, distH);
         vec3 atmoHalo = vec3(0.0);
         if (eye.y >= worldPosition.y) {
             atmoHalo = vec3(0.20, 0.70, 1.0) * atmoLimb * 1.5;
         }
         finalColor += atmoHalo;

         // Smooth circular horizon cutoff (zero square edges)
         float horizonAlpha = 1.0 - smoothstep(2700.0, 2800.0, distH);
         gl_FragColor = vec4( finalColor, distAlpha * horizonAlpha );`
    );
    
    scene.add(water);

    // 6. Marching Cubes Voxel Terrain Setup (Height 96 voxels = 288m for Sacred Mountain & Alpine Peaks)
    terrain = new VoxelTerrain(scene, 256, 96, 256, 3.0);

    // 6a. Volumetric 360° Boundary Mist Ring encircling the 3rd Ring of Plato's Atlantis
    createAtlantisMistRing(scene);

    // 6b. Dynamic Canal Water & Flow System
    waterSystem = new WaterSystem(scene, terrain, camera, waterNormalsTexture);
    water.material.uniforms['waterMaskTexture'] = { value: waterSystem.maskTexture };
    water.material.uniforms['waterMaskBounds'] = { value: new THREE.Vector4(waterSystem.maskMinX, waterSystem.maskMinZ, waterSystem.maskSize, waterSystem.maskSize) };

    // Panoramic Spawn on the Central Island Terrace:
    // Facing -Z shows Il Monte Sacro rising on the left, the Inner Harbor & Grand Canal straight ahead,
    // all 3 Concentric Water & Land Rings, and the encircling Ring of Mist on the horizon!
    const startX = 46;
    const startZ = 72;
    const testPos = new THREE.Vector3(startX, 220, startZ);

    // Auto-load custom map from Level Editor before initial chunk generation so custom terrain builds immediately
    try {
        const savedMap = localStorage.getItem('cryworld_custom_map');
        if (savedMap) {
            const parsed = JSON.parse(savedMap);
            terrain.importMapData(parsed);
            console.log("Custom map from Level Editor loaded successfully!");
        }
    } catch (e) {
        console.warn("Could not load custom map:", e);
    }

    // Build initial chunks around start position immediately across the Central Island & 1st Ring
    terrain.updateChunksAroundPlayer(testPos, 1050, 340);

    // Initialize 512x512 high-precision bathymetry depth texture (2304m x 2304m centered on Atlantis)
    heightmapData = new Uint8Array(512 * 512);
    updateHeightmap();

    const groundY = terrain.getSurfaceHeight(testPos, 250.0);
    camera.position.set(startX, groundY + playerHeight, startZ);

    // 7. Player Controls (First Person) Setup
    controls = new PointerLockControls(camera, document.body);

    if (isMobile) {
        // Mobile orientation overlay setup
        const prompt = document.getElementById('orientation-prompt');
        const startBtn = document.getElementById('btn-fullscreen-start');
        
        function checkOrientation() {
            const isPortrait = window.innerHeight > window.innerWidth;
            if (isPortrait) {
                prompt.classList.remove('hidden');
                startBtn.classList.add('hidden');
                document.getElementById('mobile-hud').classList.add('hidden');
                blocker.style.display = 'none';
            } else {
                prompt.classList.remove('hidden');
                startBtn.classList.remove('hidden');
                document.getElementById('mobile-hud').classList.add('hidden');
                blocker.style.display = 'none';
            }
        }
        
        window.addEventListener('resize', checkOrientation);
        window.addEventListener('orientationchange', checkOrientation);
        checkOrientation(); // Run check immediately

        startBtn.addEventListener('click', () => {
            // Trigger fullscreen on touch devices (requires user action)
            const docEl = document.documentElement;
            if (docEl.requestFullscreen) docEl.requestFullscreen();
            else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
            else if (docEl.mozRequestFullScreen) docEl.mozRequestFullScreen();
            else if (docEl.msRequestFullscreen) docEl.msRequestFullscreen();

            prompt.classList.add('hidden');
            blocker.style.display = 'none';
            document.getElementById('mobile-hud').classList.remove('hidden');
            
            controls.enabled = true;
            gameStarted = true;
            startBackgroundMusic();
        });
    } else {
        blocker.addEventListener('click', () => {
            startBackgroundMusic();
            controls.lock();
        });
    }

    controls.addEventListener('lock', () => {
        blocker.style.display = 'none';
        document.getElementById('esc-confirm').classList.add('hidden');
        gameStarted = true;
        startBackgroundMusic();
    });

    controls.addEventListener('unlock', () => {
        // Reset movement states when pausing
        keyStates.KeyW = false;
        keyStates.KeyA = false;
        keyStates.KeyS = false;
        keyStates.KeyD = false;
        keyStates.Space = false;
        keyStates.ShiftLeft = false;
        isDigging = false;
        isBuilding = false;

        if (gameStarted) {
            // Show confirmation modal instead of directly returning to start screen blocker
            blocker.style.display = 'none';
            document.getElementById('esc-confirm').classList.remove('hidden');
        } else {
            // Show main blocker (homepage)
            blocker.style.display = 'flex';
            document.getElementById('esc-confirm').classList.add('hidden');
        }
    });

    // ESC Pause dialog button handlers
    const escConfirm = document.getElementById('esc-confirm');
    const resumeGame = () => {
        escConfirm.classList.add('hidden');
        controls.lock(); // return to game
        startBackgroundMusic();
    };

    const btnPauseResume = document.getElementById('btn-pause-resume');
    if (btnPauseResume) btnPauseResume.addEventListener('click', resumeGame);

    const btnConfirmNo = document.getElementById('btn-confirm-no');
    if (btnConfirmNo) btnConfirmNo.addEventListener('click', resumeGame);

    const btnPauseMusic = document.getElementById('btn-pause-music');
    if (btnPauseMusic) {
        btnPauseMusic.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMusicMute(true);
            if (!bgmMuted && !bgmPlaying) {
                startBackgroundMusic();
            }
        });
    }

    const btnHomeMusic = document.getElementById('btn-home-music');
    if (btnHomeMusic) {
        btnHomeMusic.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMusicMute(false);
            if (!bgmMuted) {
                startBackgroundMusic();
            }
        });
    }

    document.getElementById('btn-confirm-yes').addEventListener('click', () => {
        escConfirm.classList.add('hidden');
        gameStarted = false;
        blocker.style.display = 'flex'; // go back to homepage
        stopBackgroundMusic();
        
        // Reset player coordinates to start island position
        const resetPos = new THREE.Vector3(startX, 130, startZ);
        const resetY = terrain.getSurfaceHeight(resetPos, 192.0);
        camera.position.set(startX, resetY + playerHeight, startZ);
        velocity.set(0, 0, 0);
    });

    scene.add(controls.getObject());

    // Create Manipulator HUD element dynamically
    manipulatorHud = document.createElement('div');
    manipulatorHud.id = 'manipulator-hud';
    manipulatorHud.style.position = 'absolute';
    manipulatorHud.style.bottom = '95px';
    manipulatorHud.style.left = '50%';
    manipulatorHud.style.transform = 'translateX(-50%)';
    manipulatorHud.style.color = '#fff';
    manipulatorHud.style.fontFamily = 'sans-serif';
    manipulatorHud.style.fontSize = '14px';
    manipulatorHud.style.background = 'rgba(11, 29, 40, 0.75)';
    manipulatorHud.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    manipulatorHud.style.padding = '6px 12px';
    manipulatorHud.style.borderRadius = '12px';
    manipulatorHud.style.fontWeight = 'bold';
    manipulatorHud.style.pointerEvents = 'none';
    manipulatorHud.style.opacity = '0';
    manipulatorHud.style.transition = 'opacity 0.2s, transform 0.2s';
    manipulatorHud.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    manipulatorHud.style.backdropFilter = 'blur(4px)';
    manipulatorHud.innerText = `Manipulator Radius: ${manipulatorRadius.toFixed(1)}m (Hold Ctrl/Shift + Scroll)`;
    document.body.appendChild(manipulatorHud);

    // 7ap. Player Arms Setup
    leftArm = createArm(true);
    leftArm.position.set(-0.35, -0.32, -0.55);
    leftArm.rotation.set(-0.1, 0.25, 0.0);
    camera.add(leftArm);

    rightArm = createArm(false);
    rightArm.position.set(0.35, -0.32, -0.55);
    rightArm.rotation.set(-0.1, -0.25, 0.0);
    rightArm.visible = true; // Initially visible because slot 3 is active at start (hands empty)
    camera.add(rightArm);

    // 7b. First-Person Spear (View Model) Setup
    spear = new THREE.Group();
    
    // Wood shaft (low-poly cylinder)
    const shaftGeo = new THREE.CylinderGeometry(0.012, 0.016, 1.4, 5);
    const shaftMat = new THREE.MeshStandardMaterial({
        color: 0x6e4e37,
        flatShading: true,
        roughness: 0.95
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.rotation.x = Math.PI / 2; // Point forward
    shaft.position.z = -0.5;
    spear.add(shaft);
    
    // Obsidian/Stone tip (low-poly squashed double pyramid/cone)
    const tipGeo = new THREE.ConeGeometry(0.035, 0.22, 4);
    tipGeo.scale(1.0, 1.0, 0.35); // Squash flat like a flint spearhead
    const tipMat = new THREE.MeshStandardMaterial({
        color: 0x242526, // obsidian black-grey
        flatShading: true,
        roughness: 0.5,
        metalness: 0.7
    });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -1.2;
    spear.add(tip);


    
    // Position relative to camera (bottom-right)
    spear.position.set(0.35, -0.35, -0.6);
    spear.rotation.set(-0.25, -0.25, 0); // Leaning in
    spear.visible = false; // Hide initially since slot 3 is active at start
    camera.add(spear);

    // 7bb. First-Person Pickaxe (View Model) Setup
    pickaxe = new THREE.Group();
    
    // Pickaxe wood shaft (reusing shaftMat)
    const pickShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 1.3, 5), shaftMat);
    pickShaft.rotation.x = Math.PI / 2;
    pickShaft.position.z = -0.45;
    pickaxe.add(pickShaft);
    
    // Curved metal head (squashed cylinder)
    const pickHeadGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4);
    pickHeadGeo.scale(1.0, 1.0, 0.25); // Squash flat
    const pickHeadMat = new THREE.MeshStandardMaterial({
        color: 0x4f5458, // dark iron metal
        flatShading: true,
        roughness: 0.65,
        metalness: 0.8
    });
    const pickHead = new THREE.Mesh(pickHeadGeo, pickHeadMat);
    pickHead.rotation.z = Math.PI / 2; // Perpendicular to shaft
    pickHead.position.z = -1.0;
    pickaxe.add(pickHead);


    
    // Position and hide initially (since slot 1 is active spear)
    pickaxe.position.set(0.35, -0.35, -0.6);
    pickaxe.rotation.set(-0.25, -0.25, 0);
    pickaxe.visible = false;
    camera.add(pickaxe);

    // 7bb2. First-Person Matter Manipulator (View Model) Setup
    manipulator = new THREE.Group();
    
    // Materials
    const darkGreyMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, flatShading: true, roughness: 0.7 });
    const whiteMetalMat = new THREE.MeshStandardMaterial({ color: 0xdfe6e9, flatShading: true, roughness: 0.4, metalness: 0.8 });
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xffa502, flatShading: true, roughness: 0.3, emissive: 0xffa502, emissiveIntensity: 0.5 });
    const purpleMat = new THREE.MeshStandardMaterial({ color: 0xa29bfe, flatShading: true, roughness: 0.1, emissive: 0x9b59b6, emissiveIntensity: 0.8 });
    const cyanMat = new THREE.MeshStandardMaterial({ color: 0x00d2d3, flatShading: true, roughness: 0.2, emissive: 0x00d2d3, emissiveIntensity: 0.7 });

    // Handle/Grip (cylinder pointing down)
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.15, 6), darkGreyMat);
    handle.position.set(0, -0.08, 0);
    handle.rotation.x = 0.2; // Slightly angled forward
    manipulator.add(handle);
    
    // Main body tube (cylinder pointing forward)
    const bodyTube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.24, 6), darkGreyMat);
    bodyTube.rotation.x = Math.PI / 2;
    bodyTube.position.z = -0.05;
    manipulator.add(bodyTube);

    // Purple core orb in the center (sphere)
    const coreOrb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), purpleMat);
    coreOrb.position.set(0, 0.01, -0.05);
    manipulator.add(coreOrb);

    // White outer armor braces (2 arched boxes wrapping the core)
    const braceLeft = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.12), whiteMetalMat);
    braceLeft.position.set(-0.03, 0.01, -0.05);
    braceLeft.rotation.y = 0.15;
    manipulator.add(braceLeft);

    const braceRight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.12), whiteMetalMat);
    braceRight.position.set(0.03, 0.01, -0.05);
    braceRight.rotation.y = -0.15;
    manipulator.add(braceRight);

    // Front Cyan Ring muzzle
    const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.025, 8, 1, true), cyanMat);
    muzzleRing.rotation.x = Math.PI / 2;
    muzzleRing.position.z = -0.17;
    manipulator.add(muzzleRing);

    // Muzzle tip core
    const muzzleTip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 6), darkGreyMat);
    muzzleTip.rotation.x = Math.PI / 2;
    muzzleTip.position.z = -0.18;
    manipulator.add(muzzleTip);

    // Rear Orange reactor disc
    const reactorDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), orangeMat);
    reactorDisc.rotation.x = Math.PI / 2;
    reactorDisc.position.z = 0.07;
    manipulator.add(reactorDisc);

    // Rear exhaust/cap (tapered dark grey cylinder at the very back)
    const exhaustCap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.032, 0.03, 8), darkGreyMat);
    exhaustCap.rotation.x = Math.PI / 2;
    exhaustCap.position.z = 0.09;
    manipulator.add(exhaustCap);



    // Position relative to camera (bottom-right)
    manipulator.position.set(0.35, -0.32, -0.65);
    manipulator.rotation.set(-0.15, -0.15, 0); // Leaning in
    manipulator.visible = false;
    camera.add(manipulator);

    // 7bc. Volumetric clouds are rendered directly in the Sky Dome Shader (zero low-poly cloud meshes)

    // 7bd. Hotbar Slot Selection Handler
    function selectSlot(slotNum) {
        activeSlot = slotNum;
        document.querySelectorAll('.hotbar-slot').forEach(slot => {
            if (slot.dataset.slot == slotNum) {
                slot.classList.add('active');
            } else {
                slot.classList.remove('active');
            }
        });
        
        // Show/hide view-model meshes based on slot selection
        if (slotNum === 1) {
            if (spear) spear.visible = true;
            if (pickaxe) pickaxe.visible = false;
            if (manipulator) manipulator.visible = false;
            if (leftArm) leftArm.visible = false;
            if (rightArm) rightArm.visible = false;
            if (manipulatorHud) {
                manipulatorHud.style.opacity = '0';
                manipulatorHud.style.transform = 'translateX(-50%) scale(0.9)';
            }
        } else if (slotNum === 7) {
            if (spear) spear.visible = false;
            if (pickaxe) pickaxe.visible = true;
            if (manipulator) manipulator.visible = false;
            if (leftArm) leftArm.visible = false;
            if (rightArm) rightArm.visible = false;
            if (manipulatorHud) {
                manipulatorHud.style.opacity = '0';
                manipulatorHud.style.transform = 'translateX(-50%) scale(0.9)';
            }
        } else if (slotNum === 9) {
            if (spear) spear.visible = false;
            if (pickaxe) pickaxe.visible = false;
            if (manipulator) manipulator.visible = true;
            if (leftArm) leftArm.visible = false;
            if (rightArm) rightArm.visible = false;
            if (manipulatorHud) {
                manipulatorHud.style.opacity = '1';
                manipulatorHud.style.transform = 'translateX(-50%) scale(1.0)';
            }
        } else {
            if (spear) spear.visible = false;
            if (pickaxe) pickaxe.visible = false;
            if (manipulator) manipulator.visible = false;
            if (leftArm) leftArm.visible = true;
            if (rightArm) rightArm.visible = true;
            if (manipulatorHud) {
                manipulatorHud.style.opacity = '0';
                manipulatorHud.style.transform = 'translateX(-50%) scale(0.9)';
            }
        }
    }
    
    // Listen for keys 1 to 9
    window.addEventListener('keydown', (event) => {
        const key = event.key;
        if (key >= '1' && key <= '9') {
            selectSlot(parseInt(key));
        }
    });

    // Scroll wheel listener for manipulator radius adjustment (with Ctrl/Shift) or hotbar slot switching
    window.addEventListener('wheel', (event) => {
        if (activeSlot === 9 && (event.ctrlKey || event.shiftKey)) {
            // Adjust manipulator radius when holding Ctrl/Shift
            if (event.deltaY < 0) {
                manipulatorRadius = Math.min(15.0, manipulatorRadius + 0.5);
            } else {
                manipulatorRadius = Math.max(1.0, manipulatorRadius - 0.5);
            }
            if (manipulatorHud) {
                manipulatorHud.innerText = `Manipulator Radius: ${manipulatorRadius.toFixed(1)}m (Hold Ctrl/Shift + Scroll)`;
                // Add a little pop animation effect on change
                manipulatorHud.style.transform = 'translateX(-50%) scale(1.15)';
                setTimeout(() => {
                    if (activeSlot === 9) {
                        manipulatorHud.style.transform = 'translateX(-50%) scale(1.0)';
                    }
                }, 100);
            }
        } else {
            // Otherwise cycle hotbar slots 1 to 9
            let newSlot = activeSlot;
            if (event.deltaY < 0) {
                newSlot = activeSlot - 1;
                if (newSlot < 1) newSlot = 9;
            } else {
                newSlot = activeSlot + 1;
                if (newSlot > 9) newSlot = 1;
            }
            selectSlot(newSlot);
        }
    });

    // Make slots clickable in DOM
    document.querySelectorAll('.hotbar-slot').forEach(slot => {
        slot.addEventListener('click', () => {
            selectSlot(parseInt(slot.dataset.slot));
        });
    });

    // 7c. Spawning Stylized Foliage and Rocks on the Voxel Terrain
    spawnEnvironmentObjects(scene, terrain);

    // 7d. Background Ambient Music Setup
    initBackgroundMusic();
    updateMusicHud();

    // 8. Event Listeners
    setupInputListeners();

    // Trigger initial static shadow map render
    renderer.shadowMap.needsUpdate = true;

    // Adjust sizes on resize
    window.addEventListener('resize', onWindowResize);
}

// ==========================================
// BACKGROUND AMBIENT MUSIC SYSTEM
// ==========================================
function initBackgroundMusic() {
    if (bgMusic) return;
    try {
        bgMusic = new Audio('musiche/Cryworld1-Daniele%20-%20Remix%202026.mp3');
        bgMusic.loop = true;
        bgMusic.volume = 0;
        bgMusic.preload = 'auto';
    } catch (e) {
        console.warn('[Music] Impossibile inizializzare traccia audio:', e);
    }
}

function startBackgroundMusic() {
    if (!bgMusic) {
        initBackgroundMusic();
    }
    if (!bgMusic) return;

    bgmPlaying = true;
    if (bgMusic.paused) {
        const playPromise = bgMusic.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.log('[Music] Riproduzione in attesa di interazione:', err.message);
            });
        }
    }
}

function pauseBackgroundMusic() {
    bgmPlaying = false;
}

function stopBackgroundMusic() {
    bgmPlaying = false;
    if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
        bgmCurrentVolume = 0;
        bgMusic.volume = 0;
    }
}

let toastTimer = null;
function showMusicToast(text) {
    const toast = document.getElementById('music-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, 2200);
}

function toggleMusicMute(showNotification = true) {
    bgmMuted = !bgmMuted;
    try {
        localStorage.setItem('cryworld_music_muted', bgmMuted ? '1' : '0');
    } catch (e) {}
    updateMusicHud();
    if (showNotification) {
        showMusicToast(bgmMuted ? '🔇 Musica Disattivata' : '🎵 Musica Attivata');
    }
    return bgmMuted;
}

function updateMusicHud() {
    const musicIcon = document.getElementById('music-icon');
    const musicStatus = document.getElementById('music-status');
    const musicCard = document.getElementById('music-card');
    const pauseMusicBtn = document.getElementById('btn-pause-music');
    const homeMusicBtn = document.getElementById('btn-home-music');

    if (musicIcon && musicStatus) {
        if (bgmMuted) {
            musicIcon.textContent = '🔇';
            musicStatus.textContent = 'BGM: OFF';
            if (musicCard) musicCard.style.color = '#ff6b6b';
        } else {
            musicIcon.textContent = '🎵';
            musicStatus.textContent = 'BGM: ON';
            if (musicCard) musicCard.style.color = '#80e5ff';
        }
    }

    if (pauseMusicBtn) {
        if (bgmMuted) {
            pauseMusicBtn.innerHTML = '🔇 MUSICA: DISATTIVATA <span style="font-size:0.75rem; opacity:0.75;">(Premi M)</span>';
            pauseMusicBtn.style.background = 'rgba(255, 75, 75, 0.15)';
            pauseMusicBtn.style.borderColor = 'rgba(255, 75, 75, 0.5)';
            pauseMusicBtn.style.color = '#ff9999';
        } else {
            pauseMusicBtn.innerHTML = '🎵 MUSICA: ATTIVA <span style="font-size:0.75rem; opacity:0.75;">(Premi M)</span>';
            pauseMusicBtn.style.background = 'rgba(0, 210, 255, 0.15)';
            pauseMusicBtn.style.borderColor = 'rgba(0, 210, 255, 0.5)';
            pauseMusicBtn.style.color = '#80e5ff';
        }
    }

    if (homeMusicBtn) {
        if (bgmMuted) {
            homeMusicBtn.innerHTML = '🔇 MUSICA: OFF';
            homeMusicBtn.style.color = '#ff9999';
            homeMusicBtn.style.borderColor = 'rgba(255, 75, 75, 0.4)';
        } else {
            homeMusicBtn.innerHTML = '🎵 MUSICA: ON';
            homeMusicBtn.style.color = '#80e5ff';
            homeMusicBtn.style.borderColor = 'rgba(0, 210, 255, 0.4)';
        }
    }
}

function updateBackgroundMusic(delta) {
    if (!bgMusic) return;

    // Se mutato o spento: target 0. Se in pausa/menu: volume ridotto a 0.06 (ambientale soft). Se in gameplay: volume pieno 0.20
    let desiredTarget = 0.0;
    if (bgmPlaying && !bgmMuted) {
        desiredTarget = (controls.isLocked || isMobile) ? BGM_TARGET_VOLUME : (BGM_TARGET_VOLUME * 0.35);
    }

    // Lerp morbido per fade-in e fade-out (circa 1.5 secondi per transizione completa)
    const fadeSpeed = 1.2;
    if (Math.abs(bgmCurrentVolume - desiredTarget) > 0.002) {
        bgmCurrentVolume += (desiredTarget - bgmCurrentVolume) * Math.min(1.0, fadeSpeed * delta);
        bgMusic.volume = Math.max(0.0, Math.min(1.0, bgmCurrentVolume));
    } else {
        bgmCurrentVolume = desiredTarget;
        bgMusic.volume = bgmCurrentVolume;
    }

    // Se il volume raggiunge 0 ed è in stop/pausa, metti in pausa per risparmiare risorse
    if (bgmCurrentVolume <= 0.001 && !bgmPlaying && !bgMusic.paused) {
        bgMusic.pause();
    }
}

// ==========================================
// INPUT HANDLING
// ==========================================
function setupInputListeners() {
    // Keyboard inputs
    const onKeyDown = function (event) {
        if (event.code in keyStates) {
            keyStates[event.code] = true;
        }
        if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
            keyStates.ShiftLeft = true;
        }
        if (event.code === 'KeyF') {
            if (controls.isLocked) {
                isFlying = !isFlying;
                if (isFlying) {
                    velocity.y = 0;
                }
                const flyInfo = document.getElementById('fly-info');
                if (flyInfo) {
                    flyInfo.style.display = isFlying ? 'inline' : 'none';
                }
                const altimeterCard = document.getElementById('altimeter-card');
                if (altimeterCard) {
                    altimeterCard.style.display = isFlying ? 'flex' : 'none';
                }
            }
        }
        if (event.code === 'KeyM') {
            toggleMusicMute();
        }
    };

    const onKeyUp = function (event) {
        if (event.code in keyStates) {
            keyStates[event.code] = false;
        }
        if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
            keyStates.ShiftLeft = false;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Mouse clicks for Digging and Building
    const onMouseDown = function (event) {
        if (!controls.isLocked) return;

        if (event.button === 0) { // Left Click
            isDigging = true;
            isBuilding = false;
            crosshair.classList.add('active');
            isDiggingAnim = true;
            animTime = 0;
        } else if (event.button === 2) { // Right Click
            isBuilding = true;
            isDigging = false;
            crosshair.classList.add('active');
            isDiggingAnim = true;
            animTime = 0;
        }
    };

    const onMouseUp = function (event) {
        if (event.button === 0) {
            isDigging = false;
        } else if (event.button === 2) {
            isBuilding = false;
        }
        if (!isDigging && !isBuilding) {
            crosshair.classList.remove('active');
        }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    
    // Prevent right click menu in game
    document.addEventListener('contextmenu', (event) => {
        if (controls.isLocked) {
            event.preventDefault();
        }
    });

    // Initialize mobile controls if on touch device
    if (isMobile) {
        setupMobileControls();
    }

    // Music HUD card click toggle (when cursor is free)
    const musicCard = document.getElementById('music-card');
    if (musicCard) {
        musicCard.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMusicMute();
        });
    }
}

function setupMobileControls() {
    let lookTouchId = null;
    let touchStartX = 0;
    let touchStartY = 0;
    
    // 1. Swipe look camera controls (independent lookTouchId tracking)
    document.addEventListener('touchstart', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            // Ignore touches on UI buttons, joystick zone or inventory hotbar
            if (touch.target.closest('#mobile-actions') || touch.target.closest('#joystick-zone') || touch.target.closest('#hotbar-container')) continue;
            
            if (lookTouchId === null) {
                lookTouchId = touch.identifier;
                touchStartX = touch.pageX;
                touchStartY = touch.pageY;
                break;
            }
        }
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        if (lookTouchId === null) return;
        
        let touch = null;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].identifier === lookTouchId) {
                touch = e.touches[i];
                break;
            }
        }
        if (!touch) return;
        
        const deltaX = touch.pageX - touchStartX;
        const deltaY = touch.pageY - touchStartY;
        
        touchStartX = touch.pageX;
        touchStartY = touch.pageY;
        
        // Adjust horizontal yaw (Y rotation) and vertical pitch (X rotation)
        camera.rotation.y -= deltaX * 0.0035;
        camera.rotation.x -= deltaY * 0.0035;
        
        // Clamp pitch look to prevent vertical camera flipping
        camera.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, camera.rotation.x));
        // Clamp camera roll (Z) to exactly 0 at all times to prevent slanted horizon / camera tilt
        camera.rotation.z = 0;
    }, { passive: true });
    
    const resetLook = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === lookTouchId) {
                lookTouchId = null;
                break;
            }
        }
    };
    document.addEventListener('touchend', resetLook);
    document.addEventListener('touchcancel', resetLook);

    // 2. Virtual Joystick setup (independent joystickTouchId tracking)
    const joyZone = document.getElementById('joystick-zone');
    const joyNub = document.getElementById('joystick-nub');
    let joyActive = false;
    let joystickTouchId = null;
    let joyStart = { x: 0, y: 0 };
    let joyMax = 40; // Max movement radius for nub
    
    joyZone.addEventListener('touchstart', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (joystickTouchId === null) {
                joystickTouchId = touch.identifier;
                joyActive = true;
                joyStart.x = touch.clientX;
                joyStart.y = touch.clientY;
                break;
            }
        }
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        if (!joyActive || joystickTouchId === null) return;
        
        let touch = null;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].identifier === joystickTouchId) {
                touch = e.touches[i];
                break;
            }
        }
        if (!touch) return;
        
        let dx = touch.clientX - joyStart.x;
        let dy = touch.clientY - joyStart.y;
        
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > joyMax) {
            dx = (dx / dist) * joyMax;
            dy = (dy / dist) * joyMax;
        }
        
        joyNub.style.transform = `translate(${dx}px, ${dy}px)`;
        
        const deadzone = 10;
        keyStates.KeyW = dy < -deadzone;
        keyStates.KeyS = dy > deadzone;
        keyStates.KeyA = dx < -deadzone;
        keyStates.KeyD = dx > deadzone;
    }, { passive: false });
    
    const resetJoystick = (e) => {
        if (!joyActive) return;
        let ended = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joystickTouchId) {
                ended = true;
                break;
            }
        }
        if (ended) {
            joyActive = false;
            joystickTouchId = null;
            joyNub.style.transform = 'translate(0px, 0px)';
            keyStates.KeyW = false;
            keyStates.KeyS = false;
            keyStates.KeyA = false;
            keyStates.KeyD = false;
        }
    };
    
    joyZone.addEventListener('touchend', resetJoystick);
    joyZone.addEventListener('touchcancel', resetJoystick);
    document.addEventListener('touchend', resetJoystick);
    document.addEventListener('touchcancel', resetJoystick);

    // 3. Action buttons listeners
    const btnJump = document.getElementById('btn-touch-jump');
    btnJump.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keyStates.Space = true;
    });
    btnJump.addEventListener('touchend', (e) => {
        keyStates.Space = false;
    });

    const btnRun = document.getElementById('btn-touch-run');
    btnRun.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keyStates.ShiftLeft = !keyStates.ShiftLeft; // Toggle running on touch
        if (keyStates.ShiftLeft) {
            btnRun.classList.add('active-state');
        } else {
            btnRun.classList.remove('active-state');
        }
    });

    const btnDig = document.getElementById('btn-touch-dig');
    btnDig.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isDigging = true;
        isBuilding = false;
        crosshair.classList.add('active');
        isDiggingAnim = true;
        animTime = 0;
        btnDig.classList.add('active-state');
    });
    btnDig.addEventListener('touchend', (e) => {
        isDigging = false;
        crosshair.classList.remove('active');
        btnDig.classList.remove('active-state');
    });

    const btnBuild = document.getElementById('btn-touch-build');
    btnBuild.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isBuilding = true;
        isDigging = false;
        crosshair.classList.add('active');
        isDiggingAnim = true;
        animTime = 0;
        btnBuild.classList.add('active-state');
    });
    btnBuild.addEventListener('touchend', (e) => {
        isBuilding = false;
        crosshair.classList.remove('active');
        btnBuild.classList.remove('active-state');
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Perform raycasting and modify terrain
function handleTerrainInteraction() {
    if (isMobile ? !gameStarted : !controls.isLocked) return;
    if (activeSlot !== 9) {
        isDigging = false;
        isBuilding = false;
        crosshair.classList.remove('active');
        return;
    }
    if (!isDigging && !isBuilding) return;

    const now = performance.now();
    if (now - lastInteractionTime < interactionCooldown) return;
    lastInteractionTime = now;

    // Cast ray from center of camera view
    raycaster.setFromCamera(screenCenter, camera);
    
    // Intersect chunk meshes in the terrain group
    const intersects = raycaster.intersectObjects(terrain.group.children);

    if (intersects.length > 0) {
        const hit = intersects[0];
        // Practically infinite raycast check (up to 1000 meters)
        if (hit.distance < 1000.0) {
            const mode = isDigging ? 'dig' : 'build';
            
            // Use dynamic radius controlled by scroll wheel
            const modified = terrain.modifyTerrain(hit.point, manipulatorRadius, mode);
            
            if (modified) {
                // Instantly rebuild the local dirty chunks
                terrain.update();
                updateHeightmap(hit.point, manipulatorRadius);
                checkFoliageFalling(hit.point, manipulatorRadius); // Only check nearby trees/rocks!
                if (waterSystem && isDigging) {
                    waterSystem.onTerrainExcavated(hit.point, manipulatorRadius);
                }

                // If terrain modification happened near the player, resolve player grounding immediately!
                if (!isFlying) {
                    const distToPlayer = hit.point.distanceTo(camera.position);
                    if (distToPlayer < manipulatorRadius + 3.0) {
                        const immediateGround = terrain.getSurfaceHeight(camera.position, camera.position.y + 0.8);
                        if (camera.position.y - playerHeight < immediateGround) {
                            camera.position.y = immediateGround + playerHeight;
                            velocity.y = 0;
                            isGrounded = true;
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// ANIMATION & PHYSICS LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min(clock.getDelta(), 0.1); // Clamp delta to avoid massive leaps on frame drops

    // 0. Remove previous frame's head bob offset before physics calculations
    if (lastBobY !== 0) {
        camera.position.y -= lastBobY;
        lastBobY = 0;
    }

    // Update falling tree and rock physics
    updateFoliagePhysics(delta);

    // 1. FPS counter & Altimeter update
    fpsFrames++;
    if (time > fpsLastTime + 1000) {
        fpsCounter.textContent = Math.round((fpsFrames * 1000) / (time - fpsLastTime));
        fpsFrames = 0;
        fpsLastTime = time;
    }

    if (isFlying) {
        const altMeters = Math.round(camera.position.y - 120.0);
        const altCounter = document.getElementById('alt-counter');
        if (altCounter) {
            if (Math.abs(altMeters) >= 1000) {
                altCounter.textContent = `${(altMeters / 1000).toFixed(2)} km`;
            } else {
                altCounter.textContent = `${altMeters} m`;
            }
        }
    }

    if (isMobile ? gameStarted : controls.isLocked) {
        // 2. Terrain Interaction (Dig/Build holding mouse)
        handleTerrainInteraction();

        // Update dynamic water simulation and flow
        if (waterSystem) {
            waterSystem.update(delta);
        }

        // 3. Movement Physics (Gravity & Collisions)
        const rawWaterLevel = waterSystem ? waterSystem.getWaterLevelAt(camera.position.x, camera.position.z) : 120.0;
        const hasWaterHere = (rawWaterLevel > -500.0);
        const localWaterLevel = hasWaterHere ? rawWaterLevel : 120.0;
        const inWater = !isFlying && hasWaterHere && (camera.position.y < localWaterLevel + 0.25);
        
        // Walk controls dampening
        const dragFactor = isFlying ? 5.0 : (inWater ? 5.0 : 10.0);
        velocity.x -= velocity.x * dragFactor * delta;
        velocity.z -= velocity.z * dragFactor * delta;
        
        // Vertical damping
        const verticalDrag = isFlying ? 5.0 : (inWater ? 3.5 : 1.0);
        velocity.y -= velocity.y * verticalDrag * delta;

        // Apply gravity (neutralized/reduced underwater to feel buoyant, and in orbit to feel weightless)
        if (isFlying) {
            // Gravity is disabled while flying
        } else if (inWater) {
            velocity.y -= gravity * 0.05 * delta; // 95% gravity reduction
        } else {
            const altitude = camera.position.y;
            const gravityMultiplier = altitude > 180.0 ? Math.max(0.0, 1.0 - (altitude - 180.0) / 620.0) : 1.0;
            velocity.y -= gravity * gravityMultiplier * delta;
        }

        const isMoving = keyStates.KeyW || keyStates.KeyS || keyStates.KeyA || keyStates.KeyD;

        // Jump execution or swim/fly upwards
        if (keyStates.Space) {
            if (isFlying) {
                // Fly upwards (3x speed with Shift: 270.0 vs 90.0)
                velocity.y += (keyStates.ShiftLeft ? 270.0 : 90.0) * delta;
            } else if (hasWaterHere && (camera.position.y < localWaterLevel + 1.2 && camera.position.y >= localWaterLevel - 1.8)) {
                // Surface water-exit jump / leap onto shore / canal bank
                velocity.y = Math.max(velocity.y, jumpForce * 1.3);
                // Extra forward impulse towards shore
                if (isMoving) {
                    velocity.x -= direction.x * 35.0 * delta;
                    velocity.z -= direction.z * 35.0 * delta;
                }
            } else if (inWater) {
                // Swim upwards actively using Space
                velocity.y += 45.0 * delta;
            } else if (isGrounded) {
                velocity.y = jumpForce;
                isGrounded = false;
            }
        }

        // Fly downwards with Q (3x speed with Shift: 270.0 vs 90.0)
        if (keyStates.KeyQ && isFlying) {
            velocity.y -= (keyStates.ShiftLeft ? 270.0 : 90.0) * delta;
        }

        direction.z = Number(keyStates.KeyW) - Number(keyStates.KeyS);
        direction.x = Number(keyStates.KeyA) - Number(keyStates.KeyD);
        direction.normalize(); // Ensure uniform movement speed

        // Speed calculation (3x flight speed with Shift: 300.0 vs 100.0)
        let currentSpeed;
        if (isFlying) {
            currentSpeed = keyStates.ShiftLeft ? 300.0 : 100.0;
        } else {
            currentSpeed = keyStates.ShiftLeft ? runSpeed : moveSpeed;
            if (inWater) {
                // Fast and responsive swimming speed
                currentSpeed *= keyStates.ShiftLeft ? 0.85 : 0.65;
            }
        }

        if (keyStates.KeyW || keyStates.KeyS) velocity.z -= direction.z * currentSpeed * delta;
        if (keyStates.KeyA || keyStates.KeyD) velocity.x -= direction.x * currentSpeed * delta;

        // Swimming/Flying pitch and buoyancy mechanics
        if (isFlying) {
            if (isMoving) {
                // Fly up/down based on camera look direction pitch and move direction (W/S)
                const lookDir = new THREE.Vector3();
                camera.getWorldDirection(lookDir);
                velocity.y += lookDir.y * direction.z * currentSpeed * 0.8 * delta;
            }
        } else if (inWater) {
            // Natural surface buoyancy: keeps the player floating at the surface
            const floatSurface = localWaterLevel + 0.15;
            if (camera.position.y < floatSurface) {
                const depthDiff = floatSurface - camera.position.y;
                const buoyantForce = Math.min(25.0, 5.0 + depthDiff * 4.5);
                velocity.y += buoyantForce * delta;
            }

            if (isMoving) {
                // Swim up/down based on camera look direction pitch and move direction (W/S)
                const lookDir = new THREE.Vector3();
                camera.getWorldDirection(lookDir);
                if (Math.abs(lookDir.y) > 0.12) {
                    velocity.y += lookDir.y * direction.z * currentSpeed * 0.85 * delta;
                }
                // Gentle upward boost when pushing forward towards shore/island
                if (direction.z > 0 && camera.position.y < localWaterLevel + 0.35) {
                    velocity.y += 3.5 * delta;
                }
            }
        }

        const prevX = camera.position.x;
        const prevZ = camera.position.z;

        // Apply movement vector horizontally (fixed A/D inversion)
        controls.moveRight(velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Keep player inside ocean boundaries (4800 meters from center, matching the 10km water plane)
        const boundX = 4800;
        const boundZ = 4800;
        camera.position.x = Math.max(-boundX, Math.min(boundX, camera.position.x));
        camera.position.z = Math.max(-boundZ, Math.min(boundZ, camera.position.z));

        // Horizontal movement & collision solver (supports smooth shore-climbing and walking up slopes/steps)
        if (!isFlying) {
            const playerRadius = 0.45;
            const newX = camera.position.x;
            const newZ = camera.position.z;

            // Helper to resolve horizontal collision and auto-step / mantle up onto slopes/beaches/shores
            const tryMoveHorizontal = (targetX, targetZ, fromX, fromZ) => {
                const currentEyeY = camera.position.y;
                const currentFeetY = currentEyeY - playerHeight;

                // 1. First test: standard collision at current eye height
                if (!terrain.isCylinderColliding(targetX, currentEyeY, targetZ, playerRadius, playerHeight)) {
                    return { success: true, x: targetX, z: targetZ };
                }

                // 2. If it collided, check if it's a climbable slope, beach shore, or step!
                const targetWaterLevel = waterSystem ? waterSystem.getWaterLevelAt(targetX, targetZ) : 120.0;
                const effectiveWaterLevel = (targetWaterLevel > -500.0) ? targetWaterLevel : localWaterLevel;
                const isNearSurface = inWater || (currentEyeY >= effectiveWaterLevel - 2.0 && currentEyeY <= effectiveWaterLevel + 2.5);

                const ceilingAtTarget = terrain.getCeilingHeight(new THREE.Vector3(targetX, currentEyeY, targetZ), 2.5);
                const searchStartY = (ceilingAtTarget !== Infinity)
                    ? Math.min(currentEyeY + 0.3, ceilingAtTarget - 0.2)
                    : Math.max(currentEyeY + 2.5, effectiveWaterLevel + 3.0);
                
                const groundAtTarget = terrain.getSurfaceHeight(new THREE.Vector3(targetX, searchStartY, targetZ), searchStartY);

                // Check ahead in movement direction to detect steep banks / trench edges
                const dx = targetX - fromX;
                const dz = targetZ - fromZ;
                const moveDist = Math.sqrt(dx * dx + dz * dz);
                const dirX = moveDist > 0.0001 ? (dx / moveDist) : 0;
                const dirZ = moveDist > 0.0001 ? (dz / moveDist) : 0;

                // Probe point at the leading edge of the player cylinder (0.50m ahead)
                const probeX = targetX + dirX * 0.50;
                const probeZ = targetZ + dirZ * 0.50;
                let groundAtProbe = groundAtTarget;

                if (moveDist > 0.0001) {
                    const ceilingAtProbe = terrain.getCeilingHeight(new THREE.Vector3(probeX, currentEyeY, probeZ), 2.5);
                    const probeSearchStartY = (ceilingAtProbe !== Infinity)
                        ? Math.min(currentEyeY + 0.3, ceilingAtProbe - 0.2)
                        : Math.max(currentEyeY + 2.5, effectiveWaterLevel + 3.0);
                    groundAtProbe = terrain.getSurfaceHeight(new THREE.Vector3(probeX, probeSearchStartY, probeZ), probeSearchStartY);
                }

                // Best ground candidate: either right under target or the bank ahead
                const bestGround = Math.max(groundAtTarget, groundAtProbe);
                const stepDiff = bestGround - currentFeetY;
                const maxShoreHeight = effectiveWaterLevel + 2.6; // Allows climbing onto island rim/canal banks up to 2.6m above water

                let canStep = false;
                let stepTargetPos = { x: targetX, z: targetZ };

                if (isNearSurface) {
                    // Swimming or wading near water:
                    // Any beach slope, sandbar, canal edge, or island bank up to 2.6m above water level is climbable!
                    if (bestGround <= maxShoreHeight && bestGround >= currentFeetY - 0.5) {
                        canStep = true;
                        // If there is a steep bank in front (bank ahead is significantly higher than center),
                        // mantle directly onto the probe position on the bank!
                        if (groundAtProbe > groundAtTarget + 0.25) {
                            stepTargetPos = { x: probeX, z: probeZ };
                        }
                    }
                } else {
                    // Normal walking on land or diving deep underwater:
                    // Standard step height of 0.75m
                    if (stepDiff > 0 && stepDiff <= 0.75) {
                        canStep = true;
                    }
                }

                if (canStep) {
                    const proposedEyeY = bestGround + playerHeight;
                    const testX = stepTargetPos.x;
                    const testZ = stepTargetPos.z;
                    const ceilingAtTest = terrain.getCeilingHeight(new THREE.Vector3(testX, proposedEyeY, testZ), 2.5);
                    const maxAllowedEyeY = (ceilingAtTest !== Infinity) ? (ceilingAtTest - 0.25) : Infinity;

                    if (proposedEyeY <= maxAllowedEyeY) {
                        // Check if the body cylinder is clear at the stepped-up eye height
                        if (!terrain.isCylinderColliding(testX, proposedEyeY, testZ, playerRadius, playerHeight)) {
                            // Clear! Auto-step / mantle up smoothly onto the shore / slope / bank
                            camera.position.y = Math.max(camera.position.y, proposedEyeY);
                            velocity.y = Math.max(0, velocity.y);
                            isGrounded = true;
                            return { success: true, x: testX, z: testZ };
                        }
                    }
                }

                // Actually blocked by a tall solid wall or low ceiling
                return { success: false, x: fromX, z: fromZ };
            };

            // 1. Move along X
            let resolvedX = prevX;
            const resX = tryMoveHorizontal(newX, prevZ, prevX, prevZ);
            if (resX.success) {
                resolvedX = resX.x;
            } else {
                velocity.x = 0; // Wall hit on X
            }

            // 2. Move along Z
            let resolvedZ = prevZ;
            const resZ = tryMoveHorizontal(resolvedX, newZ, resolvedX, prevZ);
            if (resZ.success) {
                resolvedZ = resZ.z;
            } else {
                velocity.z = 0; // Wall hit on Z
            }

            camera.position.x = resolvedX;
            camera.position.z = resolvedZ;
        }

        // Player collision with palm and pine tree trunks (sliding cylinder response)
        const playerRadius = 0.5;
        const treeCollisionRadius = 0.35;
        const minDist = playerRadius + treeCollisionRadius;
        
        // Check palms
        for (let i = 0; i < palmInstances.length; i++) {
            const inst = palmInstances[i];
            const tx = inst.x + terrain.group.position.x;
            const tz = inst.z + terrain.group.position.z;
            
            const dx = camera.position.x - tx;
            const dz = camera.position.z - tz;
            const distSq = dx * dx + dz * dz;
            
            if (distSq < minDist * minDist) {
                const treeBottom = inst.y;
                const treeHeight = 8.0;
                if (camera.position.y - playerHeight < treeBottom + treeHeight && camera.position.y > treeBottom) {
                    const dist = Math.sqrt(distSq);
                    const pushFactor = (minDist - dist) / (dist || 1);
                    camera.position.x += dx * pushFactor;
                    camera.position.z += dz * pushFactor;
                }
            }
        }
        
        // Check pines
        for (let i = 0; i < pineInstances.length; i++) {
            const inst = pineInstances[i];
            const tx = inst.x + terrain.group.position.x;
            const tz = inst.z + terrain.group.position.z;
            
            const dx = camera.position.x - tx;
            const dz = camera.position.z - tz;
            const distSq = dx * dx + dz * dz;
            
            if (distSq < minDist * minDist) {
                const treeBottom = inst.y;
                const treeHeight = 6.2;
                if (camera.position.y - playerHeight < treeBottom + treeHeight && camera.position.y > treeBottom) {
                    const dist = Math.sqrt(distSq);
                    const pushFactor = (minDist - dist) / (dist || 1);
                    camera.position.x += dx * pushFactor;
                    camera.position.z += dz * pushFactor;
                }
            }
        }

        // Apply vertical velocity (gravity & jump)
        camera.position.y += velocity.y * delta;

        if (!isFlying) {
            const headOffset = 0.25; // Head clearance above eye level

            // 1. Ceiling collision check: if player touches or penetrates a solid ceiling
            const ceilingY = terrain.getCeilingHeight(camera.position, 2.5);
            if (ceilingY !== Infinity && (camera.position.y + headOffset) >= ceilingY) {
                // Stop upward motion immediately (player bumps head)
                if (velocity.y > 0) {
                    velocity.y = 0;
                }
                // Clamp camera Y so head stays below ceiling without clipping or teleporting
                camera.position.y = Math.min(camera.position.y, ceilingY - headOffset);
            }

            // 2. Floor collision check: search downwards from inside current air pocket
            const searchStartY = (ceilingY !== Infinity)
                ? Math.min(camera.position.y + 0.3, ceilingY - 0.2)
                : Math.max(camera.position.y + 0.8, localWaterLevel + 1.5);
            const groundHeight = terrain.getSurfaceHeight(camera.position, searchStartY);

            if (camera.position.y - playerHeight <= groundHeight) {
                const targetY = groundHeight + playerHeight;
                
                // Never let floor resolution push the player's head into or above the ceiling
                const maxAllowedY = (ceilingY !== Infinity) ? (ceilingY - headOffset) : Infinity;
                const clampedTargetY = Math.min(targetY, maxAllowedY);

                if (camera.position.y < clampedTargetY) {
                    // Player penetrated or embedded into floor: immediately snap up to ground level
                    camera.position.y = clampedTargetY;
                } else if (Math.abs(clampedTargetY - camera.position.y) > 0.4) {
                    camera.position.y = clampedTargetY;
                } else {
                    camera.position.y += (clampedTargetY - camera.position.y) * 25.0 * delta;
                }
                velocity.y = 0;
                isGrounded = true;
            } else {
                isGrounded = false;
            }

            // Fail-safe de-penetration: if player camera/torso is ever embedded inside solid terrain, pop up to surface
            if (terrain.isPositionSolid(camera.position)) {
                const safeSurfaceY = terrain.getSurfaceHeight(camera.position, camera.position.y);
                if (safeSurfaceY > terrain.minWorldY + 10.0) {
                    camera.position.y = safeSurfaceY + playerHeight;
                    velocity.y = 0;
                    isGrounded = true;
                }
            }

            // Prevent falling below the deep ocean floor level (512m below sea level 120.0m)
            const seabedFloorLimit = -392.0;
            if (camera.position.y - playerHeight < seabedFloorLimit) {
                camera.position.y = seabedFloorLimit + playerHeight;
                velocity.y = 0;
                isGrounded = true;
            }
        }

        // 3b. Calculate Head Bobbing & Running FOV effects
        let bobY = 0;
        
        if (isGrounded && isMoving && !inWater && !isFlying) {
            const speedFactor = keyStates.ShiftLeft ? 1.45 : 1.0;
            bobTime += delta * 12.0 * speedFactor; // Speed of head bobbing
            
            const bobAmplitude = keyStates.ShiftLeft ? 0.16 : 0.08; // Higher amplitude when running
            bobY = Math.sin(bobTime) * bobAmplitude;
            
            // Apply rolling side-to-side sway
            const bobRoll = Math.cos(bobTime * 0.5) * (keyStates.ShiftLeft ? 0.02 : 0.01);
            camera.rotation.z = bobRoll;
        } else {
            // Decay Z-roll rotation back to neutral
            camera.rotation.z *= 0.9;
        }
        
        camera.position.y += bobY;
        lastBobY = bobY;

        // Smoothly interpolate FOV for running speed effect
        const targetFov = (keyStates.ShiftLeft && isMoving && !inWater) ? runFov : defaultFov;
        if (currentFov !== targetFov) {
            currentFov = THREE.MathUtils.lerp(currentFov, targetFov, delta * 8.0);
            camera.fov = currentFov;
            camera.updateProjectionMatrix();
        }

        // 4. Update HUD Coordinates (meters scaled) & Planetary Biome
        posInfo.textContent = `X: ${Math.round(camera.position.x)} Y: ${Math.round(camera.position.y - 120.0)} Z: ${Math.round(camera.position.z)}`;
        const biomeElem = document.getElementById('biome-info');
        if (biomeElem && terrain && terrain.getPlanetaryBiome) {
            const currentBiome = terrain.getPlanetaryBiome(camera.position.x, camera.position.y, camera.position.z);
            biomeElem.textContent = currentBiome.name;
        }
    }

    // 5. Water waves animation (reduced speed from 0.5 to 0.12 to prevent shoreline vibration)
    water.material.uniforms['time'].value += delta * 0.12;

    // 5bb. Check if player camera is underwater (Y < localWaterLevel) to trigger immersive effects, or high up to trigger space orbit effects
    const underwaterOverlay = document.getElementById('underwater-overlay');
    const localWaterAtCamera = waterSystem ? waterSystem.getWaterLevelAt(camera.position.x, camera.position.z) : 120.0;
    const isLookingFromBelow = (camera.position.y < localWaterAtCamera);
    const depthFactor = Math.min(Math.max((localWaterAtCamera - camera.position.y) / 80.0, 0.0), 1.0);
    
    // Altitude-based aerial perspective (flying into orbit)
    const altitude = camera.position.y;
    let altFactor = 0.0;
    let starIntensity = 0.0;

    if (altitude > 180.0) {
        // Smooth transition to black space from 180m up to 1100m (1.1km)
        altFactor = Math.min(Math.max((altitude - 180.0) / 920.0, 0.0), 1.0);
    }
    if (altitude > 350.0) {
        // Crisp stars fade in progressively from 350m up to 1100m (1.1km)
        starIntensity = Math.min(Math.max((altitude - 350.0) / 750.0, 0.0), 1.0);
    }
    
    // Planetary Atmosphere color modulation by latitude & biome
    let baseAtmosphere = new THREE.Color(0x8ce3ff);
    if (terrain && terrain.getPlanetaryAtmosphereColor) {
        baseAtmosphere = terrain.getPlanetaryAtmosphereColor(camera.position.x, camera.position.y, camera.position.z);
    }

    const skyTopColor = new THREE.Color(0x0078d7);
    const skyBottomColor = baseAtmosphere;
    const spaceColor = new THREE.Color(0x000002); // Deep black space
 
    // Interpolate sky colors based on altitude
    const currentSkyTop = skyTopColor.clone().lerp(spaceColor, altFactor);
    const currentSkyBottom = skyBottomColor.clone().lerp(spaceColor, altFactor);
 
    if (sky && sky.material && sky.material.uniforms) {
        sky.material.uniforms['topColor'].value.copy(currentSkyTop);
        sky.material.uniforms['bottomColor'].value.copy(currentSkyBottom);
        if (sky.material.uniforms['starIntensity']) {
            sky.material.uniforms['starIntensity'].value = starIntensity;
        }
    }
 
    const currentFogColor = baseAtmosphere.clone().lerp(spaceColor, altFactor);
 
    if (isLookingFromBelow) {
        // Completely hide the sky dome, mist ring and clouds while underwater so no daylight sky/horizon leaks through
        if (sky) sky.visible = false;
        if (atlantisMistGroup) atlantisMistGroup.visible = false;
        if (clouds) {
            for (let i = 0; i < clouds.length; i++) clouds[i].visible = false;
        }

        if (underwaterOverlay) {
            underwaterOverlay.classList.remove('hidden');
            const baseOpacity = 0.22 + 0.18 * depthFactor;
            const wavePulse = baseOpacity + Math.sin(clock.getElapsedTime() * 1.6) * 0.02 * depthFactor;
            underwaterOverlay.style.background = `rgba(0, 35, 60, ${Math.max(0.0, wavePulse)})`;
        }
 
        // Interpolate fog color from deep rich marine teal to dark abyss midnight blue
        const shallowWaterFog = new THREE.Color(0x002c3d);
        const deepWaterFog = new THREE.Color(0x00050d);
        const interpolatedFogColor = shallowWaterFog.clone().lerp(deepWaterFog, depthFactor);

        // Keep both fog and background strictly matching to eliminate any bright horizon or distance contrast
        scene.fog.color.copy(interpolatedFogColor);
        scene.background.copy(interpolatedFogColor);
 
        // Underwater visibility range: 100m near surface down to 40m in deep abyss
        scene.fog.near = 4.0;
        scene.fog.far = 100.0 - 60.0 * depthFactor;
 
        // Controlled underwater exposure: eliminates harsh sunlight glare in the distance
        renderer.toneMappingExposure = 0.85 - (0.85 - 0.20) * depthFactor;

        if (water && water.material && water.material.uniforms['alpha']) {
            water.material.uniforms['alpha'].value = 0.70;
        }
    } else {
        // Restore sky dome, mist ring and clouds above water
        if (sky) sky.visible = true;
        if (atlantisMistGroup) atlantisMistGroup.visible = true;
        if (clouds) {
            for (let i = 0; i < clouds.length; i++) clouds[i].visible = true;
        }

        if (underwaterOverlay) {
            underwaterOverlay.classList.add('hidden');
        }

        // Immersive walk/sail/fly-through fog when crossing the circular Boundary Mist of Plato's Atlantis (r = 620m .. 860m)
        const camDistCenter = Math.hypot(camera.position.x, camera.position.z);
        let mistImmerse = 0.0;
        if (camDistCenter > 615.0 && camDistCenter < 865.0 && camera.position.y < 290.0) {
            const rBand = Math.sin(((camDistCenter - 615.0) / 250.0) * Math.PI);
            const hBand = 1.0 - Math.max(0.0, Math.min(1.0, (camera.position.y - 210.0) / 80.0));
            mistImmerse = Math.max(0.0, rBand * hBand);
        }

        const mistFogColor = new THREE.Color(0xdcf0fa);
        const finalFogCol = currentFogColor.clone().lerp(mistFogColor, mistImmerse * 0.90);
        scene.fog.color.copy(finalFogCol);
        scene.background.copy(finalFogCol);

        // Clear panoramic view across all 3 concentric rings (460m .. 1060m), thickening smoothly inside the Mist Veil!
        const baseNear = 460.0 + (10000.0 - 460.0) * altFactor;
        const baseFar  = 1060.0 + (45000.0 - 1060.0) * altFactor;
        scene.fog.near = THREE.MathUtils.lerp(baseNear, 16.0, mistImmerse);
        scene.fog.far  = THREE.MathUtils.lerp(baseFar, 155.0, mistImmerse);

        renderer.toneMappingExposure = 1.15;

        // Outside water: fully opaque water (alpha = 0.98) so submerged terrain is not visible from above
        if (water && water.material && water.material.uniforms['alpha']) {
            water.material.uniforms['alpha'].value = 0.98;
        }
    }

    if (atlantisMistUniforms) {
        atlantisMistUniforms.uTime.value += delta;
        atlantisMistUniforms.uCameraPos.value.copy(camera.position);
    }

    // Keep ocean centered on player horizontally and update planetary curvature center
    cameraPosUniform.value.copy(camera.position);
    if (terrain && terrain.cameraPos) {
        terrain.cameraPos.copy(camera.position);
    }
    if (water) {
        water.position.x = camera.position.x;
        water.position.z = camera.position.z;
    }

    // 5c. Active Tool swing/punch animation tick (First Person stabbing/swinging/punching effect)
    if (isDiggingAnim) {
        const tool = (activeSlot === 1) ? spear : ((activeSlot === 7) ? pickaxe : ((activeSlot === 9) ? manipulator : null));
        if (tool) {
            animTime += delta * 15.0; // Speed of swing
            if (animTime < Math.PI) {
                // Stab forward and rotate downwards
                tool.position.z = -0.6 - Math.sin(animTime) * 0.18;
                tool.position.y = -0.35 - Math.sin(animTime) * 0.12;
                tool.rotation.x = -0.25 - Math.sin(animTime) * 0.55;
                tool.rotation.y = -0.25 + Math.sin(animTime) * 0.15;
            } else {
                isDiggingAnim = false;
                // Reset to default resting position
                if (tool === manipulator) {
                    tool.position.set(0.35, -0.32, -0.65);
                    tool.rotation.set(-0.15, -0.15, 0);
                } else {
                    tool.position.set(0.35, -0.35, -0.6);
                    tool.rotation.set(-0.25, -0.25, 0);
                }
            }
        } else if (rightArm && rightArm.visible) {
            // Punch animation for empty right hand
            animTime += delta * 18.0;
            if (animTime < Math.PI) {
                rightArm.position.z = -0.55 - Math.sin(animTime) * 0.22;
                rightArm.position.y = -0.32 + Math.sin(animTime) * 0.08;
                rightArm.rotation.x = -0.1 - Math.sin(animTime) * 0.3;
                rightArm.rotation.y = -0.25 - Math.sin(animTime) * 0.2;
            } else {
                isDiggingAnim = false;
                rightArm.position.set(0.35, -0.32, -0.55);
                rightArm.rotation.set(-0.1, -0.25, 0);
            }
        } else {
            isDiggingAnim = false;
        }
    } else {
        // Rest state sways for active tool and player arms
        const tool = (activeSlot === 1) ? spear : ((activeSlot === 7) ? pickaxe : ((activeSlot === 9) ? manipulator : null));
        const isMoving = keyStates.KeyW || keyStates.KeyS || keyStates.KeyA || keyStates.KeyD;
        const inWater = camera.position.y < 120.0;
        
        if (isGrounded && isMoving && !inWater) {
            // Walking/running sway frequency
            const bobSwayX = Math.cos(bobTime) * (keyStates.ShiftLeft ? 0.055 : 0.028);
            const bobSwayY = Math.sin(bobTime * 2.0) * (keyStates.ShiftLeft ? 0.035 : 0.018);
            
            // Left arm sway
            if (leftArm) {
                leftArm.position.set(-0.35 + bobSwayX, -0.32 + bobSwayY, -0.55);
            }
            // Empty right arm sway (if active)
            if (rightArm && rightArm.visible) {
                rightArm.position.set(0.35 + bobSwayX, -0.32 + bobSwayY, -0.55);
            }
            // Tool sway
            if (tool) {
                if (tool === manipulator) {
                    tool.position.set(0.35 + bobSwayX, -0.32 + bobSwayY, -0.65);
                } else {
                    tool.position.set(0.35 + bobSwayX, -0.35 + bobSwayY, -0.6);
                }
            }
        } else {
            // Breathing sway (gentle idle breathing)
            const breatheTime = performance.now() * 0.0018;
            const breatheY = Math.sin(breatheTime) * 0.008;
            
            // Left arm breathe
            if (leftArm) {
                leftArm.position.set(-0.35, -0.32 + breatheY, -0.55);
            }
            // Empty right arm breathe (if active)
            if (rightArm && rightArm.visible) {
                rightArm.position.set(0.35, -0.32 + breatheY, -0.55);
            }
            // Tool breathe
            if (tool) {
                if (tool === manipulator) {
                    tool.position.set(0.35, -0.32 + breatheY, -0.65);
                } else {
                    tool.position.set(0.35, -0.35 + breatheY, -0.6);
                }
            }
        }
        
        // Reset rotation back to default resting angles
        if (leftArm) {
            leftArm.rotation.set(-0.1, 0.25, 0.0);
        }
        if (rightArm && rightArm.visible) {
            rightArm.rotation.set(-0.1, -0.25, 0.0);
        }
        if (tool) {
            if (tool === manipulator) {
                tool.rotation.set(-0.15, -0.15, 0);
            } else {
                tool.rotation.set(-0.25, -0.25, 0);
            }
        }
    }

    // 5d. Animate volumetric sky clouds slowly drifting in the wind
    if (sky && sky.material && sky.material.uniforms && sky.material.uniforms['uTime']) {
        sky.material.uniforms['uTime'].value += delta;
    }

    // 5e. Update active terrain chunks and center sky dome on the player
    if (terrain) {
        const dynamicRenderDist = Math.min(1250.0, 1000.0 + altFactor * 250.0); // 1000m on ground, 1250m in orbit
        terrain.updateChunksAroundPlayer(camera.position, dynamicRenderDist);
    }
    if (sky) {
        sky.position.copy(camera.position);
    }

    // 5f. Update background ambient music volume fade and playback
    updateBackgroundMusic(delta);

    renderer.render(scene, camera);
}

// ==========================================
// VOLUMETRIC 360° BOUNDARY MIST RING AROUND PLATO'S ATLANTIS
// ==========================================
function createAtlantisMistRing(scene) {
    atlantisMistGroup = new THREE.Group();
    atlantisMistUniforms = {
        uTime: { value: 0.0 },
        uCameraPos: { value: new THREE.Vector3() }
    };

    const mistShaderMat = new THREE.ShaderMaterial({
        uniforms: atlantisMistUniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: `
            uniform vec3 uCameraPos;
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorldPos = wp.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);

                float distH = length(wp.xz - uCameraPos.xz);
                float planetR = 1800000.0;
                if (distH < planetR) {
                    wp.y -= (planetR - sqrt(planetR * planetR - distH * distH));
                }
                gl_Position = projectionMatrix * viewMatrix * wp;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uCameraPos;
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            varying vec2 vUv;

            float mHash(vec2 p) {
                p = fract(p * vec2(127.1, 311.7));
                p += dot(p, p + 34.5);
                return fract(p.x * p.y);
            }
            float mNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(mHash(i), mHash(i + vec2(1.0, 0.0)), f.x),
                    mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), f.x),
                    f.y
                );
            }
            float mFbm(vec2 p) {
                float v = 0.0;
                v += 0.50 * mNoise(p); p *= 2.03;
                v += 0.25 * mNoise(p); p *= 2.02;
                v += 0.125 * mNoise(p); p *= 2.04;
                v += 0.0625 * mNoise(p);
                return v;
            }

            void main() {
                float theta = atan(vWorldPos.z, vWorldPos.x);
                float hRel = vWorldPos.y - 120.0;
                if (hRel < -2.0) discard;

                // Animated billowing cloud plumes drifting around the perimeter of the 3rd Ring
                vec2 cloudCoord = vec2(theta * 14.0 + uTime * 0.055, hRel * 0.022 - uTime * 0.03);
                float billow = mFbm(cloudCoord);
                float fineWisp = mFbm(cloudCoord * 2.7 - vec2(uTime * 0.08, 0.0));

                float dynamicTop = 85.0 + billow * 72.0 + fineWisp * 24.0;
                float bottomFade = smoothstep(-1.0, 12.0, hRel);
                float topFade = 1.0 - smoothstep(dynamicTop * 0.52, dynamicTop, hRel);

                // Dissolve individual shells close to camera while scene.fog seamlessly immerses the player
                float camDist = length(vWorldPos - uCameraPos);
                float nearDissolve = smoothstep(10.0, 52.0, camDist);
                float farFade = 1.0 - smoothstep(1900.0, 2750.0, camDist);

                vec3 viewDir = normalize(uCameraPos - vWorldPos);
                float facing = 0.35 + 0.65 * abs(dot(normalize(vWorldNormal), viewDir));

                float density = bottomFade * topFade * (0.42 + 0.58 * billow) * facing * nearDissolve * farFade;
                if (density < 0.008) discard;

                // Pearlescent sunlit mist top -> aquamarine sea-fog base
                vec3 baseMistCol = vec3(0.74, 0.89, 0.97);
                vec3 sunTopCol   = vec3(0.95, 0.98, 1.00);
                vec3 col = mix(baseMistCol, sunTopCol, clamp(hRel / 95.0 + billow * 0.25, 0.0, 1.0));

                gl_FragColor = vec4(col, clamp(density * 0.46, 0.0, 0.78));
            }
        `
    });

    // 4 nested concentric billowing mist curtains spanning r = 655m .. 805m around the 3rd Land Ring
    const shellRadii = [655, 700, 750, 805];
    const shellHeight = 165;
    for (let i = 0; i < shellRadii.length; i++) {
        const cylGeo = new THREE.CylinderGeometry(shellRadii[i], shellRadii[i] * 0.985, shellHeight, 96, 8, true);
        const cylMesh = new THREE.Mesh(cylGeo, mistShaderMat);
        cylMesh.position.set(0, 118.0 + shellHeight * 0.5, 0);
        cylMesh.rotation.y = i * 0.65;
        cylMesh.frustumCulled = false;
        atlantisMistGroup.add(cylMesh);
    }

    scene.add(atlantisMistGroup);
}

// ==========================================
// PROCEDURAL ENVIRONMENT GENERATION (PALM TREES, TROPICAL BUSHES & BOULDERS)
// ==========================================
function spawnEnvironmentObjects(scene, terrain) {
    const palmTreesCount = 390;
    const pineTreesCount = 190;
    const rocksCount = 180;
    const bushesCount = 420;
    
    // Procedural Coconut Palm Tree generator (seamless curved trunk & lush arching fronds)
    function createPalmTree() {
        const treeGroup = new THREE.Group();
        
        // Graceful 10-segment curved coconut trunk
        const trunkSegmentsCount = 10;
        const trunkGroup = new THREE.Group();
        
        // Warm weathered coconut palm bark material (exact hex matched by instanced extractor)
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x9c8874,
            flatShading: false,
            roughness: 0.92
        });
        
        // Chained kinematic trunk curve: leans out gracefully and curves upward toward the sun
        const upAxis = new THREE.Vector3(0, 1, 0);
        const segDir = new THREE.Vector3();
        const leanAngle = 0.65;
        const maxLean = 0.36; // ~20.5 deg natural tropical lean
        let curX = 0;
        let curY = 0;
        let curZ = 0;
        
        for (let i = 0; i < trunkSegmentsCount; i++) {
            const h = 1.12;
            const step = 0.96; // 16cm overlap guarantees 100% seamless continuous bark joints
            const t = i / (trunkSegmentsCount - 1);
            let rBottom = 0.33 * (1.0 - i / (trunkSegmentsCount + 3.5));
            let rTop = 0.33 * (1.0 - (i + 1) / (trunkSegmentsCount + 3.5));
            
            if (i === 0) {
                rBottom = rBottom * 1.65; // Natural flared root base
            }
            
            // Smooth natural bow curve (strongest lean in mid-lower trunk, recovering slightly near crown)
            const segTilt = maxLean * Math.sin((0.18 + t * 0.72) * Math.PI * 0.88);
            segDir.set(
                Math.cos(leanAngle) * Math.sin(segTilt),
                Math.cos(segTilt),
                Math.sin(leanAngle) * Math.sin(segTilt)
            ).normalize();
            
            const segmentGeo = new THREE.CylinderGeometry(rTop, rBottom, h, 8);
            const segment = new THREE.Mesh(segmentGeo, trunkMat);
            segment.castShadow = true;
            segment.receiveShadow = true;
            
            segment.quaternion.setFromUnitVectors(upAxis, segDir);
            segment.position.set(
                curX + segDir.x * (h * 0.5 - 0.08),
                curY + segDir.y * (h * 0.5 - 0.08),
                curZ + segDir.z * (h * 0.5 - 0.08)
            );
            
            const ringGeo = new THREE.CylinderGeometry(rBottom * 1.07, rBottom * 1.05, 0.10, 8);
            const ring = new THREE.Mesh(ringGeo, trunkMat);
            ring.position.y = -h * 0.32;
            segment.add(ring);
            
            trunkGroup.add(segment);
            
            curX += segDir.x * step;
            curY += segDir.y * step;
            curZ += segDir.z * step;
        }
        treeGroup.add(trunkGroup);
        
        // Leaves at the crown (12 drooping arching feathered palm fronds)
        const leavesCount = 12;
        const leafMat = new THREE.MeshStandardMaterial({
            color: 0x2e8b3c, // Rich natural tropical palm green
            flatShading: false,
            roughness: 0.65,
            side: THREE.DoubleSide
        });
        
        const leavesGroup = new THREE.Group();
        const crownDir = new THREE.Vector3(
            Math.cos(leanAngle) * Math.sin(maxLean * 0.45),
            Math.cos(maxLean * 0.45),
            Math.sin(leanAngle) * Math.sin(maxLean * 0.45)
        ).normalize();
        leavesGroup.position.set(curX, curY - 0.06, curZ);
        leavesGroup.quaternion.setFromUnitVectors(upAxis, crownDir);
        
        for (let i = 0; i < leavesCount; i++) {
            const leaf = new THREE.Group();
            const angle = i * (Math.PI * 2 / leavesCount);
            leaf.rotation.y = angle;
            
            let fCurY = 0;
            let fCurZ = 0;
            let rotX = (i % 2 === 0) ? 0.08 : 0.22; // Layered upper and lower frond tiers
            const stemSegments = 5;
            const stemL = 0.84;
            
            for (let j = 0; j < stemSegments; j++) {
                const stemW = 0.04 * (1.0 - j / stemSegments);
                const stemH = 0.03 * (1.0 - j / stemSegments);
                const stemPartGeo = new THREE.BoxGeometry(stemW, stemH, stemL);
                const stemPart = new THREE.Mesh(stemPartGeo, leafMat);
                stemPart.castShadow = true;
                
                stemPart.position.set(0, fCurY, fCurZ + stemL / 2);
                stemPart.rotation.x = -rotX;
                leaf.add(stemPart);
                
                const leafletsPerSeg = 4;
                for (let f = 0; f < leafletsPerSeg; f++) {
                    const segmentProgress = (j * leafletsPerSeg + f) / (stemSegments * leafletsPerSeg);
                    const leafletLength = 1.35 * Math.sin(segmentProgress * Math.PI);
                    if (leafletLength < 0.15) continue;
                    
                    const leafletW = 0.075 * (1.0 - segmentProgress * 0.4);
                    const leafletGeo = new THREE.BoxGeometry(leafletW, 0.006, leafletLength);
                    const zOffset = (f / leafletsPerSeg) * stemL;
                    
                    const leafletL = new THREE.Mesh(leafletGeo, leafMat);
                    leafletL.castShadow = true;
                    leafletL.position.set(-leafletLength / 2 * 0.85, fCurY, fCurZ + zOffset);
                    leafletL.rotation.set(-rotX + 0.1, 0.45, -0.22);
                    leaf.add(leafletL);
                    
                    const leafletR = new THREE.Mesh(leafletGeo, leafMat);
                    leafletR.castShadow = true;
                    leafletR.position.set(leafletLength / 2 * 0.85, fCurY, fCurZ + zOffset);
                    leafletR.rotation.set(-rotX + 0.1, -0.45, 0.22);
                    leaf.add(leafletR);
                }
                
                fCurZ += stemL * Math.cos(rotX) * 0.95;
                fCurY -= stemL * Math.sin(rotX) * 0.95;
                rotX += 0.18;
            }
            
            leavesGroup.add(leaf);
        }
        treeGroup.add(leavesGroup);
        
        // Cluster of 3 coconuts tucked seamlessly beneath the palm crown
        const coconutMat = new THREE.MeshStandardMaterial({
            color: 0x5a3d28,
            flatShading: false,
            roughness: 0.85
        });
        
        const coconutGeo = new THREE.DodecahedronGeometry(0.24, 1);
        for (let c = 0; c < 3; c++) {
            const coconut = new THREE.Mesh(coconutGeo, coconutMat);
            coconut.castShadow = true;
            const cAngle = c * (Math.PI * 2 / 3);
            coconut.position.set(
                curX + Math.cos(cAngle) * 0.26,
                curY - 0.30,
                curZ + Math.sin(cAngle) * 0.26
            );
            treeGroup.add(coconut);
        }
        
        return treeGroup;
    }
    
    // =========================================================
    // REALISTIC TROPICAL BROADLEAF TREES & UNDERGROWTH SYSTEM
    // =========================================================
    function makeSeededRand(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // 1. Procedural Weathered Tropical Hardwood Bark Texture (256x256 tileable)
    function createTreeBarkTexture() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const rnd = makeSeededRand(4021);

        ctx.fillStyle = '#6b5846';
        ctx.fillRect(0, 0, size, size);

        // Longitudinal organic bark ridges & fissures (wrapped horizontally for seamless tiling)
        for (let i = 0; i < 220; i++) {
            const x = rnd() * size;
            const y = rnd() * size;
            const w = 2.0 + rnd() * 5.5;
            const h = 28.0 + rnd() * 90.0;
            const dark = rnd() < 0.52;
            ctx.fillStyle = dark
                ? `rgba(46, 35, 25, ${0.22 + rnd() * 0.30})`
                : `rgba(138, 118, 96, ${0.18 + rnd() * 0.24})`;
            for (const ox of [-size, 0, size]) {
                for (const oy of [-size, 0, size]) {
                    ctx.beginPath();
                    ctx.ellipse(x + ox, y + oy, w * 0.5, h * 0.5, (rnd() - 0.5) * 0.08, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Fine bark crevices & subtle coastal moss/lichen flecks
        for (let i = 0; i < 95; i++) {
            const x = rnd() * size;
            const y = rnd() * size;
            if (rnd() < 0.35) {
                ctx.fillStyle = `rgba(108, 118, 92, ${0.14 + rnd() * 0.16})`;
                ctx.beginPath();
                ctx.ellipse(x, y, 4 + rnd() * 8, 3 + rnd() * 6, rnd() * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.strokeStyle = `rgba(34, 25, 18, ${0.28 + rnd() * 0.25})`;
                ctx.lineWidth = 1.0 + rnd() * 1.4;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.bezierCurveTo(x + (rnd() - 0.5) * 6, y + 18, x + (rnd() - 0.5) * 6, y + 36, x + (rnd() - 0.5) * 4, y + 54);
                ctx.stroke();
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 4;
        return tex;
    }

    // Helper: draw one realistic pointed tropical leaf blade with midrib & lateral veins
    function drawBotanicalLeaf(ctx, cx, cy, angle, length, halfWidth, darkRgb, lightRgb, tipRgb) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        const grad = ctx.createLinearGradient(0, 0, 0, -length);
        grad.addColorStop(0.0, `rgb(${darkRgb[0]}, ${darkRgb[1]}, ${darkRgb[2]})`);
        grad.addColorStop(0.58, `rgb(${lightRgb[0]}, ${lightRgb[1]}, ${lightRgb[2]})`);
        grad.addColorStop(1.0, `rgb(${tipRgb[0]}, ${tipRgb[1]}, ${tipRgb[2]})`);

        // Pointed elliptic-obovate tropical leaf silhouette (wider slightly above middle, crisp drip-tip)
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-halfWidth * 0.85, -length * 0.22, -halfWidth * 1.12, -length * 0.64, 0, -length);
        ctx.bezierCurveTo(halfWidth * 1.12, -length * 0.64, halfWidth * 0.85, -length * 0.22, 0, 0);
        ctx.closePath();

        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = 'rgba(20, 52, 18, 0.52)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Central midrib vein
        ctx.strokeStyle = 'rgba(138, 192, 78, 0.44)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(0, -length * 0.90);
        ctx.stroke();

        // Pinnate side veins
        ctx.strokeStyle = 'rgba(128, 182, 72, 0.26)';
        ctx.lineWidth = 0.9;
        for (let v = 1; v <= 4; v++) {
            const vy = -length * (0.18 + v * 0.16);
            const vw = halfWidth * Math.sin((v / 5.2) * Math.PI) * 0.72;
            ctx.beginPath();
            ctx.moveTo(0, vy);
            ctx.quadraticCurveTo(-vw * 0.5, vy - 4, -vw, vy - 9);
            ctx.moveTo(0, vy);
            ctx.quadraticCurveTo(vw * 0.5, vy - 4, vw, vy - 9);
            ctx.stroke();
        }

        ctx.restore();
    }

    // Bleed leaf green RGB into alpha=0 pixels so WebGL mipmaps never show dark halos
    function bleedFoliageAlphaEdges(ctx, size, rBg, gBg, bBg) {
        const img = ctx.getImageData(0, 0, size, size);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 28) {
                d[i] = rBg;
                d[i + 1] = gBg;
                d[i + 2] = bBg;
                d[i + 3] = 0;
            } else if (d[i + 3] < 220) {
                d[i + 3] = Math.min(255, Math.round(d[i + 3] * 1.35));
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    // 2. Procedural Botanical Broadleaf Bough Cluster Texture (512x512 crisp alpha-cutout)
    function createBroadleafCanopyTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const rnd = makeSeededRand(9187);

        ctx.clearRect(0, 0, size, size);

        // Woody twig skeleton radiating from stem base (256, 494)
        const subTwigs = [
            { tx: 122, ty: 225, cpx: 195, cpy: 375 },
            { tx: 182, ty: 118, cpx: 222, cpy: 300 },
            { tx: 256, ty: 78,  cpx: 258, cpy: 275 },
            { tx: 334, ty: 122, cpx: 292, cpy: 300 },
            { tx: 392, ty: 228, cpx: 320, cpy: 375 }
        ];

        ctx.lineCap = 'round';
        for (const tw of subTwigs) {
            ctx.strokeStyle = '#56412e';
            ctx.lineWidth = 5.5;
            ctx.beginPath();
            ctx.moveTo(256, 496);
            ctx.quadraticCurveTo(tw.cpx, tw.cpy, tw.tx, tw.ty);
            ctx.stroke();
        }

        // Layer 1: Deeper shaded under-leaves for rich 3D volume
        for (let tIdx = 0; tIdx < subTwigs.length; tIdx++) {
            const tw = subTwigs[tIdx];
            const baseAng = Math.atan2(tw.tx - 256, 496 - tw.ty);
            for (let s = 0; s < 5; s++) {
                const u = 0.24 + (s / 4) * 0.72;
                const om = 1 - u;
                const bx = om * om * 256 + 2 * om * u * tw.cpx + u * u * tw.tx;
                const by = om * om * 496 + 2 * om * u * tw.cpy + u * u * tw.ty;
                const spread = (s % 2 === 0 ? -1 : 1) * (0.45 + rnd() * 0.35);
                const len = 88 + rnd() * 34;
                const hw = 24 + rnd() * 9;
                drawBotanicalLeaf(
                    ctx, bx, by, baseAng + spread, len, hw,
                    [24, 64, 22], [40, 96, 32], [54, 118, 38]
                );
            }
        }

        // Layer 2: Sunlit upper tropical leaves & terminal rosettes
        for (let tIdx = 0; tIdx < subTwigs.length; tIdx++) {
            const tw = subTwigs[tIdx];
            const baseAng = Math.atan2(tw.tx - 256, 496 - tw.ty);
            for (let s = 0; s < 5; s++) {
                const u = 0.30 + (s / 4) * 0.70;
                const om = 1 - u;
                const bx = om * om * 256 + 2 * om * u * tw.cpx + u * u * tw.tx;
                const by = om * om * 496 + 2 * om * u * tw.cpy + u * u * tw.ty;
                const side = (s === 4) ? ((rnd() - 0.5) * 0.25) : ((s % 2 === 0 ? 1 : -1) * (0.28 + rnd() * 0.32));
                const len = 84 + rnd() * 36;
                const hw = 23 + rnd() * 9;
                const warmBoost = Math.round(rnd() * 18);
                drawBotanicalLeaf(
                    ctx, bx, by, baseAng + side, len, hw,
                    [32, 82, 26],
                    [56 + warmBoost, 126 + warmBoost, 36],
                    [78 + warmBoost, 152 + warmBoost, 44]
                );
            }
        }

        bleedFoliageAlphaEdges(ctx, size, 44, 102, 34);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 4;
        return tex;
    }

    // 3. Procedural Tropical Fern & Coastal Shrub Frond Texture (512x512 crisp alpha-cutout)
    function createTropicalBushTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const rnd = makeSeededRand(5513);

        ctx.clearRect(0, 0, size, size);

        // Central green fern/shrub rachis stem
        ctx.strokeStyle = '#366b28';
        ctx.lineWidth = 6.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(256, 500);
        ctx.quadraticCurveTo(252, 260, 256, 36);
        ctx.stroke();

        // Pairs of lanceolate tropical fern pinnae & glossy coastal shrub leaves
        const pairs = 15;
        for (let i = 0; i < pairs; i++) {
            const t = i / (pairs - 1);
            const y = 472 - t * 405;
            const profile = Math.sin(Math.pow(t, 0.72) * Math.PI * 0.94);
            const len = (62 + profile * 128) * (0.92 + rnd() * 0.14);
            const hw = (14 + profile * 16) * (0.9 + rnd() * 0.2);
            const tilt = 1.08 - t * 0.52;
            const bright = Math.round(t * 22);

            drawBotanicalLeaf(
                ctx, 256, y, -tilt, len, hw,
                [26, 74, 26], [48 + bright, 118 + bright, 38], [72 + bright, 148 + bright, 46]
            );
            drawBotanicalLeaf(
                ctx, 256, y - 4, tilt, len * 0.97, hw,
                [26, 74, 26], [50 + bright, 120 + bright, 38], [74 + bright, 150 + bright, 46]
            );
        }
        // Terminal tip blade
        drawBotanicalLeaf(ctx, 256, 72, 0.0, 68, 15, [34, 92, 30], [68, 142, 44], [90, 165, 52]);

        bleedFoliageAlphaEdges(ctx, size, 42, 100, 34);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 4;
        return tex;
    }

    // Continuous organic tapered wooden limb along a CatmullRomCurve3 (zero cylinder seams or gaps!)
    function createTaperedLimbGeometry(points, rStart, rEnd, tubularSegs = 10, radialSegs = 8, rootButtress = 0.0) {
        const curve = new THREE.CatmullRomCurve3(points);
        const totalLen = Math.max(0.01, curve.getLength());
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        const prevTangent = new THREE.Vector3();
        const tangent = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const binormal = new THREE.Vector3();
        const rotQuat = new THREE.Quaternion();
        const pt = new THREE.Vector3();
        const vPos = new THREE.Vector3();
        const vNorm = new THREE.Vector3();

        for (let s = 0; s <= tubularSegs; s++) {
            const t = s / tubularSegs;
            curve.getPointAt(t, pt);
            curve.getTangentAt(t, tangent);
            if (tangent.lengthSq() > 1e-8) tangent.normalize(); else tangent.set(0, 1, 0);

            if (s === 0) {
                const ref = Math.abs(tangent.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
                normal.crossVectors(tangent, ref).normalize();
            } else {
                rotQuat.setFromUnitVectors(prevTangent, tangent);
                normal.applyQuaternion(rotQuat);
                normal.addScaledVector(tangent, -normal.dot(tangent));
                if (normal.lengthSq() > 1e-8) normal.normalize(); else normal.set(1, 0, 0);
            }
            binormal.crossVectors(tangent, normal).normalize();
            prevTangent.copy(tangent);

            const baseR = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.76));
            const vCoord = (t * totalLen) * 0.55;

            for (let r = 0; r <= radialSegs; r++) {
                const u = r / radialSegs;
                const theta = u * Math.PI * 2.0;
                const buttress = rootButtress > 0.0
                    ? (1.0 + rootButtress * Math.exp(-t * 5.2) * (0.5 + 0.5 * Math.cos(theta * 4.0 + 0.35)))
                    : 1.0;
                const gnarl = 1.0 + 0.045 * Math.sin(theta * 3.0 + t * 8.0);
                const rad = baseR * buttress * gnarl;

                const cosT = Math.cos(theta);
                const sinT = Math.sin(theta);

                vNorm.set(
                    normal.x * cosT + binormal.x * sinT,
                    normal.y * cosT + binormal.y * sinT,
                    normal.z * cosT + binormal.z * sinT
                ).normalize();

                vPos.copy(pt).addScaledVector(vNorm, rad);
                positions.push(vPos.x, vPos.y, vPos.z);
                normals.push(vNorm.x, vNorm.y, vNorm.z);
                uvs.push(u * 1.5, vCoord);
            }
        }

        const ringVerts = radialSegs + 1;
        for (let s = 0; s < tubularSegs; s++) {
            for (let r = 0; r < radialSegs; r++) {
                const a = s * ringVerts + r;
                const b = (s + 1) * ringVerts + r;
                const c = (s + 1) * ringVerts + (r + 1);
                const d = s * ringVerts + (r + 1);
                // Outward counter-clockwise winding matching +vNorm
                indices.push(a, d, b);
                indices.push(d, c, b);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        return geo;
    }

    // 3x3 Curved 3D Botanical Leaf-Spray Patch with Spherical Canopy Normals & Sun/AO Vertex Colors
    function createCurvedLeafSprayGeo(origin, yaw, pitch, roll, width, length, archDrop, clusterCenter, shadeFactor) {
        const nx = 2;
        const nz = 2;
        const positions = [];
        const normals = [];
        const uvs = [];
        const colors = [];
        const indices = [];

        const euler = new THREE.Euler(pitch, yaw, roll, 'YXZ');
        const quat = new THREE.Quaternion().setFromEuler(euler);
        const cardUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).normalize();
        const localPos = new THREE.Vector3();
        const outDir = new THREE.Vector3();

        for (let iz = 0; iz <= nz; iz++) {
            const vz = iz / nz; // 0 = twig stem attachment, 1 = outer leaf tips
            for (let ix = 0; ix <= nx; ix++) {
                const ux = ix / nx;
                const xCentered = ux - 0.5;
                // Natural botanical downward arch + subtle lateral cupping for 3D silhouette from all angles
                const lx = xCentered * width;
                const lz = vz * length;
                const ly = -archDrop * (vz * vz) - 0.14 * width * (xCentered * xCentered);

                localPos.set(lx, ly, lz).applyQuaternion(quat).add(origin);
                positions.push(localPos.x, localPos.y, localPos.z);
                uvs.push(ux, vz);

                // Spherical outward foliage normal (prevents X-card lighting seams and creates soft cloud-like sun shading!)
                outDir.subVectors(localPos, clusterCenter);
                if (outDir.lengthSq() > 1e-6) outDir.normalize(); else outDir.set(0, 1, 0);
                outDir.multiplyScalar(0.78).addScaledVector(cardUp, 0.22);
                outDir.y += 0.28;
                outDir.normalize();
                normals.push(outDir.x, outDir.y, outDir.z);

                // Baked interior AO at twig base -> vibrant sunlit chlorophyll at outer leaf tips
                const tipSun = THREE.MathUtils.lerp(0.66, 1.08, vz) * shadeFactor;
                const rCol = Math.min(1.25, tipSun * 1.02);
                const gCol = Math.min(1.25, tipSun * 1.05);
                const bCol = Math.min(1.20, tipSun * 0.90);
                colors.push(rCol, gCol, bCol);
            }
        }

        const stride = nx + 1;
        for (let iz = 0; iz < nz; iz++) {
            for (let ix = 0; ix < nx; ix++) {
                const a = iz * stride + ix;
                const b = (iz + 1) * stride + ix;
                const c = (iz + 1) * stride + (ix + 1);
                const d = iz * stride + (ix + 1);
                // Top surface (+Y) is front-facing counter-clockwise
                indices.push(a, b, d);
                indices.push(b, c, d);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(indices);
        return geo;
    }

    // Builds an airy multi-tiered botanical leaf sub-crown around a branch tip
    function addLeafSubCrown(foliageGeos, center, radiusScale, shadeFactor, rnd) {
        const crownCore = new THREE.Vector3(center.x, center.y - 0.35 * radiusScale, center.z);
        const outerCount = 5;
        const baseYaw = rnd() * Math.PI * 2.0;

        // 5 spreading outer umbrella sprays
        for (let k = 0; k < outerCount; k++) {
            const yaw = baseYaw + (k * Math.PI * 2.0) / outerCount + (rnd() - 0.5) * 0.28;
            const pitch = 0.16 + rnd() * 0.24; // Drooping gently outward
            const roll = (rnd() - 0.5) * 0.28;
            const w = (1.65 + rnd() * 0.35) * radiusScale;
            const l = (1.75 + rnd() * 0.35) * radiusScale;
            const origin = new THREE.Vector3(
                center.x - Math.sin(yaw) * 0.18 * radiusScale,
                center.y + (rnd() - 0.3) * 0.22 * radiusScale,
                center.z - Math.cos(yaw) * 0.18 * radiusScale
            );
            foliageGeos.push(createCurvedLeafSprayGeo(origin, yaw, pitch, roll, w, l, 0.34 * radiusScale, crownCore, shadeFactor));
        }

        // 3 upper/crossed crown sprays for full lush silhouette from side & underneath
        for (let k = 0; k < 3; k++) {
            const yaw = baseYaw + 0.55 + (k * Math.PI * 2.0) / 3.0 + (rnd() - 0.5) * 0.25;
            const pitch = -0.18 + k * 0.22;
            const roll = (rnd() - 0.5) * 0.42;
            const w = (1.50 + rnd() * 0.30) * radiusScale;
            const l = (1.55 + rnd() * 0.30) * radiusScale;
            const origin = new THREE.Vector3(
                center.x + (rnd() - 0.5) * 0.25 * radiusScale,
                center.y + (0.18 + k * 0.12) * radiusScale,
                center.z + (rnd() - 0.5) * 0.25 * radiusScale
            );
            foliageGeos.push(createCurvedLeafSprayGeo(origin, yaw, pitch, roll, w, l, 0.26 * radiusScale, crownCore, shadeFactor * 1.05));
        }
    }

    // Species A: Picturesque Spreading Coastal Umbrella / Sea-Almond Tree (~8.0m tall, ~7.4m wide crown)
    function buildCoastalUmbrellaTreeGeos() {
        const rnd = makeSeededRand(7741);
        const trunkGeos = [];
        const foliageGeos = [];

        // Sinuous buttressed main trunk (buried 0.3m at base so hillsides never show floating roots)
        const trunkPts = [
            new THREE.Vector3(0.0, -0.32, 0.0),
            new THREE.Vector3(0.08, 1.05, 0.04),
            new THREE.Vector3(0.20, 2.30, -0.06),
            new THREE.Vector3(0.14, 3.55, 0.05)
        ];
        trunkGeos.push(createTaperedLimbGeometry(trunkPts, 0.40, 0.21, 11, 9, 0.46));

        const boughDefs = [
            { y0: 2.95, dirX:  0.96, dirZ:  0.22, reach: 2.85, rise: 1.75, r0: 0.16, scale: 1.05, shade: 0.90 },
            { y0: 3.30, dirX:  0.28, dirZ:  0.96, reach: 2.55, rise: 2.40, r0: 0.155, scale: 1.00, shade: 0.98 },
            { y0: 3.05, dirX: -0.88, dirZ:  0.46, reach: 2.75, rise: 1.85, r0: 0.155, scale: 1.04, shade: 0.88 },
            { y0: 3.48, dirX: -0.62, dirZ: -0.78, reach: 2.15, rise: 3.10, r0: 0.165, scale: 1.06, shade: 1.04 },
            { y0: 3.22, dirX:  0.58, dirZ: -0.81, reach: 2.45, rise: 2.35, r0: 0.15, scale: 0.98, shade: 0.95 },
            { y0: 3.50, dirX:  0.08, dirZ:  0.05, reach: 0.35, rise: 3.55, r0: 0.145, scale: 1.08, shade: 1.08 }
        ];

        for (const b of boughDefs) {
            const p0 = new THREE.Vector3(0.15, b.y0, 0.02);
            const p1 = new THREE.Vector3(0.15 + b.dirX * b.reach * 0.36, b.y0 + b.rise * 0.42, 0.02 + b.dirZ * b.reach * 0.36);
            const p2 = new THREE.Vector3(0.15 + b.dirX * b.reach * 0.74, b.y0 + b.rise * 0.78, 0.02 + b.dirZ * b.reach * 0.74);
            const p3 = new THREE.Vector3(0.15 + b.dirX * b.reach, b.y0 + b.rise, 0.02 + b.dirZ * b.reach);

            const bCurve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
            trunkGeos.push(createTaperedLimbGeometry([p0, p1, p2, p3], b.r0, 0.048, 8, 7, 0.0));
            addLeafSubCrown(foliageGeos, p3, b.scale, b.shade, rnd);

            // 2 forked secondary limbs per primary bough
            const perpX = -b.dirZ;
            const perpZ = b.dirX;
            for (let side of [-1, 1]) {
                const tFork = side < 0 ? 0.50 : 0.72;
                const forkStart = bCurve.getPointAt(tFork);
                const subReach = 1.05 + rnd() * 0.35;
                const subEnd = new THREE.Vector3(
                    forkStart.x + (b.dirX * 0.65 + perpX * side * 0.72) * subReach,
                    forkStart.y + 0.55 + rnd() * 0.35,
                    forkStart.z + (b.dirZ * 0.65 + perpZ * side * 0.72) * subReach
                );
                const subMid = forkStart.clone().lerp(subEnd, 0.5);
                subMid.y += 0.14;
                trunkGeos.push(createTaperedLimbGeometry([forkStart, subMid, subEnd], b.r0 * 0.52, 0.034, 5, 6, 0.0));
                addLeafSubCrown(foliageGeos, subEnd, b.scale * 0.84, b.shade * 0.96, rnd);
            }
        }

        return {
            trunkGeo: BufferGeometryUtils.mergeGeometries(trunkGeos, false),
            foliageGeo: BufferGeometryUtils.mergeGeometries(foliageGeos, false),
            tempTrunk: trunkGeos,
            tempFoliage: foliageGeos
        };
    }

    // Species B: Taller Tropical Rainforest / Banyan-Fig Canopy Tree (~10.0m tall, multi-tiered crown)
    function buildTropicalRainforestTreeGeos() {
        const rnd = makeSeededRand(3319);
        const trunkGeos = [];
        const foliageGeos = [];

        const trunkPts = [
            new THREE.Vector3(0.0, -0.35, 0.0),
            new THREE.Vector3(-0.06, 1.55, 0.05),
            new THREE.Vector3(0.05, 3.35, -0.04),
            new THREE.Vector3(-0.04, 5.10, 0.06)
        ];
        trunkGeos.push(createTaperedLimbGeometry(trunkPts, 0.44, 0.22, 12, 9, 0.54));

        // 3 organic buttress root ribs anchoring base into tropical soil
        for (let r = 0; r < 3; r++) {
            const ang = (r * Math.PI * 2.0) / 3.0 + 0.4;
            const rPts = [
                new THREE.Vector3(Math.cos(ang) * 0.14, 1.35, Math.sin(ang) * 0.14),
                new THREE.Vector3(Math.cos(ang) * 0.42, 0.45, Math.sin(ang) * 0.42),
                new THREE.Vector3(Math.cos(ang) * 0.68, -0.30, Math.sin(ang) * 0.68)
            ];
            trunkGeos.push(createTaperedLimbGeometry(rPts, 0.11, 0.16, 5, 6, 0.0));
        }

        const boughDefs = [
            // Lower spreading tier
            { y0: 4.15, dirX:  0.94, dirZ: -0.34, reach: 2.65, rise: 1.55, r0: 0.15, scale: 1.00, shade: 0.86 },
            { y0: 4.35, dirX: -0.82, dirZ: -0.57, reach: 2.55, rise: 1.65, r0: 0.15, scale: 1.00, shade: 0.88 },
            { y0: 4.25, dirX: -0.10, dirZ:  0.99, reach: 2.60, rise: 1.60, r0: 0.15, scale: 1.02, shade: 0.88 },
            // Upper ascending rainforest crown tier
            { y0: 4.95, dirX:  0.65, dirZ:  0.76, reach: 2.05, rise: 3.15, r0: 0.16, scale: 1.06, shade: 1.02 },
            { y0: 5.00, dirX: -0.76, dirZ:  0.65, reach: 1.95, rise: 3.25, r0: 0.155, scale: 1.05, shade: 1.02 },
            { y0: 5.05, dirX:  0.12, dirZ: -0.99, reach: 1.90, rise: 3.10, r0: 0.15, scale: 1.04, shade: 1.00 },
            // High sunlit emergent apex
            { y0: 5.05, dirX:  0.04, dirZ:  0.04, reach: 0.25, rise: 4.10, r0: 0.15, scale: 1.12, shade: 1.10 }
        ];

        for (const b of boughDefs) {
            const p0 = new THREE.Vector3(-0.02, b.y0, 0.04);
            const p1 = new THREE.Vector3(-0.02 + b.dirX * b.reach * 0.40, b.y0 + b.rise * 0.45, 0.04 + b.dirZ * b.reach * 0.40);
            const p2 = new THREE.Vector3(-0.02 + b.dirX * b.reach * 0.76, b.y0 + b.rise * 0.80, 0.04 + b.dirZ * b.reach * 0.76);
            const p3 = new THREE.Vector3(-0.02 + b.dirX * b.reach, b.y0 + b.rise, 0.04 + b.dirZ * b.reach);

            const bCurve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
            trunkGeos.push(createTaperedLimbGeometry([p0, p1, p2, p3], b.r0, 0.048, 8, 7, 0.0));
            addLeafSubCrown(foliageGeos, p3, b.scale, b.shade, rnd);

            const perpX = -b.dirZ;
            const perpZ = b.dirX;
            for (let side of [-1, 1]) {
                const forkStart = bCurve.getPointAt(side < 0 ? 0.55 : 0.76);
                const subReach = 0.95 + rnd() * 0.35;
                const subEnd = new THREE.Vector3(
                    forkStart.x + (b.dirX * 0.6 + perpX * side * 0.75) * subReach,
                    forkStart.y + 0.52 + rnd() * 0.30,
                    forkStart.z + (b.dirZ * 0.6 + perpZ * side * 0.75) * subReach
                );
                const subMid = forkStart.clone().lerp(subEnd, 0.5);
                subMid.y += 0.12;
                trunkGeos.push(createTaperedLimbGeometry([forkStart, subMid, subEnd], b.r0 * 0.50, 0.034, 5, 6, 0.0));
                addLeafSubCrown(foliageGeos, subEnd, b.scale * 0.82, b.shade * 0.96, rnd);
            }
        }

        return {
            trunkGeo: BufferGeometryUtils.mergeGeometries(trunkGeos, false),
            foliageGeo: BufferGeometryUtils.mergeGeometries(foliageGeos, false),
            tempTrunk: trunkGeos,
            tempFoliage: foliageGeos
        };
    }

    // Lush 2-Tier Tropical Fern & Coastal Shrub Rosette (replaces smooth green pillow blobs on the ground!)
    function buildTropicalShrubGeometry() {
        const rnd = makeSeededRand(6129);
        const shrubGeos = [];
        const shrubCore = new THREE.Vector3(0, -0.15, 0);

        // Outer gracefully arching fern/shrub fronds
        const outerFronds = 9;
        for (let i = 0; i < outerFronds; i++) {
            const yaw = (i * Math.PI * 2.0) / outerFronds + (rnd() - 0.5) * 0.22;
            const pitch = 0.58 + rnd() * 0.22;
            const roll = (rnd() - 0.5) * 0.18;
            const origin = new THREE.Vector3(-Math.sin(yaw) * 0.06, 0.05, -Math.cos(yaw) * 0.06);
            shrubGeos.push(createCurvedLeafSprayGeo(origin, yaw, pitch, roll, 0.95 + rnd() * 0.22, 1.48 + rnd() * 0.25, 0.42, shrubCore, 0.92));
        }

        // Inner upright sunlit young fronds
        const innerFronds = 6;
        for (let i = 0; i < innerFronds; i++) {
            const yaw = (i * Math.PI * 2.0) / innerFronds + 0.32 + (rnd() - 0.5) * 0.22;
            const pitch = 0.22 + rnd() * 0.18;
            const roll = (rnd() - 0.5) * 0.18;
            const origin = new THREE.Vector3(0, 0.10, 0);
            shrubGeos.push(createCurvedLeafSprayGeo(origin, yaw, pitch, roll, 0.82 + rnd() * 0.18, 1.25 + rnd() * 0.20, 0.26, shrubCore, 1.06));
        }

        const merged = BufferGeometryUtils.mergeGeometries(shrubGeos, false);
        shrubGeos.forEach(g => g.dispose());
        return merged;
    }

    // Group to hold env meshes. Centered relative to voxel terrain group
    const envGroup = new THREE.Group();
    envGroup.position.copy(terrain.group.position);
    scene.add(envGroup);

    // Generate one temporary palm to extract and merge geometries
    const tempPalm = createPalmTree();
    const tempPalmGroup = new THREE.Group();
    tempPalmGroup.add(tempPalm);
    tempPalmGroup.updateMatrixWorld(true);
    
    const palmTrunkGeos = [];
    const palmLeavesGeos = [];
    const palmCoconutGeos = [];
    
    tempPalm.traverse((child) => {
        if (child.isMesh) {
            const cloneGeo = child.geometry.clone();
            cloneGeo.applyMatrix4(child.matrixWorld);
            
            const color = child.material.color.getHex();
            if (color === 0x9c8874) {
                palmTrunkGeos.push(cloneGeo);
            } else if (color === 0x2e8b3c) {
                palmLeavesGeos.push(cloneGeo);
            } else if (color === 0x5a3d28) {
                palmCoconutGeos.push(cloneGeo);
            }
        }
    });
    
    const masterPalmTrunkGeo = BufferGeometryUtils.mergeGeometries(palmTrunkGeos, true);
    const masterPalmLeavesGeo = BufferGeometryUtils.mergeGeometries(palmLeavesGeos, true);
    const masterPalmCoconutGeo = BufferGeometryUtils.mergeGeometries(palmCoconutGeos, true);
    
    palmTrunkGeos.forEach(g => g.dispose());
    palmLeavesGeos.forEach(g => g.dispose());
    palmCoconutGeos.forEach(g => g.dispose());

    // Build Species A (Spreading Coastal Umbrella Tree) & Species B (Tall Tropical Rainforest Tree)
    const speciesAData = buildCoastalUmbrellaTreeGeos();
    const masterPineTrunkGeo = speciesAData.trunkGeo;
    const masterPineFoliageGeo = speciesAData.foliageGeo;
    speciesAData.tempTrunk.forEach(g => g.dispose());
    speciesAData.tempFoliage.forEach(g => g.dispose());

    const speciesBData = buildTropicalRainforestTreeGeos();
    const masterPineBTrunkGeo = speciesBData.trunkGeo;
    const masterPineBFoliageGeo = speciesBData.foliageGeo;
    speciesBData.tempTrunk.forEach(g => g.dispose());
    speciesBData.tempFoliage.forEach(g => g.dispose());

    // Create master rock geometry (natural weathered boulder cluster)
    const rockClusterGeos = [];
    const mainRockGeo = new THREE.DodecahedronGeometry(1.0, 1);
    mainRockGeo.scale(1.0, 0.72, 1.0);
    rockClusterGeos.push(mainRockGeo);
    
    const satelliteCount = 3;
    for (let s = 0; s < satelliteCount; s++) {
        const angle = (s * Math.PI * 2) / satelliteCount + (Math.random() - 0.5) * 0.4;
        const dist = 0.75 + Math.random() * 0.25;
        const rad = 0.35 + Math.random() * 0.25;
        
        const satGeo = new THREE.DodecahedronGeometry(rad, 1);
        satGeo.scale(
            0.8 + Math.random() * 0.4,
            0.6 + Math.random() * 0.4,
            0.8 + Math.random() * 0.4
        );
        satGeo.rotateX(Math.random() * Math.PI);
        satGeo.rotateY(Math.random() * Math.PI);
        satGeo.rotateZ(Math.random() * Math.PI);
        
        const px = Math.cos(angle) * dist;
        const py = -0.22 + (Math.random() - 0.5) * 0.12;
        const pz = Math.sin(angle) * dist;
        satGeo.translate(px, py, pz);
        
        rockClusterGeos.push(satGeo);
    }
    
    const masterRockGeo = BufferGeometryUtils.mergeGeometries(rockClusterGeos, true);
    rockClusterGeos.forEach(g => {
        if (g !== masterRockGeo) g.dispose();
    });

    // Build Botanical Tropical Fern & Shrub Rosette Geometry
    const masterBushGeo = buildTropicalShrubGeometry();

    // Procedural Textures & Materials
    const barkTexture = createTreeBarkTexture();
    const broadleafTexture = createBroadleafCanopyTexture();
    const bushFrondTexture = createTropicalBushTexture();

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9c8874, flatShading: false, roughness: 0.92 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e8b3c, flatShading: false, roughness: 0.65, side: THREE.DoubleSide });
    const coconutMat = new THREE.MeshStandardMaterial({ color: 0x5a3d28, flatShading: false, roughness: 0.85 });

    const pineTrunkMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: barkTexture,
        roughness: 0.92,
        metalness: 0.0
    });

    const pineFoliageMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: broadleafTexture,
        alphaTest: 0.34,
        side: THREE.DoubleSide,
        vertexColors: true,
        roughness: 0.74,
        metalness: 0.0
    });
    // Subtle sunlit chlorophyll subsurface glow when looking up through the canopy from underneath
    pineFoliageMat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
             reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.24, 0.34, 0.12);`
        );
    };

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e6a63, flatShading: false, roughness: 0.90 });

    const bushMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: bushFrondTexture,
        alphaTest: 0.34,
        side: THREE.DoubleSide,
        vertexColors: true,
        roughness: 0.72,
        metalness: 0.0
    });
    bushMat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
             reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.22, 0.32, 0.12);`
        );
    };

    // Initialize/clear global instance arrays
    palmInstances = [];
    pineInstances = [];
    rockInstances = [];
    bushInstances = [];

    const speciesACount = Math.ceil(pineTreesCount * 0.55);
    const speciesBCount = pineTreesCount - speciesACount;

    // Instanced meshes
    instancedPalmsTrunk = new THREE.InstancedMesh(masterPalmTrunkGeo, trunkMat, palmTreesCount);
    instancedPalmsLeaves = new THREE.InstancedMesh(masterPalmLeavesGeo, leafMat, palmTreesCount);
    instancedPalmsCoconuts = new THREE.InstancedMesh(masterPalmCoconutGeo, coconutMat, palmTreesCount);
    
    instancedPinesTrunk = new THREE.InstancedMesh(masterPineTrunkGeo, pineTrunkMat, speciesACount);
    instancedPinesFoliage = new THREE.InstancedMesh(masterPineFoliageGeo, pineFoliageMat, speciesACount);

    instancedPinesBTrunk = new THREE.InstancedMesh(masterPineBTrunkGeo, pineTrunkMat, speciesBCount);
    instancedPinesBFoliage = new THREE.InstancedMesh(masterPineBFoliageGeo, pineFoliageMat, speciesBCount);
    
    instancedRocks = new THREE.InstancedMesh(masterRockGeo, rockMat, rocksCount);
    instancedBushes = new THREE.InstancedMesh(masterBushGeo, bushMat, bushesCount);

    // Configure shadows (alphaTest foliage casts real dappled leaf shadows!)
    instancedPalmsTrunk.castShadow = true; instancedPalmsTrunk.receiveShadow = true;
    instancedPalmsLeaves.castShadow = true; instancedPalmsLeaves.receiveShadow = true;
    instancedPalmsCoconuts.castShadow = true;
    
    instancedPinesTrunk.castShadow = true; instancedPinesTrunk.receiveShadow = true;
    instancedPinesFoliage.castShadow = true; instancedPinesFoliage.receiveShadow = true;
    instancedPinesBTrunk.castShadow = true; instancedPinesBTrunk.receiveShadow = true;
    instancedPinesBFoliage.castShadow = true; instancedPinesBFoliage.receiveShadow = true;
    
    instancedRocks.castShadow = true; instancedRocks.receiveShadow = true;
    instancedBushes.castShadow = true; instancedBushes.receiveShadow = true;

    // Prevent premature frustum culling of archipelago instanced trees/rocks at screen edges
    instancedPalmsTrunk.frustumCulled = false;
    instancedPalmsLeaves.frustumCulled = false;
    instancedPalmsCoconuts.frustumCulled = false;
    instancedPinesTrunk.frustumCulled = false;
    instancedPinesFoliage.frustumCulled = false;
    instancedPinesBTrunk.frustumCulled = false;
    instancedPinesBFoliage.frustumCulled = false;
    instancedRocks.frustumCulled = false;
    instancedBushes.frustumCulled = false;

    envGroup.add(instancedPalmsTrunk);
    envGroup.add(instancedPalmsLeaves);
    envGroup.add(instancedPalmsCoconuts);
    envGroup.add(instancedPinesTrunk);
    envGroup.add(instancedPinesFoliage);
    envGroup.add(instancedPinesBTrunk);
    envGroup.add(instancedPinesBFoliage);
    envGroup.add(instancedRocks);
    envGroup.add(instancedBushes);
    
    const spawnedPositions = [];
    function isFarEnough(x, z, minDist) {
        for (const pos of spawnedPositions) {
            const dx = pos.x - x;
            const dz = pos.z - z;
            if (dx*dx + dz*dz < minDist * minDist) return false;
        }
        return true;
    }
    
    // Helper: uniform circular sampling across the Central Sacred Island + all 3 Concentric Land Rings (r = 0 .. 602m)
    function sampleAtlantisPoint(maxR) {
        const rad = Math.sqrt(Math.random()) * maxR;
        const ang = Math.random() * Math.PI * 2.0;
        return { wx: Math.cos(ang) * rad, wz: Math.sin(ang) * rad };
    }

    // Spawning loop for Palm Trees (golden beaches & lower coastal slopes across all 3 concentric rings + Inner Harbor)
    let attempts = 0;
    let treesPlaced = 0;
    while (treesPlaced < palmTreesCount && attempts < 5200) {
        attempts++;
        const maxR = (treesPlaced < palmTreesCount * 0.30) ? 265.0 : 598.0;
        const { wx, wz } = sampleAtlantisPoint(maxR);
        const groundHeight = terrain.getSurfaceHeight(new THREE.Vector3(wx, 0, wz), 255.0);

        // Spawn range: between 120.4m (beaches) and 136.5m (coastal terraces), keeping natural grove spacing
        if (groundHeight > 120.4 && groundHeight < 136.5 && isFarEnough(wx, wz, 4.0)) {
            const y = groundHeight - 0.1;
            const rotationY = Math.random() * Math.PI * 2;
            const sc = 0.78 + Math.random() * 0.52;

            const position = new THREE.Vector3(wx, y, wz);
            const scale = new THREE.Vector3(sc, sc, sc);
            const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0));
            const matrix = new THREE.Matrix4().compose(position, rotation, scale);

            instancedPalmsTrunk.setMatrixAt(treesPlaced, matrix);
            instancedPalmsLeaves.setMatrixAt(treesPlaced, matrix);
            instancedPalmsCoconuts.setMatrixAt(treesPlaced, matrix);

            palmInstances.push({
                x: wx,
                y: y,
                z: wz,
                rotationY: rotationY,
                scale: sc,
                velocityY: 0,
                falling: false
            });

            spawnedPositions.push({ x: wx, z: wz });
            treesPlaced++;
        }
    }
    instancedPalmsTrunk.count = treesPlaced;
    instancedPalmsLeaves.count = treesPlaced;
    instancedPalmsCoconuts.count = treesPlaced;

    // Spawning loop for Realistic Tropical Broadleaf Trees (Species A Coastal Umbrella & Species B Rainforest Canopy)
    attempts = 0;
    let pinesAPlaced = 0;
    let pinesBPlaced = 0;
    while ((pinesAPlaced + pinesBPlaced) < pineTreesCount && attempts < 4500) {
        attempts++;
        const { wx, wz } = sampleAtlantisPoint(595.0);
        const groundHeight = terrain.getSurfaceHeight(new THREE.Vector3(wx, 0, wz), 255.0);

        // Spawn broadleaf trees on verdant ring ridges & Sacred Mountain lower/mid slopes (124.5m up to 176.0m)
        if (groundHeight >= 124.5 && groundHeight < 176.0 && isFarEnough(wx, wz, 5.2)) {
            const y = groundHeight - 0.15;
            const rotationY = Math.random() * Math.PI * 2;
            const scXZ = 0.82 + Math.random() * 0.46;
            const scY  = scXZ * (0.90 + Math.random() * 0.22);

            const position = new THREE.Vector3(wx, y, wz);
            const scale = new THREE.Vector3(scXZ, scY, scXZ);
            const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0));
            const matrix = new THREE.Matrix4().compose(position, rotation, scale);

            // Use taller Rainforest Species B preferentially on higher inland hills (>138m) or alternate naturally
            const wantSpeciesB = (groundHeight > 140.0 || Math.random() < 0.42) && (pinesBPlaced < speciesBCount);
            const useB = wantSpeciesB || (pinesAPlaced >= speciesACount);

            if (useB && pinesBPlaced < speciesBCount) {
                instancedPinesBTrunk.setMatrixAt(pinesBPlaced, matrix);
                instancedPinesBFoliage.setMatrixAt(pinesBPlaced, matrix);
                pineInstances.push({
                    isSpeciesB: true,
                    localIdx: pinesBPlaced,
                    x: wx, y: y, z: wz,
                    rotationY: rotationY,
                    scaleX: scXZ, scaleY: scY, scaleZ: scXZ,
                    velocityY: 0, falling: false
                });
                pinesBPlaced++;
            } else if (pinesAPlaced < speciesACount) {
                instancedPinesTrunk.setMatrixAt(pinesAPlaced, matrix);
                instancedPinesFoliage.setMatrixAt(pinesAPlaced, matrix);
                pineInstances.push({
                    isSpeciesB: false,
                    localIdx: pinesAPlaced,
                    x: wx, y: y, z: wz,
                    rotationY: rotationY,
                    scaleX: scXZ, scaleY: scY, scaleZ: scXZ,
                    velocityY: 0, falling: false
                });
                pinesAPlaced++;
            }

            spawnedPositions.push({ x: wx, z: wz });
        }
    }
    instancedPinesTrunk.count = pinesAPlaced;
    instancedPinesFoliage.count = pinesAPlaced;
    instancedPinesBTrunk.count = pinesBPlaced;
    instancedPinesBFoliage.count = pinesBPlaced;

    // Spawning loop for Lush Tropical Fern & Shrub Rosettes across all 3 concentric rings
    attempts = 0;
    let bushesPlaced = 0;
    while (bushesPlaced < bushesCount && attempts < 4500) {
        attempts++;
        const { wx, wz } = sampleAtlantisPoint(598.0);
        const groundHeight = terrain.getSurfaceHeight(new THREE.Vector3(wx, 0, wz), 255.0);
        if (groundHeight >= 121.4 && groundHeight < 168.0) {
            const y = groundHeight - 0.08;
            const scX = 0.75 + Math.random() * 0.75;
            const scY = 0.70 + Math.random() * 0.65;
            const scZ = scX * (0.9 + Math.random() * 0.2);
            const rotY = Math.random() * Math.PI * 2;
            const matrix = new THREE.Matrix4().compose(
                new THREE.Vector3(wx, y, wz),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
                new THREE.Vector3(scX, scY, scZ)
            );
            instancedBushes.setMatrixAt(bushesPlaced, matrix);
            bushInstances.push({
                x: wx, y: y, z: wz,
                rotY: rotY, scX: scX, scY: scY, scZ: scZ,
                velocityY: 0, falling: false
            });
            bushesPlaced++;
        }
    }
    instancedBushes.count = bushesPlaced;
    instancedBushes.instanceMatrix.needsUpdate = true;
    instancedBushes.matrixAutoUpdate = false;

    // Spawning loop for Weathered Boulders (along shores, canal banks & Sacred Mountain slopes)
    attempts = 0;
    let rocksPlaced = 0;
    while (rocksPlaced < rocksCount && attempts < 3200) {
        attempts++;
        const { wx, wz } = sampleAtlantisPoint(625.0);
        const groundHeight = terrain.getSurfaceHeight(new THREE.Vector3(wx, 0, wz), 255.0);

        if (groundHeight > 112.0 && groundHeight < 205.0 && isFarEnough(wx, wz, 4.0)) {
            const y = groundHeight - 0.25;
            const scaleX = 0.8 + Math.random() * 1.0;
            const scaleY = 0.5 + Math.random() * 0.7;
            const scaleZ = 0.8 + Math.random() * 1.0;
            const rotX = Math.random() * Math.PI;
            const rotY = Math.random() * Math.PI;
            const rotZ = Math.random() * Math.PI;

            const position = new THREE.Vector3(wx, y, wz);
            const scale = new THREE.Vector3(scaleX, scaleY, scaleZ);
            const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ));
            const matrix = new THREE.Matrix4().compose(position, rotation, scale);

            instancedRocks.setMatrixAt(rocksPlaced, matrix);

            rockInstances.push({
                x: wx,
                y: y,
                z: wz,
                rotX: rotX,
                rotY: rotY,
                rotZ: rotZ,
                scaleX: scaleX,
                scaleY: scaleY,
                scaleZ: scaleZ,
                velocityY: 0,
                falling: false
            });

            spawnedPositions.push({ x: wx, z: wz });
            rocksPlaced++;
        }
    }
    instancedRocks.count = rocksPlaced;

    // Flag instance matrices for update
    instancedPalmsTrunk.instanceMatrix.needsUpdate = true;
    instancedPalmsLeaves.instanceMatrix.needsUpdate = true;
    instancedPalmsCoconuts.instanceMatrix.needsUpdate = true;
    instancedPinesTrunk.instanceMatrix.needsUpdate = true;
    instancedPinesFoliage.instanceMatrix.needsUpdate = true;
    instancedPinesBTrunk.instanceMatrix.needsUpdate = true;
    instancedPinesBFoliage.instanceMatrix.needsUpdate = true;
    instancedRocks.instanceMatrix.needsUpdate = true;

    // Disable autoUpdate on instanced components as they are static
    instancedPalmsTrunk.matrixAutoUpdate = false;
    instancedPalmsLeaves.matrixAutoUpdate = false;
    instancedPalmsCoconuts.matrixAutoUpdate = false;
    instancedPinesTrunk.matrixAutoUpdate = false;
    instancedPinesFoliage.matrixAutoUpdate = false;
    instancedPinesBTrunk.matrixAutoUpdate = false;
    instancedPinesBFoliage.matrixAutoUpdate = false;
    instancedRocks.matrixAutoUpdate = false;
}

function updateHeightmap(nearPos, radius) {
    if (!terrain) return;
    const width = 512;
    const depth = 512;
    const minWorldX = -1152.0;
    const minWorldZ = -1152.0;
    const texelSize = 4.5; // 512 * 4.5m = 2304m x 2304m symmetrically centered on Plato's Atlantis
    const scale = 3.0; // voxelScale

    let minX = 0, maxX = width - 1;
    let minZ = 0, maxZ = depth - 1;

    // Fast path: when digging/building locally, only update the small touched window
    if (nearPos && radius) {
        const padTex = Math.ceil((radius + 9.0) / texelSize);
        const cx = Math.floor((nearPos.x - minWorldX) / texelSize);
        const cz = Math.floor((nearPos.z - minWorldZ) / texelSize);
        minX = Math.max(0, cx - padTex);
        maxX = Math.min(width - 1, cx + padTex);
        minZ = Math.max(0, cz - padTex);
        maxZ = Math.min(depth - 1, cz + padTex);
    }

    for (let x = minX; x <= maxX; x++) {
        const wx = minWorldX + (x + 0.5) * texelSize;
        const vx = wx / scale;
        const ivx = Math.round(vx);

        for (let z = minZ; z <= maxZ; z++) {
            const wz = minWorldZ + (z + 0.5) * texelSize;
            const vz = wz / scale;
            const ivz = Math.round(vz);
            let surfaceY = 0.0;

            if (terrain.modifiedColumns.has(`${ivx},${ivz}`)) {
                // Column was sculpted/dug: scan vertically with smooth sub-voxel zero-crossing interpolation
                for (let y = 45; y >= 0; y--) {
                    const d0 = terrain.getDensity(ivx, y, ivz);
                    if (d0 >= 0.0) {
                        if (y < 45) {
                            const d1 = terrain.getDensity(ivx, y + 1, ivz);
                            const denom = d0 - d1;
                            surfaceY = denom > 1e-5 ? (y + d0 / denom) : y;
                        } else {
                            surfaceY = y;
                        }
                        break;
                    }
                }
            } else {
                // Exact closed-form analytical terrain height (10cm precision, zero shelf clamping)
                surfaceY = terrain.getEstimatedSurfaceHeight(vx, vz);
            }

            // Encode water depth [0.0m .. 25.5m] below sea level (120.0m) at 0.1m resolution
            const h = surfaceY * scale;
            const waterDepthMeters = Math.max(0.0, Math.min(25.5, 120.0 - h));
            heightmapData[x + z * width] = Math.round((waterDepthMeters / 25.5) * 255.0);
        }
    }

    if (!heightmapTexture) {
        heightmapTexture = new THREE.DataTexture(
            heightmapData,
            width,
            depth,
            THREE.RedFormat,
            THREE.UnsignedByteType
        );
        heightmapTexture.minFilter = THREE.LinearFilter;
        heightmapTexture.magFilter = THREE.LinearFilter;
        heightmapTexture.needsUpdate = true;

        if (water && water.material && water.material.uniforms) {
            water.material.uniforms['heightmapTexture'] = { value: heightmapTexture };
        }
    } else {
        heightmapTexture.needsUpdate = true;
    }
}

function checkFoliageFalling(nearPos, radius = 6.0) {
    if (!terrain) return;
    const checkRadiusSq = (radius + 8.0) * (radius + 8.0);

    for (let i = 0; i < palmInstances.length; i++) {
        const inst = palmInstances[i];
        if (inst.falling) continue;
        if (nearPos) {
            const dx = inst.x - nearPos.x;
            const dz = inst.z - nearPos.z;
            if (dx * dx + dz * dz > checkRadiusSq) continue;
        }
        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 255.0);
        const targetY = groundHeight - 0.1;
        if (inst.y > targetY + 0.1) {
            inst.falling = true;
            inst.velocityY = 0;
        }
    }

    for (let i = 0; i < pineInstances.length; i++) {
        const inst = pineInstances[i];
        if (inst.falling) continue;
        if (nearPos) {
            const dx = inst.x - nearPos.x;
            const dz = inst.z - nearPos.z;
            if (dx * dx + dz * dz > checkRadiusSq) continue;
        }
        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 255.0);
        const targetY = groundHeight - 0.15;
        if (inst.y > targetY + 0.1) {
            inst.falling = true;
            inst.velocityY = 0;
        }
    }

    for (let i = 0; i < bushInstances.length; i++) {
        const inst = bushInstances[i];
        if (inst.falling) continue;
        if (nearPos) {
            const dx = inst.x - nearPos.x;
            const dz = inst.z - nearPos.z;
            if (dx * dx + dz * dz > checkRadiusSq) continue;
        }
        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 255.0);
        const targetY = groundHeight - 0.08;
        if (inst.y > targetY + 0.1) {
            inst.falling = true;
            inst.velocityY = 0;
        }
    }

    for (let i = 0; i < rockInstances.length; i++) {
        const inst = rockInstances[i];
        if (inst.falling) continue;
        if (nearPos) {
            const dx = inst.x - nearPos.x;
            const dz = inst.z - nearPos.z;
            if (dx * dx + dz * dz > checkRadiusSq) continue;
        }
        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 255.0);
        const targetY = groundHeight - 0.25;
        if (inst.y > targetY + 0.1) {
            inst.falling = true;
            inst.velocityY = 0;
        }
    }
}

function updateFoliagePhysics(delta) {
    let palmUpdated = false;
    let pineAUpdated = false;
    let pineBUpdated = false;
    let bushUpdated = false;
    let rockUpdated = false;

    const gravityForce = 9.81;

    for (let i = 0; i < palmInstances.length; i++) {
        const inst = palmInstances[i];
        if (!inst.falling) continue;

        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 255.0);
        const targetY = groundHeight - 0.1;

        inst.velocityY -= gravityForce * delta;
        inst.y += inst.velocityY * delta;

        if (inst.y <= targetY) {
            inst.y = targetY;
            inst.velocityY = 0;
            inst.falling = false;
        }

        const position = new THREE.Vector3(inst.x, inst.y, inst.z);
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, inst.rotationY, 0));
        const scale = new THREE.Vector3(inst.scale, inst.scale, inst.scale);
        const matrix = new THREE.Matrix4().compose(position, rotation, scale);

        instancedPalmsTrunk.setMatrixAt(i, matrix);
        instancedPalmsLeaves.setMatrixAt(i, matrix);
        instancedPalmsCoconuts.setMatrixAt(i, matrix);
        palmUpdated = true;
    }

    for (let i = 0; i < pineInstances.length; i++) {
        const inst = pineInstances[i];
        if (!inst.falling) continue;

        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 255.0);
        const targetY = groundHeight - 0.15;

        inst.velocityY -= gravityForce * delta;
        inst.y += inst.velocityY * delta;

        if (inst.y <= targetY) {
            inst.y = targetY;
            inst.velocityY = 0;
            inst.falling = false;
        }

        const position = new THREE.Vector3(inst.x, inst.y, inst.z);
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, inst.rotationY, 0));
        const scale = new THREE.Vector3(inst.scaleX, inst.scaleY, inst.scaleZ);
        const matrix = new THREE.Matrix4().compose(position, rotation, scale);

        if (inst.isSpeciesB) {
            instancedPinesBTrunk.setMatrixAt(inst.localIdx, matrix);
            instancedPinesBFoliage.setMatrixAt(inst.localIdx, matrix);
            pineBUpdated = true;
        } else {
            instancedPinesTrunk.setMatrixAt(inst.localIdx, matrix);
            instancedPinesFoliage.setMatrixAt(inst.localIdx, matrix);
            pineAUpdated = true;
        }
    }

    for (let i = 0; i < bushInstances.length; i++) {
        const inst = bushInstances[i];
        if (!inst.falling) continue;

        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 255.0);
        const targetY = groundHeight - 0.08;

        inst.velocityY -= gravityForce * delta;
        inst.y += inst.velocityY * delta;

        if (inst.y <= targetY) {
            inst.y = targetY;
            inst.velocityY = 0;
            inst.falling = false;
        }

        const matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(inst.x, inst.y, inst.z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, inst.rotY, 0)),
            new THREE.Vector3(inst.scX, inst.scY, inst.scZ)
        );
        instancedBushes.setMatrixAt(i, matrix);
        bushUpdated = true;
    }

    for (let i = 0; i < rockInstances.length; i++) {
        const inst = rockInstances[i];
        if (!inst.falling) continue;

        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 255.0);
        const targetY = groundHeight - 0.25;

        inst.velocityY -= gravityForce * delta;
        inst.y += inst.velocityY * delta;

        if (inst.y <= targetY) {
            inst.y = targetY;
            inst.velocityY = 0;
            inst.falling = false;
        }

        const position = new THREE.Vector3(inst.x, inst.y, inst.z);
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(inst.rotX, inst.rotY, inst.rotZ));
        const scale = new THREE.Vector3(inst.scaleX, inst.scaleY, inst.scaleZ);
        const matrix = new THREE.Matrix4().compose(position, rotation, scale);

        instancedRocks.setMatrixAt(i, matrix);
        rockUpdated = true;
    }

    if (palmUpdated) {
        instancedPalmsTrunk.instanceMatrix.needsUpdate = true;
        instancedPalmsLeaves.instanceMatrix.needsUpdate = true;
        instancedPalmsCoconuts.instanceMatrix.needsUpdate = true;
    }
    if (pineAUpdated) {
        instancedPinesTrunk.instanceMatrix.needsUpdate = true;
        instancedPinesFoliage.instanceMatrix.needsUpdate = true;
    }
    if (pineBUpdated) {
        instancedPinesBTrunk.instanceMatrix.needsUpdate = true;
        instancedPinesBFoliage.instanceMatrix.needsUpdate = true;
    }
    if (bushUpdated) {
        instancedBushes.instanceMatrix.needsUpdate = true;
    }
    if (rockUpdated) {
        instancedRocks.instanceMatrix.needsUpdate = true;
    }

    if (palmUpdated || pineAUpdated || pineBUpdated || bushUpdated || rockUpdated) {
        renderer.shadowMap.needsUpdate = true;
    }
}

// ==========================================
// FIRST-PERSON PLAYER ARM CREATION HELPERS
// ==========================================
function createArm(isLeft) {
    const armGroup = new THREE.Group();

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0ac69, flatShading: true, roughness: 0.8 }); // skin tone
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, flatShading: true, roughness: 0.9 }); // dark brown leather glove
    const wristMat = new THREE.MeshStandardMaterial({ color: 0x3d2b22, flatShading: true, roughness: 0.9 }); // darker leather strap

    // Forearm sleeve (glove sleeve) - cylinder pointing forward
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.35, 6), gloveMat);
    forearm.rotation.x = Math.PI / 2; // Point forward
    forearm.position.set(0, 0, 0.1);
    armGroup.add(forearm);

    // Wristband strap
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.03, 6), wristMat);
    strap.rotation.x = Math.PI / 2;
    strap.position.set(0, 0, -0.06);
    armGroup.add(strap);

    // Main glove hand body (box)
    const gloveHand = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.032, 0.05), gloveMat);
    gloveHand.position.set(0, 0, -0.1);
    armGroup.add(gloveHand);

    // Fingers (exposed skin)
    // Thumb
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.025), skinMat);
    thumb.position.set(isLeft ? 0.024 : -0.024, 0.008, -0.115);
    thumb.rotation.y = isLeft ? -0.4 : 0.4;
    armGroup.add(thumb);

    // Index, Middle, Ring, Pinky
    const finger1 = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.025), skinMat);
    finger1.position.set(isLeft ? 0.015 : -0.015, -0.004, -0.13);
    armGroup.add(finger1);

    const finger2 = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.027), skinMat);
    finger2.position.set(isLeft ? 0.005 : -0.005, -0.004, -0.132);
    armGroup.add(finger2);

    const finger3 = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.025), skinMat);
    finger3.position.set(isLeft ? -0.005 : 0.005, -0.004, -0.13);
    armGroup.add(finger3);

    const finger4 = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.009, 0.022), skinMat);
    finger4.position.set(isLeft ? -0.015 : 0.015, -0.004, -0.128);
    armGroup.add(finger4);

    return armGroup;
}
