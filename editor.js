import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";
import { VoxelTerrain } from "./marching_cubes.js";

// ==========================================
// EDITOR STATE
// ==========================================
let scene, camera, renderer, clock;
let terrain, water, sky, sun;
let brushRing, brushTargetPos = new THREE.Vector3();
let raycaster, mouse = new THREE.Vector2(-999, -999);
let isLeftMouseDown = false, isRightMouseDown = false, isShiftDown = false;
let isTopDown = false;

let currentTool = "sculpt"; // sculpt, flatten, smooth, foliage, stamp, eraser
let brushRadius = 18.0;
let brushStrength = 1.0;
let foliageType = "palm"; // palm, pine, rock
let stampType = "atoll"; // atoll, volcano, mountain

// Camera controls (Positioned directly above the player spawn island at X:0, Z:312)
let camPos = new THREE.Vector3(0, 260, 480);
let camYaw = 0, camPitch = -0.52;
let keys = {};
let foliageInstances = [];
let foliageGroup;

// Tool Colors
const toolColors = {
    sculpt: 0x00d2ff,
    flatten: 0xff9800,
    smooth: 0x29b6f6,
    foliage: 0x00e676,
    stamp: 0xab47bc,
    eraser: 0xff5252
};

// UI Elements
const uiCursorPos = document.getElementById("cursor-pos");
const uiModCount = document.getElementById("mod-count");
const uiValRadius = document.getElementById("val-radius");
const uiValStrength = document.getElementById("val-strength");
const sliderRadius = document.getElementById("slider-radius");
const sliderStrength = document.getElementById("slider-strength");
const groupType = document.getElementById("group-type");
const selectType = document.getElementById("select-type");
const lblType = document.getElementById("lbl-type");
const toast = document.getElementById("toast");
const fileInput = document.getElementById("file-input");

function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
}

// ==========================================
// INITIALIZATION
// ==========================================
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ce3ff);
    scene.fog = new THREE.Fog(0x8ce3ff, 300, 2500);

    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();

    const canvas = document.getElementById("editor-canvas");
    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 6000);
    camera.position.copy(camPos);
    camera.rotation.set(camPitch, camYaw, 0, "YXZ");

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xdff4ff, 0.85);
    scene.add(ambientLight);

    sun = new THREE.Vector3(120, 280, 150).normalize();
    const dirLight = new THREE.DirectionalLight(0xfff6e5, 1.6);
    dirLight.position.set(200, 450, 250);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 1200;
    dirLight.shadow.camera.left = -400;
    dirLight.shadow.camera.right = 400;
    dirLight.shadow.camera.top = 400;
    dirLight.shadow.camera.bottom = -400;
    scene.add(dirLight);

    // Sky
    sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);
    const skyUniforms = sky.material.uniforms;
    skyUniforms["turbidity"].value = 4.0;
    skyUniforms["rayleigh"].value = 1.2;
    skyUniforms["mieCoefficient"].value = 0.005;
    skyUniforms["mieDirectionalG"].value = 0.8;
    skyUniforms["sunPosition"].value.copy(dirLight.position);

    // Ocean Plane
    const waterGeometry = new THREE.CircleGeometry(3200, 96);
    water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: new THREE.TextureLoader().load("waternormals.jpg", function (texture) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }),
        sunDirection: sun,
        sunColor: 0xffdfaa,
        waterColor: 0x005a78,
        distortionScale: 1.5,
        alpha: 0.82
    });
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 120.0, 0);
    water.material.side = THREE.DoubleSide;
    scene.add(water);

    // Voxel Terrain
    terrain = new VoxelTerrain(scene, 256, 64, 256, 3.0);
    terrain.updateChunksAroundPlayer(new THREE.Vector3(0, 130, 312), 1000);

    // Auto-load custom map if exists
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

    // Brush Indicator (3D Glowing Ring)
    const ringGeo = new THREE.RingGeometry(0.92, 1.0, 48);
    const ringMat = new THREE.MeshBasicMaterial({
        color: toolColors.sculpt,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthTest: false
    });
    brushRing = new THREE.Mesh(ringGeo, ringMat);
    brushRing.rotation.x = -Math.PI / 2;
    brushRing.visible = false;
    scene.add(brushRing);

    setupEvents();
    setupUI();

    window.addEventListener("resize", onWindowResize);
    requestAnimationFrame(animate);
}

