import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";
import { VoxelTerrain } from "./marching_cubes.js?v=0.213";
import { createAtlantisCapital } from "./atlantis_capital.js?v=0.213";
import { WorldRealismSystem } from "./world_realism.js?v=0.213";

// ==========================================
// EDITOR GAMEPLAY STATE & GLOBALS
// ==========================================
let scene, camera, renderer, clock;
let terrain, water, sky, sun, dirLight, ambientLight, hemiLight, worldRealism;
let atlantisMistGroup = null, atlantisMistUniforms = null, atlantisCapital = null;
let heightmapData = null, heightmapTexture = null;
let hmCenterX = 14200.0, hmCenterZ = -13800.0;
const hmBoundsUniform = { value: new THREE.Vector4(14200.0 - 2611.2, -13800.0 - 2611.2, 5222.4, 5222.4) };
let raycaster;
let brushRing, brushDisc;
let brushTargetPos = new THREE.Vector3();
let brushNormal = new THREE.Vector3(0, 1, 0);
let hasTarget = false;

// Controls & Camera State
let isPointerLocked = false;
let isLeftMouseDown = false;
let isRightMouseDown = false;
let keyStates = {};
let camYaw = 3.08;
let camPitch = -0.22;
let playerPos = new THREE.Vector3(14200, 178, -13775); // Panoramic drone view over Tigris & Euphrates Headwaters & Mesopotamia
let playerVelocity = new THREE.Vector3();
let camMode = "drone"; // "drone" (freecam fly), "walk" (grounded FPS physics), "topdown"
let savedDronePos = new THREE.Vector3(14200, 178, -13775);
let savedDronePitch = -0.22;
let isGrounded = false;

// Editor Tools Configuration
let currentTool = "sculpt"; // sculpt, flatten, smooth, foliage, stamp, beach, eraser, view
let brushRadius = 18.0;
let brushStrength = 1.0;
let foliageType = "palm"; // palm, pine, rock, bush
let stampType = "atoll";  // atoll, volcano, mountain, stack

// Foliage Instances
let foliageGroup;
let foliageInstances = [];

// Tool Colors (for 3D holographic cursor)
const toolColors = {
    sculpt: 0x00d2ff,   // Cyan
    flatten: 0xff9800,  // Orange
    smooth: 0x29b6f6,   // Sky Blue
    foliage: 0x00e676,  // Emerald Green
    stamp: 0xab47bc,    // Purple
    beach: 0xf5dfa6,    // Champagne Gold
    eraser: 0xff5252,   // Coral Red
    view: 0xffffff      // White
};

// UI Elements
const canvas = document.getElementById("editor-canvas");
const crosshair = document.getElementById("crosshair");
const posInfo = document.getElementById("pos-info");
const biomeInfo = document.getElementById("biome-info");
const flyInfo = document.getElementById("fly-info");
const modCounter = document.getElementById("mod-counter");
const fpsCounter = document.getElementById("fps-counter");
const altCounter = document.getElementById("alt-counter");
const camModeText = document.getElementById("cam-mode-text");
const btnToggleCam = document.getElementById("btn-toggle-cam");

const valRadius = document.getElementById("val-radius");
const valStrength = document.getElementById("val-strength");
const btnRadMinus = document.getElementById("btn-radius-minus");
const btnRadPlus = document.getElementById("btn-radius-plus");
const btnStrMinus = document.getElementById("btn-strength-minus");
const btnStrPlus = document.getElementById("btn-strength-plus");
const pillSuboption = document.getElementById("pill-suboption");
const lblSuboption = document.getElementById("lbl-suboption");
const selectSuboption = document.getElementById("select-suboption");
const toolHint = document.getElementById("tool-hint");

const blocker = document.getElementById("blocker");
const btnStartEditing = document.getElementById("btn-start-editing");
const editorModal = document.getElementById("editor-modal");
const btnOpenMenu = document.getElementById("btn-open-menu");
const btnQuickPlay = document.getElementById("btn-quick-play");
const btnQuickSave = document.getElementById("btn-quick-save");
const modalResume = document.getElementById("modal-resume");
const modalPlay = document.getElementById("modal-play");
const modalExport = document.getElementById("modal-export");
const modalImport = document.getElementById("modal-import");
const modalReset = document.getElementById("modal-reset");
const toast = document.getElementById("toast");
const fileInput = document.getElementById("file-input");

// FPS Calculation
let frameCount = 0;
let lastFpsTime = performance.now();
let isEditorWorldLoaded = false;

// ==========================================
// CRYING / LOADING PROGRESS BAR CONTROLLER
// ==========================================
function setCryingProgress(percent, statusText) {
    window.__cryingEngineControlled = true;
    const fill = document.getElementById("crying-bar-fill");
    const pct = document.getElementById("crying-percent");
    const status = document.getElementById("crying-status");
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (fill) fill.style.width = `${clamped}%`;
    if (pct) pct.textContent = `${clamped}%`;
    if (status && statusText) status.textContent = statusText;
}

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function finishCryingLoader() {
    isEditorWorldLoaded = true;
    setCryingProgress(100, "✨ Level Builder pronto! Benvenuto in CryWorld");
    const loader = document.getElementById("crying-loader");
    const startBtns = document.getElementById("start-buttons-row");
    setTimeout(() => {
        if (loader) {
            loader.style.opacity = "0";
            loader.style.transform = "translateY(-6px)";
            setTimeout(() => {
                loader.classList.add("hidden");
                if (startBtns) startBtns.classList.remove("hidden");
            }, 260);
        } else if (startBtns) {
            startBtns.classList.remove("hidden");
        }
    }, 240);
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
let toastTimeout = null;
function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove("hidden");
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add("hidden"), 2600);
}

