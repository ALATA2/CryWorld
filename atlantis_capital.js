import * as THREE from 'three';

/**
 * ATLANTIS CAPITAL ("CLEITO") — MONUMENTAL 4X ARCHITECTURE & FAR-RING LOD
 * Faithful to Plato's Critias (115c - 117e):
 *  - Muro Esterno (r = 2185m): Outermost land ring, completely clad in gleaming Bronze (Bronzo).
 *  - Muro Intermedio (r = 1545m): Next belt inward, completely clad in silvery Tin (Stagno).
 *  - Muro Interno (r = 390m): Central Acropolis wall, clad in mythical Orichalcum (Oricalco) shining with fiery red light.
 *  - Muro d'Oro (r = 148m): Innermost Golden Wall inside the Acropolis, enclosing the Sacred Sanctuary of Poseidon & Cleito.
 *  - Tempio Sacro di Poseidone e Clito, Fonti Sacre, Reggia Imperiale & Ponti Monumentali sui Canali Concentrici.
 */
export function createAtlantisCapital(scene, terrain) {
    const group = new THREE.Group();
    group.name = 'AtlantisCapitalGroup';

    const sharedUniforms = {
        uTime: { value: 0.0 },
        uCameraPos: { value: new THREE.Vector3() },
        uChunkHideRadius: { value: 960.0 }
    };

    // Helper: inject planetary horizon curvature matching VoxelTerrain & Water
    function applyPlanetaryCurvature(material) {
        const prevCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
            shader.uniforms.uCameraPos = sharedUniforms.uCameraPos;
            shader.uniforms.uTime = sharedUniforms.uTime;
            shader.vertexShader = `uniform vec3 uCameraPos;\n` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `vec4 wpAtl = modelMatrix * vec4(transformed, 1.0);
                 #ifdef USE_INSTANCING
                     wpAtl = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
                 #endif
                 float atlDistH = length(wpAtl.xz - uCameraPos.xz);
                 float atlPlanetR = 1800000.0;
                 if (atlDistH < atlPlanetR) {
                     float atlDrop = atlPlanetR - sqrt(atlPlanetR * atlPlanetR - atlDistH * atlDistH);
                     wpAtl.y -= atlDrop;
                 }
                 vec4 mvPosition = viewMatrix * wpAtl;
                 gl_Position = projectionMatrix * mvPosition;`
            );
            if (prevCompile) prevCompile(shader, renderer);
        };
        return material;
    }

    // Exact analytical surface height in meters at world (wx, wz)
    function sampleGroundY(wx, wz) {
        return terrain.getEstimatedSurfaceHeight(wx / 3.0, wz / 3.0) * 3.0;
    }

    // =========================================================================
    // 1. SEAMLESS 1-DRAW-CALL DISTANT TERRAIN LOD FOR 4X CLEITO (r = 0..2440m)
    // Ensures all 3 concentric rings & Acropolis are 100% visible across 4.9 km
    // in Walk & Fly Mode while keeping Marching Cubes chunk count lightweight!
    // =========================================================================
    {
        const radialSteps = 156;
        const angularSteps = 224;
        const maxRadius = 2440.0;
        const vertCount = (radialSteps + 1) * (angularSteps + 1);

        const positions = new Float32Array(vertCount * 3);
        const normals   = new Float32Array(vertCount * 3);
        const colors    = new Float32Array(vertCount * 3);
        const indices   = [];

        const cSand  = new THREE.Color(0xe6c47e);
        const cScrub = new THREE.Color(0x528a2e);
        const cGreen = new THREE.Color(0x2d7a22);
        const cLush  = new THREE.Color(0x469629);
        const tmpCol = new THREE.Color();

        let ptr = 0;
        for (let ir = 0; ir <= radialSteps; ir++) {
            const r = (ir / radialSteps) * maxRadius;
            for (let ia = 0; ia <= angularSteps; ia++) {
                const theta = (ia / angularSteps) * Math.PI * 2.0;
                const wx = Math.cos(theta) * r;
                const wz = Math.sin(theta) * r;
                const wy = sampleGroundY(wx, wz);

                positions[ptr * 3]     = wx;
                positions[ptr * 3 + 1] = wy - 0.35; // Slight 35cm tuck so nearby MC chunks smoothly overlap
                positions[ptr * 3 + 2] = wz;

                const eps = 6.0;
                const hx = (sampleGroundY(wx + eps, wz) - sampleGroundY(wx - eps, wz)) / (2.0 * eps);
                const hz = (sampleGroundY(wx, wz + eps) - sampleGroundY(wx, wz - eps)) / (2.0 * eps);
                const invLen = 1.0 / Math.sqrt(hx * hx + 1.0 + hz * hz);
                normals[ptr * 3]     = -hx * invLen;
                normals[ptr * 3 + 1] = invLen;
                normals[ptr * 3 + 2] = -hz * invLen;

                // Smooth organic sand -> coastal scrub -> emerald green hill tint matching Marching Cubes shader
                const wave = Math.sin(wx * 0.018 + wz * 0.015) * 1.4 + Math.cos(wx * 0.041 - wz * 0.037) * 0.8;
                const effY = wy + wave;
                if (effY < 121.6) {
                    tmpCol.copy(cSand);
                } else if (effY < 125.2) {
                    tmpCol.lerpColors(cSand, cScrub, (effY - 121.6) / 3.6);
                } else if (effY < 129.0) {
                    tmpCol.lerpColors(cScrub, cGreen, (effY - 125.2) / 3.8);
                } else {
                    const patch = 0.5 + 0.5 * Math.sin(wx * 0.011 - wz * 0.013);
                    tmpCol.lerpColors(cGreen, cLush, patch * 0.65);
                }

                colors[ptr * 3]     = tmpCol.r;
                colors[ptr * 3 + 1] = tmpCol.g;
                colors[ptr * 3 + 2] = tmpCol.b;
                ptr++;
            }
        }

        const stride = angularSteps + 1;
        for (let ir = 0; ir < radialSteps; ir++) {
            for (let ia = 0; ia < angularSteps; ia++) {
                const a = ir * stride + ia;
                const b = a + 1;
                const c = (ir + 1) * stride + ia;
                const d = c + 1;
                const maxY = Math.max(
                    positions[a * 3 + 1],
                    positions[b * 3 + 1],
                    positions[c * 3 + 1],
                    positions[d * 3 + 1]
                );
                if (maxY > 119.2) {
                    indices.push(a, c, b, b, c, d);
                }
            }
        }

        const farGeo = new THREE.BufferGeometry();
        farGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        farGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        farGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        farGeo.setIndex(indices);

        const farMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.88,
            metalness: 0.02
        });
        farMat.onBeforeCompile = (shader) => {
            shader.uniforms.uCameraPos = sharedUniforms.uCameraPos;
            shader.uniforms.uChunkHideRadius = sharedUniforms.uChunkHideRadius;
            shader.vertexShader = `
                uniform vec3 uCameraPos;
                varying vec3 vFarWorldPos;
            ` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `vec4 wpFar = modelMatrix * vec4(transformed, 1.0);
                 vFarWorldPos = wpFar.xyz;
                 float farDistH = length(wpFar.xz - uCameraPos.xz);
                 float farPlanetR = 1800000.0;
                 if (farDistH < farPlanetR) {
                     wpFar.y -= (farPlanetR - sqrt(farPlanetR * farPlanetR - farDistH * farDistH));
                 }
                 vec4 mvPosition = viewMatrix * wpFar;
                 gl_Position = projectionMatrix * mvPosition;`
            );
            shader.fragmentShader = `
                uniform vec3 uCameraPos;
                uniform float uChunkHideRadius;
                varying vec3 vFarWorldPos;
            ` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <clipping_planes_fragment>',
                `#include <clipping_planes_fragment>
                 if (vFarWorldPos.y < 119.75) discard;
                 float dCamXZ = length(vFarWorldPos.xz - uCameraPos.xz);
                 if (dCamXZ < uChunkHideRadius) discard;`
            );
        };

        const farMesh = new THREE.Mesh(farGeo, farMat);
        farMesh.frustumCulled = false;
        farMesh.receiveShadow = true;
        group.add(farMesh);
    }

    // =========================================================================
    // 2. SACRED METALLIC & ARCHITECTURAL PBR MATERIALS (PLATO'S CRITIAS)
    // =========================================================================
    // I. Muro Esterno — BRONZO (Rich burnished antique bronze)
    const bronzeMat = applyPlanetaryCurvature(new THREE.MeshStandardMaterial({
        color: 0xc97f34,
        emissive: 0x261202,
        emissiveIntensity: 0.20,
        metalness: 0.86,
        roughness: 0.27
    }));

    // II. Muro Intermedio — STAGNO (Silvery-pewter metallic tin)
    const tinMat = applyPlanetaryCurvature(new THREE.MeshStandardMaterial({
        color: 0xd8e3ec,
        emissive: 0x101822,
        emissiveIntensity: 0.16,
        metalness: 0.88,
        roughness: 0.23
    }));

    // III. Muro Interno dell'Acropoli — ORICALCO (Fiery reddish-copper-gold gleam "simile al fuoco")
    const orichalcumMat = new THREE.MeshStandardMaterial({
        color: 0xec4816,
        emissive: 0x7a1600,
        emissiveIntensity: 0.52,
        metalness: 0.90,
        roughness: 0.19
    });
    orichalcumMat.onBeforeCompile = (shader) => {
        shader.uniforms.uCameraPos = sharedUniforms.uCameraPos;
        shader.uniforms.uTime = sharedUniforms.uTime;
        shader.vertexShader = `
            uniform vec3 uCameraPos;
            varying vec3 vOriWorldPos;
            varying vec3 vOriNormal;
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `vec4 wpOri = modelMatrix * vec4(transformed, 1.0);
             #ifdef USE_INSTANCING
                 wpOri = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
             #endif
             vOriWorldPos = wpOri.xyz;
             #ifdef USE_INSTANCING
                 vOriNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
             #else
                 vOriNormal = normalize(mat3(modelMatrix) * objectNormal);
             #endif
             float oriDistH = length(wpOri.xz - uCameraPos.xz);
             float oriPlanetR = 1800000.0;
             if (oriDistH < oriPlanetR) {
                 wpOri.y -= (oriPlanetR - sqrt(oriPlanetR * oriPlanetR - oriDistH * oriDistH));
             }
             vec4 mvPosition = viewMatrix * wpOri;
             gl_Position = projectionMatrix * mvPosition;`
        );
        shader.fragmentShader = `
            uniform vec3 uCameraPos;
            uniform float uTime;
            varying vec3 vOriWorldPos;
            varying vec3 vOriNormal;
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
             vec3 oriView = normalize(uCameraPos - vOriWorldPos);
             float oriFresnel = pow(1.0 - clamp( abs(dot(normalize(vOriNormal), oriView)), 0.0, 1.0 ), 2.2);
             float firePulse = 0.85 + 0.25 * sin(uTime * 2.4 + vOriWorldPos.x * 0.05 + vOriWorldPos.z * 0.05);
             totalEmissiveRadiance += vec3(1.15, 0.32, 0.04) * oriFresnel * firePulse;`
        );
    };

    // IV. Muro del Santuario — ORO PURO (Radiant 24k burnished gold)
    const goldMat = applyPlanetaryCurvature(new THREE.MeshStandardMaterial({
        color: 0xffd22a,
        emissive: 0x422900,
        emissiveIntensity: 0.26,
        metalness: 0.92,
        roughness: 0.17
    }));

    // Classical Atlantean Ivory Marble, Carved Stone & Glowing Beacon Fire
    const ivoryMarbleMat = applyPlanetaryCurvature(new THREE.MeshStandardMaterial({
        color: 0xf5efe2,
        roughness: 0.48,
        metalness: 0.05
    }));
    const carvedStoneMat = applyPlanetaryCurvature(new THREE.MeshStandardMaterial({
        color: 0xd8ceb8,
        roughness: 0.72,
        metalness: 0.04
    }));
    const beaconFireMat = applyPlanetaryCurvature(new THREE.MeshStandardMaterial({
        color: 0xffaa22,
        emissive: 0xff5500,
        emissiveIntensity: 2.2,
        roughness: 0.3
    }));
    const springWaterMat = applyPlanetaryCurvature(new THREE.MeshStandardMaterial({
        color: 0x14d8e8,
        emissive: 0x055868,
        emissiveIntensity: 0.45,
        roughness: 0.12,
        metalness: 0.15
    }));

    // =========================================================================
    // 3. REUSABLE BATTERED WALL & TOWER UNIT GEOMETRIES
    // =========================================================================
    // Unit Wall Segment: length 1.0 along X, height 1.0 along Y (0..1), thickness 1.0 along Z
    const wallSegGeo = new THREE.BoxGeometry(1.04, 1.0, 1.0);
    wallSegGeo.translate(0, 0.5, 0);

    // Octagonal Bastion Watchtower: radius 1.0, height 1.0 (0..1)
    const towerBodyGeo = new THREE.CylinderGeometry(0.84, 1.0, 1.0, 8);
    towerBodyGeo.translate(0, 0.5, 0);

    // Conical/Octagonal Metallic Tower Roof
    const towerRoofGeo = new THREE.ConeGeometry(1.12, 0.42, 8);
    towerRoofGeo.translate(0, 0.21, 0);

    // Collision descriptors for analytical O(1) player collision & rampart walking
    const wallSpecs = [
        {
            name: 'Bronzo',
            radius: 2185.0,
            wallHeight: 12.5,
            thickness: 5.8,
            segments: 420,
            towerEvery: 5,
            canalHalfGap: 108.0, // Grand Canal along -Z
            cardinalHalfGap: 16.0,
            hasSouthGate: false, // South is wide Grand Canal Sea-Gate
            mat: bronzeMat,
            gateTowerH: 36.0
        },
        {
            name: 'Stagno',
            radius: 1545.0,
            wallHeight: 11.2,
            thickness: 5.2,
            segments: 320,
            towerEvery: 5,
            canalHalfGap: 88.0, // Grand Canal along -Z
            cardinalHalfGap: 15.0,
            hasSouthGate: false,
            mat: tinMat,
            gateTowerH: 31.0
        },
        {
            name: 'Oricalco',
            radius: 390.0,
            wallHeight: 10.2,
            thickness: 4.5,
            segments: 128,
            towerEvery: 4,
            canalHalfGap: 0.0,
            cardinalHalfGap: 14.0,
            hasSouthGate: true, // Grand Harbor Portal facing -Z
            mat: orichalcumMat,
            gateTowerH: 25.0
        },
        {
            name: 'Oro',
            radius: 148.0,
            wallHeight: 8.2,
            thickness: 3.6,
            segments: 72,
            towerEvery: 4,
            canalHalfGap: 0.0,
            cardinalHalfGap: 10.5,
            hasSouthGate: true, // Sacred Sanctuary Portal facing -Z
            mat: goldMat,
            gateTowerH: 17.5
        }
    ];

    function isAngleInWallGap(wx, wz, spec) {
        // Grand Canal gap along -Z (z < 0, |x| < canalHalfGap)
        if (spec.canalHalfGap > 0 && wz < 0 && Math.abs(wx) < spec.canalHalfGap) {
            return true;
        }
        // South Gate (-Z, x ≈ 0)
        if (spec.hasSouthGate && wz < 0 && Math.abs(wx) < spec.cardinalHalfGap) {
            return true;
        }
        // North Bridge/Avenue Gate (+Z, x ≈ 0)
        if (wz > 0 && Math.abs(wx) < spec.cardinalHalfGap) {
            return true;
        }
        // East & West Bridge/Avenue Gates (±X, z ≈ 0)
        if (Math.abs(wz) < spec.cardinalHalfGap) {
            return true;
        }
        return false;
    }

    const dummyPos = new THREE.Vector3();
    const dummyQuat = new THREE.Quaternion();
    const dummyScale = new THREE.Vector3();
    const dummyEuler = new THREE.Euler();
    const mat4 = new THREE.Matrix4();

    // Build all 4 Concentric Metallic Walls via GPU InstancedMeshes
    for (const spec of wallSpecs) {
        const wallMatrices = [];
        const towerMatrices = [];
        const roofMatrices = [];

        const dTheta = (Math.PI * 2.0) / spec.segments;
        const arcLen = spec.radius * dTheta;

        for (let i = 0; i < spec.segments; i++) {
            const theta = i * dTheta;
            const wx = Math.cos(theta) * spec.radius;
            const wz = Math.sin(theta) * spec.radius;

            if (isAngleInWallGap(wx, wz, spec)) continue;

            const gY = Math.max(119.5, sampleGroundY(wx, wz));
            const embed = 5.5;
            const totalH = spec.wallHeight + embed;

            // Tangent orientation: face radially outward (normal = [cos(theta), sin(theta)])
            dummyPos.set(wx, gY - embed, wz);
            dummyEuler.set(0, -theta + Math.PI * 0.5, 0);
            dummyQuat.setFromEuler(dummyEuler);
            dummyScale.set(arcLen * 1.03, totalH, spec.thickness);
            wallMatrices.push(new THREE.Matrix4().compose(dummyPos, dummyQuat, dummyScale));

            if (i % spec.towerEvery === 0) {
                const tRad = spec.thickness * 0.92;
                const tH = spec.wallHeight + 4.2 + embed;
                dummyPos.set(wx, gY - embed, wz);
                dummyScale.set(tRad, tH, tRad);
                towerMatrices.push(new THREE.Matrix4().compose(dummyPos, dummyQuat, dummyScale));

                dummyPos.set(wx, gY + spec.wallHeight + 4.1, wz);
                dummyScale.set(tRad, tRad * 1.15, tRad);
                roofMatrices.push(new THREE.Matrix4().compose(dummyPos, dummyQuat, dummyScale));
            }
        }

        // Add Twin Monumental Gate-Towers at every Canal & Cardinal Gateway!
        const gateTowerCoords = [];
        if (spec.canalHalfGap > 0) {
            const gz = -Math.sqrt(Math.max(1.0, spec.radius * spec.radius - spec.canalHalfGap * spec.canalHalfGap));
            gateTowerCoords.push({ x: -spec.canalHalfGap, z: gz, h: spec.gateTowerH, rad: spec.thickness * 1.55, beacon: true });
            gateTowerCoords.push({ x:  spec.canalHalfGap, z: gz, h: spec.gateTowerH, rad: spec.thickness * 1.55, beacon: true });
        } else if (spec.hasSouthGate) {
            const gz = -Math.sqrt(Math.max(1.0, spec.radius * spec.radius - spec.cardinalHalfGap * spec.cardinalHalfGap));
            gateTowerCoords.push({ x: -spec.cardinalHalfGap, z: gz, h: spec.gateTowerH, rad: spec.thickness * 1.35, beacon: true });
            gateTowerCoords.push({ x:  spec.cardinalHalfGap, z: gz, h: spec.gateTowerH, rad: spec.thickness * 1.35, beacon: true });
        }
        // North (+Z), East (+X), West (-X) Gate-Towers
        const cOff = spec.cardinalHalfGap;
        const cMain = Math.sqrt(Math.max(1.0, spec.radius * spec.radius - cOff * cOff));
        gateTowerCoords.push(
            { x: -cOff, z:  cMain, h: spec.gateTowerH * 0.85, rad: spec.thickness * 1.25, beacon: false },
            { x:  cOff, z:  cMain, h: spec.gateTowerH * 0.85, rad: spec.thickness * 1.25, beacon: false },
            { x:  cMain, z: -cOff, h: spec.gateTowerH * 0.85, rad: spec.thickness * 1.25, beacon: false },
            { x:  cMain, z:  cOff, h: spec.gateTowerH * 0.85, rad: spec.thickness * 1.25, beacon: false },
            { x: -cMain, z: -cOff, h: spec.gateTowerH * 0.85, rad: spec.thickness * 1.25, beacon: false },
            { x: -cMain, z:  cOff, h: spec.gateTowerH * 0.85, rad: spec.thickness * 1.25, beacon: false }
        );

        for (const gt of gateTowerCoords) {
            const gY = Math.max(120.2, sampleGroundY(gt.x, gt.z));
            const embed = 6.5;
            dummyPos.set(gt.x, gY - embed, gt.z);
            dummyQuat.identity();
            dummyScale.set(gt.rad, gt.h + embed, gt.rad);
            towerMatrices.push(new THREE.Matrix4().compose(dummyPos, dummyQuat, dummyScale));

            dummyPos.set(gt.x, gY + gt.h - 0.1, gt.z);
            dummyScale.set(gt.rad, gt.rad * 1.25, gt.rad);
            roofMatrices.push(new THREE.Matrix4().compose(dummyPos, dummyQuat, dummyScale));

            if (gt.beacon) {
                const brazier = new THREE.Mesh(new THREE.SphereGeometry(gt.rad * 0.42, 10, 8), beaconFireMat);
                brazier.position.set(gt.x, gY + gt.h + gt.rad * 0.65, gt.z);
                brazier.frustumCulled = false;
                group.add(brazier);
            }
        }

        const wallInst = new THREE.InstancedMesh(wallSegGeo, spec.mat, wallMatrices.length);
        wallMatrices.forEach((m, idx) => wallInst.setMatrixAt(idx, m));
        wallInst.castShadow = true;
        wallInst.receiveShadow = true;
        wallInst.frustumCulled = false;
        wallInst.matrixAutoUpdate = false;
        group.add(wallInst);

        const towerInst = new THREE.InstancedMesh(towerBodyGeo, spec.mat, towerMatrices.length);
        towerMatrices.forEach((m, idx) => towerInst.setMatrixAt(idx, m));
        towerInst.castShadow = true;
        towerInst.receiveShadow = true;
        towerInst.frustumCulled = false;
        towerInst.matrixAutoUpdate = false;
        group.add(towerInst);

        const roofMat = (spec.name === 'Bronzo' || spec.name === 'Stagno') ? spec.mat : goldMat;
        const roofInst = new THREE.InstancedMesh(towerRoofGeo, roofMat, roofMatrices.length);
        roofMatrices.forEach((m, idx) => roofInst.setMatrixAt(idx, m));
        roofInst.castShadow = true;
        roofInst.frustumCulled = false;
        roofInst.matrixAutoUpdate = false;
        group.add(roofInst);
    }

    // =========================================================================
    // 4. TEMPIO SACRO DI POSEIDONE E CLITO & FONTI SACRE (CENTER 0,0 INSIDE GOLDEN WALL)
    // =========================================================================
    const centerGroundY = sampleGroundY(0, 0);
    const templeBaseY = centerGroundY;
    {
        const templeGroup = new THREE.Group();
        templeGroup.position.set(0, templeBaseY, 0);

        // 3-Tier Ivory Marble & Gold Stepped Stylobate (68m along Z x 44m along X, embedded 5m deep)
        const step1 = new THREE.Mesh(new THREE.BoxGeometry(46, 6.2, 70), ivoryMarbleMat);
        step1.position.y = -1.9;
        step1.receiveShadow = true; step1.castShadow = true;
        templeGroup.add(step1);

        const step2 = new THREE.Mesh(new THREE.BoxGeometry(42, 1.2, 66), goldMat);
        step2.position.y = 1.8;
        step2.receiveShadow = true; step2.castShadow = true;
        templeGroup.add(step2);

        const step3 = new THREE.Mesh(new THREE.BoxGeometry(38, 1.2, 62), ivoryMarbleMat);
        step3.position.y = 3.0;
        step3.receiveShadow = true; step3.castShadow = true;
        templeGroup.add(step3);

        // Inner Sanctuary Cella clad in Orichalcum & Gold
        const cella = new THREE.Mesh(new THREE.BoxGeometry(22, 12.5, 40), orichalcumMat);
        cella.position.y = 9.85;
        cella.castShadow = true; cella.receiveShadow = true;
        templeGroup.add(cella);

        // Golden Sanctuary Portals (North & South)
        for (const sgn of [-1, 1]) {
            const portalFrame = new THREE.Mesh(new THREE.BoxGeometry(10.5, 10.2, 1.6), goldMat);
            portalFrame.position.set(0, 8.7, sgn * 20.2);
            templeGroup.add(portalFrame);
        }

        // Peripteral Fluted Colonnade (32 Ivory Columns with Golden Capitals)
        const colPositions = [];
        const halfW = 16.8, halfL = 28.2;
        for (let ix = 0; ix < 6; ix++) {
            const cx = -halfW + (ix / 5) * (halfW * 2);
            colPositions.push([cx, -halfL], [cx, halfL]);
        }
        for (let iz = 1; iz < 10; iz++) {
            const cz = -halfL + (iz / 10) * (halfL * 2);
            colPositions.push([-halfW, cz], [halfW, cz]);
        }

        const colGeo = new THREE.CylinderGeometry(0.88, 1.05, 12.8, 12);
        const colInst = new THREE.InstancedMesh(colGeo, ivoryMarbleMat, colPositions.length);
        const capGeo = new THREE.BoxGeometry(2.5, 0.9, 2.5);
        const capInst = new THREE.InstancedMesh(capGeo, goldMat, colPositions.length);

        colPositions.forEach(([cx, cz], i) => {
            mat4.makeTranslation(cx, 10.0, cz);
            colInst.setMatrixAt(i, mat4);
            mat4.makeTranslation(cx, 16.6, cz);
            capInst.setMatrixAt(i, mat4);
        });
        colInst.castShadow = true; colInst.receiveShadow = true; colInst.frustumCulled = false;
        capInst.castShadow = true; capInst.frustumCulled = false;
        templeGroup.add(colInst);
        templeGroup.add(capInst);

        // Marble Entablature + Golden Frieze + Pitched Golden Roof
        const entablature = new THREE.Mesh(new THREE.BoxGeometry(37.5, 2.4, 61.5), ivoryMarbleMat);
        entablature.position.y = 18.2;
        entablature.castShadow = true;
        templeGroup.add(entablature);

        const roofPrismGeo = new THREE.CylinderGeometry(22.5, 22.5, 63.0, 3);
        roofPrismGeo.rotateZ(Math.PI);
        roofPrismGeo.rotateX(Math.PI * 0.5);
        roofPrismGeo.scale(1.0, 0.36, 1.0);
        const roofMesh = new THREE.Mesh(roofPrismGeo, goldMat);
        roofMesh.position.y = 22.8;
        roofMesh.castShadow = true;
        templeGroup.add(roofMesh);

        // Radiant Golden Trident of Poseidon crowning the Temple Apex
        const tridentShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 9.5, 8), goldMat);
        tridentShaft.position.y = 29.5;
        templeGroup.add(tridentShaft);
        const tridentBar = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.55, 0.55), goldMat);
        tridentBar.position.y = 32.2;
        templeGroup.add(tridentBar);
        for (const px of [-2.3, 0, 2.3]) {
            const prong = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.6, 6), goldMat);
            prong.position.set(px, 34.2, 0);
            templeGroup.add(prong);
        }

        // Twin Sacred Springs of Poseidon & Cleito (North & South Courtyards)
        for (const sz of [-56, 56]) {
            const rim = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 10.5, 3.2, 24), ivoryMarbleMat);
            rim.position.set(0, -0.6, sz);
            templeGroup.add(rim);
            const goldRing = new THREE.Mesh(new THREE.TorusGeometry(9.6, 0.45, 8, 28), goldMat);
            goldRing.rotation.x = Math.PI * 0.5;
            goldRing.position.set(0, 1.05, sz);
            templeGroup.add(goldRing);
            const basinWater = new THREE.Mesh(new THREE.CylinderGeometry(9.1, 9.1, 0.4, 24), springWaterMat);
            basinWater.position.set(0, 0.85, sz);
            templeGroup.add(basinWater);
        }

        templeGroup.traverse(obj => { if (obj.isMesh) obj.frustumCulled = false; });
        group.add(templeGroup);
    }

    // =========================================================================
    // 5. LA REGGIA IMPERIALE (ROYAL PALACE COMPLEX ON THE ACROPOLIS, r = 185m..320m)
    // =========================================================================
    const palacePlacements = [
        { x: -195, z: -115, ry:  0.52, w: 46, l: 64, domeMat: orichalcumMat },
        { x:  195, z: -115, ry: -0.52, w: 46, l: 64, domeMat: orichalcumMat },
        { x: -195, z:  115, ry:  2.62, w: 44, l: 58, domeMat: goldMat },
        { x:  195, z:  115, ry: -2.62, w: 44, l: 58, domeMat: goldMat },
        { x: -255, z:    0, ry:  Math.PI * 0.5, w: 38, l: 52, domeMat: orichalcumMat },
        { x:  255, z:    0, ry: -Math.PI * 0.5, w: 38, l: 52, domeMat: orichalcumMat }
    ];

    for (const p of palacePlacements) {
        const py = sampleGroundY(p.x, p.z);
        const pal = new THREE.Group();
        pal.position.set(p.x, py, p.z);
        pal.rotation.y = p.ry;

        const podium = new THREE.Mesh(new THREE.BoxGeometry(p.w, 8.5, p.l), carvedStoneMat);
        podium.position.y = -2.2;
        podium.castShadow = true; podium.receiveShadow = true;
        pal.add(podium);

        const hall = new THREE.Mesh(new THREE.BoxGeometry(p.w * 0.76, 9.5, p.l * 0.78), ivoryMarbleMat);
        hall.position.y = 6.8;
        hall.castShadow = true; hall.receiveShadow = true;
        pal.add(hall);

        const trim = new THREE.Mesh(new THREE.BoxGeometry(p.w * 0.82, 1.4, p.l * 0.84), orichalcumMat);
        trim.position.y = 12.1;
        pal.add(trim);

        const dome = new THREE.Mesh(new THREE.SphereGeometry(p.w * 0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), p.domeMat);
        dome.position.y = 12.6;
        dome.castShadow = true;
        pal.add(dome);

        pal.traverse(obj => { if (obj.isMesh) obj.frustumCulled = false; });
        group.add(pal);
    }

    // =========================================================================
    // 6. MONUMENTAL ARCHED CEREMONIAL BRIDGES ACROSS THE 3 CONCENTRIC LAGOONS
    // Spanning North (+Z), East (+X), and West (-X) across:
    //  - 1st Lagoon (r = 445m .. 700m)
    //  - 2nd Lagoon (r = 980m .. 1255m)
    //  - 3rd Lagoon (r = 1595m .. 1870m)
    // =========================================================================
    const bridgeSpans = [
        { rStart: 442.0,  rEnd: 702.0,  trimMat: orichalcumMat },
        { rStart: 978.0,  rEnd: 1258.0, trimMat: tinMat },
        { rStart: 1592.0, rEnd: 1872.0, trimMat: bronzeMat }
    ];
    const bridgeAxes = [
        { dx:  0, dz:  1, ry: 0 },               // North (+Z)
        { dx:  1, dz:  0, ry: Math.PI * 0.5 },   // East (+X)
        { dx: -1, dz:  0, ry: -Math.PI * 0.5 }   // West (-X)
    ];
    const walkableBridges = [];

    for (const span of bridgeSpans) {
        const len = span.rEnd - span.rStart;
        const rMid = (span.rStart + span.rEnd) * 0.5;
        const deckSteps = 18;
        const stepLen = len / deckSteps;

        for (const ax of bridgeAxes) {
            const startGround = Math.max(123.5, sampleGroundY(ax.dx * span.rStart, ax.dz * span.rStart));
            const endGround   = Math.max(123.5, sampleGroundY(ax.dx * span.rEnd,   ax.dz * span.rEnd));
            const archRise = 12.5; // High arch clearance (~16m above 120m water) so triremes pass beneath!

            walkableBridges.push({
                dx: ax.dx, dz: ax.dz,
                rStart: span.rStart, rEnd: span.rEnd,
                halfWidth: 9.5,
                startY: startGround, endY: endGround, archRise
            });

            for (let s = 0; s < deckSteps; s++) {
                const t0 = (s + 0.5) / deckSteps;
                const rCur = span.rStart + t0 * len;
                const yArch = THREE.MathUtils.lerp(startGround, endGround, t0) + Math.sin(t0 * Math.PI) * archRise;
                const slopeAngle = Math.atan2(
                    (endGround - startGround) / len + (Math.PI * archRise / len) * Math.cos(t0 * Math.PI),
                    1.0
                );

                const bx = ax.dx * rCur;
                const bz = ax.dz * rCur;

                const deck = new THREE.Mesh(new THREE.BoxGeometry(19.0, 2.2, stepLen * 1.06), carvedStoneMat);
                deck.position.set(bx, yArch - 1.0, bz);
                deck.rotation.set(ax.dz !== 0 ? -slopeAngle * ax.dz : 0, ax.ry, ax.dx !== 0 ? slopeAngle * ax.dx : 0, 'YXZ');
                deck.castShadow = true; deck.receiveShadow = true; deck.frustumCulled = false;
                group.add(deck);

                // Metallic Parapets
                const rail = new THREE.Mesh(new THREE.BoxGeometry(19.6, 1.3, stepLen * 1.05), span.trimMat);
                rail.position.set(bx, yArch + 0.5, bz);
                rail.rotation.copy(deck.rotation);
                rail.frustumCulled = false;
                group.add(rail);

                // Stone Bridge Piers outside the central 70m shipping channel
                if (Math.abs(rCur - rMid) > 38.0 && s % 3 === 1) {
                    const pierH = Math.max(4.0, yArch - 104.0);
                    const pier = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, pierH, 8), carvedStoneMat);
                    pier.position.set(bx, yArch - 1.5 - pierH * 0.5, bz);
                    pier.castShadow = true; pier.frustumCulled = false;
                    group.add(pier);
                }
            }
        }
    }

    scene.add(group);

    // =========================================================================
    // 7. ANALYTICAL COLLISION & WALKABLE SURFACES (O(1) ZERO-LAG PHYSICS)
    // =========================================================================
    function getWalkableSurfaceHeight(x, z, feetY) {
        let bestY = -Infinity;

        // 1. Temple of Poseidon & Cleito Stylobate (|x| <= 23, |z| <= 35)
        if (Math.abs(x) <= 23.0 && Math.abs(z) <= 35.0) {
            const topStylobate = templeBaseY + 3.6;
            if (feetY >= topStylobate - 3.2) {
                bestY = Math.max(bestY, topStylobate);
            }
        }

        // 2. Ceremonial Arched Bridges across the 3 Concentric Lagoons
        for (const br of walkableBridges) {
            const projR = x * br.dx + z * br.dz;
            const perp  = Math.abs(x * br.dz - z * br.dx);
            if (projR >= br.rStart - 2.0 && projR <= br.rEnd + 2.0 && perp <= br.halfWidth) {
                const t = Math.max(0.0, Math.min(1.0, (projR - br.rStart) / (br.rEnd - br.rStart)));
                const deckY = THREE.MathUtils.lerp(br.startY, br.endY, t) + Math.sin(t * Math.PI) * br.archRise;
                if (feetY >= deckY - 3.0) {
                    bestY = Math.max(bestY, deckY);
                }
            }
        }

        // 3. Top Walkway of the 4 Concentric Metallic Ramparts
        const r = Math.hypot(x, z);
        for (const spec of wallSpecs) {
            if (Math.abs(r - spec.radius) <= spec.thickness * 0.55 && !isAngleInWallGap(x, z, spec)) {
                const gY = Math.max(119.5, sampleGroundY(x, z));
                const wallTop = gY + spec.wallHeight;
                if (feetY >= wallTop - 2.2) {
                    bestY = Math.max(bestY, wallTop);
                }
            }
        }

        return bestY;
    }

    function resolvePlayerCollision(pos, playerHeight, isFlying) {
        if (isFlying) return;
        const feetY = pos.y - playerHeight;
        const playerRad = 0.55;

        // Radial sliding collision against the 4 Concentric Metallic Walls (except at Gateways & Canal!)
        const r = Math.hypot(pos.x, pos.z);
        if (r > 1.0) {
            for (const spec of wallSpecs) {
                const halfT = spec.thickness * 0.5 + playerRad;
                if (Math.abs(r - spec.radius) < halfT && !isAngleInWallGap(pos.x, pos.z, spec)) {
                    const gY = Math.max(119.5, sampleGroundY(pos.x, pos.z));
                    const wallTop = gY + spec.wallHeight;
                    if (feetY < wallTop - 1.2) {
                        const targetR = (r >= spec.radius) ? (spec.radius + halfT) : (spec.radius - halfT);
                        const scale = targetR / r;
                        pos.x *= scale;
                        pos.z *= scale;
                    }
                }
            }
        }

        // Temple inner Cella walls (|x| < 11.5, |z| < 20.5)
        const cw = 11.5 + playerRad, cl = 20.5 + playerRad;
        if (Math.abs(pos.x) < cw && Math.abs(pos.z) < cl && feetY < templeBaseY + 16.0) {
            const penX = cw - Math.abs(pos.x);
            const penZ = cl - Math.abs(pos.z);
            if (penX < penZ) {
                pos.x = (pos.x >= 0 ? cw : -cw);
            } else {
                pos.z = (pos.z >= 0 ? cl : -cl);
            }
        }
    }

    function update(delta, cameraPos, activeChunkRadius) {
        sharedUniforms.uTime.value += delta;
        sharedUniforms.uCameraPos.value.copy(cameraPos);
        sharedUniforms.uChunkHideRadius.value = Math.max(400.0, activeChunkRadius - 75.0);
    }

    return {
        group,
        update,
        getWalkableSurfaceHeight,
        resolvePlayerCollision
    };
}