// ==========================================
// INPUT & EVENTS
// ==========================================
function setupEvents() {
    window.addEventListener("keydown", (e) => {
        keys[e.code] = true;
        if (e.code === "ShiftLeft" || e.code === "ShiftRight") isShiftDown = true;
        
        // Tool Hotkeys
        if (e.key === "1") setTool("sculpt");
        if (e.key === "2") setTool("flatten");
        if (e.key === "3") setTool("smooth");
        if (e.key === "4") setTool("foliage");
        if (e.key === "5") setTool("stamp");
        if (e.key === "6") setTool("eraser");
        if (e.code === "KeyT") toggleTopDown();
        
        // Radius hotkeys [ and ]
        if (e.key === "[") {
            brushRadius = Math.max(3, brushRadius - 3);
            sliderRadius.value = brushRadius;
            uiValRadius.textContent = brushRadius + "m";
        }
        if (e.key === "]") {
            brushRadius = Math.min(60, brushRadius + 3);
            sliderRadius.value = brushRadius;
            uiValRadius.textContent = brushRadius + "m";
        }
    });

    window.addEventListener("keyup", (e) => {
        keys[e.code] = false;
        if (e.code === "ShiftLeft" || e.code === "ShiftRight") isShiftDown = false;
    });

    window.addEventListener("mousemove", (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        if (isRightMouseDown) {
            camYaw -= e.movementX * 0.0035;
            camPitch -= e.movementY * 0.0035;
            camPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camPitch));
        }

        if (isLeftMouseDown && (currentTool === "sculpt" || currentTool === "flatten" || currentTool === "smooth" || currentTool === "eraser")) {
            applyCurrentTool();
        }
    });

    window.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
        if (e.button === 0) {
            isLeftMouseDown = true;
            applyCurrentTool();
        } else if (e.button === 2) {
            isRightMouseDown = true;
        }
    });

    window.addEventListener("mouseup", (e) => {
        if (e.button === 0) isLeftMouseDown = false;
        if (e.button === 2) isRightMouseDown = false;
    });

    window.addEventListener("wheel", (e) => {
        if (isTopDown) {
            camera.position.y = Math.max(150, Math.min(2000, camera.position.y + e.deltaY * 0.8));
        } else {
            const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(camPitch, camYaw, 0, "YXZ"));
            camera.position.addScaledVector(forward, -e.deltaY * 0.4);
        }
    }, { passive: true });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
}

// ==========================================
// TOOLS LOGIC
// ==========================================
function applyCurrentTool() {
    if (!brushRing.visible) return;
    const hit = brushTargetPos;

    if (currentTool === "sculpt") {
        const mode = isShiftDown ? "remove" : "add";
        terrain.modifyTerrain(hit, brushRadius, mode);
    } else if (currentTool === "flatten") {
        const targetY = hit.y;
        flattenTerrain(hit, brushRadius, targetY);
    } else if (currentTool === "smooth") {
        smoothTerrain(hit, brushRadius);
    } else if (currentTool === "foliage") {
        paintFoliage(hit, brushRadius, foliageType);
    } else if (currentTool === "stamp") {
        stampIsland(hit, stampType);
    } else if (currentTool === "eraser") {
        eraseTerrain(hit, brushRadius);
    }

    updateModCount();
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

            for (let y = 1; y < terrain.height; y++) {
                if (y <= cyTarget) {
                    terrain.setDensity(x, y, z, 1.0);
                } else {
                    terrain.setDensity(x, y, z, -1.0);
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

            for (let y = 1; y < terrain.height - 1; y++) {
                const current = terrain.getDensity(x, y, z);
                const avg = (terrain.getDensity(x+1, y, z) + terrain.getDensity(x-1, y, z) +
                             terrain.getDensity(x, y+1, z) + terrain.getDensity(x, y-1, z) +
                             terrain.getDensity(x, y, z+1) + terrain.getDensity(x, y, z-1)) / 6.0;
                terrain.setDensity(x, y, z, THREE.MathUtils.lerp(current, avg, 0.4));
            }
        }
    }
}

function eraseTerrain(center, radius) {
    const rVox = Math.ceil(radius / terrain.voxelScale);
    const cx = Math.round(center.x / terrain.voxelScale);
    const cz = Math.round(center.z / terrain.voxelScale);

    for (let x = cx - rVox; x <= cx + rVox; x++) {
        for (let z = cz - rVox; z <= cz + rVox; z++) {
            for (let y = 0; y < terrain.height; y++) {
                const key = `${x},${y},${z}`;
                if (terrain.modifiedVoxels.has(key)) {
                    terrain.modifiedVoxels.delete(key);
                }
            }
        }
    }
    for (const chunk of terrain.loadedChunks.values()) {
        chunk.dirty = true;
    }
}