// ==========================================
// INITIALIZATION
// ==========================================
async function init() {
    setCryingProgress(20, "💧 CRYING... Inizializzazione Cielo Volumetrico & Oceano...");
    await nextFrame();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ce3ff);
    scene.fog = new THREE.Fog(0x8ce3ff, 1950, 4100); // Clear panoramic view across 4.8km Cleito, 4 Walls + Mist Ring!

    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 45000);
    camera.position.copy(playerPos);
    camera.rotation.order = "YXZ";

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Ambient, Hemisphere and Directional Lighting matching Next-Gen Gameplay
    ambientLight = new THREE.AmbientLight(0xfff8ee, 0.55);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(0x88d4ff, 0x2d5e2e, 0.65);
    hemiLight.position.set(0, 300, 0);
    scene.add(hemiLight);

    sun = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(90 - 28.0);
    const theta = THREE.MathUtils.degToRad(195);
    sun.setFromSphericalCoords(1, phi, theta);

    dirLight = new THREE.DirectionalLight(0xfff2d6, 2.40);
    dirLight.target.position.set(0, 126, 0);
    scene.add(dirLight.target);
    dirLight.position.copy(dirLight.target.position).addScaledVector(sun, 420);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 1400;
    dirLight.shadow.camera.left = -450;
    dirLight.shadow.camera.right = 450;
    dirLight.shadow.camera.top = 450;
    dirLight.shadow.camera.bottom = -450;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Photorealistic Tropical Sky Dome with Volumetric Cumulus Clouds matching Gameplay
    const skyGeo = new THREE.SphereGeometry(1, 48, 24);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0b5ec9) },
            bottomColor: { value: new THREE.Color(0x9be2ff) },
            exponent: { value: 0.55 },
            sunDirection: { value: sun.clone() },
            starIntensity: { value: 0.0 },
            uTime: { value: 0.0 }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_Position.z = gl_Position.w;
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
            void main() {
                vec3 dir = normalize(vWorldPosition);
                vec3 sunDir = normalize(sunDirection);
                float h = dir.y;
                float sunGlow = max(0.0, dot(dir, sunDir));
                vec3 skyColor = (h >= 0.0) ? mix(bottomColor, topColor, pow(h, exponent)) : mix(bottomColor, vec3(0.003, 0.015, 0.035), pow(clamp(-h * 4.5, 0.0, 1.0), 0.7));
                if (h >= 0.0) {
                    float horizonGlow = pow(1.0 - h, 3.5);
                    skyColor += vec3(1.0, 0.88, 0.68) * pow(sunGlow, 3.0) * 0.42 * (0.5 + 0.5 * horizonGlow);
                }
                float cloudVis = smoothstep(0.015, 0.14, h);
                if (cloudVis > 0.001 && h > 0.01) {
                    vec2 cloudUV = dir.xz / (h + 0.13);
                    vec2 wind = vec2(uTime * 0.012, uTime * 0.005);
                    float baseN = fbmCloud(cloudUV * 0.65 + wind);
                    float detailN = fbmCloud(cloudUV * 1.85 - wind * 1.4);
                    float cloudShape = baseN * 0.72 + detailN * 0.28;
                    float cloudDensity = smoothstep(0.47, 0.72, cloudShape);
                    if (cloudDensity > 0.001) {
                        vec2 sunStep = normalize(sunDir.xz + vec2(0.0001)) * 0.16;
                        float shadowSample = fbmCloud((cloudUV + sunStep) * 0.65 + wind);
                        float selfShadow = clamp((shadowSample - cloudShape) * 3.2 + 0.5, 0.0, 1.0);
                        float topLight = clamp(1.0 - selfShadow * 0.75 + detailN * 0.25, 0.0, 1.0);
                        float mieLining = pow(sunGlow, 8.0) * (1.0 - cloudDensity * 0.5) * 0.65;
                        vec3 cloudCol = mix(vec3(0.62, 0.71, 0.82), vec3(1.0, 0.98, 0.94), topLight) + vec3(1.0, 0.90, 0.70) * mieLining;
                        cloudCol = mix(bottomColor * 1.04, cloudCol, 0.35 + 0.65 * smoothstep(0.015, 0.22, h));
                        skyColor = mix(skyColor, cloudCol, cloudDensity * cloudVis * 0.92);
                    }
                }
                skyColor += vec3(1.0, 0.96, 0.86) * smoothstep(0.9982, 0.9997, sunGlow) * 2.2;
                skyColor += vec3(1.0, 0.88, 0.62) * pow(sunGlow, 18.0) * 0.38;
                skyColor += vec3(1.0, 0.82, 0.55) * pow(sunGlow, 4.5) * 0.14;
                gl_FragColor = vec4(skyColor, 1.0);
            }
        `,
        side: THREE.BackSide,
        depthWrite: false
    });
    sky = new THREE.Mesh(skyGeo, skyMat);
    sky.scale.setScalar(35000);
    scene.add(sky);

    // Next-Gen Bathymetric Tropical Ocean Plane with Reefs, Shore Foam & Horizon Curvature
    const waterNormalsTexture = new THREE.TextureLoader().load("waternormals.jpg", function (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
    });

    const waterGeometry = new THREE.CircleGeometry(7600, 180);
    water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: waterNormalsTexture,
        sunDirection: sun,
        sunColor: 0xffe6b8,
        waterColor: 0x004e75,
        distortionScale: 1.8,
        alpha: 0.98,
        fog: scene.fog !== undefined
    });
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 120.0, 0); // Sea level at Y = 120.0m
    water.material.side = THREE.DoubleSide;
    water.material.transparent = true;

    // Inject planetary curvature & bathymetric reef/foam shader into water
    const cameraPosUniform = { value: new THREE.Vector3() };
    water.material.uniforms["cameraPos"] = cameraPosUniform;
    water.material.uniforms["heightmapTexture"] = { value: null };
    water.material.uniforms["hmBounds"] = hmBoundsUniform;
    water.material.vertexShader = `
        uniform vec3 cameraPos;
    ` + water.material.vertexShader;

    water.material.vertexShader = water.material.vertexShader.replace(
        "vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
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

    water.material.fragmentShader = `
        uniform vec3 cameraPos;
        uniform sampler2D heightmapTexture;
        uniform vec3 hmBounds;
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
        "gl_FragColor = vec4( outgoingLight, alpha );",
        `float distAlpha = alpha;
         vec3 finalColor = outgoingLight;
         vec2 wPosMod = mod(worldPosition.xz, 4096.0);
         if (eye.y >= worldPosition.y) {
             float waterDepth = 25.5;
             vec2 hmUV = (worldPosition.xz - (hmBounds.xy - vec2(hmBounds.z * 0.5))) / hmBounds.z;
             if (hmUV.x > 0.002 && hmUV.x < 0.998 && hmUV.y > 0.002 && hmUV.y < 0.998) {
                 float hmSample = texture2D(heightmapTexture, hmUV).r * 25.5;
                 float hmEdge = smoothstep(0.002, 0.04, hmUV.x) * smoothstep(0.998, 0.96, hmUV.x)
                              * smoothstep(0.002, 0.04, hmUV.y) * smoothstep(0.998, 0.96, hmUV.y);
                 waterDepth = mix(25.5, hmSample, hmEdge);
             }

             vec3 sunDirN = normalize(sunDirection);
             vec3 viewDir = normalize(eye - worldPosition.xyz);
             float NdotV  = clamp(dot(surfaceNormal, viewDir), 0.0, 1.0);
             float waveRipple = 0.84 + 0.42 * clamp(dot(surfaceNormal, sunDirN), 0.0, 1.0);
             float physFresnel = 0.030 + 0.35 * pow(1.0 - NdotV, 4.5);

             vec3 ultraShallowTurq = vec3(0.018, 0.62, 0.68);
             vec3 midLagoonCyan    = vec3(0.012, 0.30, 0.50);
             vec3 deepRoyalCobalt  = vec3(0.008, 0.072, 0.235);

             vec3 waterBody = mix(ultraShallowTurq, midLagoonCyan, smoothstep(1.2, 4.8, waterDepth));
             waterBody      = mix(waterBody, deepRoyalCobalt, smoothstep(4.2, 11.0, waterDepth));

             float reefMacro  = wFbm(wPosMod * 0.048);
             float reefDetail = wFbm(wPosMod * 0.19 + 5.7);
             float reefPatch  = smoothstep(0.43, 0.67, reefMacro * 0.68 + reefDetail * 0.32)
                              * smoothstep(0.55, 1.75, waterDepth)
                              * (1.0 - smoothstep(5.0, 8.8, waterDepth));
             vec3 darkCoralReef = mix(vec3(0.008, 0.052, 0.082), vec3(0.018, 0.115, 0.135), reefDetail);
             waterBody = mix(waterBody, darkCoralReef, reefPatch * 0.82);

             finalColor = mix(waterBody * waveRipple, outgoingLight, physFresnel);

             vec3 halfVec = normalize(sunDirN + viewDir);
             float NdotH = max(0.0, dot(surfaceNormal, halfVec));
             finalColor += vec3(1.0, 0.90, 0.66) * (pow(NdotH, 260.0) * 2.4 + pow(NdotH, 72.0) * 0.20);

             float foamNoise = wFbm(wPosMod * 0.62 + vec2(time * 0.48, -time * 0.34));
             float lapWave   = 0.5 + 0.5 * sin(waterDepth * 9.0 - time * 4.8 + foamNoise * 3.2);
             float shoreLace = smoothstep(0.62, 0.06, waterDepth)
                             * smoothstep(0.0, 0.05, waterDepth)
                             * smoothstep(0.42, 0.78, foamNoise * 0.68 + lapWave * 0.46);

             float breakerWave = 0.5 + 0.5 * sin(waterDepth * 5.2 - time * 3.4 + reefDetail * 4.5);
             float reefBreaker = smoothstep(2.4, 1.45, waterDepth)
                               * smoothstep(0.75, 1.35, waterDepth)
                               * smoothstep(0.62, 0.86, foamNoise * 0.55 + breakerWave * 0.50)
                               * (0.45 + 0.55 * reefPatch);

             float surfWhite = clamp(shoreLace * 0.68 + reefBreaker * 0.52, 0.0, 0.85);
             finalColor = mix(finalColor, vec3(0.96, 0.99, 1.0), surfWhite);

             float opticalAlpha = 1.0 - exp(-waterDepth * 0.52);
             distAlpha = clamp(mix(opticalAlpha, alpha, smoothstep(3.2, 8.5, waterDepth)), 0.0, alpha);
             distAlpha = max(distAlpha, surfWhite * 0.72);

             // Sea-hugging Boundary Mist Ring around the 3rd Concentric Ring of Plato's Atlantis (r = 2400m .. 2880m)
             float rAtlantisW = length(worldPosition.xz - vec2(-10800.0, -10600.0));
             float seaMistBand = smoothstep(2400.0, 2530.0, rAtlantisW) * (1.0 - smoothstep(2740.0, 2880.0, rAtlantisW));
             if (seaMistBand > 0.001) {
                 float mistSwirl = wFbm(wPosMod * 0.014 + vec2(time * 0.18, -time * 0.12));
                 float mistAmt = seaMistBand * (0.62 + 0.38 * mistSwirl);
                 finalColor = mix(finalColor, vec3(0.84, 0.94, 0.99), mistAmt * 0.88);
                 distAlpha = max(distAlpha, mistAmt * 0.95);
             }
         }
         float distH = length(worldPosition.xz - cameraPos.xz);
         if (eye.y >= worldPosition.y) {
             finalColor += vec3(0.20, 0.70, 1.0) * smoothstep(4200.0, 7200.0, distH) * 1.5;
         }
         float horizonAlpha = 1.0 - smoothstep(7100.0, 7500.0, distH);
         gl_FragColor = vec4( finalColor, distAlpha * horizonAlpha );`
    );

    scene.add(water);

    setCryingProgress(38, "🌍 CRYING... Generazione Mappa Planetaria 3D (Terra/Luna)...");
    await nextFrame();

    // Marching Cubes Voxel Terrain (Planetary Engine with Height 96 voxels)
    terrain = new VoxelTerrain(scene, 256, 96, 256, 3.0);

    setCryingProgress(54, "👑 CRYING... Erezione Capitale di Atlantide (Cleito) & 4 Mura...");
    await nextFrame();

    createAtlantisMistRing(scene);
    atlantisCapital = createAtlantisCapital(scene, terrain);

    // Auto-load custom map from localStorage if present before building initial chunks
    try {
        const savedMap = localStorage.getItem("cryworld_custom_map");
        if (savedMap) {
            const parsed = JSON.parse(savedMap);
            terrain.importMapData(parsed);
            showToast("Mappa personalizzata caricata!");
        }
    } catch (e) {
        console.warn("Could not load custom map:", e);
    }

    setCryingProgress(72, "🏔️ CRYING... Scolpitura Sorgenti del Tigri, Eufrate & Monte Ararat...");
    await nextFrame();

    terrain.updateChunksAroundPlayer(playerPos, 1050, 340);

    setCryingProgress(88, "🌊 CRYING... Calcolo Batimetria Costiera & Strumenti Editor...");
    await nextFrame();

    heightmapData = new Uint8Array(768 * 768);
    updateHeightmap();

    // Initialize World Realism System (5-Min Day/Night Cycle, Spawn Campfire, Twin Springs, Regional Wildlife)
    worldRealism = new WorldRealismSystem(scene, terrain, { isEditor: true });
    worldRealism.refreshCampfireHeight();
    initEditorCompass();

    // Foliage Group
    foliageGroup = new THREE.Group();
    scene.add(foliageGroup);

    // Load any saved foliage
    try {
        const savedFoliage = localStorage.getItem("cryworld_custom_foliage");
        if (savedFoliage) {
            const parsedFoliage = JSON.parse(savedFoliage);
            if (Array.isArray(parsedFoliage)) {
                for (const item of parsedFoliage) {
                    spawnFoliageItem(item.x, item.y, item.z, item.type, false);
                }
            }
        }
    } catch (e) {}

    // 3D Holographic Cursor (Indicator Ring + Subtle Disc)
    const cursorGroup = new THREE.Group();
    
    // Outer Ring
    const ringGeo = new THREE.RingGeometry(0.94, 1.0, 64);
    const ringMat = new THREE.MeshBasicMaterial({
        color: toolColors.sculpt,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthTest: false
    });
    brushRing = new THREE.Mesh(ringGeo, ringMat);
    cursorGroup.add(brushRing);

    // Inner Glowing Translucent Disc
    const discGeo = new THREE.CircleGeometry(0.93, 48);
    const discMat = new THREE.MeshBasicMaterial({
        color: toolColors.sculpt,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.18,
        depthTest: false
    });
    brushDisc = new THREE.Mesh(discGeo, discMat);
    cursorGroup.add(brushDisc);

    cursorGroup.rotation.x = -Math.PI / 2;
    cursorGroup.visible = false;
    scene.add(cursorGroup);

    setupEvents();
    setupUI();
    updateToolState();
    updateModCount();

    window.addEventListener("resize", onWindowResize);
    renderer.render(scene, camera);
    finishCryingLoader();
    requestAnimationFrame(animate);
}

