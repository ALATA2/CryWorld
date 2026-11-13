import * as THREE from 'three';

// ============================================================================
// CRYWORLD REALISM SYSTEM (V 0.212)
// 1. GPU Foliage Wind Animation (Palms, Cedars/Pines, Shrubs — 0% CPU overhead)
// 2. Geographically Coherent Regional Wildlife:
//    - Tigris/Euphrates & Mount Ararat: Golden Eagles, Caucasian/Taurus Ibex, River Barbel Fish
//    - Cleito (Atlantis) & Gibraltar: Atlantic Sea Gulls, Dolphins & Coral Reef Fish
// 3. 5-Minute Day/Night Cycle (300s) with Sunset, Starry Night, Moonlight & [N] Time Skip
// 4. Scenic Spawn Campfire at the Tigris & Euphrates Headwaters Overlook
// 5. Gentle Hydrological Spring Ripples at the Twin Sources of Tigris & Euphrates
// 6. Subtle, Positional WebAudio Campfire Crackle & Spring Water Whisper (respects [M] Mute)
// ============================================================================

export class WorldRealismSystem {
    constructor(scene, terrain, options = {}) {
        this.scene = scene;
        this.terrain = terrain;
        this.isEditor = !!options.isEditor;

        // Shared uniform for GPU foliage wind vertex shader
        this.windTimeUniform = { value: 0.0 };

        // 5-Minute (300 seconds) Full 24h Day/Night Cycle
        // timeOfDayHours in [0, 24): starts at 15.6h (3:36 PM — warm golden afternoon approaching sunset)
        this.dayCycleDurationSec = 300.0;
        this.timeOfDayHours = 15.6;
        this.elapsedTime = 0.0;

        // Reusable color objects for zero-GC sky/fog interpolation
        this._skyTopDay = new THREE.Color(0x0b5ec9);
        this._skyBotDay = new THREE.Color(0x8ce3ff);
        this._skyTopSunset = new THREE.Color(0x1b245c);
        this._skyBotSunset = new THREE.Color(0xff6b3d);
        this._skyTopNight = new THREE.Color(0x020613);
        this._skyBotNight = new THREE.Color(0x071428);
        this._sunColDay = new THREE.Color(0xfff2d6);
        this._sunColSunset = new THREE.Color(0xff8242);
        this._moonColNight = new THREE.Color(0x7caaff);
        this._ambColDay = new THREE.Color(0xfff8ee);
        this._ambColSunset = new THREE.Color(0xffb899);
        this._ambColNight = new THREE.Color(0x284068);
        this._hemiSkyDay = new THREE.Color(0x88d4ff);
        this._hemiGroundDay = new THREE.Color(0x2d5e2e);
        this._hemiSkyNight = new THREE.Color(0x1b3358);
        this._hemiGroundNight = new THREE.Color(0x0d1c18);

        this.currentTopColor = new THREE.Color(0x0b5ec9);
        this.currentBottomColor = new THREE.Color(0x8ce3ff);
        this.currentStarIntensity = 0.0;
        this.currentNightFactor = 0.0;
        this.currentSunsetFactor = 0.0;
        this.sunDirection = new THREE.Vector3(0, 0.5, 0.86);
        this.lightDirection = new THREE.Vector3(0, 0.5, 0.86);

        // Campfire & Hydrological Springs
        this.campfirePos = new THREE.Vector3(14200.5, 137.0, -13770.2);
        this.campfireGroup = null;
        this.campfireLight = null;
        this.flameMeshes = [];
        this.sparkMeshes = [];
        this.emberMesh = null;

        this.springsGroup = null;
        this.springRings = [];

        // Regional Wildlife Containers
        this.mesopotamiaWildlifeGroup = new THREE.Group();
        this.atlantisWildlifeGroup = new THREE.Group();
        this.gibraltarWildlifeGroup = new THREE.Group();
        this.borgosesiaWildlifeGroup = new THREE.Group();
        this.eagles = [];
        this.ibexHerd = [];
        this.riverFish = [];
        this.seagulls = [];
        this.dolphins = [];
        this.reefFish = [];

        // Subtle Positional WebAudio (Campfire Crackle & Spring Water)
        this.audioCtx = null;
        this.fireGain = null;
        this.springGain = null;
        this.audioInitialized = false;
        this.lastCrackleTime = 0;

        this._initSpawnCampfire();
        this._initTwinSpringsRipples();
        this._initRegionalWildlife();
    }

