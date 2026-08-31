import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { VoxelTerrain } from './marching_cubes.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ==========================================
// GAME STATE variables
// ==========================================
let scene, camera, renderer, clock;
let terrain, water, sky, sun, heightmapTexture, heightmapData;
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

// FPS counting variables
let fpsLastTime = performance.now();
let fpsFrames = 0;

// Instanced mesh variables for environment objects
let instancedPalmsTrunk, instancedPalmsLeaves, instancedPalmsCoconuts;
let instancedPinesTrunk, instancedPinesFoliage;
let instancedRocks;

// Arrays containing positions and falling states of all environment objects
let palmInstances = [];
let pineInstances = [];
let rockInstances = [];

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
    scene.fog = new THREE.Fog(0x8ce3ff, 250, 600); // Linear fog to mask chunk rendering boundary

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

    // 3. Lighting Setup
    // Bright sky blue ambient light representing light scattered by a tropical sky
    const ambientLight = new THREE.AmbientLight(0xdff2ff, 0.85);
    scene.add(ambientLight);

    // Intense vertical white sunlight for a "sole a picco" effect
    const dirLight = new THREE.DirectionalLight(0xfffff0, 2.0);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    const d = 60;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // 4. Sky and Sun Configuration (Custom Gradient Sky Dome with Procedural Stars)
    const skyGeo = new THREE.SphereGeometry(1, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0078d7) }, // Deep tropical cobalt blue
            bottomColor: { value: new THREE.Color(0x8ce3ff) }, // Caribbean cyan horizon
            exponent: { value: 0.6 },
            sunDirection: { value: new THREE.Vector3() },
            starIntensity: { value: 0.0 }
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

            // Fast 3D hash for celestial coordinates
            float hash31(vec3 p) {
                p = fract(p * vec3(443.897, 441.423, 437.195));
                p += dot(p, p.yzx + 19.19);
                return fract((p.x + p.y) * p.z);
            }

            float getStars(vec3 dir) {
                // Layer 1: Crisp brilliant stars
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

                // Layer 2: Dense starry background / Milky Way dust
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
                float h = max(0.0, dir.y);
                vec3 skyColor = mix(bottomColor, topColor, pow(h, exponent));
                
                // Add crisp stars in space when starIntensity > 0 (360 degrees cosmos)
                if (starIntensity > 0.0) {
                    float stars = getStars(dir);
                    vec3 starTint = mix(vec3(0.85, 0.93, 1.0), vec3(1.0, 0.92, 0.78), hash31(floor(dir * 260.0)));
                    skyColor += starTint * stars * starIntensity;
                }

                // Add a soft sun disk and corona glow
                float sunGlow = max(0.0, dot(dir, normalize(sunDirection)));
                vec3 sunColor = vec3(1.0, 1.0, 0.95);
                skyColor += sunColor * pow(sunGlow, 220.0) * 1.0; // Sun disk core
                skyColor += sunColor * pow(sunGlow, 14.0) * 0.25 * (1.0 - starIntensity * 0.6); // Corona
                
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
        elevation: 50.0, // High noon sun (sole a picco)
        azimuth: 180,  // Facing North-South
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

    // 5. Planetary Spherical Ocean Setup (Perfect 360° circular celestial planet body)
    const waterGeometry = new THREE.CircleGeometry(3200, 160);
    water = new Water(
        waterGeometry,
        {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals: new THREE.TextureLoader().load('waternormals.jpg', function (texture) {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
            }),
            sunDirection: sun,
            sunColor: 0xffdfaa, // Bright sunlight specular reflections
            waterColor: 0x005a78, // Vibrant Caribbean tropical turquoise-blue
            distortionScale: 1.5,
            alpha: 0.85, // Balanced semi-transparent tropical water
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
         float planetR = 2800.0;
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

    // Planetary Atmosphere Limb glow & smooth circular horizon cutoff in fragment shader
    water.material.fragmentShader = `
        uniform vec3 cameraPos;
    ` + water.material.fragmentShader;

    water.material.fragmentShader = water.material.fragmentShader.replace(
        'gl_FragColor = vec4( outgoingLight, alpha );',
        `float viewDist = length(worldPosition.xyz - eye);
         float distFade = smoothstep(15.0, 120.0, viewDist);
         float distAlpha = clamp(alpha + distFade * (1.0 - alpha) * 0.85, 0.0, 0.98);

         // Atmospheric Rayleigh limb halo around the planetary spherical horizon
         float distH = length(worldPosition.xz - cameraPos.xz);
         float atmoLimb = smoothstep(1600.0, 2750.0, distH);
         vec3 atmoHalo = vec3(0.20, 0.70, 1.0) * atmoLimb * 1.5;
         vec3 finalColor = outgoingLight + atmoHalo;

         // Smooth circular horizon cutoff (zero square edges)
         float horizonAlpha = 1.0 - smoothstep(2700.0, 2800.0, distH);
         gl_FragColor = vec4( finalColor, distAlpha * horizonAlpha );`
    );
    
    scene.add(water);

    // 6. Marching Cubes Voxel Terrain Setup
    terrain = new VoxelTerrain(scene, 256, 64, 256, 3.0);

    const startX = 0;
    const startZ = 312; // Rim of the volcano island at Z = 95 voxels (285m) + 27m offset
    const testPos = new THREE.Vector3(startX, 130, startZ);

    // Build initial chunks around start position so we can query height
    terrain.updateChunksAroundPlayer(testPos, 150);

    // Initialize heightmap data arrays and render dynamic shore foam heightmap texture
    heightmapData = new Uint8Array(256 * 256);
    updateHeightmap();

    const groundY = terrain.getSurfaceHeight(testPos, 192.0);
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
        });
    } else {
        blocker.addEventListener('click', () => {
            controls.lock();
        });
    }

    controls.addEventListener('lock', () => {
        blocker.style.display = 'none';
        document.getElementById('esc-confirm').classList.add('hidden');
        gameStarted = true;
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

    // ESC Confirmation dialog button handlers
    const escConfirm = document.getElementById('esc-confirm');
    document.getElementById('btn-confirm-no').addEventListener('click', () => {
        escConfirm.classList.add('hidden');
        controls.lock(); // return to game
    });

    document.getElementById('btn-confirm-yes').addEventListener('click', () => {
        escConfirm.classList.add('hidden');
        gameStarted = false;
        blocker.style.display = 'flex'; // go back to homepage
        
        // Reset player coordinates to start beach position
        const resetPos = new THREE.Vector3(startX, 20, startZ);
        const resetY = terrain.getSurfaceHeight(resetPos, 256.0);
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

    // 7bc. Low-Poly Floating Clouds Setup (matches low-poly sample screenshots)
    const cloudsGroup = new THREE.Group();
    scene.add(cloudsGroup);
    
    const cloudMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        flatShading: true,
        roughness: 0.95,
        metalness: 0.0
    });
    
    for (let c = 0; c < 15; c++) {
        const cloud = new THREE.Group();
        const partsCount = 7 + Math.floor(Math.random() * 5); // 7 to 11 parts for rich detail
        
        for (let p = 0; p < partsCount; p++) {
            const t = p / (partsCount - 1);
            const offsetFactor = t - 0.5; // range -0.5 to 0.5
            
            // Taper sizes from the center outward
            const baseRad = 7.0 + Math.random() * 5.0;
            const rad = baseRad * (1.0 - Math.abs(offsetFactor) * 1.2);
            if (rad < 2.5) continue; // Skip too small parts
            
            // Detail 1 gives a beautifully faceted low-poly sphere
            const part = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 1), cloudMat);
            
            // Align bottoms of the spheres near the same plane (creating flat bottoms)
            const posX = offsetFactor * 42.0; // Elongate the cloud cluster
            const posY = rad * 0.35; // Lift slightly so bottom is flatter
            const posZ = (Math.random() - 0.5) * rad * 0.8;
            
            part.position.set(posX, posY, posZ);
            part.scale.set(1.5, 0.45 + Math.random() * 0.15, 1.1); // Squash flat on Y
            part.rotation.set(
                (Math.random() - 0.5) * 0.1,
                Math.random() * Math.PI,
                (Math.random() - 0.5) * 0.1
            );
            cloud.add(part);
        }
        
        const range = 1200;
        cloud.position.set(
            (Math.random() - 0.5) * range,
            220 + Math.random() * 80,
            (Math.random() - 0.5) * range
        );
        cloud.userData = { speed: 0.3 + Math.random() * 1.2 };
        
        cloudsGroup.add(cloud);
        clouds.push(cloud);
    }

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

    // 8. Event Listeners
    setupInputListeners();

    // Trigger initial static shadow map render
    renderer.shadowMap.needsUpdate = true;

    // Adjust sizes on resize
    window.addEventListener('resize', onWindowResize);
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
                // Instantly rebuild the dirty chunks in this frame
                terrain.update();
                updateHeightmap();
                renderer.shadowMap.needsUpdate = true; // Optimize: Request shadow map update on terrain change!
                checkFoliageFalling(); // Check if any tree/rock lost its support ground!
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
        const altMeters = Math.max(0, Math.round(camera.position.y - 120.0));
        const altCounter = document.getElementById('alt-counter');
        if (altCounter) {
            if (altMeters >= 1000) {
                altCounter.textContent = `${(altMeters / 1000).toFixed(2)} km`;
            } else {
                altCounter.textContent = `${altMeters} m`;
            }
        }
    }

    if (isMobile ? gameStarted : controls.isLocked) {
        // 2. Terrain Interaction (Dig/Build holding mouse)
        handleTerrainInteraction();

        // 3. Movement Physics (Gravity & Collisions)
        const inWater = camera.position.y < 120.0;
        
        // Walk controls dampening (less horizontal drag in water to glide)
        const dragFactor = isFlying ? 5.0 : (inWater ? 6.0 : 10.0);
        velocity.x -= velocity.x * dragFactor * delta;
        velocity.z -= velocity.z * dragFactor * delta;
        
        // Strong vertical damping in water to simulate drag and stabilize floating, and flying to stabilize hovering
        const verticalDrag = isFlying ? 5.0 : (inWater ? 4.0 : 1.0);
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

        // Jump execution or swim/fly upwards
        if (keyStates.Space) {
            if (isFlying) {
                // Fly upwards (3x speed with Shift: 270.0 vs 90.0)
                velocity.y += (keyStates.ShiftLeft ? 270.0 : 90.0) * delta;
            } else if (inWater) {
                // Swim upwards actively using Space
                velocity.y += 18.0 * delta;
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
                currentSpeed *= 0.45;
            }
        }

        const isMoving = keyStates.KeyW || keyStates.KeyS || keyStates.KeyA || keyStates.KeyD;

        if (keyStates.KeyW || keyStates.KeyS) velocity.z -= direction.z * currentSpeed * delta;
        if (keyStates.KeyA || keyStates.KeyD) velocity.x -= direction.x * currentSpeed * delta;

        // Swimming/Flying pitch and buoyancy mechanics
        if (isFlying) {
            if (isMoving) {
                // Fly up/down based on camera look direction pitch and move direction (W/S)
                const lookDir = new THREE.Vector3();
                camera.getWorldDirection(lookDir);
                // direction.z is positive for W, negative for S
                velocity.y += lookDir.y * direction.z * currentSpeed * 0.8 * delta;
            }
        } else if (inWater) {
            if (isMoving) {
                // Swim up/down based on camera look direction pitch and move direction (W/S)
                const lookDir = new THREE.Vector3();
                camera.getWorldDirection(lookDir);
                // direction.z is positive for W, negative for S
                velocity.y += lookDir.y * direction.z * currentSpeed * 0.8 * delta;
            } else if (!keyStates.Space) {
                // Buoyancy: slowly float up to the surface if idle
                const floatSurface = 119.95; // target eye level at surface
                if (camera.position.y < floatSurface) {
                    const diff = floatSurface - camera.position.y;
                    velocity.y += diff * 1.5 * delta;
                }
            }
        }

        // Apply movement vector horizontally (fixed A/D inversion)
        controls.moveRight(velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Keep player inside ocean boundaries (4800 meters from center, matching the 10km water plane)
        const boundX = 4800;
        const boundZ = 4800;
        camera.position.x = Math.max(-boundX, Math.min(boundX, camera.position.x));
        camera.position.z = Math.max(-boundZ, Math.min(boundZ, camera.position.z));

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
                const treeHeight = 5.0;
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

        // Get ground level Y under player position
        // Search downwards starting from slightly above player Y position
        const groundHeight = terrain.getSurfaceHeight(camera.position, camera.position.y + 1.0);

        // Ceiling collision check: if player head goes inside solid terrain
        const headPos = camera.position.clone();
        headPos.y += 0.3; // Check 0.3m above camera eye level
        if (terrain.isPositionSolid(headPos)) {
            // Player hit head: push down slightly and halt upward velocity
            if (velocity.y > 0) {
                velocity.y = 0;
                camera.position.y = terrain.getSurfaceHeight(camera.position, camera.position.y) - 0.3;
            }
        }

        // Floor collision check
        if (camera.position.y - playerHeight <= groundHeight) {
            const targetY = groundHeight + playerHeight;
            const diff = targetY - camera.position.y;
            // If the difference is large (falling from high up, or digging under feet), snap instantly.
            // Otherwise, interpolate Y smoothly over time to eliminate marching cubes staircase jitter.
            if (Math.abs(diff) > 0.4) {
                camera.position.y = targetY;
            } else {
                camera.position.y += diff * 25.0 * delta;
            }
            velocity.y = 0;
            isGrounded = true;
        } else {
            isGrounded = false;
        }

        // Prevent falling below the water floor level
        if (camera.position.y - playerHeight < 0.5) {
            camera.position.y = 0.5 + playerHeight;
            velocity.y = 0;
            isGrounded = true;
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

        // 4. Update HUD Coordinates (meters scaled)
        posInfo.textContent = `X: ${Math.round(camera.position.x)} Y: ${Math.round(camera.position.y - 120.0)} Z: ${Math.round(camera.position.z)}`;
    }

    // 5. Water waves animation (reduced speed from 0.5 to 0.12 to prevent shoreline vibration)
    water.material.uniforms['time'].value += delta * 0.12;

    // 5bb. Check if player camera is underwater (Y < 120.0m) to trigger immersive effects, or high up to trigger space orbit effects
    const underwaterOverlay = document.getElementById('underwater-overlay');
    const isLookingFromBelow = (camera.position.y < 120.0);
    const depthFactor = Math.min(Math.max((120.0 - camera.position.y) / 70.0, 0.0), 1.0);
    
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
    
    const skyTopColor = new THREE.Color(0x0078d7);
    const skyBottomColor = new THREE.Color(0x8ce3ff);
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
 
    const currentFogColor = new THREE.Color(0x8ce3ff).lerp(spaceColor, altFactor);
 
    if (isLookingFromBelow) {
        if (underwaterOverlay) {
            underwaterOverlay.classList.remove('hidden');
            const baseOpacity = 0.25 * depthFactor;
            const wavePulse = baseOpacity + Math.sin(clock.getElapsedTime() * 1.6) * 0.03 * depthFactor;
            underwaterOverlay.style.background = `rgba(0, 120, 180, ${Math.max(0.0, wavePulse)})`;
        }
 
        // Interpolate fog color from clear shallow water cyan to dark deep ocean abyss
        const shallowWaterFog = new THREE.Color(0x007799);
        const deepWaterFog = new THREE.Color(0x000511);
        const interpolatedFogColor = shallowWaterFog.clone().lerp(deepWaterFog, depthFactor);
        scene.fog.color.copy(interpolatedFogColor);
 
        // Linear fog range for water: keeps realistic visibility (120m near surface, 50m in depth)
        scene.fog.near = 5.0;
        scene.fog.far = 120.0 - 70.0 * depthFactor;
 
        // Interpolate exposure from bright noon (1.15) to very dark underwater (0.25)
        renderer.toneMappingExposure = 1.15 - (1.15 - 0.25) * depthFactor;

        if (water && water.material && water.material.uniforms['alpha']) {
            water.material.uniforms['alpha'].value = 0.38;
        }
    } else {
        if (underwaterOverlay) {
            underwaterOverlay.classList.add('hidden');
        }
        
        scene.fog.color.copy(currentFogColor);
        // From 1.1km up, the atmosphere thins completely (fog recedes to 45km for crystal-clear view of islands and ocean)
        scene.fog.near = 250.0 + (10000.0 - 250.0) * altFactor;
        scene.fog.far = 600.0 + (45000.0 - 600.0) * altFactor;
        
        renderer.toneMappingExposure = 1.15;

        if (water && water.material && water.material.uniforms['alpha']) {
            water.material.uniforms['alpha'].value = 0.82;
        }
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

    // 5d. Animate low-poly clouds drifting slowly across the sky
    if (clouds) {
        for (const cloud of clouds) {
            cloud.position.x += cloud.userData.speed * delta * 4.0; // drift speed
            // Wrap cloud around when it drifts too far
            if (cloud.position.x > 800) {
                cloud.position.x = -800;
                cloud.position.z = (Math.random() - 0.5) * 1200;
            }
        }
    }

    // 5e. Update active terrain chunks and center sky dome on the player
    if (terrain) {
        const dynamicRenderDist = Math.min(850.0, 500.0 + altFactor * 350.0); // 500m on ground, 850m in orbit
        terrain.updateChunksAroundPlayer(camera.position, dynamicRenderDist);
    }
    if (sky) {
        sky.position.copy(camera.position);
    }

    renderer.render(scene, camera);
}

// ==========================================
// PROCEDURAL ENVIRONMENT GENERATION (PALM TREES & BOULDERS)
// ==========================================
function spawnEnvironmentObjects(scene, terrain) {
    const palmTreesCount = 180;
    const pineTreesCount = 90;
    const rocksCount = 120;
    
    // Procedural low-poly Palm Tree segment generator
    function createPalmTree() {
        const treeGroup = new THREE.Group();
        
        // Taller trunk segments (more graceful)
        const trunkSegmentsCount = 7 + Math.floor(Math.random() * 4);
        let currentHeight = 0;
        const trunkGroup = new THREE.Group();
        
        // Light grey-beige wood material (tropical palm look)
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0xa18f7c,
            flatShading: true,
            roughness: 0.95
        });
        
        // Accumulate rotation to make trunk bend/lean elegantly over the beach
        let bendX = 0;
        let bendZ = 0;
        const bendDirectionX = (Math.random() - 0.5) * 0.22; // More pronounced leaning
        const bendDirectionZ = (Math.random() - 0.5) * 0.22;
        
        for (let i = 0; i < trunkSegmentsCount; i++) {
            const h = 1.1;
            let rBottom = 0.32 * (1.0 - i / (trunkSegmentsCount + 3));
            let rTop = 0.32 * (1.0 - (i + 1) / (trunkSegmentsCount + 3));
            
            // Flared base foot for coconut palm (referencing photo 1)
            if (i === 0) {
                rBottom = rBottom * 1.95;
            }
            
            const segmentGeo = new THREE.CylinderGeometry(rTop, rBottom, h, 5);
            const segment = new THREE.Mesh(segmentGeo, trunkMat);
            segment.castShadow = true;
            segment.receiveShadow = true;
            
            segment.position.y = currentHeight + h / 2;
            
            // Apply organic curve
            bendX += bendDirectionX;
            bendZ += bendDirectionZ;
            segment.rotation.set(bendX, 0, bendZ);
            
            segment.position.x += Math.sin(bendX) * 0.2;
            segment.position.z += Math.sin(bendZ) * 0.2;
            
            // Add a bulbous joint ring at the bottom of the segment for textured palm bark
            const ringGeo = new THREE.CylinderGeometry(rBottom * 1.12, rBottom * 1.12, 0.12, 5);
            const ring = new THREE.Mesh(ringGeo, trunkMat);
            ring.position.y = -h / 2;
            segment.add(ring);
            
            trunkGroup.add(segment);
            currentHeight += h * 0.88;
        }
        treeGroup.add(trunkGroup);
        
        // Leaves at the crown (drooping arching feathered palm fronds)
        const leavesCount = 9 + Math.floor(Math.random() * 3); // 9 to 11 fronds
        const leafMat = new THREE.MeshStandardMaterial({
            color: 0x2ecc71, // Bright tropical green
            flatShading: true,
            roughness: 0.75,
            side: THREE.DoubleSide
        });
        
        const leavesGroup = new THREE.Group();
        const topSegment = trunkGroup.children[trunkSegmentsCount - 1];
        leavesGroup.position.set(topSegment.position.x, currentHeight - 0.2, topSegment.position.z);
        leavesGroup.rotation.copy(topSegment.rotation);
        
        for (let i = 0; i < leavesCount; i++) {
            const leaf = new THREE.Group();
            
            // Spin around Y axis to distribute leaves radially
            const angle = i * (Math.PI * 2 / leavesCount);
            leaf.rotation.y = angle;
            
            let curY = 0;
            let curZ = 0;
            let rotX = 0.12; // Initial upward/outward tilt
            const stemSegments = 5; // Construct leaf from chained segments to curve it
            const stemL = 0.8;
            
            for (let j = 0; j < stemSegments; j++) {
                // Taper stem size towards the tip
                const stemW = 0.04 * (1.0 - j / stemSegments);
                const stemH = 0.03 * (1.0 - j / stemSegments);
                const stemPartGeo = new THREE.BoxGeometry(stemW, stemH, stemL);
                const stemPart = new THREE.Mesh(stemPartGeo, leafMat);
                stemPart.castShadow = true;
                
                // Position relative to current segment joint
                stemPart.position.set(0, curY, curZ + stemL / 2);
                stemPart.rotation.x = -rotX;
                leaf.add(stemPart);
                
                // Add leaflets along this stem segment (feathered comb pattern, dense as in photo)
                const leafletsPerSeg = 4;
                for (let f = 0; f < leafletsPerSeg; f++) {
                    const segmentProgress = (j * leafletsPerSeg + f) / (stemSegments * leafletsPerSeg); // 0 to 1 along the whole leaf
                    const leafletLength = 1.3 * Math.sin(segmentProgress * Math.PI); // Longest in middle, tapered
                    if (leafletLength < 0.15) continue;
                    
                    const leafletW = 0.07 * (1.0 - segmentProgress * 0.4); // Taper width towards tip
                    const leafletGeo = new THREE.BoxGeometry(leafletW, 0.006, leafletLength);
                    const zOffset = (f / leafletsPerSeg) * stemL;
                    
                    // Left leaflet
                    const leafletL = new THREE.Mesh(leafletGeo, leafMat);
                    leafletL.castShadow = true;
                    leafletL.position.set(-leafletLength / 2 * 0.85, curY, curZ + zOffset);
                    leafletL.rotation.set(-rotX + 0.1, 0.45, -0.22);
                    leaf.add(leafletL);
                    
                    // Right leaflet
                    const leafletR = new THREE.Mesh(leafletGeo, leafMat);
                    leafletR.castShadow = true;
                    leafletR.position.set(leafletLength / 2 * 0.85, curY, curZ + zOffset);
                    leafletR.rotation.set(-rotX + 0.1, -0.45, 0.22);
                    leaf.add(leafletR);
                }
                
                // Move joint pointer forward along the curve
                curZ += stemL * Math.cos(rotX) * 0.95;
                curY -= stemL * Math.sin(rotX) * 0.95;
                
                // Increase downward rotation for next segment (droop/arch)
                rotX += 0.18;
            }
            
            leavesGroup.add(leaf);
        }
        treeGroup.add(leavesGroup);
        
        // Add a cluster of 3 coconuts at the center of the palm crown
        const coconutMat = new THREE.MeshStandardMaterial({
            color: 0x5a3d28, // Coconut shell brown
            flatShading: true,
            roughness: 0.90
        });
        
        const coconutGeo = new THREE.DodecahedronGeometry(0.24, 0);
        for (let c = 0; c < 3; c++) {
            const coconut = new THREE.Mesh(coconutGeo, coconutMat);
            coconut.castShadow = true;
            // Position cocos offset under the crown leaves
            const cAngle = c * (Math.PI * 2 / 3);
            coconut.position.set(
                topSegment.position.x + Math.cos(cAngle) * 0.28,
                currentHeight - 0.45,
                topSegment.position.z + Math.sin(cAngle) * 0.28
            );
            coconut.rotation.copy(topSegment.rotation);
            treeGroup.add(coconut);
        }
        
        return treeGroup;
    }
    
    // Procedural low-poly Maritime Pine generator (referencing photo 2: Pino Marittimo)
    function createPineTree() {
        const treeGroup = new THREE.Group();
        
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x8d7a6b, // Light grey-brown wood
            flatShading: true,
            roughness: 0.95
        });
        const foliageMat = new THREE.MeshStandardMaterial({
            color: 0x27ae60, // Maritime pine green
            flatShading: true,
            roughness: 0.85
        });
        
        // 1. Lower Trunk (Gnarled, curves upward)
        let curY = 0;
        let curX = 0;
        let curZ = 0;
        const trunkSegments = 5;
        const h = 0.6;
        let rBottom = 0.28;
        
        for (let i = 0; i < trunkSegments; i++) {
            const rTop = rBottom * 0.9;
            const segGeo = new THREE.CylinderGeometry(rTop, rBottom, h, 5);
            const seg = new THREE.Mesh(segGeo, trunkMat);
            seg.castShadow = true;
            seg.receiveShadow = true;
            
            seg.position.set(curX, curY + h/2, curZ);
            
            // Apply organic twist/bend
            const angleX = 0.18 * Math.sin(i * 1.0);
            const angleZ = 0.12 * Math.cos(i * 1.0);
            seg.rotation.set(angleX, 0, angleZ);
            
            treeGroup.add(seg);
            
            curX += Math.sin(angleX) * h * 0.9;
            curZ += Math.sin(angleZ) * h * 0.9;
            curY += h * 0.9;
            rBottom = rTop;
        }
        
        // 2. Branching split into 3 gnarled main branches (umbrella shape)
        const branches = [
            { angleY: 0, tiltX: 0.5, tiltZ: 0.2, length: 1.6, scale: 0.8 },
            { angleY: Math.PI * 2/3, tiltX: -0.3, tiltZ: 0.4, length: 1.8, scale: 0.75 },
            { angleY: Math.PI * 4/3, tiltX: 0.2, tiltZ: -0.5, length: 1.5, scale: 0.7 }
        ];
        
        for (const br of branches) {
            const branchGroup = new THREE.Group();
            branchGroup.position.set(curX, curY, curZ);
            branchGroup.rotation.y = br.angleY;
            
            let brY = 0;
            let brX = 0;
            let brZ = 0;
            let brRad = rBottom * br.scale;
            const brSegs = 4;
            const brH = br.length / brSegs;
            
            for (let j = 0; j < brSegs; j++) {
                const nextRad = brRad * 0.85;
                const segGeo = new THREE.CylinderGeometry(nextRad, brRad, brH, 4);
                const seg = new THREE.Mesh(segGeo, trunkMat);
                seg.castShadow = true;
                seg.receiveShadow = true;
                
                // Keep branching outwards
                const tiltX = br.tiltX * (1.0 + j * 0.1);
                const tiltZ = br.tiltZ * (1.0 + j * 0.15);
                seg.rotation.set(tiltX, 0, tiltZ);
                seg.position.set(brX, brY + brH/2, brZ);
                
                branchGroup.add(seg);
                
                brX += Math.sin(tiltX) * brH * 0.95;
                brZ += Math.sin(tiltZ) * brH * 0.95;
                brY += brH * Math.cos(tiltX) * 0.95;
                brRad = nextRad;
            }
            
            // 3. Foliage Umbrella Domes at the end of each main branch!
            const foliageDome = new THREE.Group();
            foliageDome.position.set(brX, brY, brZ);
            
            const cloudParts = 5 + Math.floor(Math.random() * 3);
            for (let p = 0; p < cloudParts; p++) {
                const rad = 0.9 + Math.random() * 0.6;
                const geo = new THREE.DodecahedronGeometry(rad, 1);
                const mesh = new THREE.Mesh(geo, foliageMat);
                mesh.castShadow = true;
                
                // Spread horizontally to create a nice wide umbrella profile
                const px = (Math.random() - 0.5) * 1.5;
                const pz = (Math.random() - 0.5) * 1.5;
                const py = (rad * 0.25) + (Math.random() - 0.5) * 0.15;
                
                mesh.position.set(px, py, pz);
                mesh.scale.set(1.4, 0.6 + Math.random() * 0.2, 1.2); // squash flat to look like a canopy umbrella tier
                foliageDome.add(mesh);
            }
            branchGroup.add(foliageDome);
            treeGroup.add(branchGroup);
        }
        
        return treeGroup;
    }
    
    // Group to hold env meshes. Centered relative to voxel terrain group
    const envGroup = new THREE.Group();
    envGroup.position.copy(terrain.group.position);
    scene.add(envGroup);

    // ----------------------------------------------------
    // OPTIMIZATION: Generate single instancing geometries using BufferGeometryUtils
    // ----------------------------------------------------
    
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
            if (color === 0xa18f7c) {
                palmTrunkGeos.push(cloneGeo);
            } else if (color === 0x2ecc71) {
                palmLeavesGeos.push(cloneGeo);
            } else if (color === 0x5a3d28) {
                palmCoconutGeos.push(cloneGeo);
            }
        }
    });
    
    const masterPalmTrunkGeo = BufferGeometryUtils.mergeGeometries(palmTrunkGeos, true);
    const masterPalmLeavesGeo = BufferGeometryUtils.mergeGeometries(palmLeavesGeos, true);
    const masterPalmCoconutGeo = BufferGeometryUtils.mergeGeometries(palmCoconutGeos, true);
    
    // Dispose cloned geometries
    palmTrunkGeos.forEach(g => g.dispose());
    palmLeavesGeos.forEach(g => g.dispose());
    palmCoconutGeos.forEach(g => g.dispose());
    
    // Generate one temporary pine to extract and merge geometries
    const tempPine = createPineTree();
    const tempPineGroup = new THREE.Group();
    tempPineGroup.add(tempPine);
    tempPineGroup.updateMatrixWorld(true);
    
    const pineTrunkGeos = [];
    const pineFoliageGeos = [];
    
    tempPine.traverse((child) => {
        if (child.isMesh) {
            const cloneGeo = child.geometry.clone();
            cloneGeo.applyMatrix4(child.matrixWorld);
            
            const color = child.material.color.getHex();
            if (color === 0x8d7a6b) {
                pineTrunkGeos.push(cloneGeo);
            } else if (color === 0x27ae60) {
                pineFoliageGeos.push(cloneGeo);
            }
        }
    });
    
    const masterPineTrunkGeo = BufferGeometryUtils.mergeGeometries(pineTrunkGeos, true);
    const masterPineFoliageGeo = BufferGeometryUtils.mergeGeometries(pineFoliageGeos, true);
    
    // Dispose cloned geometries
    pineTrunkGeos.forEach(g => g.dispose());
    pineFoliageGeos.forEach(g => g.dispose());

    // Create master rock geometry (merged cluster of dodecahedrons for realistic outcrops)
    const rockClusterGeos = [];
    
    // 1. Central main boulder (squashed slightly on Y to sit naturally)
    const mainRockGeo = new THREE.DodecahedronGeometry(1.0, 0);
    mainRockGeo.scale(1.0, 0.72, 1.0);
    rockClusterGeos.push(mainRockGeo);
    
    // 2. Add 3 satellite stones around the base at random offsets and sizes
    const satelliteCount = 3;
    for (let s = 0; s < satelliteCount; s++) {
        const angle = (s * Math.PI * 2) / satelliteCount + (Math.random() - 0.5) * 0.4;
        const dist = 0.75 + Math.random() * 0.25;
        const rad = 0.35 + Math.random() * 0.25;
        
        const satGeo = new THREE.DodecahedronGeometry(rad, 0);
        
        // Randomly scale each axis to create unique jagged shapes
        satGeo.scale(
            0.8 + Math.random() * 0.4,
            0.6 + Math.random() * 0.4,
            0.8 + Math.random() * 0.4
        );
        
        // Random rotation
        satGeo.rotateX(Math.random() * Math.PI);
        satGeo.rotateY(Math.random() * Math.PI);
        satGeo.rotateZ(Math.random() * Math.PI);
        
        // Translate relative to base of main rock
        const px = Math.cos(angle) * dist;
        const py = -0.22 + (Math.random() - 0.5) * 0.12;
        const pz = Math.sin(angle) * dist;
        satGeo.translate(px, py, pz);
        
        rockClusterGeos.push(satGeo);
    }
    
    const masterRockGeo = BufferGeometryUtils.mergeGeometries(rockClusterGeos, true);
    
    // Dispose the sub-geometries to free memory
    rockClusterGeos.forEach(g => {
        if (g !== masterRockGeo) g.dispose();
    });

    // Materials with Planetary Horizon Curvature
    function applyFoliageCurvature(mat) {
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.cameraPos = cameraPosUniform;
            shader.vertexShader = `
                uniform vec3 cameraPos;
            ` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                 #ifdef USE_INSTANCING
                     vec4 worldV = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
                 #else
                     vec4 worldV = modelMatrix * vec4(transformed, 1.0);
                 #endif
                 float distH = length(worldV.xz - cameraPos.xz);
                 float planetR = 2800.0;
                 if (distH < planetR) {
                     float drop = planetR - sqrt(planetR * planetR - distH * distH);
                     transformed.y -= drop;
                 } else {
                     transformed.y -= planetR;
                 }`
            );
        };
    }

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0xa18f7c, flatShading: true, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, flatShading: true, roughness: 0.75, side: THREE.DoubleSide });
    const coconutMat = new THREE.MeshStandardMaterial({ color: 0x5a3d28, flatShading: true, roughness: 0.90 });
    const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8d7a6b, flatShading: true, roughness: 0.95 });
    const pineFoliageMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, flatShading: true, roughness: 0.85 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, flatShading: true, roughness: 0.95 });

    applyFoliageCurvature(trunkMat);
    applyFoliageCurvature(leafMat);
    applyFoliageCurvature(coconutMat);
    applyFoliageCurvature(pineTrunkMat);
    applyFoliageCurvature(pineFoliageMat);
    applyFoliageCurvature(rockMat);

    // Initialize/clear global instance arrays
    palmInstances = [];
    pineInstances = [];
    rockInstances = [];

    // Instanced meshes (assigned to global variables instead of local constants)
    instancedPalmsTrunk = new THREE.InstancedMesh(masterPalmTrunkGeo, trunkMat, palmTreesCount);
    instancedPalmsLeaves = new THREE.InstancedMesh(masterPalmLeavesGeo, leafMat, palmTreesCount);
    instancedPalmsCoconuts = new THREE.InstancedMesh(masterPalmCoconutGeo, coconutMat, palmTreesCount);
    
    instancedPinesTrunk = new THREE.InstancedMesh(masterPineTrunkGeo, pineTrunkMat, pineTreesCount);
    instancedPinesFoliage = new THREE.InstancedMesh(masterPineFoliageGeo, pineFoliageMat, pineTreesCount);
    
    instancedRocks = new THREE.InstancedMesh(masterRockGeo, rockMat, rocksCount);

    // Configure shadows
    instancedPalmsTrunk.castShadow = true; instancedPalmsTrunk.receiveShadow = true;
    instancedPalmsLeaves.castShadow = true; instancedPalmsLeaves.receiveShadow = true;
    instancedPalmsCoconuts.castShadow = true;
    
    instancedPinesTrunk.castShadow = true; instancedPinesTrunk.receiveShadow = true;
    instancedPinesFoliage.castShadow = true; instancedPinesFoliage.receiveShadow = true;
    
    instancedRocks.castShadow = true; instancedRocks.receiveShadow = true;

    envGroup.add(instancedPalmsTrunk);
    envGroup.add(instancedPalmsLeaves);
    envGroup.add(instancedPalmsCoconuts);
    envGroup.add(instancedPinesTrunk);
    envGroup.add(instancedPinesFoliage);
    envGroup.add(instancedRocks);
    
    const spawnedPositions = [];
    function isFarEnough(x, z, minDist) {
        for (const pos of spawnedPositions) {
            const dx = pos.x - x;
            const dz = pos.z - z;
            if (dx*dx + dz*dz < minDist * minDist) return false;
        }
        return true;
    }
    
    // Spawning loop for Palm Trees (placed at lower elevations / beaches)
    let attempts = 0;
    let treesPlaced = 0;
    while (treesPlaced < palmTreesCount && attempts < 1500) {
        attempts++;
        const wx = (Math.random() - 0.5) * 700.0;
        if (wx > 250.0) continue; // Keep eastern islands barren/arid!
        const wz = (Math.random() - 0.5) * 700.0;
        
        // Sample height from global height map
        const groundHeight = terrain.getSurfaceHeight(new THREE.Vector3(wx, 0, wz), 192.0);
        
        // Spawn range: between 120.5m (beaches) and 125.0m, keeping spacing
        if (groundHeight > 120.5 && groundHeight < 125.0 && isFarEnough(wx, wz, 5.0)) {
            const y = groundHeight - 0.1;
            const rotationY = Math.random() * Math.PI * 2;
            const sc = 0.8 + Math.random() * 0.45;
            
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
    
    // Spawning loop for Pine Trees (placed at higher/colder elevations)
    attempts = 0;
    let pinesPlaced = 0;
    while (pinesPlaced < pineTreesCount && attempts < 1000) {
        attempts++;
        const wx = (Math.random() - 0.5) * 700.0;
        if (wx > 250.0) continue; // Keep eastern islands barren/arid!
        const wz = (Math.random() - 0.5) * 700.0;
        
        const groundHeight = terrain.getSurfaceHeight(new THREE.Vector3(wx, 0, wz), 192.0);
        
        // Spawn pine trees on mountain slopes (125.0m up to 185.0m)
        if (groundHeight >= 125.0 && groundHeight < 185.0 && isFarEnough(wx, wz, 4.5)) {
            const y = groundHeight - 0.15;
            const rotationY = Math.random() * Math.PI * 2;
            const sc = 0.85 + Math.random() * 0.45;
            
            const position = new THREE.Vector3(wx, y, wz);
            const scale = new THREE.Vector3(sc, sc, sc);
            const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0));
            
            const matrix = new THREE.Matrix4().compose(position, rotation, scale);
            
            instancedPinesTrunk.setMatrixAt(pinesPlaced, matrix);
            instancedPinesFoliage.setMatrixAt(pinesPlaced, matrix);
            
            pineInstances.push({
                x: wx,
                y: y,
                z: wz,
                rotationY: rotationY,
                scale: sc,
                velocityY: 0,
                falling: false
            });
            
            spawnedPositions.push({ x: wx, z: wz });
            pinesPlaced++;
        }
    }
 
    // Spawning loop for Rocks
    attempts = 0;
    let rocksPlaced = 0;
    while (rocksPlaced < rocksCount && attempts < 1200) {
        attempts++;
        const wx = (Math.random() - 0.5) * 700.0;
        const wz = (Math.random() - 0.5) * 700.0;
        
        const groundHeight = terrain.getSurfaceHeight(new THREE.Vector3(wx, 0, wz), 192.0);
        
        if (groundHeight > 110.0 && groundHeight < 185.0 && isFarEnough(wx, wz, 4.0)) {
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

    // Flag instance matrices for update
    instancedPalmsTrunk.instanceMatrix.needsUpdate = true;
    instancedPalmsLeaves.instanceMatrix.needsUpdate = true;
    instancedPalmsCoconuts.instanceMatrix.needsUpdate = true;
    instancedPinesTrunk.instanceMatrix.needsUpdate = true;
    instancedPinesFoliage.instanceMatrix.needsUpdate = true;
    instancedRocks.instanceMatrix.needsUpdate = true;
    
    // Disable autoUpdate on instanced components as they are static
    instancedPalmsTrunk.matrixAutoUpdate = false;
    instancedPalmsLeaves.matrixAutoUpdate = false;
    instancedPalmsCoconuts.matrixAutoUpdate = false;
    instancedPinesTrunk.matrixAutoUpdate = false;
    instancedPinesFoliage.matrixAutoUpdate = false;
    instancedRocks.matrixAutoUpdate = false;
}

function updateHeightmap() {
    if (!terrain) return;
    const width = 256;
    const height = 64;
    const depth = 256;
    const scale = 3.0; // voxelScale
    
    for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
            // Map x [0, 255] to vx [-128, 127] centered at world (0,0)
            const vx = x - 128;
            const vz = z - 128;
            let surfaceY = 0;
            
            const colKey = `${vx},${vz}`;
            if (terrain.modifiedColumns.has(colKey)) {
                // Column has been modified, perform accurate vertical scan
                for (let y = height - 1; y >= 0; y--) {
                    if (terrain.getDensity(vx, y, vz) >= 0.0) { // solid voxel threshold
                        surfaceY = y;
                        break;
                    }
                }
            } else {
                // Instantly estimate surface height mathematically (no noise loops)
                surfaceY = terrain.getEstimatedSurfaceHeight(vx, vz);
            }
            
            // Convert local voxel Y coordinate to world height (meters)
            const h = surfaceY * scale;
            const norm = Math.max(0.0, Math.min(192.0, h)) / 192.0;
            heightmapData[x + z * width] = Math.floor(norm * 255);
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

function checkFoliageFalling() {
    if (!terrain) return;
    
    // Check palms
    for (let i = 0; i < palmInstances.length; i++) {
        const inst = palmInstances[i];
        if (inst.falling) continue;
        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 192.0);
        const targetY = groundHeight - 0.1;
        if (inst.y > targetY + 0.1) {
            inst.falling = true;
            inst.velocityY = 0;
        }
    }
    
    // Check pines
    for (let i = 0; i < pineInstances.length; i++) {
        const inst = pineInstances[i];
        if (inst.falling) continue;
        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 192.0);
        const targetY = groundHeight - 0.15;
        if (inst.y > targetY + 0.1) {
            inst.falling = true;
            inst.velocityY = 0;
        }
    }
    
    // Check rocks
    for (let i = 0; i < rockInstances.length; i++) {
        const inst = rockInstances[i];
        if (inst.falling) continue;
        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 192.0);
        const targetY = groundHeight - 0.25;
        if (inst.y > targetY + 0.1) {
            inst.falling = true;
            inst.velocityY = 0;
        }
    }
}

function updateFoliagePhysics(delta) {
    let palmUpdated = false;
    let pineUpdated = false;
    let rockUpdated = false;
    
    const gravityForce = 9.81;
    
    // Update palms
    for (let i = 0; i < palmInstances.length; i++) {
        const inst = palmInstances[i];
        if (!inst.falling) continue;
        
        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 192.0);
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
    
    // Update pines
    for (let i = 0; i < pineInstances.length; i++) {
        const inst = pineInstances[i];
        if (!inst.falling) continue;
        
        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 192.0);
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
        const scale = new THREE.Vector3(inst.scale, inst.scale, inst.scale);
        const matrix = new THREE.Matrix4().compose(position, rotation, scale);
        
        instancedPinesTrunk.setMatrixAt(i, matrix);
        instancedPinesFoliage.setMatrixAt(i, matrix);
        pineUpdated = true;
    }
    
    // Update rocks
    for (let i = 0; i < rockInstances.length; i++) {
        const inst = rockInstances[i];
        if (!inst.falling) continue;
        
        const worldPos = new THREE.Vector3(inst.x + terrain.group.position.x, 0, inst.z + terrain.group.position.z);
        const groundHeight = terrain.getSurfaceHeight(worldPos, 192.0);
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
    if (pineUpdated) {
        instancedPinesTrunk.instanceMatrix.needsUpdate = true;
        instancedPinesFoliage.instanceMatrix.needsUpdate = true;
    }
    if (rockUpdated) {
        instancedRocks.instanceMatrix.needsUpdate = true;
    }
    
    if (palmUpdated || pineUpdated || rockUpdated) {
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