// ==========================================
// CONTROLS & EVENT LISTENERS
// ==========================================
function setupEvents() {
    // Blocker / Start Editing Button
    btnStartEditing.addEventListener("click", () => {
        if (!isEditorWorldLoaded) return;
        enterPointerLock();
    });

    blocker.addEventListener("click", (e) => {
        if (!isEditorWorldLoaded) return;
        if (e.target.tagName !== "BUTTON") {
            enterPointerLock();
        }
    });

    // Pointer Lock Change Detection
    document.addEventListener("pointerlockchange", () => {
        isPointerLocked = (document.pointerLockElement === canvas);
        if (isPointerLocked) {
            blocker.classList.add("hidden");
            editorModal.classList.add("hidden");
        }
    });

    // Keyboard Input
    window.addEventListener("keydown", (e) => {
        keyStates[e.code] = true;

        // Quick Hotbar Slots 1..8
        if (e.code === "Digit1") selectHotbarSlot(1);
        if (e.code === "Digit2") selectHotbarSlot(2);
        if (e.code === "Digit3") selectHotbarSlot(3);
        if (e.code === "Digit4") selectHotbarSlot(4);
        if (e.code === "Digit5") selectHotbarSlot(5);
        if (e.code === "Digit6") selectHotbarSlot(6);
        if (e.code === "Digit7") selectHotbarSlot(7);
        if (e.code === "Digit8") selectHotbarSlot(8);

        // Radius Adjustments: '[' and ']'
        if (e.key === "[" || e.key === "{") {
            adjustRadius(-3);
        }
        if (e.key === "]" || e.key === "}") {
            adjustRadius(+3);
        }

        // Strength Adjustments: '-' and '+'
        if (e.key === "-" || e.key === "_") {
            adjustStrength(-0.2);
        }
        if (e.key === "+" || e.key === "=") {
            adjustStrength(+0.2);
        }

        // Toggle Flight / Camera Mode: 'F'
        if (e.code === "KeyF") {
            toggleCameraMode();
        }

        // Top-Down View Toggle: 'T'
        if (e.code === "KeyT") {
            toggleTopDownView();
        }

        // Quick Play Map: 'P'
        if (e.code === "KeyP") {
            quickPlay();
        }

        // Fast Travel to Key Planetary Hubs: F6 / F7 / F8 / F9
        if (e.code === "F6") {
            e.preventDefault();
            window.teleportEditorToRegion("tigris");
        } else if (e.code === "F7") {
            e.preventDefault();
            window.teleportEditorToRegion("gibraltar");
        } else if (e.code === "F8") {
            e.preventDefault();
            window.teleportEditorToRegion("atlantis");
        } else if (e.code === "F9") {
            e.preventDefault();
            window.teleportEditorToRegion("borgosesia");
        } else if (e.code === "KeyN" && worldRealism) {
            const tInfo = worldRealism.advanceTimeHours(3.0);
            showToast(`Ciclo Giorno/Notte: ${tInfo.text} (${tInfo.label})`);
        }

        // Quick Save: Ctrl + S
        if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
            e.preventDefault();
            quickSave();
        }

        // ESC opens/toggles Modal Menu
        if (e.code === "Escape") {
            if (!editorModal.classList.contains("hidden")) {
                closeModal();
            } else if (isPointerLocked) {
                document.exitPointerLock();
                openModal();
            } else {
                openModal();
            }
        }
    });

    window.addEventListener("keyup", (e) => {
        keyStates[e.code] = false;
    });

    // Mouse Movement
    window.addEventListener("mousemove", (e) => {
        if (isPointerLocked) {
            camYaw -= e.movementX * 0.0022;
            camPitch -= e.movementY * 0.0022;
            camPitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, camPitch));
        } else if (isRightMouseDown) {
            // Drag look when pointer is unlocked
            camYaw -= e.movementX * 0.0035;
            camPitch -= e.movementY * 0.0035;
            camPitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, camPitch));
        }
    });

    // Mouse Clicks for Editing
    window.addEventListener("mousedown", (e) => {
        // Prevent editing when clicking on UI cards/buttons
        if (e.target.closest(".hud-card") || e.target.closest("#brush-hud") || e.target.closest("#hotbar-container") || e.target.closest("#editor-modal")) {
            return;
        }

        if (!isPointerLocked && blocker.classList.contains("hidden") && editorModal.classList.contains("hidden")) {
            if (e.button === 0) {
                enterPointerLock();
            }
        }

        if (e.button === 0) {
            isLeftMouseDown = true;
            if (crosshair) crosshair.classList.add("active");
            applyActiveTool("primary");
        } else if (e.button === 2) {
            isRightMouseDown = true;
            if (crosshair) crosshair.classList.add("active");
            applyActiveTool("secondary");
        }
    });

    window.addEventListener("mouseup", (e) => {
        if (e.button === 0) isLeftMouseDown = false;
        if (e.button === 2) isRightMouseDown = false;
        if (!isLeftMouseDown && !isRightMouseDown && crosshair) {
            crosshair.classList.remove("active");
        }
    });

    // Mouse Wheel: Adjusts Brush Radius smoothly
    window.addEventListener("wheel", (e) => {
        if (camMode === "topdown") {
            // Zoom in top-down
            playerPos.y = Math.max(150, Math.min(1800, playerPos.y + e.deltaY * 0.8));
        } else {
            // Adjust radius on the fly!
            const dir = e.deltaY < 0 ? 2 : -2;
            adjustRadius(dir);
        }
    }, { passive: true });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
}

function enterPointerLock() {
    canvas.requestPointerLock();
}

