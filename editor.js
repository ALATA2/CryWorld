import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";
import { VoxelTerrain } from "./marching_cubes.js";

// ==========================================
// EDITOR GAMEPLAY STATE & GLOBALS
// ==========================================
let scene, camera, renderer, clock;
let terrain, water, sky, sun;
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
let camYaw = 0;
let camPitch = -0.15;
let playerPos = new THREE.Vector3(0, 126, 300); // Start on island plateau
let playerVelocity = new THREE.Vector3();
let camMode = "drone"; // "drone" (freecam fly), "walk" (grounded FPS physics), "topdown"
let savedDronePos = new THREE.Vector3(0, 150, 300);
let savedDronePitch = -0.2;
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
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ce3ff);
    scene.fog = new THREE.Fog(0x8ce3ff, 250, 750); // Exact gameplay fog distance!

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

    // Ambient and Directional Lighting matching Gameplay
    const ambientLight = new THREE.AmbientLight(0xdff4ff, 0.85);
    scene.add(ambientLight);

    sun = new THREE.Vector3(120, 280, 150).normalize();
    const dirLight = new THREE.DirectionalLight(0xfff6e5, 1.6);
    dirLight.position.set(200, 450, 250);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 1400;
    dirLight.shadow.camera.left = -450;
    dirLight.shadow.camera.right = 450;
    dirLight.shadow.camera.top = 450;
    dirLight.shadow.camera.bottom = -450;
    scene.add(dirLight);

    // Sky Dome matching Gameplay
    sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);
    const skyUniforms = sky.material.uniforms;
    skyUniforms["turbidity"].value = 3.5;
    skyUniforms["rayleigh"].value = 1.1;
    skyUniforms["mieCoefficient"].value = 0.005;
    skyUniforms["mieDirectionalG"].value = 0.8;
    skyUniforms["sunPosition"].value.copy(dirLight.position);

    // Realistic Planetary Ocean Plane with Horizon Curvature (Matching main.js V 0.201)
    const waterNormalsTexture = new THREE.TextureLoader().load("waternormals.jpg", function (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
    });

    const waterGeometry = new THREE.CircleGeometry(3200, 128);
    water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: waterNormalsTexture,
        sunDirection: sun,
        sunColor: 0xffdfaa,
        waterColor: 0x005a78,
        distortionScale: 1.5,
        alpha: 0.96
    });
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 120.0, 0); // Sea level at Y = 120.0m
    water.material.side = THREE.DoubleSide;
    water.material.transparent = true;

    // Inject planetary curvature into water shader
    const cameraPosUniform = { value: new THREE.Vector3() };
    water.material.uniforms["cameraPos"] = cameraPosUniform;
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

    scene.add(water);

    // Marching Cubes Voxel Terrain (Planetary Engine with Height 88 voxels)
    terrain = new VoxelTerrain(scene, 256, 88, 256, 3.0);
    terrain.updateChunksAroundPlayer(playerPos, 850);

    // Auto-load custom map from localStorage if present
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
    requestAnimationFrame(animate);
}

// ==========================================
// CONTROLS & EVENT LISTENERS
// ==========================================
function setupEvents() {
    // Blocker / Start Editing Button
    btnStartEditing.addEventListener("click", () => {
        enterPointerLock();
    });

    blocker.addEventListener("click", (e) => {
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

    updateModCount();
    saveToLocalStorage();
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
        // Tropical palm with curved trunk and fronds
        const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 6, 7);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0xa18f7c, roughness: 0.9, flatShading: true });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 3;
        trunk.rotation.z = (Math.random() - 0.5) * 0.2;

        const frondsGeo = new THREE.ConeGeometry(3.6, 2.2, 7);
        const frondsMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.8, flatShading: true });
        const fronds = new THREE.Mesh(frondsGeo, frondsMat);
        fronds.position.y = 6.2;
        group.add(trunk, fronds);
    } else if (type === "pine") {
        // Mountain conifer pine
        const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 4.5, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d7a6b, roughness: 0.9, flatShading: true });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 2.25;

        const pineGeo = new THREE.ConeGeometry(2.8, 7.5, 7);
        const pineMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.85, flatShading: true });
        const pine = new THREE.Mesh(pineGeo, pineMat);
        pine.position.y = 6.0;
        group.add(trunk, pine);
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
        // Alpine flowering shrub
        const bushGeo = new THREE.SphereGeometry(1.4, 7, 6);
        const bushMat = new THREE.MeshStandardMaterial({ color: 0x55efc4, roughness: 0.85, flatShading: true });
        const bush = new THREE.Mesh(bushGeo, bushMat);
        bush.position.y = 1.0;
        group.add(bush);
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

    // 2. Keep Water Plane Centered horizontally & update waves
    water.material.uniforms["time"].value += delta * 0.12;
    water.material.uniforms["cameraPos"].value.copy(camera.position);
    water.position.x = camera.position.x;
    water.position.z = camera.position.z;

    // 3. Adaptive Atmospheric Fog matching Planetary Biome
    if (terrain.getPlanetaryAtmosphereColor) {
        const atmoColor = terrain.getPlanetaryAtmosphereColor(camera.position.x, camera.position.y, camera.position.z);
        scene.fog.color.lerp(atmoColor, 0.08);
        scene.background.lerp(atmoColor, 0.08);
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

    // 8. Stream voxel chunks around player/camera
    terrain.updateChunksAroundPlayer(camera.position, 750);
    terrain.update();

    renderer.render(scene, camera);
}

// Start Level Builder
init();
