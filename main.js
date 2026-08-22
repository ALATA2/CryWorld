import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { VoxelTerrain } from './marching_cubes.js';

// ==========================================
// GAME STATE variables
// ==========================================
let scene, camera, renderer, clock;
let terrain, water, sky, sun, shoreWaves, shoreWaveMaterial;
let controls;
let spear, pickaxe, isDiggingAnim = false, animTime = 0;
let activeSlot = 1;
let clouds = [];
let gameStarted = false;

// Movement flags & velocities
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const keyStates = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    Space: false,
    ShiftLeft: false
};

let isGrounded = false;
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

// FPS counting variables
let fpsLastTime = performance.now();
let fpsFrames = 0;

// Initialize the game
init();
animate();

// ==========================================
// CORE INITIALIZATION
// ==========================================
function init() {
    // 1. Scene & Camera Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x44a2e6); // Deep tropical sky blue background
    scene.fog = new THREE.FogExp2(0x44a2e6, 0.001); // Clear, very thin tropical sky fog

    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 20, 45); // Start on beach slope

    clock = new THREE.Clock();

    // 2. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('game-canvas') });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio to 2 for performance
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    // 4. Sky and Sun Configuration (Custom Gradient Sky Dome)
    const skyGeo = new THREE.SphereGeometry(1, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0078d7) }, // Deep tropical cobalt blue
            bottomColor: { value: new THREE.Color(0x8ce3ff) }, // Caribbean cyan horizon
            exponent: { value: 0.6 },
            sunDirection: { value: new THREE.Vector3() }
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
            void main() {
                vec3 dir = normalize(vWorldPosition);
                float h = max(0.0, dir.y);
                vec3 skyColor = mix(bottomColor, topColor, pow(h, exponent));
                
                // Add a soft sun disk and corona glow
                float sunGlow = max(0.0, dot(dir, normalize(sunDirection)));
                vec3 sunColor = vec3(1.0, 1.0, 0.95);
                skyColor += sunColor * pow(sunGlow, 180.0) * 0.75; // Sun disk core
                skyColor += sunColor * pow(sunGlow, 12.0) * 0.20;  // Outer corona
                
                gl_FragColor = vec4(skyColor, 1.0);
            }
        `,
        side: THREE.BackSide,
        depthWrite: false
    });
    sky = new THREE.Mesh(skyGeo, skyMat);
    sky.scale.setScalar(4000); // Scale comfortably inside far clipping plane
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
        
        // Dynamically update water shader sunlight direction if initialized
        if (water) {
            water.material.uniforms['sunDirection'].value.copy(sun).normalize();
        }
    }
    updateSky();

    // 5. Water Setup
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    water = new Water(
        waterGeometry,
        {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals: new THREE.TextureLoader().load('waternormals.jpg', function (texture) {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                // Trilinear filtering and mipmapping prevents texture shimmering/vibrating in the distance
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
            }),
            sunDirection: sun,
            sunColor: 0xffaa44, // Golden sunset sun reflections
            waterColor: 0x004c66, // Warm tropical blue-cyan
            distortionScale: 1.2, // Low distortion prevents high-frequency pixel vibration
            fog: scene.fog !== undefined
        }
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 8.0; // Sea level at Y = 8.0 meters
    
    // Make water double-sided so you can see the surface from underneath
    water.material.side = THREE.DoubleSide;
    
    scene.add(water);

    // 5b. Shore Waves Setup (Soft breathing waves using dynamic shader)
    // Footprint scaled to the tripled island dimensions (360m x 360m)
    const shoreWaveGeometry = new THREE.PlaneGeometry(360, 360, 64, 64);
    shoreWaveMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false, // Prevents ocean occlusion issues
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide, // Visible from underwater looking up
        // Polygon offset offsets the depth testing to completely prevent z-fighting / shoreline flickering
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -4.0,
        uniforms: {
            time: { value: 0 },
            islandCenter: { value: new THREE.Vector2(0, 0) }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform float time;
            varying vec3 vWorldPosition;
            varying vec2 vUv;

            // Pseudo-random noise function in GLSL
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            // 2D Value Noise
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                           mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
            }

            void main() {
                // Distance from center (0, 0) in the XZ world plane
                float d = length(vWorldPosition.xz);

                // Distort distance with noise for an organic wave contour
                float scale = 0.05;
                float waveNoise = noise(vWorldPosition.xz * scale + time * 0.05) * 5.0;
                float wavyDist = d + waveNoise;

                // Slow breathing tide (Gentle wash back and forth on the beach, period ~7 seconds)
                float tide = sin(time * 0.9) * 2.0;

                // Foam line is active at the breathing tide contact zone
                float distToTide = abs(wavyDist - (134.0 + tide));

                // Single soft shore foam band
                float foam = smoothstep(5.0, 0.0, distToTide) * 0.7;

                // Add secondary bubbly detail to the foam
                float bubbleNoise = noise(vWorldPosition.xz * 0.35 - time * 0.2) * 0.25;
                foam += bubbleNoise * smoothstep(0.1, 0.6, foam);

                // Break up the foam line using large noise mask to look like natural sea foam patches
                float patchNoise = noise(vWorldPosition.xz * 0.08 - time * 0.08);
                foam *= smoothstep(0.2, 0.65, patchNoise);

                // Shore Mask: ensure waves only exist in the beach surf zone (110m to 165m)
                float shoreMask = smoothstep(165.0, 140.0, d) * smoothstep(110.0, 128.0, d);

                // Permanent subtle background shore foam at the beach edge (very soft)
                float ambientFoam = smoothstep(138.0, 126.0, d) * 0.04 * (0.8 + 0.2 * sin(time * 1.0));

                float alpha = (foam * shoreMask) + ambientFoam;
                vec3 foamColor = vec3(0.92, 0.96, 1.0); // Soft cyan-tinted ocean foam white

                // Reduced overall opacity for a subtle, natural, non-distracting look
                gl_FragColor = vec4(foamColor, alpha * 0.40);
            }
        `
    });

    shoreWaves = new THREE.Mesh(shoreWaveGeometry, shoreWaveMaterial);
    shoreWaves.rotation.x = -Math.PI / 2;
    shoreWaves.position.y = 8.05; // 5cm above sea level to eliminate z-fighting
    scene.add(shoreWaves);

    // 6. Marching Cubes Voxel Terrain Setup
    // Tripled footprint: Width = 128, Height = 32, Depth = 128, VoxelScale = 3.0 (total island footprint: 384m x 96m x 384m)
    terrain = new VoxelTerrain(scene, 128, 32, 128, 3.0);

    // Position player safely on the beach of the larger island
    const startX = 0;
    const startZ = 120;
    const testPos = new THREE.Vector3(startX, 20, startZ);
    const groundY = terrain.getSurfaceHeight(testPos, 32);
    camera.position.set(startX, groundY + playerHeight, startZ);

    // 7. Player Controls (First Person) Setup
    controls = new PointerLockControls(camera, document.body);

    blocker.addEventListener('click', () => {
        controls.lock();
    });

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
        const resetY = terrain.getSurfaceHeight(resetPos, 32);
        camera.position.set(startX, resetY + playerHeight, startZ);
        velocity.set(0, 0, 0);
    });

    scene.add(controls.getObject());

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

    // 7bc. Low-Poly Floating Clouds Setup (matches low-poly sample screenshots)
    const cloudsGroup = new THREE.Group();
    scene.add(cloudsGroup);
    
    const cloudMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        flatShading: true,
        roughness: 0.9,
        metalness: 0.0
    });
    
    for (let c = 0; c < 15; c++) {
        const cloud = new THREE.Group();
        const partsCount = 3 + Math.floor(Math.random() * 3);
        for (let p = 0; p < partsCount; p++) {
            const rad = 6.0 + Math.random() * 8.0;
            const part = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 0), cloudMat);
            part.position.set(
                (p - partsCount/2) * rad * 0.75,
                (Math.random() - 0.5) * rad * 0.2,
                (Math.random() - 0.5) * rad * 0.2
            );
            part.scale.set(1.4, 0.5 + Math.random() * 0.3, 1.0); // Squash flat
            cloud.add(part);
        }
        
        const range = 1000;
        cloud.position.set(
            (Math.random() - 0.5) * range,
            110 + Math.random() * 70,
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
        } else if (slotNum === 7) {
            if (spear) spear.visible = false;
            if (pickaxe) pickaxe.visible = true;
        } else {
            if (spear) spear.visible = false;
            if (pickaxe) pickaxe.visible = false;
        }
    }
    
    // Listen for keys 1 to 8
    window.addEventListener('keydown', (event) => {
        const key = event.key;
        if (key >= '1' && key <= '8') {
            selectSlot(parseInt(key));
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
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Perform raycasting and modify terrain
function handleTerrainInteraction() {
    if (!controls.isLocked) return;
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
        // Ensure we hit a valid surface that is reasonably close (e.g. within 35 meters)
        if (hit.distance < 35.0) {
            const mode = isDigging ? 'dig' : 'build';
            
            // Dig/Build radius: 3.5 meters
            const modified = terrain.modifyTerrain(hit.point, 3.5, mode);
            
            if (modified) {
                // Instantly rebuild the dirty chunks in this frame
                terrain.update();
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

    // 1. FPS counter update
    fpsFrames++;
    if (time > fpsLastTime + 1000) {
        fpsCounter.textContent = Math.round((fpsFrames * 1000) / (time - fpsLastTime));
        fpsFrames = 0;
        fpsLastTime = time;
    }

    if (controls.isLocked) {
        // 2. Terrain Interaction (Dig/Build holding mouse)
        handleTerrainInteraction();

        // 3. Movement Physics (Gravity & Collisions)
        const inWater = camera.position.y < 8.0;
        
        // Walk controls dampening (less horizontal drag in water to glide)
        const dragFactor = inWater ? 6.0 : 10.0;
        velocity.x -= velocity.x * dragFactor * delta;
        velocity.z -= velocity.z * dragFactor * delta;
        
        // Strong vertical damping in water to simulate drag and stabilize floating
        velocity.y -= velocity.y * (inWater ? 4.0 : 1.0) * delta;

        // Apply gravity (neutralized/reduced underwater to feel buoyant)
        if (inWater) {
            velocity.y -= gravity * 0.05 * delta; // 95% gravity reduction
        } else {
            velocity.y -= gravity * delta;
        }

        // Jump execution or swim upwards
        if (keyStates.Space) {
            if (inWater) {
                // Swim upwards actively using Space
                velocity.y += 18.0 * delta;
            } else if (isGrounded) {
                velocity.y = jumpForce;
                isGrounded = false;
            }
        }

        direction.z = Number(keyStates.KeyW) - Number(keyStates.KeyS);
        direction.x = Number(keyStates.KeyA) - Number(keyStates.KeyD);
        direction.normalize(); // Ensure uniform movement speed

        // Running speed if Shift is held down
        let currentSpeed = keyStates.ShiftLeft ? runSpeed : moveSpeed;

        // Apply underwater speed drag
        if (inWater) {
            currentSpeed *= 0.45;
        }

        const isMoving = keyStates.KeyW || keyStates.KeyS || keyStates.KeyA || keyStates.KeyD;

        if (keyStates.KeyW || keyStates.KeyS) velocity.z -= direction.z * currentSpeed * delta;
        if (keyStates.KeyA || keyStates.KeyD) velocity.x -= direction.x * currentSpeed * delta;

        // Swimming pitch and buoyancy mechanics
        if (inWater) {
            if (isMoving) {
                // Swim up/down based on camera look direction pitch and move direction (W/S)
                const lookDir = new THREE.Vector3();
                camera.getWorldDirection(lookDir);
                // direction.z is positive for W, negative for S
                velocity.y += lookDir.y * direction.z * currentSpeed * 0.8 * delta;
            } else if (!keyStates.Space) {
                // Buoyancy: slowly float up to the surface if idle
                const floatSurface = 7.95; // target eye level at surface
                if (camera.position.y < floatSurface) {
                    const diff = floatSurface - camera.position.y;
                    velocity.y += diff * 1.5 * delta;
                }
            }
        }

        // Apply movement vector horizontally (fixed A/D inversion)
        controls.moveRight(velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Keep player inside island coordinate boundaries
        const boundX = (terrain.width * terrain.voxelScale) / 2 - 2;
        const boundZ = (terrain.depth * terrain.voxelScale) / 2 - 2;
        camera.position.x = Math.max(-boundX, Math.min(boundX, camera.position.x));
        camera.position.z = Math.max(-boundZ, Math.min(boundZ, camera.position.z));

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
            // Landing on the ground
            camera.position.y = groundHeight + playerHeight;
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

        // 4. Update HUD Coordinates (meters scaled)
        posInfo.textContent = `X: ${Math.round(camera.position.x)} Y: ${Math.round(camera.position.y - 8.0)} Z: ${Math.round(camera.position.z)}`;
    }

    // 5. Water waves animation (reduced speed from 0.5 to 0.12 to prevent shoreline vibration)
    water.material.uniforms['time'].value += delta * 0.12;

    // 5b. Shore waves animation
    if (shoreWaveMaterial) {
        shoreWaveMaterial.uniforms['time'].value += delta;
    }

    // 5bb. Check if player camera is underwater (Y < 8.0m) to trigger immersive effects
    const underwaterOverlay = document.getElementById('underwater-overlay');
    if (camera.position.y < 8.0) {
        const depth = 8.0 - camera.position.y;
        // Maximum effect reached at 3.5m depth
        const depthFactor = Math.min(depth / 3.5, 1.0);

        if (underwaterOverlay) {
            underwaterOverlay.classList.remove('hidden');
            // Opacity scales with depth, plus a gentle caustics pulse
            const baseOpacity = 0.32 * depthFactor;
            const wavePulse = baseOpacity + Math.sin(clock.getElapsedTime() * 1.6) * 0.03 * depthFactor;
            underwaterOverlay.style.background = `rgba(0, 200, 240, ${Math.max(0.0, wavePulse)})`;
        }

        // Interpolate fog color from sky blue (0x8ce3ff) to tropical turquoise (0x00aacc)
        const skyFog = new THREE.Color(0x8ce3ff);
        const waterFog = new THREE.Color(0x00aacc);
        skyFog.lerp(waterFog, depthFactor);
        scene.fog.color.copy(skyFog);

        // Interpolate fog density from clear air (0.0015) to dense water (0.045)
        scene.fog.density = 0.0015 + (0.045 - 0.0015) * depthFactor;

        // Interpolate exposure from bright noon (1.15) to dimmer underwater (0.75)
        renderer.toneMappingExposure = 1.15 - (1.15 - 0.75) * depthFactor;
    } else {
        if (underwaterOverlay) {
            underwaterOverlay.classList.add('hidden');
        }
        // Restore deep clear tropical sky-blue fog and exposure settings
        scene.fog.color.setHex(0x8ce3ff); // Matches the sky horizon bottomColor
        scene.fog.density = 0.0015; // Very thin, clear horizon fade
        renderer.toneMappingExposure = 1.15;
    }

    // 5c. Active Tool swing animation tick (First Person stabbing/swinging effect)
    if (isDiggingAnim) {
        const tool = (activeSlot === 1) ? spear : ((activeSlot === 7) ? pickaxe : null);
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
                tool.position.set(0.35, -0.35, -0.6);
                tool.rotation.set(-0.25, -0.25, 0);
            }
        } else {
            // No tool visible for this slot, reset animation flag immediately
            isDiggingAnim = false;
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

    // 5e. Center the sky dome on the player so it renders infinitely around them
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
            const rBottom = 0.4 * (1.0 - i / (trunkSegmentsCount + 3));
            const rTop = 0.4 * (1.0 - (i + 1) / (trunkSegmentsCount + 3));
            
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
            
            trunkGroup.add(segment);
            currentHeight += h * 0.88;
        }
        treeGroup.add(trunkGroup);
        
        // Leaves at the crown (drooping arching palm fronds)
        const leavesCount = 8 + Math.floor(Math.random() * 3);
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
            let rotX = 0.15; // Initial upward/outward tilt
            const leafSegments = 5; // Construct leaf from chained segments to curve it
            
            for (let j = 0; j < leafSegments; j++) {
                // Taper size towards the tip
                const w = 0.52 * (1.0 - j / leafSegments);
                const l = 0.85;
                const h = 0.02;
                
                const bladeGeo = new THREE.BoxGeometry(w, h, l);
                const blade = new THREE.Mesh(bladeGeo, leafMat);
                blade.castShadow = true;
                
                // Position relative to current segment joint
                blade.position.set(0, curY, curZ + l / 2);
                blade.rotation.x = -rotX;
                leaf.add(blade);
                
                // Move joint pointer forward along the curve
                curZ += l * Math.cos(rotX) * 0.95;
                curY -= l * Math.sin(rotX) * 0.95;
                
                // Increase downward rotation for next segment (droop/arch)
                rotX += 0.22;
            }
            
            leavesGroup.add(leaf);
        }
        treeGroup.add(leavesGroup);
        
        // Add a cluster of 3 coconuts at the center of the palm crown
        const coconutMat = new THREE.MeshStandardMaterial({
            color: 0x5a3d28, // Coconut shell brown
            flatShading: true,
            roughness: 0.9
        });
        for (let c = 0; c < 3; c++) {
            const coconutGeo = new THREE.SphereGeometry(0.24, 4, 4);
            const coconut = new THREE.Mesh(coconutGeo, coconutMat);
            const cAngle = c * (Math.PI * 2 / 3);
            coconut.position.set(
                topSegment.position.x + Math.cos(cAngle) * 0.28,
                currentHeight - 0.4,
                topSegment.position.z + Math.sin(cAngle) * 0.28
            );
            treeGroup.add(coconut);
        }
        
        return treeGroup;
    }
    
    // Procedural low-poly Pine Tree generator (matches conifer pine in screenshot 1 and 3)
    function createPineTree() {
        const treeGroup = new THREE.Group();
        
        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.12, 0.28, 2.5, 4);
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x8d7a6b, // Light grey-brown wood
            flatShading: true,
            roughness: 0.95
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.25;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        treeGroup.add(trunk);
        
        // Foliage cones (3 stacked cones)
        const foliageMat = new THREE.MeshStandardMaterial({
            color: 0x27ae60, // Bright conifer pine green
            flatShading: true,
            roughness: 0.85
        });
        
        const cone1 = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.8, 4), foliageMat);
        cone1.position.y = 2.2;
        cone1.castShadow = true;
        treeGroup.add(cone1);
        
        const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.4, 4), foliageMat);
        cone2.position.y = 3.2;
        cone2.castShadow = true;
        treeGroup.add(cone2);
        
        const cone3 = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.0, 4), foliageMat);
        cone3.position.y = 4.1;
        cone3.castShadow = true;
        treeGroup.add(cone3);
        
        return treeGroup;
    }

    // Low-poly Rock/Boulder generator
    function createRock() {
        const rad = 1.0 + Math.random() * 2.8;
        // Dodecahedron provides flat faceted rock surfaces
        const rockGeo = new THREE.DodecahedronGeometry(rad, 0);
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x95a5a6, // Soft light granite grey
            flatShading: true,
            roughness: 0.95
        });
        
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.castShadow = true;
        rock.receiveShadow = true;
        
        // Stretch rock scale randomly on X, Y, Z to look like a jagged boulder
        rock.scale.set(
            0.8 + Math.random() * 1.0,
            0.5 + Math.random() * 0.7,
            0.8 + Math.random() * 1.0
        );
        
        rock.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        
        return rock;
    }
    
    // Group to hold env meshes. Centered relative to voxel terrain group
    const envGroup = new THREE.Group();
    envGroup.position.copy(terrain.group.position);
    scene.add(envGroup);
    
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
        const vx = 4 + Math.random() * (terrain.width - 8);
        const vz = 4 + Math.random() * (terrain.depth - 8);
        
        const wx = vx * terrain.voxelScale;
        const wz = vz * terrain.voxelScale;
        
        // Sample height from global height map
        const groundHeight = terrain.getSurfaceHeight(new THREE.Vector3(wx + terrain.group.position.x, 0, wz + terrain.group.position.z), 32);
        
        // Spawn range: between 9.0m (beaches) and 20.0m (lower plains), keeping spacing
        if (groundHeight > 8.8 && groundHeight < 20.0 && isFarEnough(wx, wz, 5.0)) {
            const tree = createPalmTree();
            tree.position.set(wx, groundHeight - 0.1, wz);
            
            const sc = 0.8 + Math.random() * 0.45;
            tree.scale.set(sc, sc, sc);
            tree.rotation.y = Math.random() * Math.PI * 2;
            
            envGroup.add(tree);
            spawnedPositions.push({ x: wx, z: wz });
            treesPlaced++;
        }
    }
    
    // Spawning loop for Pine Trees (placed at higher/colder elevations)
    attempts = 0;
    let pinesPlaced = 0;
    while (pinesPlaced < pineTreesCount && attempts < 1000) {
        attempts++;
        const vx = 4 + Math.random() * (terrain.width - 8);
        const vz = 4 + Math.random() * (terrain.depth - 8);
        
        const wx = vx * terrain.voxelScale;
        const wz = vz * terrain.voxelScale;
        
        const groundHeight = terrain.getSurfaceHeight(new THREE.Vector3(wx + terrain.group.position.x, 0, wz + terrain.group.position.z), 32);
        
        // Spawn pine trees on mountain slopes (20.0m up to 55.0m)
        if (groundHeight >= 20.0 && groundHeight < 55.0 && isFarEnough(wx, wz, 4.5)) {
            const pine = createPineTree();
            pine.position.set(wx, groundHeight - 0.15, wz);
            
            const sc = 0.85 + Math.random() * 0.45;
            pine.scale.set(sc, sc, sc);
            pine.rotation.y = Math.random() * Math.PI * 2;
            
            envGroup.add(pine);
            spawnedPositions.push({ x: wx, z: wz });
            pinesPlaced++;
        }
    }

    // Spawning loop for Rocks
    attempts = 0;
    let rocksPlaced = 0;
    while (rocksPlaced < rocksCount && attempts < 1200) {
        attempts++;
        const vx = 3 + Math.random() * (terrain.width - 6);
        const vz = 3 + Math.random() * (terrain.depth - 6);
        
        const wx = vx * terrain.voxelScale;
        const wz = vz * terrain.voxelScale;
        
        const groundHeight = terrain.getSurfaceHeight(new THREE.Vector3(wx + terrain.group.position.x, 0, wz + terrain.group.position.z), 32);
        
        if (groundHeight > 7.0 && groundHeight < 55.0 && isFarEnough(wx, wz, 4.0)) {
            const rock = createRock();
            rock.position.set(wx, groundHeight - 0.25, wz);
            
            envGroup.add(rock);
            spawnedPositions.push({ x: wx, z: wz });
            rocksPlaced++;
        }
    }
}