function openModal() {
    editorModal.classList.remove("hidden");
    if (document.exitPointerLock) document.exitPointerLock();
}

function closeModal() {
    editorModal.classList.add("hidden");
    enterPointerLock();
}

// ==========================================
// UI INTERACTION & TOOL SELECTION
// ==========================================
function setupUI() {
    // Hotbar Slot Clicks
    document.querySelectorAll(".hotbar-slot").forEach(slot => {
        slot.addEventListener("click", () => {
            const slotNum = parseInt(slot.dataset.slot);
            selectHotbarSlot(slotNum);
        });
    });

    // Top Right Actions
    btnQuickPlay.addEventListener("click", quickPlay);
    btnQuickSave.addEventListener("click", quickSave);
    btnOpenMenu.addEventListener("click", openModal);

    // Modal Actions
    modalResume.addEventListener("click", closeModal);
    modalPlay.addEventListener("click", quickPlay);
    modalExport.addEventListener("click", exportMap);
    modalImport.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", importMap);
    modalReset.addEventListener("click", resetMap);

    // Brush Pills Buttons
    btnRadMinus.addEventListener("click", () => adjustRadius(-3));
    btnRadPlus.addEventListener("click", () => adjustRadius(+3));
    btnStrMinus.addEventListener("click", () => adjustStrength(-0.2));
    btnStrPlus.addEventListener("click", () => adjustStrength(+0.2));

    // Sub-option select
    selectSuboption.addEventListener("change", (e) => {
        if (currentTool === "foliage") foliageType = e.target.value;
        if (currentTool === "stamp") stampType = e.target.value;
    });

    // Camera Mode Pill click
    btnToggleCam.addEventListener("click", toggleCameraMode);
}

function selectHotbarSlot(num) {
    const slots = document.querySelectorAll(".hotbar-slot");
    slots.forEach(s => s.classList.remove("active"));
    const activeSlot = document.querySelector(`.hotbar-slot[data-slot="${num}"]`);
    if (activeSlot) {
        activeSlot.classList.add("active");
        currentTool = activeSlot.dataset.tool;
        updateToolState();
    }
}

function updateToolState() {
    const color = toolColors[currentTool] || 0x00d2ff;
    if (brushRing && brushRing.material) brushRing.material.color.setHex(color);
    if (brushDisc && brushDisc.material) brushDisc.material.color.setHex(color);

    // Update Suboption Pill & Hint Text
    if (currentTool === "sculpt") {
        pillSuboption.style.display = "none";
        toolHint.textContent = "Click SX: Alza terreno | Click DX: Scava | [ ]: Raggio | - +: Forza";
    } else if (currentTool === "flatten") {
        pillSuboption.style.display = "none";
        toolHint.textContent = "Click SX: Crea plateau alla quota del mirino | [ ]: Raggio";
    } else if (currentTool === "smooth") {
        pillSuboption.style.display = "none";
        toolHint.textContent = "Click SX: Leviga creste e ammorbidisce pendii | [ ]: Raggio";
    } else if (currentTool === "foliage") {
        pillSuboption.style.display = "flex";
        lblSuboption.textContent = "ELEMENTO:";
        selectSuboption.innerHTML = `
            <option value="palm">🌴 Palma Tropicale</option>
            <option value="pine">🌲 Pino di Montagna</option>
            <option value="rock">🪨 Masso di Granito</option>
            <option value="bush">🌱 Cespuglio Alpino</option>
        `;
        selectSuboption.value = foliageType;
        toolHint.textContent = "Click SX: Pianta vegetazione | Click DX: Rimuovi alberi";
    } else if (currentTool === "stamp") {
        pillSuboption.style.display = "flex";
        lblSuboption.textContent = "ARCHETIPO:";
        selectSuboption.innerHTML = `
            <option value="atoll">⭕ Atollo con Laguna</option>
            <option value="volcano">🌋 Vulcano con Caldera</option>
            <option value="mountain">🏔️ Catena Montuosa</option>
            <option value="stack">🪨 Faraglione Marino</option>
        `;
        selectSuboption.value = stampType;
        toolHint.textContent = "Click SX: Timbro completo sul terreno | P: Gioca subito";
    } else if (currentTool === "beach") {
        pillSuboption.style.display = "none";
        toolHint.textContent = "Click SX: Sagoma spiaggia idilliaca verso il mare (120m)";
    } else if (currentTool === "eraser") {
        pillSuboption.style.display = "none";
        toolHint.textContent = "Click SX: Ripristina terreno procedurale naturale incontaminato";
    } else if (currentTool === "view") {
        pillSuboption.style.display = "none";
        toolHint.textContent = "Click SX / F: Alterna Volo Drone / A Piedi / Top-Down";
    }
}

function adjustRadius(delta) {
    brushRadius = Math.max(3, Math.min(80, brushRadius + delta));
    valRadius.textContent = `${brushRadius} m`;
}

function adjustStrength(delta) {
    brushStrength = Math.max(0.2, Math.min(3.0, Math.round((brushStrength + delta) * 10) / 10));
    valStrength.textContent = brushStrength.toFixed(1);
}

function toggleCameraMode() {
    if (camMode === "drone") {
        // Switch to grounded FPS walk mode
        camMode = "walk";
        camModeText.textContent = "A PIEDI [F]";
        flyInfo.textContent = "🚶 WALKING";
        flyInfo.style.color = "#00e676";
        showToast("Modalità Esplorazione a Piedi!");
    } else if (camMode === "walk") {
        // Switch to freecam drone flight
        camMode = "drone";
        camModeText.textContent = "VOLO DRONE [F]";
        flyInfo.textContent = "🛸 DRONE FLY";
        flyInfo.style.color = "#ffeb3b";
        showToast("Modalità Volo Libero Drone!");
    } else if (camMode === "topdown") {
        // Return from top-down to drone
        camMode = "drone";
        playerPos.copy(savedDronePos);
        camPitch = savedDronePitch;
        camModeText.textContent = "VOLO DRONE [F]";
        flyInfo.textContent = "🛸 DRONE FLY";
        flyInfo.style.color = "#ffeb3b";
        showToast("Visuale Ripristinata!");
    }
}

function toggleTopDownView() {
    if (camMode !== "topdown") {
        savedDronePos.copy(playerPos);
        savedDronePitch = camPitch;
        camMode = "topdown";
        playerPos.set(playerPos.x, 680, playerPos.z);
        camPitch = -Math.PI / 2 + 0.01;
        camModeText.textContent = "TOP-DOWN [T]";
        flyInfo.textContent = "📐 TOP-DOWN";
        flyInfo.style.color = "#00d2ff";
        showToast("Visuale Mappa Tattica Top-Down!");
    } else {
        toggleCameraMode();
    }
}

// ==========================================
// LEVEL EDITING TOOLS IMPLEMENTATION
// ==========================================
function applyActiveTool(actionType = "primary") {
    if (!hasTarget) return;
    const hit = brushTargetPos;

    if (currentTool === "sculpt") {
        const mode = (actionType === "primary" && !keyStates["ShiftLeft"]) ? "add" : "remove";
        terrain.modifyTerrain(hit, brushRadius, mode);
    } else if (currentTool === "flatten") {
        flattenTerrain(hit, brushRadius, hit.y);
    } else if (currentTool === "smooth") {
        smoothTerrain(hit, brushRadius);
    } else if (currentTool === "foliage") {
        if (actionType === "primary") {
            paintFoliage(hit, brushRadius, foliageType);
        } else {
            clearFoliage(hit, brushRadius);
        }
    } else if (currentTool === "stamp") {
        stampIslandPreset(hit, stampType);
    } else if (currentTool === "beach") {
        sculptBeach(hit, brushRadius);
    } else if (currentTool === "eraser") {
        eraseTerrain(hit, brushRadius);
    } else if (currentTool === "view") {
        toggleCameraMode();
    }

    if (currentTool !== "foliage" && currentTool !== "view") {
        updateHeightmap(hit, currentTool === "stamp" ? 190.0 : brushRadius);
    }

    updateModCount();
    saveToLocalStorage();
}

function recenterEditorHeightmap(cx, cz) {
    hmCenterX = Math.round(cx / 100.0) * 100.0;
    hmCenterZ = Math.round(cz / 100.0) * 100.0;
    hmBoundsUniform.value.set(hmCenterX, hmCenterZ, 5222.4);
    updateHeightmap();
}