    // ========================================================================
    // 1. GPU FOLIAGE WIND ANIMATION INJECTION (Palms, Trees, Bushes)
    // ========================================================================
    injectFoliageWindShader(material, type = 'canopy') {
        if (!material) return;
        const windUniform = this.windTimeUniform;
        const prevCompile = material.onBeforeCompile;

        material.onBeforeCompile = (shader, renderer) => {
            if (prevCompile) prevCompile(shader, renderer);
            shader.uniforms.uWindTime = windUniform;
            shader.vertexShader = `uniform float uWindTime;\n` + shader.vertexShader;

            if (type === 'bush') {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                    #ifdef USE_INSTANCING
                        float wSeed = instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.13;
                    #else
                        float wSeed = position.x * 0.5 + position.z * 0.5;
                    #endif
                    float wHeight = clamp(position.y / 1.1, 0.0, 1.0);
                    float wPhase = uWindTime * 2.1 + wSeed;
                    transformed.x += sin(wPhase + position.z * 1.6) * 0.085 * wHeight;
                    transformed.z += cos(wPhase * 1.15 + position.x * 1.6) * 0.075 * wHeight;`
                );
            } else if (type === 'palm') {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                    #ifdef USE_INSTANCING
                        float wSeed = instanceMatrix[3].x * 0.08 + instanceMatrix[3].z * 0.09;
                    #else
                        float wSeed = 0.0;
                    #endif
                    float wHeight = clamp((position.y - 2.2) / 4.5, 0.0, 1.0);
                    float wRadial = clamp(length(position.xz) / 2.8, 0.0, 1.2);
                    float wPhase = uWindTime * 1.85 + wSeed;
                    float wGust = sin(wPhase) * 0.65 + cos(wPhase * 2.3 + position.x * 0.9) * 0.35;
                    transformed.x += wGust * 0.26 * wHeight * (0.4 + 0.6 * wRadial);
                    transformed.z += sin(wPhase * 1.25 + position.z * 0.8) * 0.20 * wHeight * (0.4 + 0.6 * wRadial);
                    transformed.y += cos(wPhase * 2.6 + position.x * 1.2) * 0.07 * wHeight * wRadial;`
                );
            } else {
                // Broadleaf / Cedar / Pine Canopy
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                    #ifdef USE_INSTANCING
                        float wSeed = instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.09;
                    #else
                        float wSeed = 0.0;
                    #endif
                    float wHeight = clamp((position.y - 1.5) / 5.5, 0.0, 1.0);
                    float wPhase = uWindTime * 1.55 + wSeed;
                    float wGust = sin(wPhase + position.y * 0.4) * 0.65 + cos(wPhase * 2.1 + position.x * 0.7) * 0.35;
                    transformed.x += wGust * 0.22 * wHeight;
                    transformed.z += sin(wPhase * 1.3 + position.z * 0.7) * 0.17 * wHeight;`
                );
            }
        };
        material.needsUpdate = true;
    }

    // ========================================================================
    // 2. SCENIC CAMPFIRE AT PLAYER SPAWN (Tigris & Euphrates Overlook)
    // ========================================================================
    _sampleTerrainHeight(wx, wz) {
        if (!this.terrain) return 137.0;
        if (this.terrain.getSurfaceHeight) {
            const h = this.terrain.getSurfaceHeight(new THREE.Vector3(wx, 240.0, wz), 240.0);
            if (Number.isFinite(h) && h > 115.0) return h;
        }
        if (this.terrain.getEstimatedSurfaceHeight) {
            return this.terrain.getEstimatedSurfaceHeight(wx / 3.0, wz / 3.0) * 3.0;
        }
        return 137.0;
    }

    _initSpawnCampfire() {
        const cx = 14200.5;
        const cz = -13770.2; // 4.8m in front of player spawn (14200, -13775) along initial +Z view
        const cy = this._sampleTerrainHeight(cx, cz);
        this.campfirePos.set(cx, cy, cz);

        this.campfireGroup = new THREE.Group();
        this.campfireGroup.position.set(cx, cy, cz);

        // 1. Dark ash & glowing ember bed disc on the ground
        const ashGeo = new THREE.CylinderGeometry(0.95, 1.15, 0.08, 16);
        const ashMat = new THREE.MeshStandardMaterial({
            color: 0x231d1a,
            roughness: 0.95
        });
        const ashMesh = new THREE.Mesh(ashGeo, ashMat);
        ashMesh.position.y = 0.02;
        this.campfireGroup.add(ashMesh);

        const emberGeo = new THREE.SphereGeometry(0.52, 12, 8);
        emberGeo.scale(1.0, 0.24, 1.0);
        const emberMat = new THREE.MeshStandardMaterial({
            color: 0xff3b00,
            emissive: 0xff4500,
            emissiveIntensity: 2.2,
            roughness: 0.6
        });
        this.emberMesh = new THREE.Mesh(emberGeo, emberMat);
        this.emberMesh.position.y = 0.07;
        this.campfireGroup.add(this.emberMesh);

        // 2. Ring of 11 weathered mountain stones encircling the fire
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x6f685f,
            roughness: 0.90,
            flatShading: true
        });
        const numStones = 11;
        for (let i = 0; i < numStones; i++) {
            const angle = (i / numStones) * Math.PI * 2.0;
            const rad = 0.96 + (i % 2) * 0.06;
            const sGeo = new THREE.DodecahedronGeometry(0.22 + (i % 3) * 0.03, 0);
            sGeo.scale(1.15, 0.68, 0.95);
            const stone = new THREE.Mesh(sGeo, stoneMat);
            stone.position.set(Math.cos(angle) * rad, 0.11, Math.sin(angle) * rad);
            stone.rotation.set(i * 0.5, -angle, i * 0.3);
            stone.castShadow = true;
            stone.receiveShadow = true;
            this.campfireGroup.add(stone);
        }

        // 3. Crossed cedar firewood logs
        const logMat = new THREE.MeshStandardMaterial({
            color: 0x4d321e,
            roughness: 0.92
        });
        const numLogs = 6;
        for (let i = 0; i < numLogs; i++) {
            const angle = (i / numLogs) * Math.PI * 2.0 + 0.25;
            const logGeo = new THREE.CylinderGeometry(0.085, 0.105, 1.28, 7);
            const log = new THREE.Mesh(logGeo, logMat);
            log.position.set(Math.cos(angle) * 0.26, 0.22, Math.sin(angle) * 0.26);
            log.rotation.order = 'YXZ';
            log.rotation.y = angle;
            log.rotation.x = 1.08;
            log.castShadow = true;
            this.campfireGroup.add(log);
        }

        // 4. Layered Animated 3D Flames (Outer Crimson-Orange tongues + Inner Golden-White core)
        const flameColors = [0xff3300, 0xff6600, 0xff9900, 0xffcc22, 0xffee88];
        for (let i = 0; i < 7; i++) {
            const isCore = i >= 4;
            const fRad = isCore ? (0.16 + (i - 4) * 0.04) : (0.26 + (i % 3) * 0.05);
            const fHeight = isCore ? 0.68 : (0.95 + (i % 2) * 0.22);
            const fGeo = new THREE.ConeGeometry(fRad, fHeight, 6);
            fGeo.translate(0, fHeight * 0.45, 0);
            const fMat = new THREE.MeshBasicMaterial({
                color: flameColors[i % flameColors.length],
                transparent: true,
                opacity: isCore ? 0.90 : 0.78,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const flame = new THREE.Mesh(fGeo, fMat);
            const ang = (i / 7) * Math.PI * 2.0;
            const dist = isCore ? 0.05 : 0.14;
            flame.position.set(Math.cos(ang) * dist, 0.12, Math.sin(ang) * dist);
            flame.userData = {
                baseX: flame.position.x,
                baseZ: flame.position.z,
                phase: i * 1.37,
                speed: 6.5 + i * 0.9,
                isCore
            };
            this.flameMeshes.push(flame);
            this.campfireGroup.add(flame);
        }

        // 5. Rising Glowing Sparks / Embers
        const sparkGeo = new THREE.OctahedronGeometry(0.032, 0);
        const sparkMat = new THREE.MeshBasicMaterial({
            color: 0xffb733,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        for (let s = 0; s < 16; s++) {
            const spark = new THREE.Mesh(sparkGeo, sparkMat.clone());
            spark.userData = {
                seed: s * 0.618,
                speed: 0.55 + (s % 5) * 0.12,
                radius: 0.12 + (s % 4) * 0.08
            };
            this.sparkMeshes.push(spark);
            this.campfireGroup.add(spark);
        }

        // 6. Warm Flickering Campfire PointLight
        this.campfireLight = new THREE.PointLight(0xff6b1a, 3.0, 34.0, 1.6);
        this.campfireLight.position.set(0, 1.15, 0);
        this.campfireGroup.add(this.campfireLight);

        this.scene.add(this.campfireGroup);
    }

    refreshCampfireHeight() {
        if (!this.campfireGroup) return;
        const y = this._sampleTerrainHeight(this.campfirePos.x, this.campfirePos.z);
        this.campfirePos.y = y;
        this.campfireGroup.position.y = y;
    }

    // ========================================================================
    // 3. HYDROLOGICAL SPRING RIPPLES AT TIGRIS & EUPHRATES HEADWATERS
    // ========================================================================
    _initTwinSpringsRipples() {
        this.springsGroup = new THREE.Group();
        // Twin Springs coordinates from getTigrisEuphratesRegion:
        // Tigris Spring: tx = +38 vox -> worldX = 14200 + 114 = 14314, tz = +12 vox -> worldZ = -13800 + 36 = -13764
        // Euphrates Spring: tx = -40 vox -> worldX = 14200 - 120 = 14080, tz = +15 vox -> worldZ = -13800 + 45 = -13755
        const springLocations = [
            { x: 14314.0, z: -13764.0, maxR: 22.0 }, // Sorgente del Tigri
            { x: 14080.0, z: -13755.0, maxR: 22.0 }, // Sorgente dell'Eufrate
            { x: 14322.0, z: -13715.0, maxR: 16.0 }, // Rapida superiore Tigri
            { x: 14072.0, z: -13705.0, maxR: 16.0 }  // Rapida superiore Eufrate
        ];

        const ringGeo = new THREE.RingGeometry(0.78, 1.0, 36);
        ringGeo.rotateX(-Math.PI / 2);

        for (let locIdx = 0; locIdx < springLocations.length; locIdx++) {
            const loc = springLocations[locIdx];
            for (let r = 0; r < 4; r++) {
                const mat = new THREE.MeshBasicMaterial({
                    color: 0xb8f8ff,
                    transparent: true,
                    opacity: 0.35,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const ring = new THREE.Mesh(ringGeo, mat);
                ring.position.set(loc.x, 120.06, loc.z);
                ring.userData = {
                    phase: r * 0.25 + locIdx * 0.17,
                    maxR: loc.maxR
                };
                this.springRings.push(ring);
                this.springsGroup.add(ring);
            }
        }
        this.scene.add(this.springsGroup);
    }

    // ========================================================================
    // 4. GEOGRAPHICALLY COHERENT REGIONAL WILDLIFE
    // ========================================================================
    _createBirdMesh(wingSpan = 2.2, bodyColor = 0x4a3219, wingTipColor = 0x24160b, beakColor = 0xd4a024) {
        const birdGroup = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.75, flatShading: true });
        const tipMat = new THREE.MeshStandardMaterial({ color: wingTipColor, roughness: 0.8, flatShading: true });
        const beakMat = new THREE.MeshStandardMaterial({ color: beakColor, roughness: 0.5 });

        // Torso
        const torsoGeo = new THREE.ConeGeometry(0.16 * (wingSpan / 2.0), 0.78 * (wingSpan / 2.0), 6);
        torsoGeo.rotateX(Math.PI / 2);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        birdGroup.add(torso);

        // Tail fan
        const tailGeo = new THREE.BoxGeometry(0.32 * (wingSpan / 2.0), 0.03, 0.28 * (wingSpan / 2.0));
        const tail = new THREE.Mesh(tailGeo, tipMat);
        tail.position.set(0, 0.02, -0.44 * (wingSpan / 2.0));
        birdGroup.add(tail);

        // Beak
        const beakGeo = new THREE.ConeGeometry(0.055 * (wingSpan / 2.0), 0.22 * (wingSpan / 2.0), 4);
        beakGeo.rotateX(Math.PI / 2);
        const beak = new THREE.Mesh(beakGeo, beakMat);
        beak.position.set(0, 0.02, 0.45 * (wingSpan / 2.0));
        birdGroup.add(beak);

        // Articulated Left & Right Wings
        const halfSpan = wingSpan * 0.5;
        const createWing = (dirSign) => {
            const pivot = new THREE.Group();
            const innerGeo = new THREE.BoxGeometry(halfSpan * 0.58, 0.035, 0.28 * (wingSpan / 2.0));
            innerGeo.translate(dirSign * halfSpan * 0.29, 0, 0);
            const innerMesh = new THREE.Mesh(innerGeo, bodyMat);
            pivot.add(innerMesh);

            const outerGeo = new THREE.BoxGeometry(halfSpan * 0.46, 0.028, 0.22 * (wingSpan / 2.0));
            outerGeo.translate(dirSign * halfSpan * 0.78, 0, -0.03);
            const outerMesh = new THREE.Mesh(outerGeo, tipMat);
            pivot.add(outerMesh);
            return pivot;
        };

        const leftWing = createWing(1);
        const rightWing = createWing(-1);
        birdGroup.add(leftWing);
        birdGroup.add(rightWing);

        birdGroup.userData.leftWing = leftWing;
        birdGroup.userData.rightWing = rightWing;
        return birdGroup;
    }

    _createMountainIbexMesh() {
        const ibex = new THREE.Group();
        const coatMat = new THREE.MeshStandardMaterial({ color: 0x8c6d4e, roughness: 0.88, flatShading: true });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x382a1e, roughness: 0.9, flatShading: true });
        const bellyMat = new THREE.MeshStandardMaterial({ color: 0xd8c8b4, roughness: 0.85, flatShading: true });

        // Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 1.25), coatMat);
        body.position.set(0, 0.78, 0);
        body.castShadow = true;
        ibex.add(body);

        const belly = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 1.15), bellyMat);
        belly.position.set(0, 0.52, 0);
        ibex.add(belly);

        // Neck & HeadPivot (for grazing animation)
        const headPivot = new THREE.Group();
        headPivot.position.set(0, 0.98, 0.54);

        const neck = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.46, 0.28), coatMat);
        neck.position.set(0, 0.14, 0.08);
        neck.rotation.x = 0.32;
        headPivot.add(neck);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.24, 0.42), coatMat);
        head.position.set(0, 0.34, 0.24);
        headPivot.add(head);

        // Characteristic Swept-Back Curved Ibex Horns (Stambecco del Tauro/Ararat)
        for (const side of [-1, 1]) {
            const horn1 = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.048, 0.48, 5), darkMat);
            horn1.position.set(side * 0.09, 0.62, 0.12);
            horn1.rotation.x = -0.68;
            horn1.rotation.z = side * -0.14;
            headPivot.add(horn1);

            const horn2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.42, 5), darkMat);
            horn2.position.set(side * 0.13, 0.74, -0.22);
            horn2.rotation.x = -1.35;
            headPivot.add(horn2);
        }

        ibex.add(headPivot);
        ibex.userData.headPivot = headPivot;

        // 4 Legs
        const legPositions = [
            [-0.18, 0.28,  0.42],
            [ 0.18, 0.28,  0.42],
            [-0.18, 0.28, -0.42],
            [ 0.18, 0.28, -0.42]
        ];
        const legs = [];
        for (let i = 0; i < 4; i++) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.56, 0.12), darkMat);
            leg.position.set(legPositions[i][0], legPositions[i][1], legPositions[i][2]);
            leg.castShadow = true;
            ibex.add(leg);
            legs.push(leg);
        }
        ibex.userData.legs = legs;
        return ibex;
    }

    _createFishMesh(length = 0.65, colorHex = 0xc8963e) {
        const fish = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.25, flatShading: true });
        const bodyGeo = new THREE.ConeGeometry(length * 0.18, length, 6);
        bodyGeo.rotateX(Math.PI / 2);
        bodyGeo.scale(0.65, 1.0, 1.0);
        const body = new THREE.Mesh(bodyGeo, mat);
        fish.add(body);

        const tailGeo = new THREE.ConeGeometry(length * 0.16, length * 0.32, 3);
        tailGeo.rotateX(-Math.PI / 2);
        tailGeo.scale(0.35, 1.0, 1.0);
        const tail = new THREE.Mesh(tailGeo, mat);
        tail.position.z = -length * 0.58;
        fish.add(tail);
        fish.userData.tail = tail;
        return fish;
    }

    _initRegionalWildlife() {
        // --------------------------------------------------------------------
        // REGION A: MESOPOTAMIA, TIGRIS/EUPHRATES HEADWATERS & MOUNT ARARAT
        // --------------------------------------------------------------------
        // 1. Aquile Reali del Tauro e dell'Ararat (14 Golden Eagles)
        const eagleCenters = [
            { x: 14200.0, z: -13740.0, baseAlt: 184.0, r: 95.0 },  // Over Tigris/Euphrates Headwaters
            { x: 14755.0, z: -14325.0, baseAlt: 268.0, r: 165.0 }, // Circling Snowy Mount Ararat Summit
            { x: 14350.0, z: -13520.0, baseAlt: 175.0, r: 120.0 }, // Upper Tigris Valley
            { x: 14040.0, z: -13500.0, baseAlt: 175.0, r: 120.0 }  // Upper Euphrates Valley
        ];
        for (let i = 0; i < 14; i++) {
            const center = eagleCenters[i % eagleCenters.length];
            const eagle = this._createBirdMesh(2.5, 0x4d3319, 0x221509, 0xe5b528);
            eagle.userData.cx = center.x + (Math.sin(i * 2.1) * 35.0);
            eagle.userData.cz = center.z + (Math.cos(i * 2.1) * 35.0);
            eagle.userData.baseY = center.baseAlt + (i % 4) * 9.0;
            eagle.userData.radius = center.r + (i % 5) * 18.0;
            eagle.userData.speed = 0.22 + (i % 4) * 0.035;
            eagle.userData.phase = i * 0.85;
            eagle.userData.flapFreq = 2.8 + (i % 3) * 0.4;
            this.eagles.push(eagle);
            this.mesopotamiaWildlifeGroup.add(eagle);
        }

        // 2. Stambecchi del Caucaso / Capre Selvatiche del Tauro (10 Mountain Ibex on alpine slopes)
        const ibexSpots = [
            { x: 14232.0, z: -13788.0 },
            { x: 14240.0, z: -13782.0 },
            { x: 14168.0, z: -13785.0 },
            { x: 14158.0, z: -13774.0 },
            { x: 14255.0, z: -13745.0 },
            { x: 14145.0, z: -13738.0 },
            { x: 14285.0, z: -13825.0 },
            { x: 14120.0, z: -13815.0 },
            { x: 14365.0, z: -13920.0 },
            { x: 14420.0, z: -13980.0 }
        ];
        for (let i = 0; i < ibexSpots.length; i++) {
            const spot = ibexSpots[i];
            const ibex = this._createMountainIbexMesh();
            const groundY = this._sampleTerrainHeight(spot.x, spot.z);
            ibex.position.set(spot.x, groundY, spot.z);
            ibex.userData.homeX = spot.x;
            ibex.userData.homeZ = spot.z;
            ibex.userData.phase = i * 1.3;
            ibex.userData.walkRadius = 6.0 + (i % 3) * 2.5;
            this.ibexHerd.push(ibex);
            this.mesopotamiaWildlifeGroup.add(ibex);
        }

        // 3. Barbi e Carpe Mesopotamiche (24 Freshwater River Fish in Tigris & Euphrates springs/channels)
        for (let i = 0; i < 24; i++) {
            const isTigris = (i % 2 === 0);
            const baseZ = -13760.0 + Math.floor(i / 2) * 32.0;
            const baseX = isTigris ? 14315.0 : 14080.0;
            const fish = this._createFishMesh(0.58 + (i % 3) * 0.12, isTigris ? 0xc89542 : 0xb58840);
            fish.userData.cx = baseX;
            fish.userData.cz = baseZ;
            fish.userData.rx = 11.0 + (i % 4) * 3.0;
            fish.userData.rz = 18.0 + (i % 3) * 6.0;
            fish.userData.depthY = 118.4 + (i % 3) * 0.35;
            fish.userData.speed = 0.65 + (i % 4) * 0.12;
            fish.userData.phase = i * 0.77;
            this.riverFish.push(fish);
            this.mesopotamiaWildlifeGroup.add(fish);
        }
        this.scene.add(this.mesopotamiaWildlifeGroup);

        // --------------------------------------------------------------------
        // REGION B: CLEITO — CAPITAL OF ATLANTIS (Center of Atlantic: -10800, -10600)
        // --------------------------------------------------------------------
        // 1. Gabbiani Reali Atlantici (18 White Sea Gulls over Cleito's harbors, canals & rings)
        for (let i = 0; i < 18; i++) {
            const gull = this._createBirdMesh(1.65, 0xf5f8fa, 0x222a34, 0xffb300);
            const ringR = 160.0 + (i % 6) * 280.0;
            const angle = (i / 18) * Math.PI * 2.0;
            gull.userData.cx = -10800.0 + Math.cos(angle) * (ringR * 0.55);
            gull.userData.cz = -10600.0 + Math.sin(angle) * (ringR * 0.55);
            gull.userData.baseY = 138.0 + (i % 5) * 6.5;
            gull.userData.radius = 65.0 + (i % 4) * 28.0;
            gull.userData.speed = 0.34 + (i % 4) * 0.05;
            gull.userData.phase = i * 0.92;
            gull.userData.flapFreq = 4.2 + (i % 3) * 0.5;
            this.seagulls.push(gull);
            this.atlantisWildlifeGroup.add(gull);
        }

        // 2. Delfini e Pesci Corallini nelle Lagune di Cleito (8 Dolphins + 24 Coral Reef Fish)
        const lagoonRadii = [565.0, 1175.0, 1795.0];
        for (let i = 0; i < 8; i++) {
            const dolphin = this._createFishMesh(2.15, 0x4f7d9c);
            const orbitR = lagoonRadii[i % lagoonRadii.length];
            dolphin.userData.orbitCenter = new THREE.Vector2(-10800.0, -10600.0);
            dolphin.userData.orbitR = orbitR + (i % 2 === 0 ? 12.0 : -12.0);
            dolphin.userData.angle = (i / 8) * Math.PI * 2.0;
            dolphin.userData.speed = 0.018 + (i % 3) * 0.004;
            dolphin.userData.phase = i * 1.15;
            this.dolphins.push(dolphin);
            this.atlantisWildlifeGroup.add(dolphin);
        }

        const reefColors = [0x00e5ff, 0xffab00, 0xff5252, 0x69f0ae];
        for (let i = 0; i < 24; i++) {
            const rFish = this._createFishMesh(0.48, reefColors[i % reefColors.length]);
            const ang = (i / 24) * Math.PI * 2.0;
            const dist = 480.0 + (i % 3) * 580.0;
            rFish.userData.cx = -10800.0 + Math.cos(ang) * dist;
            rFish.userData.cz = -10600.0 + Math.sin(ang) * dist;
            rFish.userData.rx = 18.0;
            rFish.userData.rz = 18.0;
            rFish.userData.depthY = 118.5 + (i % 3) * 0.35;
            rFish.userData.speed = 0.85 + (i % 4) * 0.15;
            rFish.userData.phase = i * 0.63;
            this.reefFish.push(rFish);
            this.atlantisWildlifeGroup.add(rFish);
        }
        this.scene.add(this.atlantisWildlifeGroup);

        // --------------------------------------------------------------------
        // REGION C: COLONNE D'ERCOLE / STRETTO DI GIBILTERRA (-2100, -12520)
        // --------------------------------------------------------------------
        for (let i = 0; i < 8; i++) {
            const gull = this._createBirdMesh(1.65, 0xf5f8fa, 0x222a34, 0xffb300);
            gull.userData.cx = -2100.0 + (i - 4) * 45.0;
            gull.userData.cz = -12580.0 + (i % 3) * 55.0;
            gull.userData.baseY = 142.0 + (i % 4) * 7.0;
            gull.userData.radius = 75.0 + (i % 3) * 20.0;
            gull.userData.speed = 0.36 + (i % 3) * 0.05;
            gull.userData.phase = i * 1.1;
            gull.userData.flapFreq = 4.4;
            this.seagulls.push(gull);
            this.gibraltarWildlifeGroup.add(gull);
        }
        this.scene.add(this.gibraltarWildlifeGroup);

        // --------------------------------------------------------------------
        // REGION D: BORGOSESIA — VALSESIA, FIUME SESIA & MONTE ROSA (2950, -15300)
        // --------------------------------------------------------------------
        // 1. Aquile Reali del Monte Rosa e della Valsesia (8 Alpine Golden Eagles)
        const borgoEagleCenters = [
            { x: 2950.0, z: -15275.0, baseAlt: 182.0, r: 90.0 },  // Over Borgosesia & Sesia River
            { x: 2425.0, z: -15840.0, baseAlt: 266.0, r: 155.0 }, // Circling Snowy Monte Rosa Massif (Punta Dufour)
            { x: 3505.0, z: -15075.0, baseAlt: 205.0, r: 105.0 }  // Over Monte Fenera Natural Park
        ];
        for (let i = 0; i < 8; i++) {
            const center = borgoEagleCenters[i % borgoEagleCenters.length];
            const eagle = this._createBirdMesh(2.45, 0x4d3319, 0x221509, 0xe5b528);
            eagle.userData.cx = center.x + (Math.sin(i * 1.9) * 30.0);
            eagle.userData.cz = center.z + (Math.cos(i * 1.9) * 30.0);
            eagle.userData.baseY = center.baseAlt + (i % 4) * 8.0;
            eagle.userData.radius = center.r + (i % 4) * 16.0;
            eagle.userData.speed = 0.23 + (i % 3) * 0.035;
            eagle.userData.phase = i * 0.95;
            eagle.userData.flapFreq = 2.8 + (i % 3) * 0.4;
            this.eagles.push(eagle);
            this.borgosesiaWildlifeGroup.add(eagle);
        }

        // 2. Stambecchi delle Alpi Valsesiane (6 Alpine Ibex on Valsesia & Monte Rosa / Monte Fenera slopes)
        const borgoIbexSpots = [
            { x: 2985.0, z: -15295.0 },
            { x: 2996.0, z: -15284.0 },
            { x: 2915.0, z: -15335.0 },
            { x: 3045.0, z: -15235.0 },
            { x: 2810.0, z: -15460.0 },
            { x: 3180.0, z: -15180.0 }
        ];
        for (let i = 0; i < borgoIbexSpots.length; i++) {
            const spot = borgoIbexSpots[i];
            const ibex = this._createMountainIbexMesh();
            const groundY = this._sampleTerrainHeight(spot.x, spot.z);
            ibex.position.set(spot.x, groundY, spot.z);
            ibex.userData.homeX = spot.x;
            ibex.userData.homeZ = spot.z;
            ibex.userData.phase = i * 1.4;
            ibex.userData.walkRadius = 5.5 + (i % 3) * 2.2;
            this.ibexHerd.push(ibex);
            this.borgosesiaWildlifeGroup.add(ibex);
        }

        // 3. Trote Marmorate e Fario del Fiume Sesia (14 Alpine River Trout swimming in the Sesia River)
        for (let i = 0; i < 14; i++) {
            const baseZ = -15360.0 + i * 24.0;
            const fish = this._createFishMesh(0.54 + (i % 3) * 0.10, (i % 2 === 0) ? 0x8ea885 : 0xb89b6a);
            fish.userData.cx = 2848.0 + ((baseZ + 15300.0) * 0.22);
            fish.userData.cz = baseZ;
            fish.userData.rx = 10.0 + (i % 3) * 2.5;
            fish.userData.rz = 15.0 + (i % 3) * 5.0;
            fish.userData.depthY = 118.45 + (i % 3) * 0.30;
            fish.userData.speed = 0.72 + (i % 4) * 0.12;
            fish.userData.phase = i * 0.83;
            this.riverFish.push(fish);
            this.borgosesiaWildlifeGroup.add(fish);
        }
        this.scene.add(this.borgosesiaWildlifeGroup);
    }

    // ========================================================================
    // 5. SUBTLE POSITIONAL WEBAUDIO (Campfire Crackle & Spring Water Whisper)
    // ========================================================================
    _updatePositionalAudio(cameraPos, isMuted, delta) {
        const distFire = cameraPos.distanceTo(this.campfirePos);
        const distSprings = Math.min(
            Math.hypot(cameraPos.x - 14200.0, cameraPos.z - (-13760.0)),
            Math.hypot(cameraPos.x - 2855.0, cameraPos.z - (-15275.0)) // Fiume Sesia at Borgosesia
        );

        // Only initialize WebAudio when player is near the campfire/springs and sound is unmuted
        if (isMuted || (distFire > 35.0 && distSprings > 180.0)) {
            if (this.fireGain && this.audioCtx) {
                this.fireGain.gain.setTargetAtTime(0.0, this.audioCtx.currentTime, 0.15);
            }
            if (this.springGain && this.audioCtx) {
                this.springGain.gain.setTargetAtTime(0.0, this.audioCtx.currentTime, 0.15);
            }
            return;
        }

        if (!this.audioInitialized) {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                this.audioCtx = new AudioCtx();

                // Create warm pink/brown noise buffer (2 seconds seamless loop)
                const sampleRate = this.audioCtx.sampleRate;
                const bufferSize = sampleRate * 2;
                const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, sampleRate);
                const output = noiseBuffer.getChannelData(0);
                let lastOut = 0.0;
                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    output[i] = (lastOut + (0.04 * white)) / 1.04;
                    lastOut = output[i];
                    output[i] *= 2.5;
                }

                // 1. Warm Hearth rumble for Campfire (Lowpass 260 Hz)
                const fireSource = this.audioCtx.createBufferSource();
                fireSource.buffer = noiseBuffer;
                fireSource.loop = true;
                const fireFilter = this.audioCtx.createBiquadFilter();
                fireFilter.type = 'lowpass';
                fireFilter.frequency.value = 260;
                this.fireGain = this.audioCtx.createGain();
                this.fireGain.gain.value = 0.0;
                fireSource.connect(fireFilter);
                fireFilter.connect(this.fireGain);
                this.fireGain.connect(this.audioCtx.destination);
                fireSource.start(0);

                // 2. Gentle Alpine Spring Stream whisper (Bandpass 620 Hz)
                const springSource = this.audioCtx.createBufferSource();
                springSource.buffer = noiseBuffer;
                springSource.loop = true;
                const springFilter = this.audioCtx.createBiquadFilter();
                springFilter.type = 'bandpass';
                springFilter.frequency.value = 620;
                springFilter.Q.value = 1.4;
                this.springGain = this.audioCtx.createGain();
                this.springGain.gain.value = 0.0;
                springSource.connect(springFilter);
                springFilter.connect(this.springGain);
                this.springGain.connect(this.audioCtx.destination);
                springSource.start(0);

                this.audioInitialized = true;
            } catch (e) {
                return;
            }
        }

        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
        if (!this.audioCtx || this.audioCtx.state !== 'running') return;

        // Distance attenuation for campfire (0m..24m, max volume 0.042 — subtle & warm)
        const fireAtten = Math.max(0.0, 1.0 - distFire / 24.0);
        const targetFireVol = fireAtten * fireAtten * 0.042;
        this.fireGain.gain.setTargetAtTime(targetFireVol, this.audioCtx.currentTime, 0.12);

        // Occasional soft wood crackle pop when standing close to the campfire (< 14m)
        const now = performance.now();
        if (distFire < 14.0 && now - this.lastCrackleTime > 260 + Math.random() * 520) {
            this.lastCrackleTime = now;
            try {
                const osc = this.audioCtx.createOscillator();
                const popGain = this.audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(950 + Math.random() * 900, this.audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(180, this.audioCtx.currentTime + 0.028);
                const popVol = fireAtten * (0.012 + Math.random() * 0.016);
                popGain.gain.setValueAtTime(popVol, this.audioCtx.currentTime);
                popGain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.032);
                osc.connect(popGain);
                popGain.connect(this.audioCtx.destination);
                osc.start();
                osc.stop(this.audioCtx.currentTime + 0.035);
            } catch (e) {}
        }

        // Distance attenuation for Twin Springs (max volume 0.022 — very gentle)
        const springAtten = Math.max(0.0, 1.0 - distSprings / 140.0);
        const targetSpringVol = springAtten * springAtten * 0.022;
        this.springGain.gain.setTargetAtTime(targetSpringVol, this.audioCtx.currentTime, 0.18);
    }

    // ========================================================================
    // 6. DAY / NIGHT CYCLE (5 MINUTES = 300s) & TIME FORMATTING
    // ========================================================================
    advanceTimeHours(hoursDelta = 3.0) {
        this.timeOfDayHours = (this.timeOfDayHours + hoursDelta) % 24.0;
        if (this.timeOfDayHours < 0) this.timeOfDayHours += 24.0;
        return this.getFormattedTimeOfDay();
    }

    getFormattedTimeOfDay() {
        const totalMinutes = Math.floor(this.timeOfDayHours * 60) % 1440;
        const hh = Math.floor(totalMinutes / 60);
        const mm = totalMinutes % 60;
        const padH = String(hh).padStart(2, '0');
        const padM = String(mm).padStart(2, '0');
        let icon = '☀️';
        let label = 'Giorno';
        if (hh >= 5 && hh < 8) {
            icon = '🌅';
            label = 'Alba';
        } else if (hh >= 18 && hh < 21) {
            icon = '🌇';
            label = 'Tramonto';
        } else if (hh >= 21 || hh < 5) {
            icon = '🌙';
            label = 'Notte';
        }
        return { hh, mm, text: `${icon} ${padH}:${padM}`, label };
    }

    // ========================================================================
    // MAIN PER-FRAME UPDATE
    // ========================================================================
    update(delta, cameraPos, lightingRefs = {}) {
        const dt = Math.min(delta, 0.1);
        this.elapsedTime += dt;
        this.windTimeUniform.value = this.elapsedTime;

        // 1. Advance 5-Minute Day/Night Cycle (24h in 300s -> 0.08 hours per second)
        this.timeOfDayHours = (this.timeOfDayHours + (dt * 24.0) / this.dayCycleDurationSec) % 24.0;

        // Convert timeOfDayHours [0..24) to solar angle:
        // 6:00 = sunrise (0°), 12:00 = solar noon (+58°), 18:00 = sunset (0°), 0:00 = midnight (-58°)
        const dayAngle = ((this.timeOfDayHours - 6.0) / 24.0) * Math.PI * 2.0;
        const sinElev = Math.sin(dayAngle); // -1 at midnight, 0 at 6:00/18:00, +1 at 12:00
        const sunElevDeg = sinElev * 56.0;
        const sunAzimuthDeg = 95.0 + ((this.timeOfDayHours / 24.0) * 210.0);

        const phi = THREE.MathUtils.degToRad(90.0 - sunElevDeg);
        const theta = THREE.MathUtils.degToRad(sunAzimuthDeg);
        this.sunDirection.setFromSphericalCoords(1.0, phi, theta).normalize();

        // Compute smooth Day / Sunset / Night blend factors
        // sunsetFactor peaks when sinElev is between -0.14 and +0.28 (dawn & dusk golden hour)
        const duskBand = 1.0 - Math.min(1.0, Math.abs(sinElev - 0.06) / 0.28);
        this.currentSunsetFactor = Math.max(0.0, duskBand * duskBand * (3.0 - 2.0 * duskBand));

        // nightFactor transitions smoothly from 0 (day) to 1 (night) when sinElev < 0.08
        const rawNight = THREE.MathUtils.clamp((0.08 - sinElev) / 0.34, 0.0, 1.0);
        this.currentNightFactor = rawNight * rawNight * (3.0 - 2.0 * rawNight);
        const dayFactor = 1.0 - this.currentNightFactor;

        // Compute Sky Zenith & Horizon colors
        let baseAtmo = this._skyBotDay;
        if (this.terrain && this.terrain.getPlanetaryAtmosphereColor) {
            baseAtmo = this.terrain.getPlanetaryAtmosphereColor(cameraPos.x, cameraPos.y, cameraPos.z);
        }

        this.currentTopColor.copy(this._skyTopDay)
            .lerp(this._skyTopSunset, this.currentSunsetFactor * 0.78)
            .lerp(this._skyTopNight, this.currentNightFactor);

        this.currentBottomColor.copy(baseAtmo)
            .lerp(this._skyBotSunset, this.currentSunsetFactor * 0.85)
            .lerp(this._skyBotNight, this.currentNightFactor);

        this.currentStarIntensity = THREE.MathUtils.clamp((this.currentNightFactor - 0.15) / 0.75, 0.0, 1.0);

        // Update directional light, ambient light, hemisphere light & water sun reflection
        const { dirLight, ambientLight, hemiLight, water, sky } = lightingRefs;
        if (sky && sky.material && sky.material.uniforms) {
            sky.material.uniforms['sunDirection'].value.copy(this.sunDirection);
        }

        // At night, dirLight smoothly switches to silvery Moonlight from above so terrain remains scenic & readable
        if (this.currentNightFactor < 0.65) {
            this.lightDirection.copy(this.sunDirection);
            if (this.lightDirection.y < 0.12) this.lightDirection.y = 0.12;
            this.lightDirection.normalize();
        } else {
            this.lightDirection.set(-this.sunDirection.x, Math.max(0.32, -this.sunDirection.y), -this.sunDirection.z).normalize();
        }

        if (dirLight) {
            dirLight.color.copy(this._sunColDay)
                .lerp(this._sunColSunset, this.currentSunsetFactor * 0.88)
                .lerp(this._moonColNight, this.currentNightFactor);
            dirLight.intensity = THREE.MathUtils.lerp(2.40, 0.52, this.currentNightFactor)
                               * (1.0 - this.currentSunsetFactor * 0.22);
            dirLight.position.copy(dirLight.target.position).addScaledVector(this.lightDirection, 360.0);
        }

        if (ambientLight) {
            ambientLight.color.copy(this._ambColDay)
                .lerp(this._ambColSunset, this.currentSunsetFactor * 0.65)
                .lerp(this._ambColNight, this.currentNightFactor);
            ambientLight.intensity = THREE.MathUtils.lerp(0.55, 0.34, this.currentNightFactor);
        }

        if (hemiLight) {
            hemiLight.color.copy(this._hemiSkyDay).lerp(this._hemiSkyNight, this.currentNightFactor);
            hemiLight.groundColor.copy(this._hemiGroundDay).lerp(this._hemiGroundNight, this.currentNightFactor);
            hemiLight.intensity = THREE.MathUtils.lerp(0.65, 0.38, this.currentNightFactor);
        }

        if (water && water.material && water.material.uniforms) {
            if (water.material.uniforms['sunDirection']) {
                water.material.uniforms['sunDirection'].value.copy(this.lightDirection);
            }
            if (water.material.uniforms['sunColor']) {
                water.material.uniforms['sunColor'].value.copy(this._sunColDay)
                    .lerp(this._sunColSunset, this.currentSunsetFactor * 0.90)
                    .lerp(this._moonColNight, this.currentNightFactor * 0.85);
            }
        }

        // 2. Animate Spawn Campfire & Twin Springs (when within Mesopotamia region)
        const distMesopotamia = Math.hypot(cameraPos.x - 14200.0, cameraPos.z - (-13775.0));
        const inMesopotamia = distMesopotamia < 4200.0;

        if (this.campfireGroup) {
            this.campfireGroup.visible = inMesopotamia;
            if (inMesopotamia) {
                const t = this.elapsedTime;
                // Flicker point light stronger at sunset & night for dramatic campfire atmosphere
                const nightBoost = 1.0 + this.currentNightFactor * 0.95 + this.currentSunsetFactor * 0.45;
                const flicker = 1.0 + Math.sin(t * 11.3) * 0.12 + Math.cos(t * 17.7) * 0.08 + Math.sin(t * 29.1) * 0.05;
                if (this.campfireLight) {
                    this.campfireLight.intensity = 2.8 * nightBoost * flicker;
                    this.campfireLight.distance = 32.0 + this.currentNightFactor * 14.0;
                }
                if (this.emberMesh && this.emberMesh.material) {
                    this.emberMesh.material.emissiveIntensity = (2.0 + Math.sin(t * 6.5) * 0.45) * nightBoost;
                }

                // Animate 3D flame tongues
                for (let i = 0; i < this.flameMeshes.length; i++) {
                    const f = this.flameMeshes[i];
                    const ud = f.userData;
                    const wave = Math.sin(t * ud.speed + ud.phase);
                    const wave2 = Math.cos(t * (ud.speed * 1.3) + ud.phase);
                    f.scale.set(
                        1.0 + wave * 0.16,
                        0.88 + (0.5 + 0.5 * wave2) * 0.34,
                        1.0 - wave * 0.16
                    );
                    f.position.x = ud.baseX + wave * 0.035;
                    f.position.z = ud.baseZ + wave2 * 0.035;
                    f.rotation.z = wave * 0.14;
                    f.rotation.x = wave2 * 0.12;
                }

                // Animate rising sparks
                for (let i = 0; i < this.sparkMeshes.length; i++) {
                    const sp = this.sparkMeshes[i];
                    const ud = sp.userData;
                    const life = (t * ud.speed + ud.seed) % 1.0;
                    const angle = t * 2.5 + ud.seed * 6.28;
                    const r = ud.radius * (0.4 + life * 1.4);
                    sp.position.set(
                        Math.cos(angle) * r,
                        0.28 + life * 2.45,
                        Math.sin(angle) * r
                    );
                    const sScale = Math.sin(life * Math.PI);
                    sp.scale.setScalar(Math.max(0.01, sScale));
                    sp.material.opacity = (1.0 - life) * 0.9;
                }
            }
        }

        if (this.springsGroup) {
            this.springsGroup.visible = inMesopotamia;
            if (inMesopotamia) {
                for (let i = 0; i < this.springRings.length; i++) {
                    const ring = this.springRings[i];
                    const cyc = (this.elapsedTime * 0.28 + ring.userData.phase) % 1.0;
                    const rad = 1.5 + cyc * ring.userData.maxR;
                    ring.scale.setScalar(rad);
                    ring.material.opacity = Math.sin(cyc * Math.PI) * 0.26 * (0.45 + 0.55 * dayFactor);
                }
            }
        }

        // 3. Animate Regional Wildlife (Only active in current geographic zone -> Zero CPU waste!)
        const distBorgosesia = Math.hypot(cameraPos.x - 2950.0, cameraPos.z - (-15300.0));
        const inBorgosesia = distBorgosesia < 3200.0;
        this.mesopotamiaWildlifeGroup.visible = inMesopotamia;
        this.borgosesiaWildlifeGroup.visible = inBorgosesia;

        if (inMesopotamia || inBorgosesia) {
            const t = this.elapsedTime;
            // Golden Eagles soaring over Mount Ararat, Tigris/Euphrates Headwaters, or Monte Rosa & Borgosesia
            for (let i = 0; i < this.eagles.length; i++) {
                const eagle = this.eagles[i];
                if (!eagle.parent || !eagle.parent.visible) continue;
                const ud = eagle.userData;
                const ang = t * ud.speed + ud.phase;
                const nx = ud.cx + Math.cos(ang) * ud.radius;
                const nz = ud.cz + Math.sin(ang) * ud.radius;
                const ny = ud.baseY + Math.sin(t * 0.8 + ud.phase) * 4.5;
                eagle.position.set(nx, ny, nz);
                // Face tangent direction of flight
                eagle.rotation.y = Math.atan2(-Math.sin(ang), Math.cos(ang));
                eagle.rotation.z = -0.18 * Math.cos(t * 0.5 + ud.phase); // Bank in thermal turn

                // Glide + slow majestic wingbeat
                const glideCycle = Math.sin(t * 0.7 + ud.phase);
                const flap = (glideCycle > 0.2)
                    ? Math.sin(t * ud.flapFreq + ud.phase) * 0.38
                    : 0.08 + Math.sin(t * 1.2 + ud.phase) * 0.04;
                eagle.userData.leftWing.rotation.z = flap;
                eagle.userData.rightWing.rotation.z = -flap;
            }

            // Caucasian / Taurus / Valsesia Alpine Ibex grazing & walking on alpine ledges
            for (let i = 0; i < this.ibexHerd.length; i++) {
                const ibex = this.ibexHerd[i];
                if (!ibex.parent || !ibex.parent.visible) continue;
                const ud = ibex.userData;
                const cycle = t * 0.35 + ud.phase;
                const isWalking = Math.sin(cycle * 0.7) > 0.15;
                if (isWalking) {
                    const walkAng = cycle * 0.45;
                    const wx = ud.homeX + Math.cos(walkAng) * ud.walkRadius;
                    const wz = ud.homeZ + Math.sin(walkAng) * ud.walkRadius;
                    ibex.position.x = wx;
                    ibex.position.z = wz;
                    ibex.rotation.y = Math.atan2(-Math.sin(walkAng), Math.cos(walkAng));
                    const legSwing = Math.sin(t * 4.5 + ud.phase) * 0.32;
                    ibex.userData.legs[0].rotation.x = legSwing;
                    ibex.userData.legs[1].rotation.x = -legSwing;
                    ibex.userData.legs[2].rotation.x = -legSwing;
                    ibex.userData.legs[3].rotation.x = legSwing;
                    ibex.userData.headPivot.rotation.x = 0.05;
                } else {
                    // Grazing grass motion
                    ibex.userData.legs[0].rotation.x = 0;
                    ibex.userData.legs[1].rotation.x = 0;
                    ibex.userData.legs[2].rotation.x = 0;
                    ibex.userData.legs[3].rotation.x = 0;
                    ibex.userData.headPivot.rotation.x = 0.38 + Math.sin(t * 2.2 + ud.phase) * 0.18;
                }
            }

            // River Fish swimming in Tigris, Euphrates, or Fiume Sesia
            for (let i = 0; i < this.riverFish.length; i++) {
                const fish = this.riverFish[i];
                if (!fish.parent || !fish.parent.visible) continue;
                const ud = fish.userData;
                const ang = t * ud.speed + ud.phase;
                fish.position.set(
                    ud.cx + Math.cos(ang) * ud.rx,
                    ud.depthY + Math.sin(t * 1.5 + ud.phase) * 0.15,
                    ud.cz + Math.sin(ang) * ud.rz
                );
                fish.rotation.y = Math.atan2(-Math.sin(ang) * ud.rx, Math.cos(ang) * ud.rz);
                fish.userData.tail.rotation.y = Math.sin(t * 9.0 + ud.phase) * 0.35;
            }
        }

        // Atlantis Wildlife (Cleito in Atlantic Ocean)
        const distAtlantis = Math.hypot(cameraPos.x - (-10800.0), cameraPos.z - (-10600.0));
        const inAtlantis = distAtlantis < 4800.0;
        this.atlantisWildlifeGroup.visible = inAtlantis;

        const distGibraltar = Math.hypot(cameraPos.x - (-2100.0), cameraPos.z - (-12520.0));
        const inGibraltar = distGibraltar < 3200.0;
        this.gibraltarWildlifeGroup.visible = inGibraltar;

        if (inAtlantis || inGibraltar) {
            const t = this.elapsedTime;
            for (let i = 0; i < this.seagulls.length; i++) {
                const gull = this.seagulls[i];
                if (!gull.parent.visible) continue;
                const ud = gull.userData;
                const ang = t * ud.speed + ud.phase;
                gull.position.set(
                    ud.cx + Math.cos(ang) * ud.radius,
                    ud.baseY + Math.sin(t * 1.1 + ud.phase) * 2.8,
                    ud.cz + Math.sin(ang) * ud.radius
                );
                gull.rotation.y = Math.atan2(-Math.sin(ang), Math.cos(ang));
                const flap = Math.sin(t * ud.flapFreq + ud.phase) * 0.42;
                gull.userData.leftWing.rotation.z = flap;
                gull.userData.rightWing.rotation.z = -flap;
            }
        }

        if (inAtlantis) {
            const t = this.elapsedTime;
            // Dolphins swimming & gracefully cresting in Cleito's concentric lagoons
            for (let i = 0; i < this.dolphins.length; i++) {
                const d = this.dolphins[i];
                const ud = d.userData;
                ud.angle += dt * ud.speed;
                const crest = Math.sin(t * 1.45 + ud.phase);
                const dy = 119.35 + crest * 0.85;
                d.position.set(
                    ud.orbitCenter.x + Math.cos(ud.angle) * ud.orbitR,
                    dy,
                    ud.orbitCenter.y + Math.sin(ud.angle) * ud.orbitR
                );
                d.rotation.y = Math.atan2(-Math.sin(ud.angle), Math.cos(ud.angle));
                d.rotation.x = -Math.cos(t * 1.45 + ud.phase) * 0.28;
                d.userData.tail.rotation.x = Math.sin(t * 6.5 + ud.phase) * 0.32;
            }

            // Coral Reef Fish in Cleito's shallow lagoons
            for (let i = 0; i < this.reefFish.length; i++) {
                const rf = this.reefFish[i];
                const ud = rf.userData;
                const ang = t * ud.speed + ud.phase;
                rf.position.set(
                    ud.cx + Math.cos(ang) * ud.rx,
                    ud.depthY + Math.sin(t * 1.8 + ud.phase) * 0.12,
                    ud.cz + Math.sin(ang) * ud.rz
                );
                rf.rotation.y = Math.atan2(-Math.sin(ang), Math.cos(ang));
                rf.userData.tail.rotation.y = Math.sin(t * 10.0 + ud.phase) * 0.38;
            }
        }

        // 4. Subtle Positional Audio Update
        this._updatePositionalAudio(cameraPos, !!lightingRefs.isMuted, dt);
    }
}