function stampIsland(center, type) {
    const cx = center.x;
    const cz = center.z;

    if (type === "atoll") {
        // Create circular atoll ring
        const ringR = 85.0;
        const width = 28.0;
        for (let angle = 0; angle < Math.PI * 2; angle += 0.08) {
            const px = cx + Math.cos(angle) * ringR;
            const pz = cz + Math.sin(angle) * ringR;
            terrain.modifyTerrain(new THREE.Vector3(px, 122.0, pz), width, "add");
        }
        showToast("Timbro Atollo applicato!");
    } else if (type === "volcano") {
        // Create volcanic cone with crater
        terrain.modifyTerrain(new THREE.Vector3(cx, 150.0, cz), 90.0, "add");
        terrain.modifyTerrain(new THREE.Vector3(cx, 160.0, cz), 32.0, "remove");
        showToast("Timbro Vulcano applicato!");
    } else if (type === "mountain") {
        // Sharp mountain peak
        terrain.modifyTerrain(new THREE.Vector3(cx, 165.0, cz), 65.0, "add");
        showToast("Timbro Montagna applicato!");
    }
}

function paintFoliage(center, radius, type) {
    const count = Math.floor(radius * 0.4);
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius;
        const wx = center.x + Math.cos(angle) * dist;
        const wz = center.z + Math.sin(angle) * dist;
        const groundY = terrain.getSurfaceHeight(new THREE.Vector3(wx, 0, wz), 192.0);
        if (groundY > 120.5) {
            spawnFoliageItem(wx, groundY, wz, type);
        }
    }
}

function spawnFoliageItem(x, y, z, type) {
    const group = new THREE.Group();
    if (type === "palm") {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 6, 6), new THREE.MeshStandardMaterial({ color: 0xa18f7c, roughness: 0.9 }));
        trunk.position.y = 3;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(3.5, 2.5, 6), new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.8 }));
        leaves.position.y = 6.5;
        group.add(trunk, leaves);
    } else if (type === "pine") {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 4, 6), new THREE.MeshStandardMaterial({ color: 0x8d7a6b, roughness: 0.9 }));
        trunk.position.y = 2;
        const foliage = new THREE.Mesh(new THREE.ConeGeometry(2.8, 7.0, 6), new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.85 }));
        foliage.position.y = 5.5;
        group.add(trunk, foliage);
    } else if (type === "rock") {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + Math.random() * 1.5, 1), new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.95, flatShading: true }));
        rock.position.y = 1.0;
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        group.add(rock);
    }
    group.position.set(x, y, z);
    foliageGroup.add(group);
    foliageInstances.push({ x, y, z, type });
}

// ==========================================
// UI & CONTROLS SETUP
// ==========================================
function setupUI() {
    document.querySelectorAll(".tool-btn").forEach(btn => {
        btn.addEventListener("click", () => setTool(btn.dataset.tool));
    });

    sliderRadius.addEventListener("input", (e) => {
        brushRadius = parseFloat(e.target.value);
        uiValRadius.textContent = brushRadius + "m";
    });

    sliderStrength.addEventListener("input", (e) => {
        brushStrength = parseFloat(e.target.value);
        uiValStrength.textContent = brushStrength.toFixed(1);
    });

    selectType.addEventListener("change", (e) => {
        if (currentTool === "foliage") foliageType = e.target.value;
        if (currentTool === "stamp") stampType = e.target.value;
    });

    document.getElementById("btn-topdown").addEventListener("click", toggleTopDown);

    document.getElementById("btn-export").addEventListener("click", exportMap);
    document.getElementById("btn-import").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", importMap);

    document.getElementById("btn-play").addEventListener("click", () => {
        exportMap(false);
        showToast("Lancio del gioco...");
        setTimeout(() => window.location.href = "index.html", 400);
    });

    document.getElementById("btn-reset").addEventListener("click", () => {
        if (confirm("Vuoi azzerare tutte le modifiche alla mappa?")) {
            localStorage.removeItem("cryworld_custom_map");
            location.reload();
        }
    });
}

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll(".tool-btn").forEach(b => b.classList.toggle("active", b.dataset.tool === tool));

    // Update brush ring color
    brushRing.material.color.setHex(toolColors[tool] || 0x00d2ff);

    // Update secondary type selector
    if (tool === "foliage") {
        groupType.style.display = "flex";
        lblType.textContent = "Vegetation";
        selectType.innerHTML = `
            <option value="palm">🌴 Palma Tropicale</option>
            <option value="pine">🌲 Pino di Montagna</option>
            <option value="rock">🪨 Masso Roccioso</option>
        `;
        selectType.value = foliageType;
    } else if (tool === "stamp") {
        groupType.style.display = "flex";
        lblType.textContent = "Island Preset";
        selectType.innerHTML = `
            <option value="atoll">⭕ Atollo Circolare</option>
            <option value="volcano">🌋 Vulcano con Cratere</option>
            <option value="mountain">🏔️ Picco Montano</option>
        `;
        selectType.value = stampType;
    } else {
        groupType.style.display = "none";
    }
}