window.teleportEditorToRegion = function(regionKey) {
    const destinations = {
        tigris: {
            x: 14200.0, y: 178.0, z: -13775.0, yaw: 3.08, pitch: -0.22,
            label: "🏔️ SORGENTI DEL TIGRI E DELL'EUFRATE (Mesopotamia)"
        },
        gibraltar: {
            x: -2100.0, y: 175.0, z: -12520.0, yaw: 1.57, pitch: -0.18,
            label: "🏛️ COLONNE D'ERCOLE (Stretto di Gibilterra)"
        },
        atlantis: {
            x: -10722.0, y: 215.0, z: -10845.0, yaw: 0.42, pitch: -0.24,
            label: "👑 CLEITO — CAPITALE DI ATLANTIDE (Centro Oceano Atlantico)"
        },
        borgosesia: {
            x: 2950.0, y: 174.0, z: -15275.0, yaw: 0.72, pitch: -0.20,
            label: "🌲 BORGOSESIA — VALSESIA, FIUME SESIA & MONTE ROSA (Piemonte, Italia)"
        }
    };
    const dest = destinations[regionKey] || destinations.tigris;
    playerPos.set(dest.x, dest.y, dest.z);
    camYaw = dest.yaw;
    camPitch = dest.pitch;
    recenterEditorHeightmap(dest.x, dest.z);
    if (terrain) {
        terrain.updateChunksAroundPlayer(playerPos, 540, true);
        terrain.update();
    }
    showToast(`Viaggio Rapido: ${dest.label}`);
};

function updateHeightmap(nearPos, radius) {
    if (!terrain || !heightmapData) return;
    const width = 768;
    const depth = 768;
    const minWorldX = hmCenterX - 2611.2;
    const minWorldZ = hmCenterZ - 2611.2;
    const texelSize = 6.8;
    const scale = 3.0;

    let minX = 0, maxX = width - 1;
    let minZ = 0, maxZ = depth - 1;

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
                for (let y = 44; y >= 0; y--) {
                    const d0 = terrain.getDensity(ivx, y, ivz);
                    if (d0 >= 0.0) {
                        if (y < 44) {
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
                surfaceY = terrain.getEstimatedSurfaceHeight(vx, vz);
            }

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
            water.material.uniforms["heightmapTexture"] = { value: heightmapTexture };
        }
    } else {
        heightmapTexture.needsUpdate = true;
    }
}

function flattenTerrain(center, radius, targetY) {
    const rVox = Math.ceil(radius / terrain.voxelScale);
    const cx = Math.round(center.x / terrain.voxelScale);
    const cyTarget = Math.round(targetY / terrain.voxelScale);
    const cz = Math.round(center.z / terrain.voxelScale);

    for (let x = cx - rVox; x <= cx + rVox; x++) {
        for (let z = cz - rVox; z <= cz + rVox; z++) {
            const dist = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)) * terrain.voxelScale;
            if (dist > radius) continue;

            const t = Math.max(0.0, 1.0 - dist / radius);
            const blend = t * brushStrength;

            for (let y = terrain.minY + 1; y < terrain.maxY; y++) {
                if (y <= cyTarget) {
                    const oldVal = terrain.getDensity(x, y, z);
                    terrain.setDensity(x, y, z, THREE.MathUtils.lerp(oldVal, 1.0, blend));
                } else {
                    const oldVal = terrain.getDensity(x, y, z);
                    terrain.setDensity(x, y, z, THREE.MathUtils.lerp(oldVal, -1.0, blend));
                }
            }
        }
    }
}

function smoothTerrain(center, radius) {
    const rVox = Math.ceil(radius / terrain.voxelScale);
    const cx = Math.round(center.x / terrain.voxelScale);
    const cz = Math.round(center.z / terrain.voxelScale);

    for (let x = cx - rVox; x <= cx + rVox; x++) {
        for (let z = cz - rVox; z <= cz + rVox; z++) {
            const dist = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)) * terrain.voxelScale;
            if (dist > radius) continue;

            for (let y = terrain.minY + 2; y < terrain.maxY - 1; y++) {
                const current = terrain.getDensity(x, y, z);
                const avg = (
                    terrain.getDensity(x + 1, y, z) + terrain.getDensity(x - 1, y, z) +
                    terrain.getDensity(x, y + 1, z) + terrain.getDensity(x, y - 1, z) +
                    terrain.getDensity(x, y, z + 1) + terrain.getDensity(x, y, z - 1)
                ) / 6.0;
                terrain.setDensity(x, y, z, THREE.MathUtils.lerp(current, avg, 0.45 * brushStrength));
            }
        }
    }
}

function sculptBeach(center, radius) {
    // Shapes an idyllic gentle shoreline towards sea level Y = 120.0m
    const rVox = Math.ceil(radius / terrain.voxelScale);
    const cx = Math.round(center.x / terrain.voxelScale);
    const cz = Math.round(center.z / terrain.voxelScale);
    const targetSeaY = 40; // Y = 120m

    for (let x = cx - rVox; x <= cx + rVox; x++) {
        for (let z = cz - rVox; z <= cz + rVox; z++) {
            const dist = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)) * terrain.voxelScale;
            if (dist > radius) continue;

            const t = dist / radius; // 0 at center, 1 at edge
            // Gentle parabolic rise from sea level up to beach crest (120m to 125m)
            const targetBeachY = targetSeaY + Math.pow(t, 1.8) * 2.2;

            for (let y = terrain.minY + 2; y < terrain.maxY; y++) {
                if (y <= targetBeachY) {
                    terrain.setDensity(x, y, z, 1.0);
                } else {
                    terrain.setDensity(x, y, z, -1.0);
                }
            }
        }
    }
    showToast("Spiaggia idilliaca modellata!");
}

function stampIslandPreset(center, type) {
    const cx = center.x;
    const cz = center.z;

    if (type === "atoll") {
        // Stamp circular coral atoll with shallow lagoon inside
        const atollRadius = 80.0;
        const ringThickness = 24.0;
        for (let angle = 0; angle < Math.PI * 2; angle += 0.08) {
            const px = cx + Math.cos(angle) * atollRadius;
            const pz = cz + Math.sin(angle) * atollRadius;
            terrain.modifyTerrain(new THREE.Vector3(px, 122.5, pz), ringThickness, "add");
        }
        // Shallow sandbar in center
        terrain.modifyTerrain(new THREE.Vector3(cx, 118.0, cz), 35.0, "add");
        showToast("⭕ Archetipo Atollo Corallino Creato!");
    } else if (type === "volcano") {
        // Conical volcano with central crater bowl
        terrain.modifyTerrain(new THREE.Vector3(cx, 155.0, cz), 95.0, "add");
        terrain.modifyTerrain(new THREE.Vector3(cx, 168.0, cz), 34.0, "remove");
        showToast("🌋 Archetipo Vulcano con Caldera Creato!");
    } else if (type === "mountain") {
        // Sharp alpine mountain peak
        terrain.modifyTerrain(new THREE.Vector3(cx, 175.0, cz), 75.0, "add");
        showToast("🏔️ Archetipo Picco Alpino Creato!");
    } else if (type === "stack") {
        // Sea stack crag rising steep out of ocean
        terrain.modifyTerrain(new THREE.Vector3(cx, 142.0, cz), 30.0, "add");
        showToast("🪨 Archetipo Faraglione Marino Creato!");
    }
}

function eraseTerrain(center, radius) {
    const rVox = Math.ceil(radius / terrain.voxelScale);
    const cx = Math.round(center.x / terrain.voxelScale);
    const cz = Math.round(center.z / terrain.voxelScale);

    for (let x = cx - rVox; x <= cx + rVox; x++) {
        for (let z = cz - rVox; z <= cz + rVox; z++) {
            for (let y = terrain.minY; y < terrain.maxY; y++) {
                const key = `${x},${y},${z}`;
                if (terrain.modifiedVoxels.has(key)) {
                    terrain.modifiedVoxels.delete(key);
                }
            }
            terrain.modifiedColumns.delete(`${x},${z}`);
        }
    }
    for (const chunk of terrain.loadedChunks.values()) {
        chunk.dirty = true;
    }
    showToast("Terreno ripristinato allo stato naturale!");
}

// ==========================================
// FOLIAGE SYSTEM
// ==========================================
function paintFoliage(center, radius, type) {
    const count = Math.max(1, Math.floor(radius * 0.35));
    let placed = 0;

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius;
        const wx = center.x + Math.cos(angle) * dist;
        const wz = center.z + Math.sin(angle) * dist;
        const groundY = terrain.getSurfaceHeight(new THREE.Vector3(wx, 0, wz), 260.0);

        if (groundY > 120.2 && groundY < 235.0) {
            spawnFoliageItem(wx, groundY, wz, type, true);
            placed++;
        }
    }
    if (placed > 0) {
        saveFoliageToLocalStorage();
        showToast(`Vegetazione piantata: +${placed} elementi!`);
    }
}

function clearFoliage(center, radius) {
    const rSq = radius * radius;
    let removed = 0;

    for (let i = foliageInstances.length - 1; i >= 0; i--) {
        const inst = foliageInstances[i];
        const dx = inst.x - center.x;
        const dz = inst.z - center.z;
        if (dx * dx + dz * dz <= rSq) {
            if (inst.meshGroup) {
                foliageGroup.remove(inst.meshGroup);
            }
            foliageInstances.splice(i, 1);
            removed++;
        }
    }
    if (removed > 0) {
        saveFoliageToLocalStorage();
        showToast(`Vegetazione rimossa: -${removed} elementi!`);
    }
}