function toggleTopDown() {
    isTopDown = !isTopDown;
    const btn = document.getElementById("btn-topdown");
    if (isTopDown) {
        btn.classList.add("btn-primary");
        camera.position.set(0, 750, 312);
        camera.rotation.set(-Math.PI / 2, 0, 0);
    } else {
        btn.classList.remove("btn-primary");
        camera.position.set(0, 260, 480);
        camYaw = 0;
        camPitch = -0.52;
    }
}

function updateModCount() {
    if (uiModCount && terrain) {
        uiModCount.textContent = `Mods: ${terrain.modifiedVoxels.size} voxels`;
    }
}

function exportMap(downloadFile = true) {
    const mapData = {
        version: 1,
        date: new Date().toISOString(),
        voxels: terrain.exportMapData(),
        foliage: foliageInstances
    };

    const jsonStr = JSON.stringify(mapData);
    localStorage.setItem("cryworld_custom_map", JSON.stringify(mapData.voxels));

    if (downloadFile) {
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cryworld_map.json";
        a.click();
        URL.revokeObjectURL(url);
        showToast("Mappa esportata in cryworld_map.json!");
    }
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
                localStorage.setItem("cryworld_custom_map", JSON.stringify(data.voxels));
            }
            if (data.foliage) {
                foliageGroup.clear();
                foliageInstances = [];
                for (const f of data.foliage) {
                    spawnFoliageItem(f.x, f.y, f.z, f.type);
                }
            }
            updateModCount();
            showToast("Mappa importata con successo!");
        } catch (err) {
            alert("Errore nel caricamento del file JSON: " + err.message);
        }
    };
    reader.readAsText(file);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// ANIMATION LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    // Freecam Movement
    if (!isTopDown) {
        const speed = (keys["ShiftLeft"] || keys["ShiftRight"]) ? 320.0 : 120.0;
        const moveVector = new THREE.Vector3();

        if (keys["KeyW"]) moveVector.z -= 1;
        if (keys["KeyS"]) moveVector.z += 1;
        if (keys["KeyA"]) moveVector.x -= 1;
        if (keys["KeyD"]) moveVector.x += 1;
        if (keys["KeyE"]) moveVector.y += 1;
        if (keys["KeyQ"]) moveVector.y -= 1;

        moveVector.normalize();

        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, camYaw, 0, "YXZ"));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, camYaw, 0, "YXZ"));

        camera.position.addScaledVector(forward, -moveVector.z * speed * delta);
        camera.position.addScaledVector(right, moveVector.x * speed * delta);
        camera.position.y += moveVector.y * speed * delta;

        camera.rotation.set(camPitch, camYaw, 0, "YXZ");
    }

    // Raycast for 3D Brush Position
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(terrain.group.children, true);

    if (intersects.length > 0) {
        brushTargetPos.copy(intersects[0].point);
        brushRing.position.copy(brushTargetPos);
        brushRing.position.y += 0.15; // float slightly above ground
        brushRing.scale.setScalar(brushRadius);
        brushRing.visible = true;

        if (uiCursorPos) {
            uiCursorPos.textContent = `Cursor: X: ${Math.round(brushTargetPos.x)} Y: ${Math.round(brushTargetPos.y)} Z: ${Math.round(brushTargetPos.z)}`;
        }
    } else {
        // Fallback raycast to water plane at Y = 120.0
        const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -120.0);
        const waterHit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(waterPlane, waterHit)) {
            brushTargetPos.copy(waterHit);
            brushRing.position.copy(brushTargetPos);
            brushRing.position.y = 120.2;
            brushRing.scale.setScalar(brushRadius);
            brushRing.visible = true;

            if (uiCursorPos) {
                uiCursorPos.textContent = `Cursor: X: ${Math.round(brushTargetPos.x)} Y: 120 Z: ${Math.round(brushTargetPos.z)}`;
            }
        } else {
            brushRing.visible = false;
        }
    }

    // Update active chunks in editor
    terrain.updateChunksAroundPlayer(camera.position, 1000);

    renderer.render(scene, camera);
}

init();