function spawnFoliageItem(x, y, z, type, save = true) {
    const group = new THREE.Group();

    if (type === "palm") {
        // Tropical coconut palm with graceful curved trunk & arching frond crown
        const leanX = (Math.random() - 0.5) * 1.1;
        const leanZ = (Math.random() - 0.5) * 1.1;
        const palmCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, -0.1, 0),
            new THREE.Vector3(leanX * 0.35, 2.2, leanZ * 0.35),
            new THREE.Vector3(leanX * 0.85, 4.6, leanZ * 0.85),
            new THREE.Vector3(leanX, 6.6, leanZ)
        ]);
        const trunkGeo = new THREE.TubeGeometry(palmCurve, 9, 0.24, 7, false);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9c8874, roughness: 0.92 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        group.add(trunk);

        const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e8b3c, roughness: 0.65, side: THREE.DoubleSide });
        for (let i = 0; i < 9; i++) {
            const ang = (i / 9) * Math.PI * 2;
            const frondCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(leanX, 6.6, leanZ),
                new THREE.Vector3(leanX + Math.cos(ang) * 1.6, 6.95, leanZ + Math.sin(ang) * 1.6),
                new THREE.Vector3(leanX + Math.cos(ang) * 3.2, 5.75, leanZ + Math.sin(ang) * 3.2)
            ]);
            const frondGeo = new THREE.TubeGeometry(frondCurve, 6, 0.14, 4, false);
            frondGeo.scale(1.0, 0.25, 1.0);
            group.add(new THREE.Mesh(frondGeo, frondMat));
        }
    } else if (type === "pine") {
        // Realistic Tropical Broadleaf Tree with forked organic hardwood trunk & layered botanical bough crowns
        const barkMat = new THREE.MeshStandardMaterial({ color: 0x6b5846, roughness: 0.92 });
        const canopyDarkMat = new THREE.MeshStandardMaterial({ color: 0x2a6928, roughness: 0.76 });
        const canopySunMat  = new THREE.MeshStandardMaterial({ color: 0x3f8832, roughness: 0.74 });

        const trunkCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, -0.15, 0),
            new THREE.Vector3(0.18, 1.6, -0.10),
            new THREE.Vector3(-0.08, 3.2, 0.12),
            new THREE.Vector3(0.05, 4.4, 0.02)
        ]);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 8, 0.28, 7, false), barkMat));

        for (let b = 0; b < 4; b++) {
            const ang = (b / 4) * Math.PI * 2 + 0.35;
            const reach = 2.0 + (b % 2) * 0.45;
            const endY = 5.6 + (b % 2) * 0.55;
            const limbCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0.05, 3.6, 0.02),
                new THREE.Vector3(Math.cos(ang) * reach * 0.55, 4.8, Math.sin(ang) * reach * 0.55),
                new THREE.Vector3(Math.cos(ang) * reach, endY, Math.sin(ang) * reach)
            ]);
            group.add(new THREE.Mesh(new THREE.TubeGeometry(limbCurve, 6, 0.13, 6, false), barkMat));

            for (let k = 0; k < 5; k++) {
                const subA = ang + (k - 2) * 0.45;
                const subR = 0.65 + (k % 2) * 0.45;
                const leafCluster = new THREE.Mesh(
                    new THREE.IcosahedronGeometry(0.95 + (k % 2) * 0.22, 1),
                    (k % 2 === 0) ? canopySunMat : canopyDarkMat
                );
                leafCluster.scale.set(1.35, 0.62, 1.25);
                leafCluster.position.set(
                    Math.cos(ang) * reach + Math.cos(subA) * subR,
                    endY + 0.25 + (k % 2) * 0.35,
                    Math.sin(ang) * reach + Math.sin(subA) * subR
                );
                group.add(leafCluster);
            }
        }
        const apexCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55, 1), canopySunMat);
        apexCrown.scale.set(1.45, 0.68, 1.45);
        apexCrown.position.set(0.05, 6.75, 0.02);
        group.add(apexCrown);
    } else if (type === "rock") {
        // Granite boulder
        const scale = 1.2 + Math.random() * 1.6;
        const rockGeo = new THREE.DodecahedronGeometry(scale, 1);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.95, flatShading: true });
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.y = scale * 0.8;
        rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        group.add(rock);
    } else if (type === "bush") {
        // Tropical fern & broadleaf shrub rosette
        const shrubMatA = new THREE.MeshStandardMaterial({ color: 0x2e7830, roughness: 0.78, side: THREE.DoubleSide });
        const shrubMatB = new THREE.MeshStandardMaterial({ color: 0x439436, roughness: 0.75, side: THREE.DoubleSide });
        for (let f = 0; f < 8; f++) {
            const ang = (f / 8) * Math.PI * 2;
            const frond = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.55, 5), (f % 2 === 0) ? shrubMatB : shrubMatA);
            frond.scale.set(1.0, 1.0, 0.22);
            frond.position.set(Math.cos(ang) * 0.48, 0.58, Math.sin(ang) * 0.48);
            frond.rotation.order = "YXZ";
            frond.rotation.y = -ang + Math.PI * 0.5;
            frond.rotation.x = 0.68;
            group.add(frond);
        }
    }

    group.position.set(x, y, z);
    foliageGroup.add(group);

    if (save) {
        foliageInstances.push({ x, y, z, type, meshGroup: group });
    }
}

function saveFoliageToLocalStorage() {
    try {
        const compact = foliageInstances.map(f => ({ x: f.x, y: f.y, z: f.z, type: f.type }));
        localStorage.setItem("cryworld_custom_foliage", JSON.stringify(compact));
    } catch (e) {}
}

// ==========================================
// PERSISTENCE & QUICK PLAY INTEGRATION
// ==========================================
function updateModCount() {
    if (modCounter && terrain) {
        modCounter.textContent = `Mods: ${terrain.modifiedVoxels.size}`;
    }
}

function saveToLocalStorage() {
    if (terrain) {
        const voxels = terrain.exportMapData();
        localStorage.setItem("cryworld_custom_map", JSON.stringify(voxels));
    }
}

function quickSave() {
    saveToLocalStorage();
    saveFoliageToLocalStorage();
    showToast("💾 Mappa salvata con successo!");
}

function quickPlay() {
    saveToLocalStorage();
    saveFoliageToLocalStorage();
    showToast("🎮 Lancio della partita...");
    if (document.exitPointerLock) document.exitPointerLock();
    setTimeout(() => {
        window.location.href = "index.html";
    }, 350);
}

function exportMap() {
    saveToLocalStorage();
    saveFoliageToLocalStorage();

    const mapData = {
        version: 1,
        date: new Date().toISOString(),
        voxels: terrain.exportMapData(),
        foliage: foliageInstances.map(f => ({ x: f.x, y: f.y, z: f.z, type: f.type }))
    };

    const jsonStr = JSON.stringify(mapData);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cryworld_map.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Mappa esportata in cryworld_map.json!");
}

function importMap(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data.voxels) {
                terrain.importMapData(data.voxels);
                updateHeightmap();
                saveToLocalStorage();
            }
            if (data.foliage && Array.isArray(data.foliage)) {
                foliageGroup.clear();
                foliageInstances = [];
                for (const f of data.foliage) {
                    spawnFoliageItem(f.x, f.y, f.z, f.type, true);
                }
                saveFoliageToLocalStorage();
            }
            updateModCount();
            closeModal();
            showToast("Mappa importata con successo!");
        } catch (err) {
            alert("Errore nel file JSON: " + err.message);
        }
    };
    reader.readAsText(file);
}

function resetMap() {
    if (confirm("Vuoi azzerare tutte le modifiche e ripristinare il mondo procedurale naturale?")) {
        localStorage.removeItem("cryworld_custom_map");
        localStorage.removeItem("cryworld_custom_foliage");
        location.reload();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// ANIMATION & GAMEPLAY LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    // 1. Camera & Movement Physics
    if (camMode === "drone") {
        // 6-DOF Drone Freecam Flight
        const speed = (keyStates["ShiftLeft"] || keyStates["ShiftRight"]) ? 300.0 : 100.0;
        const moveVec = new THREE.Vector3();

        if (keyStates["KeyW"]) moveVec.z -= 1;
        if (keyStates["KeyS"]) moveVec.z += 1;
        if (keyStates["KeyA"]) moveVec.x -= 1;
        if (keyStates["KeyD"]) moveVec.x += 1;
        if (keyStates["Space"]) moveVec.y += 1;
        if (keyStates["KeyQ"] || keyStates["KeyC"]) moveVec.y -= 1;

        moveVec.normalize();

        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camYaw, 0, "YXZ"));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, camYaw, 0, "YXZ"));

        playerPos.addScaledVector(forward, -moveVec.z * speed * delta);
        playerPos.addScaledVector(right, moveVec.x * speed * delta);
        playerPos.y += moveVec.y * speed * delta;

        camera.position.copy(playerPos);
        camera.rotation.set(camPitch, camYaw, 0, "YXZ");
    } else if (camMode === "walk") {
        // Grounded Player Character Physics with Gravity & Step
        const speed = (keyStates["ShiftLeft"] || keyStates["ShiftRight"]) ? 24.0 : 12.0;
        const moveVec = new THREE.Vector3();

        if (keyStates["KeyW"]) moveVec.z -= 1;
        if (keyStates["KeyS"]) moveVec.z += 1;
        if (keyStates["KeyA"]) moveVec.x -= 1;
        if (keyStates["KeyD"]) moveVec.x += 1;
        moveVec.normalize();

        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camYaw, 0, "YXZ"));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, camYaw, 0, "YXZ"));

        playerPos.addScaledVector(forward, -moveVec.z * speed * delta);
        playerPos.addScaledVector(right, moveVec.x * speed * delta);

        // Ground Height Raycast / Adherence
        const groundHeight = terrain.getSurfaceHeight(playerPos, 260.0);
        const playerHeight = 1.8;
        const targetGroundY = Math.max(120.0, groundHeight) + playerHeight;

        if (playerPos.y > targetGroundY) {
            playerVelocity.y -= 38.0 * delta; // Gravity
            playerPos.y += playerVelocity.y * delta;
            if (playerPos.y <= targetGroundY) {
                playerPos.y = targetGroundY;
                playerVelocity.y = 0;
                isGrounded = true;
            }
        } else {
            playerPos.y = THREE.MathUtils.lerp(playerPos.y, targetGroundY, 0.35);
            playerVelocity.y = 0;
            isGrounded = true;
        }

        // Jump
        if (keyStates["Space"] && isGrounded) {
            playerVelocity.y = 14.0;
            isGrounded = false;
        }

        camera.position.copy(playerPos);
        camera.rotation.set(camPitch, camYaw, 0, "YXZ");
    } else if (camMode === "topdown") {
        // Top-Down Overview Movement
        const speed = (keyStates["ShiftLeft"] || keyStates["ShiftRight"]) ? 400.0 : 180.0;
        if (keyStates["KeyW"]) playerPos.z -= speed * delta;
        if (keyStates["KeyS"]) playerPos.z += speed * delta;
        if (keyStates["KeyA"]) playerPos.x -= speed * delta;
        if (keyStates["KeyD"]) playerPos.x += speed * delta;

        camera.position.set(playerPos.x, playerPos.y, playerPos.z);
        camera.rotation.set(-Math.PI / 2 + 0.01, 0, 0);
    }

    // 2. Keep Water & Sky Centered horizontally & update waves/clouds
    water.material.uniforms["time"].value += delta * 0.12;
    water.material.uniforms["cameraPos"].value.copy(camera.position);
    water.position.x = camera.position.x;
    water.position.z = camera.position.z;
    if (terrain && terrain.cameraPos) {
        terrain.cameraPos.copy(camera.position);
    }
    if (sky) {
        sky.position.copy(camera.position);
        if (sky.material && sky.material.uniforms && sky.material.uniforms["uTime"]) {
            sky.material.uniforms["uTime"].value += delta;
        }
    }

    // 3. Update World Realism (5-Min Day/Night Cycle, Spawn Campfire, Twin Springs & Regional Wildlife)
    if (worldRealism) {
        worldRealism.update(delta, camera.position, {
            dirLight,
            ambientLight,
            hemiLight,
            water,
            sky,
            isMuted: false
        });
        if (sky && sky.material && sky.material.uniforms) {
            sky.material.uniforms["topColor"].value.copy(worldRealism.currentTopColor);
            sky.material.uniforms["bottomColor"].value.copy(worldRealism.currentBottomColor);
            if (sky.material.uniforms["starIntensity"]) {
                sky.material.uniforms["starIntensity"].value = worldRealism.currentStarIntensity;
            }
        }
    }

    // 3b. Adaptive Atmospheric Fog & Volumetric Boundary Mist of Plato's Atlantis
    let baseAtmo = worldRealism ? worldRealism.currentBottomColor : new THREE.Color(0x8ce3ff);
    const nightFactor = worldRealism ? worldRealism.currentNightFactor : 0.0;
    const camDistCenter = Math.hypot(camera.position.x - (-10800.0), camera.position.z - (-10600.0));
    let mistImmerse = 0.0;
    if (camDistCenter > 2400.0 && camDistCenter < 2880.0 && camera.position.y < 360.0) {
        const rBand = Math.sin(((camDistCenter - 2400.0) / 480.0) * Math.PI);
        const hBand = 1.0 - Math.max(0.0, Math.min(1.0, (camera.position.y - 250.0) / 110.0));
        mistImmerse = Math.max(0.0, rBand * hBand);
    }
    const mistCol = new THREE.Color(0xdcf0fa).lerp(new THREE.Color(0x182c48), nightFactor * 0.82);
    const targetFogCol = baseAtmo.clone().lerp(mistCol, mistImmerse * 0.90);
    scene.fog.color.lerp(targetFogCol, 0.12);
    scene.background.lerp(targetFogCol, 0.12);
    scene.fog.near = THREE.MathUtils.lerp(1950.0, 16.0, mistImmerse);
    scene.fog.far  = THREE.MathUtils.lerp(4100.0, 155.0, mistImmerse);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.12, 0.90, nightFactor);

    updateEditorCompass();

    // Keep local heightmap window centered around the editor camera when flying across continents
    if (Math.hypot(camera.position.x - hmCenterX, camera.position.z - hmCenterZ) > 1450.0) {
        recenterEditorHeightmap(camera.position.x, camera.position.z);
    }

    if (atlantisMistUniforms) {
        atlantisMistUniforms.uTime.value += delta;
        atlantisMistUniforms.uCameraPos.value.copy(camera.position);
    }

    // 4. Continuous Tool Application while holding mouse
    if (isLeftMouseDown && (currentTool === "sculpt" || currentTool === "flatten" || currentTool === "smooth" || currentTool === "eraser")) {
        applyActiveTool("primary");
    } else if (isRightMouseDown && (currentTool === "sculpt" || currentTool === "eraser")) {
        applyActiveTool("secondary");
    }

    // 5. Raycast for 3D Holographic Cursor from Crosshair
    if (isPointerLocked || camMode !== "topdown") {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    }
    const intersects = raycaster.intersectObjects(terrain.group.children, true);

    if (intersects.length > 0) {
        hasTarget = true;
        brushTargetPos.copy(intersects[0].point);
        if (intersects[0].face) {
            brushNormal.copy(intersects[0].face.normal).transformDirection(intersects[0].object.matrixWorld);
        } else {
            brushNormal.set(0, 1, 0);
        }

        const cursorGroup = brushRing.parent;
        cursorGroup.position.copy(brushTargetPos);
        cursorGroup.position.addScaledVector(brushNormal, 0.14); // float slightly above ground

        // Orient cursor disc along surface normal
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), brushNormal);
        cursorGroup.quaternion.copy(q);

        // Breathing pulse animation
        const pulse = 1.0 + Math.sin(performance.now() * 0.005) * 0.03;
        cursorGroup.scale.setScalar(brushRadius * pulse);
        cursorGroup.visible = true;
    } else {
        // Fallback raycast to water plane at Y = 120.0
        const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -120.0);
        const waterHit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(waterPlane, waterHit)) {
            hasTarget = true;
            brushTargetPos.copy(waterHit);
            brushNormal.set(0, 1, 0);

            const cursorGroup = brushRing.parent;
            cursorGroup.position.set(brushTargetPos.x, 120.2, brushTargetPos.z);
            cursorGroup.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
            cursorGroup.scale.setScalar(brushRadius);
            cursorGroup.visible = true;
        } else {
            hasTarget = false;
            brushRing.parent.visible = false;
        }
    }

    // 6. Update HUD Stats & Planetary Biome in real-time
    if (posInfo) {
        posInfo.textContent = `X: ${Math.round(camera.position.x)} Y: ${Math.round(camera.position.y - 120.0)} Z: ${Math.round(camera.position.z)}`;
    }
    if (biomeInfo && terrain.getPlanetaryBiome) {
        const b = terrain.getPlanetaryBiome(camera.position.x, camera.position.y, camera.position.z);
        biomeInfo.textContent = b.name;
    }
    if (altCounter) {
        const altMeters = Math.round(camera.position.y - 120.0);
        if (Math.abs(altMeters) >= 1000) {
            altCounter.textContent = `${(altMeters / 1000).toFixed(2)} km`;
        } else {
            altCounter.textContent = `${altMeters} m`;
        }
    }

    // 7. FPS Counter
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
        if (fpsCounter) fpsCounter.textContent = frameCount;
        frameCount = 0;
        lastFpsTime = now;
    }

    // 8. Stream voxel chunks around player/camera & update distant Atlantis LOD
    terrain.updateChunksAroundPlayer(camera.position, 1080);
    terrain.update();
    if (atlantisCapital) {
        atlantisCapital.update(delta, camera.position, 1080);
    }

    renderer.render(scene, camera);
}

// ==========================================
// VOLUMETRIC 360° BOUNDARY MIST RING AROUND PLATO'S ATLANTIS
// ==========================================
function createAtlantisMistRing(scene) {
    atlantisMistGroup = new THREE.Group();
    atlantisMistGroup.position.set(-10800.0, 0, -10600.0);
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
                vec2 relMist = vWorldPos.xz - vec2(-10800.0, -10600.0);
                float theta = atan(relMist.y, relMist.x);
                float hRel = vWorldPos.y - 120.0;
                if (hRel < -2.0) discard;

                vec2 cloudCoord = vec2(theta * 36.0 + uTime * 0.055, hRel * 0.018 - uTime * 0.03);
                float billow = mFbm(cloudCoord);
                float fineWisp = mFbm(cloudCoord * 2.7 - vec2(uTime * 0.08, 0.0));

                float dynamicTop = 115.0 + billow * 92.0 + fineWisp * 30.0;
                float bottomFade = smoothstep(-1.0, 14.0, hRel);
                float topFade = 1.0 - smoothstep(dynamicTop * 0.52, dynamicTop, hRel);

                float camDist = length(vWorldPos - uCameraPos);
                float nearDissolve = smoothstep(10.0, 52.0, camDist);
                float farFade = 1.0 - smoothstep(4800.0, 7200.0, camDist);

                vec3 viewDir = normalize(uCameraPos - vWorldPos);
                float facing = 0.35 + 0.65 * abs(dot(normalize(vWorldNormal), viewDir));

                float density = bottomFade * topFade * (0.42 + 0.58 * billow) * facing * nearDissolve * farFade;
                if (density < 0.008) discard;

                vec3 baseMistCol = vec3(0.74, 0.89, 0.97);
                vec3 sunTopCol   = vec3(0.95, 0.98, 1.00);
                vec3 col = mix(baseMistCol, sunTopCol, clamp(hRel / 115.0 + billow * 0.25, 0.0, 1.0));

                gl_FragColor = vec4(col, clamp(density * 0.46, 0.0, 0.78));
            }
        `
    });

    const shellRadii = [2450, 2560, 2680, 2810];
    const shellHeight = 230;
    for (let i = 0; i < shellRadii.length; i++) {
        const cylGeo = new THREE.CylinderGeometry(shellRadii[i], shellRadii[i] * 0.985, shellHeight, 128, 8, true);
        const cylMesh = new THREE.Mesh(cylGeo, mistShaderMat);
        cylMesh.position.set(0, 118.0 + shellHeight * 0.5, 0);
        cylMesh.rotation.y = i * 0.65;
        cylMesh.frustumCulled = false;
        atlantisMistGroup.add(cylMesh);
    }

    scene.add(atlantisMistGroup);
}

// ==========================================
// LEVEL EDITOR HORIZONTAL PLANETARY COMPASS & RADAR
// ==========================================
let compassCardinalEls = [];
let compassPoiEls = [];

const EDITOR_COMPASS_POIS = [
    { key: "tigris",     icon: "🔥", label: "Tigri/Eufrate", x: 14200.0,  z: -13775.0 },
    { key: "ararat",     icon: "🏔️", label: "M. Ararat",     x: 14755.0,  z: -14325.0 },
    { key: "borgosesia", icon: "🌲", label: "Borgosesia",    x: 2950.0,   z: -15300.0 },
    { key: "gibraltar",  icon: "🏛️", label: "Gibilterra",    x: -2100.0,  z: -12520.0 },
    { key: "atlantis",   icon: "👑", label: "Atlantide",     x: -10800.0, z: -10600.0 }
];

function initEditorCompass() {
    const track = document.getElementById("editor-compass-track");
    if (!track) return;
    track.innerHTML = "";
    compassCardinalEls = [];
    compassPoiEls = [];

    const dirs = [
        { deg: 0,   text: "N",  cardinal: true },
        { deg: 45,  text: "NE", cardinal: false },
        { deg: 90,  text: "E",  cardinal: true },
        { deg: 135, text: "SE", cardinal: false },
        { deg: 180, text: "S",  cardinal: true },
        { deg: 225, text: "SO", cardinal: false },
        { deg: 270, text: "O",  cardinal: true },
        { deg: 315, text: "NO", cardinal: false }
    ];

    for (const d of dirs) {
        const el = document.createElement("div");
        el.className = "compass-tick" + (d.cardinal ? " cardinal" : "");
        el.textContent = d.text;
        track.appendChild(el);
        compassCardinalEls.push({ deg: d.deg, el });
    }

    for (const poi of EDITOR_COMPASS_POIS) {
        const el = document.createElement("div");
        el.className = "compass-poi";
        el.title = `Clicca per viaggiare a: ${poi.label}`;
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (poi.key === "ararat") {
                playerPos.set(14755.0, 275.0, -14180.0);
                camYaw = 0.0;
                camPitch = -0.18;
                recenterEditorHeightmap(14755.0, -14180.0);
                showToast("Viaggio Rapido: 🏔️ Vetta del Monte Ararat");
            } else if (window.teleportEditorToRegion) {
                window.teleportEditorToRegion(poi.key);
            }
        });
        track.appendChild(el);
        compassPoiEls.push({ poi, el });
    }

    const timeBtn = document.getElementById("compass-time-btn");
    if (timeBtn) {
        timeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (worldRealism) {
                const tInfo = worldRealism.advanceTimeHours(3.0);
                showToast(`Ciclo Giorno/Notte: ${tInfo.text} (${tInfo.label})`);
            }
        });
    }
}

function updateEditorCompass() {
    const track = document.getElementById("editor-compass-track");
    if (!track || !camera) return;

    // Forward horizontal direction of camera:
    // North = -Z (0°), East = +X (90°), South = +Z (180°), West = -X (270°)
    const lookDir = new THREE.Vector3();
    camera.getWorldDirection(lookDir);
    let headingDeg = THREE.MathUtils.radToDeg(Math.atan2(lookDir.x, -lookDir.z));
    if (headingDeg < 0) headingDeg += 360.0;

    const fovSpanDeg = 130.0; // Visible degree span across the 520px compass ribbon

    const shortestAngleDiff = (targetDeg, currentDeg) => {
        let diff = (targetDeg - currentDeg + 540.0) % 360.0 - 180.0;
        return diff;
    };

    for (let i = 0; i < compassCardinalEls.length; i++) {
        const item = compassCardinalEls[i];
        const diff = shortestAngleDiff(item.deg, headingDeg);
        if (Math.abs(diff) <= fovSpanDeg * 0.55) {
            const pct = 50.0 + (diff / fovSpanDeg) * 100.0;
            item.el.style.display = "block";
            item.el.style.left = `${pct}%`;
        } else {
            item.el.style.display = "none";
        }
    }

    for (let i = 0; i < compassPoiEls.length; i++) {
        const item = compassPoiEls[i];
        const dx = item.poi.x - camera.position.x;
        const dz = item.poi.z - camera.position.z;
        const distM = Math.hypot(dx, dz);
        let poiDeg = THREE.MathUtils.radToDeg(Math.atan2(dx, -dz));
        if (poiDeg < 0) poiDeg += 360.0;

        const diff = shortestAngleDiff(poiDeg, headingDeg);
        const clampedDiff = Math.max(-fovSpanDeg * 0.46, Math.min(fovSpanDeg * 0.46, diff));
        const pct = 50.0 + (clampedDiff / fovSpanDeg) * 100.0;

        const distText = distM >= 1000.0 ? `${(distM / 1000.0).toFixed(1)}km` : `${Math.round(distM)}m`;
        item.el.textContent = `${item.poi.icon} ${item.poi.label} (${distText})`;
        item.el.style.left = `${pct}%`;
        item.el.style.opacity = Math.abs(diff) <= fovSpanDeg * 0.48 ? "1.0" : "0.52";
    }

    const headingEl = document.getElementById("compass-heading-text");
    if (headingEl) {
        const cardNames = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
        const cardIdx = Math.round(headingDeg / 45.0) % 8;
        headingEl.textContent = `${Math.round(headingDeg)}° ${cardNames[cardIdx]}`;
    }

    const timeBtn = document.getElementById("compass-time-btn");
    if (timeBtn && worldRealism) {
        const tInfo = worldRealism.getFormattedTimeOfDay();
        timeBtn.textContent = `${tInfo.text} [N]`;
    }
}

// Start Level Builder
init();
