import * as THREE from 'three';

// ==========================================
// PERLIN NOISE GENERATOR
// ==========================================
class PerlinNoise {
    constructor() {
        this.p = new Uint8Array(256);
        // Pre-fill with a pseudo-random permutation
        const permutation = [
            151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,
            23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,
            174,20,125,136,171,168, 68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,
            133,230,220,105,92,41,55,46,245,40,244,102,143,54, 65,25,63,161, 1,216,80,73,209,76,132,187,208,
            89,18,169,200,196,135,130,116,188,26,243,141,128,115,221,120,19,87,36,85,189,207,64,185,113,84,
            88,140,164,198,154,34,57,176,224,196,101,173,178,56,114,80,249,150,111,250,14,142,94,135,143,172,
            235,192,20,112,65,74,223,209,53,67,172,9,141,21,241,130,29,47,82,76,101,102,114,49,228,113,222,
            179,252,65,204,116,228,135,22,176,137,225,193,248,219,224,251,195,78,96,252,181,213,232,36,56,
            110,79,81,172,94,236,118,34,221,65,110,49,84,250,222,54,91,0,250,241,120,230,90,250,31,223,168,
            196,177,135,163,236,25,143,97,11,24,168,71,240,21,218,88,89,250,212,18,228,142,67,110,83,89,122
        ];
        for (let i = 0; i < 256; i++) {
            this.p[i] = permutation[i];
        }
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
        }
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
        return a + t * (b - a);
    }

    grad2d(hash, x, y) {
        const h = hash & 7;
        const u = h < 4 ? x : y;
        const v = h < 4 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? 2.0 * v : -2.0 * v);
    }

    grad3d(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise2d(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);

        const u = this.fade(x);
        const v = this.fade(y);

        const A = this.perm[X] + Y;
        const B = this.perm[X + 1] + Y;

        return this.lerp(v,
            this.lerp(u, this.grad2d(this.perm[A], x, y), this.grad2d(this.perm[B], x - 1, y)),
            this.lerp(u, this.grad2d(this.perm[A + 1], x, y - 1), this.grad2d(this.perm[B + 1], x - 1, y - 1))
        );
    }

    noise3d(x, y, z) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const A = this.perm[X] + Y;
        const AA = this.perm[A] + Z;
        const AB = this.perm[A + 1] + Z;
        const B = this.perm[X + 1] + Y;
        const BA = this.perm[B] + Z;
        const BB = this.perm[B + 1] + Z;

        return this.lerp(w,
            this.lerp(v,
                this.lerp(u, this.grad3d(this.perm[AA], x, y, z), this.grad3d(this.perm[BA], x - 1, y, z)),
                this.lerp(u, this.grad3d(this.perm[AB], x, y - 1, z), this.grad3d(this.perm[BB], x - 1, y - 1, z))
            ),
            this.lerp(v,
                this.lerp(u, this.grad3d(this.perm[AA + 1], x, y, z - 1), this.grad3d(this.perm[BA + 1], x - 1, y, z - 1)),
                this.lerp(u, this.grad3d(this.perm[AB + 1], x, y - 1, z - 1), this.grad3d(this.perm[BB + 1], x - 1, y - 1, z - 1))
            )
        );
    }
}

// ==========================================
// TERRAIN HELPERS & STATIC ALLOCATIONS
// ==========================================
// 1. Tropical Island Lagoon & Coral Atolls
const _sandColor = new THREE.Color(0xf4ead2); // Warm sunlit coral beach sand
const _goldenSandColor = new THREE.Color(0xebd29b); // Warm golden sand for eastern islands
const _grassColor = new THREE.Color(0x2f8f38); // Lush deep tropical jungle green
const _barrenColor = new THREE.Color(0x367d39); // Rich tropical island hillside foliage for eastern archipelago
const _rockColor = new THREE.Color(0x7c776e);  // Natural weathered volcanic/limestone cliff rock
const _seabedColor = new THREE.Color(0x0b8a99); // Bright tropical turquoise lagoon reef
const _abyssRockColor = new THREE.Color(0x071726); // Deep abyssal ocean basalt rock

// 2. Continental Idyllic Beaches
const _beachSandColor = new THREE.Color(0xf5dfa6); // Fine golden champagne beach sand

// 3. Equatorial Continental Desert
const _desertSandColor = new THREE.Color(0xe09f45); // Golden-orange Saharan dune sand
const _desertRockColor = new THREE.Color(0xb25d3a); // Sun-baked terracotta & canyon sandstone
const _desertPlateauColor = new THREE.Color(0xd28646); // Arid plateau / clay

// 4. Temperate Woods & Forests
const _forestGrassColor = new THREE.Color(0x27ae60); // Vibrant forest green meadow
const _forestDeepColor = new THREE.Color(0x196f3d);  // Deep woodland canopy and moss

// 5. Alpine Pastures (Alpeggi) & High Mountain Crags
const _alpineMeadowColor = new THREE.Color(0x55efc4); // Luminous fresh emerald alpine meadow
const _alpineFloraColor = new THREE.Color(0x7bed9f);  // Wildflower alpine pasture turf
const _graniteMountainColor = new THREE.Color(0x636e72); // Cold granite ridge rock
const _darkMountainColor = new THREE.Color(0x2d3436); // Sharp slate / mountain spine rock

// 6. Polar Ice Caps & Glaciers
const _polarSnowColor = new THREE.Color(0xf8fafc); // Pure sparkling snow white
const _glacierIceColor = new THREE.Color(0x70d6ff); // Crystalline turquoise-cyan glacial ice
const _deepGlacierColor = new THREE.Color(0x00b4d8); // Deep compacted blue glacial ice
const _polarRockColor = new THREE.Color(0x334155); // Cold frosted slate rock
const _polarSeabedColor = new THREE.Color(0x133854); // Icy polar fjord seabed

const _tempBiomeInfo = {
    type: 'tropical',
    name: '🏝️ ATOLLO E LAGUNA TROPICALE',
    isGlacier: false,
    isDesert: false,
    isBeach: false,
    isForest: false,
    isAlpine: false,
    isMountain: false,
    isStartingEast: false,
    latitude: 0.0,
    contFactor: 0.0
};

const _vlist = Array.from({ length: 12 }, () => new THREE.Vector3());
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _p4 = new THREE.Vector3();
const _p5 = new THREE.Vector3();
const _p6 = new THREE.Vector3();
const _p7 = new THREE.Vector3();

const _tempNormal = new THREE.Vector3();
const _tempColor0 = new THREE.Color();
const _tempColor1 = new THREE.Color();
const _tempColor2 = new THREE.Color();

function vertexInterpolate(isolevel, p1, p2, val1, val2, target) {
    if (!Number.isFinite(val1) || !Number.isFinite(val2)) return target.copy(p1);
    if (Math.abs(isolevel - val1) < 0.00001) return target.copy(p1);
    if (Math.abs(isolevel - val2) < 0.00001) return target.copy(p2);
    if (Math.abs(val1 - val2) < 0.00001) return target.copy(p1);
    
    const mu = Math.max(0.0, Math.min(1.0, (isolevel - val1) / (val2 - val1)));
    return target.set(
        p1.x + mu * (p2.x - p1.x),
        p1.y + mu * (p2.y - p1.y),
        p1.z + mu * (p2.z - p1.z)
    );
}

function getNormalAt(terrain, vx, vy, vz, target) {
    const rx = Math.round(vx);
    const ry = Math.round(vy);
    const rz = Math.round(vz);
    
    const dx = terrain.getDensity(rx + 1, ry, rz) - terrain.getDensity(rx - 1, ry, rz);
    const dy = terrain.getDensity(rx, ry + 1, rz) - terrain.getDensity(rx, ry - 1, rz);
    const dz = terrain.getDensity(rx, ry, rz + 1) - terrain.getDensity(rx, ry - 1, rz);
    
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (!Number.isFinite(len) || len === 0) {
        return target.set(0, 1, 0);
    }
    return target.set(-dx / len, -dy / len, -dz / len).normalize();
}

function getColorAt(terrain, worldX, worldY, worldZ, normal, target) {
    const slope = normal.y; // 1.0 = flat upwards, 0.0 = sheer vertical wall
    
    const biome = terrain.getPlanetaryBiome(worldX, worldY, worldZ);
    
    // 1. STARTING EASTERN ARCHIPELAGO
    if (biome.isStartingEast) {
        const sand = _goldenSandColor;
        const vegetation = _barrenColor;
        const rock = _rockColor;
        if (slope < 0.60) {
            target.copy(rock);
        } else if (worldY < 125.0) {
            if (worldY < 120.0) {
                const depthFactor = Math.min(Math.max((120.0 - worldY) / 8.0, 0.0), 1.0);
                target.lerpColors(sand, _seabedColor, depthFactor);
            } else {
                target.copy(sand);
            }
        } else if (worldY < 128.0) {
            target.lerpColors(sand, vegetation, (worldY - 125.0) / 3.0);
        } else if (worldY < 155.0) {
            target.copy(vegetation);
        } else if (worldY < 165.0) {
            target.lerpColors(vegetation, rock, (worldY - 155.0) / 10.0);
        } else {
            target.copy(rock);
        }
        return target;
    }

    // 2. POLAR GLACIERS & ICE SHEETS (At the poles or high summits)
    if (biome.isGlacier) {
        if (worldY < 120.0) {
            // Underwater polar seabed / submerged glacier foot
            const depthFactor = Math.min(Math.max((120.0 - worldY) / 8.0, 0.0), 1.0);
            target.lerpColors(_glacierIceColor, _polarSeabedColor, depthFactor);
            if (worldY < 100.0) {
                const abyssFactor = Math.min(Math.max((100.0 - worldY) / 250.0, 0.0), 1.0);
                target.lerp(_abyssRockColor, abyssFactor * 0.75);
            }
        } else {
            // Above water glacier: ice cliffs, crevasses, and pure snow fields
            if (slope < 0.35) {
                // Sheer vertical walls: frosted dark polar rock
                target.copy(_polarRockColor);
            } else if (slope < 0.65) {
                // Sloped ice falls: crystalline turquoise glacial ice transitioning to deep blue
                const t = (slope - 0.35) / 0.30;
                target.lerpColors(_deepGlacierColor, _glacierIceColor, t);
            } else {
                // Gentle slopes and flat domes: fresh sparkling snow with subtle glacial cyan tint
                const t = Math.min(1.0, (slope - 0.65) / 0.25);
                target.lerpColors(_glacierIceColor, _polarSnowColor, t);
            }
        }
        return target;
    }

    // 3. EQUATORIAL CONTINENTAL DESERT
    if (biome.isDesert) {
        if (worldY < 120.0) {
            const depthFactor = Math.min(Math.max((120.0 - worldY) / 8.0, 0.0), 1.0);
            target.lerpColors(_desertSandColor, _seabedColor, depthFactor);
            if (worldY < 100.0) {
                const abyssFactor = Math.min(Math.max((100.0 - worldY) / 250.0, 0.0), 1.0);
                target.lerp(_abyssRockColor, abyssFactor * 0.75);
            }
        } else {
            if (slope < 0.50) {
                // Vertical canyon walls and mesa cliffs: terracotta red sandstone
                target.copy(_desertRockColor);
            } else if (slope < 0.72) {
                // Canyon slopes: blend from rock to baked clay plateau
                const t = (slope - 0.50) / 0.22;
                target.lerpColors(_desertRockColor, _desertPlateauColor, t);
            } else {
                // Rolling golden-orange dunes and arid basins
                const t = (slope - 0.72) / 0.28;
                target.lerpColors(_desertPlateauColor, _desertSandColor, t);
            }
        }
        return target;
    }

    // 4. UNDERWATER SEABED & REEF FOR ALL OTHER BIOMES
    if (worldY < 120.0) {
        const sand = biome.isBeach ? _beachSandColor : _sandColor;
        const depthFactor = Math.min(Math.max((120.0 - worldY) / 8.0, 0.0), 1.0);
        target.lerpColors(sand, _seabedColor, depthFactor);
        if (worldY < 100.0) {
            const abyssFactor = Math.min(Math.max((100.0 - worldY) / 250.0, 0.0), 1.0);
            target.lerp(_abyssRockColor, abyssFactor * 0.75);
        }
        return target;
    }

    // 5. IDYLLIC BEACH (Continental coast)
    if (biome.isBeach || (worldY < 125.0 && slope >= 0.55)) {
        const beachSand = biome.isBeach ? _beachSandColor : _sandColor;
        if (worldY < 125.0) {
            target.copy(beachSand);
        } else if (worldY < 128.0) {
            const t = (worldY - 125.0) / 3.0;
            const veg = biome.isForest ? _forestGrassColor : _grassColor;
            target.lerpColors(beachSand, veg, t);
        } else {
            target.copy(biome.isForest ? _forestGrassColor : _grassColor);
        }
        if (slope < 0.60) {
            target.lerp(_rockColor, (0.60 - slope) / 0.20);
        }
        return target;
    }

    // 6. ALPINE PASTURES (Alpeggi) & HIGH MOUNTAINS
    if (biome.isAlpine) {
        if (slope < 0.55) {
            // Steep mountain slopes: cold granite
            target.copy(_graniteMountainColor);
        } else {
            // High altitude meadows: luminous emerald green alpine pastures
            const t = Math.min(1.0, (worldY - 150.0) / 25.0);
            target.lerpColors(_forestGrassColor, _alpineMeadowColor, t);
            // Wildflower accents on gentler high slopes
            if (slope > 0.85) {
                target.lerp(_alpineFloraColor, 0.35);
            }
        }
        return target;
    }

    // 7. CONTINENTAL INTERIOR MOUNTAIN RIDGES & HIGH PEAKS
    if (biome.isMountain) {
        if (worldY >= 215.0 && slope >= 0.55) {
            // Summit snow and eternal ice caps on soaring peaks
            target.copy(_polarSnowColor);
        } else if (slope < 0.65) {
            target.copy(_darkMountainColor);
        } else {
            target.copy(_graniteMountainColor);
        }
        return target;
    }

    // 8. TEMPERATE FORESTS & WOODS
    if (biome.isForest) {
        if (slope < 0.58) {
            target.copy(_rockColor);
        } else {
            const t = Math.min(1.0, (worldY - 126.0) / 24.0);
            target.lerpColors(_forestGrassColor, _forestDeepColor, t * 0.7);
        }
        if (slope < 0.75) {
            const t = (0.75 - slope) / 0.17;
            target.lerp(_rockColor, t);
        }
        return target;
    }

    // 9. TROPICAL LAGOON & ATOLL (Default)
    const sand = _sandColor;
    const vegetation = _grassColor;
    const rock = _rockColor;

    if (slope < 0.60) {
        target.copy(rock);
    } else if (worldY < 125.0) {
        target.copy(sand);
    } else if (worldY < 128.0) {
        const t = (worldY - 125.0) / 3.0;
        target.lerpColors(sand, vegetation, t);
    } else if (worldY < 155.0) {
        target.copy(vegetation);
    } else if (worldY < 165.0) {
        const t = (worldY - 155.0) / 10.0;
        target.lerpColors(vegetation, rock, t);
    } else {
        target.copy(rock);
    }

    if (slope < 0.75) {
        const t = (0.75 - slope) / 0.15;
        target.lerp(rock, t);
    }

    return target;
}

// ==========================================
// VOXEL CHUNK CLASS
// ==========================================
class VoxelChunk {
    constructor(cx, cy, cz, terrain) {
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;
        this.terrain = terrain;
        
        this.geometry = new THREE.BufferGeometry();
        // Create mesh with vertex colors enabled
        this.mesh = new THREE.Mesh(this.geometry, terrain.material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.matrixAutoUpdate = false; // Optimize: Chunk is static relative to terrain group
        
        const size = terrain.chunkSize + 1;
        this.densities = new Float32Array(size * size * size);
        this.initialized = false;
        this.dirty = true;
    }

    initializeDensities() {
        if (this.initialized) return;
        this.initialized = true;

        const terrain = this.terrain;
        const chunkSize = terrain.chunkSize;
        const size = chunkSize + 1;

        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                for (let k = 0; k < size; k++) {
                    const vx = this.cx * chunkSize + i;
                    const vy = this.cy * chunkSize + j;
                    const vz = this.cz * chunkSize + k;
                    
                    const idx = i + j * size + k * size * size;
                    this.densities[idx] = terrain.getDensity(vx, vy, vz);
                }
            }
        }
    }

    setLocalDensity(vx, vy, vz, value) {
        const size = this.terrain.chunkSize + 1;
        const i = vx - this.cx * this.terrain.chunkSize;
        const j = vy - this.cy * this.terrain.chunkSize;
        const k = vz - this.cz * this.terrain.chunkSize;
        
        if (i >= 0 && i < size && j >= 0 && j < size && k >= 0 && k < size) {
            if (!this.initialized) {
                this.initializeDensities();
            }
            const idx = i + j * size + k * size * size;
            this.densities[idx] = value;
            this.dirty = true;
        }
    }

    rebuild() {
        if (!this.dirty) return;
        
        this.initializeDensities();
        this.dirty = false;

        const terrain = this.terrain;
        const chunkSize = terrain.chunkSize;
        const size = chunkSize + 1;
        const voxelScale = terrain.voxelScale;
        const isolevel = 0.0;

        const positions = [];
        const normals = [];
        const colors = [];

        // Voxel loop for the chunk
        for (let i = 0; i < chunkSize; i++) {
            for (let j = 0; j < chunkSize; j++) {
                for (let k = 0; k < chunkSize; k++) {
                    const vx = this.cx * chunkSize + i;
                    const vy = this.cy * chunkSize + j;
                    const vz = this.cz * chunkSize + k;

                    // Corner densities read from local cache
                    const d0 = this.densities[i +     j * size +     k * size * size];
                    const d1 = this.densities[(i + 1) + j * size +     k * size * size];
                    const d2 = this.densities[(i + 1) + (j + 1) * size + k * size * size];
                    const d3 = this.densities[i +     (j + 1) * size + k * size * size];
                    const d4 = this.densities[i +     j * size +     (k + 1) * size * size];
                    const d5 = this.densities[(i + 1) + j * size +     (k + 1) * size * size];
                    const d6 = this.densities[(i + 1) + (j + 1) * size + (k + 1) * size * size];
                    const d7 = this.densities[i +     (j + 1) * size + (k + 1) * size * size];

                    // Build configuration index
                    let cubeindex = 0;
                    if (d0 < isolevel) cubeindex |= 1;
                    if (d1 < isolevel) cubeindex |= 2;
                    if (d2 < isolevel) cubeindex |= 4;
                    if (d3 < isolevel) cubeindex |= 8;
                    if (d4 < isolevel) cubeindex |= 16;
                    if (d5 < isolevel) cubeindex |= 32;
                    if (d6 < isolevel) cubeindex |= 64;
                    if (d7 < isolevel) cubeindex |= 128;

                    const edges = edgeTable[cubeindex];
                    if (edges === 0) continue;

                    // Set corner positions
                    _p0.set(vx,     vy,     vz);
                    _p1.set(vx + 1, vy,     vz);
                    _p2.set(vx + 1, vy + 1, vz);
                    _p3.set(vx,     vy + 1, vz);
                    _p4.set(vx,     vy,     vz + 1);
                    _p5.set(vx + 1, vy,     vz + 1);
                    _p6.set(vx + 1, vy + 1, vz + 1);
                    _p7.set(vx,     vy + 1, vz + 1);

                    // Calculate vertex positions along intersected edges
                    if (edges & 1)    vertexInterpolate(isolevel, _p0, _p1, d0, d1, _vlist[0]);
                    if (edges & 2)    vertexInterpolate(isolevel, _p1, _p2, d1, d2, _vlist[1]);
                    if (edges & 4)    vertexInterpolate(isolevel, _p2, _p3, d2, d3, _vlist[2]);
                    if (edges & 8)    vertexInterpolate(isolevel, _p3, _p0, d3, d0, _vlist[3]);
                    if (edges & 16)   vertexInterpolate(isolevel, _p4, _p5, d4, d5, _vlist[4]);
                    if (edges & 32)   vertexInterpolate(isolevel, _p5, _p6, d5, d6, _vlist[5]);
                    if (edges & 64)   vertexInterpolate(isolevel, _p6, _p7, d6, d7, _vlist[6]);
                    if (edges & 128)  vertexInterpolate(isolevel, _p7, _p4, d7, d4, _vlist[7]);
                    if (edges & 256)  vertexInterpolate(isolevel, _p0, _p4, d0, d4, _vlist[8]);
                    if (edges & 512)  vertexInterpolate(isolevel, _p1, _p5, d1, d5, _vlist[9]);
                    if (edges & 1024) vertexInterpolate(isolevel, _p2, _p6, d2, d6, _vlist[10]);
                    if (edges & 2048) vertexInterpolate(isolevel, _p3, _p7, d3, d7, _vlist[11]);

                    // Generate triangles
                    const triIndex = cubeindex * 16;
                    for (let t = 0; triTable[triIndex + t] !== -1 && t < 16; t += 3) {
                        const edge0 = triTable[triIndex + t];
                        const edge1 = triTable[triIndex + t + 1];
                        const edge2 = triTable[triIndex + t + 2];

                        const pt0 = _vlist[edge0];
                        const pt1 = _vlist[edge1];
                        const pt2 = _vlist[edge2];

                        // Normals
                        getNormalAt(terrain, pt0.x, pt0.y, pt0.z, _tempNormal);
                        const n0x = _tempNormal.x, n0y = _tempNormal.y, n0z = _tempNormal.z;
                        
                        getNormalAt(terrain, pt1.x, pt1.y, pt1.z, _tempNormal);
                        const n1x = _tempNormal.x, n1y = _tempNormal.y, n1z = _tempNormal.z;
                        
                        getNormalAt(terrain, pt2.x, pt2.y, pt2.z, _tempNormal);
                        const n2x = _tempNormal.x, n2y = _tempNormal.y, n2z = _tempNormal.z;

                        // Colors
                        _tempNormal.set(n0x, n0y, n0z);
                        getColorAt(terrain, pt0.x * voxelScale, pt0.y * voxelScale, pt0.z * voxelScale, _tempNormal, _tempColor0);
                        
                        _tempNormal.set(n1x, n1y, n1z);
                        getColorAt(terrain, pt1.x * voxelScale, pt1.y * voxelScale, pt1.z * voxelScale, _tempNormal, _tempColor1);
                        
                        _tempNormal.set(n2x, n2y, n2z);
                        getColorAt(terrain, pt2.x * voxelScale, pt2.y * voxelScale, pt2.z * voxelScale, _tempNormal, _tempColor2);

                        // Push geometries scaled to physical meters
                        positions.push(
                            pt0.x * voxelScale, pt0.y * voxelScale, pt0.z * voxelScale,
                            pt1.x * voxelScale, pt1.y * voxelScale, pt1.z * voxelScale,
                            pt2.x * voxelScale, pt2.y * voxelScale, pt2.z * voxelScale
                        );

                        normals.push(
                            n0x, n0y, n0z,
                            n1x, n1y, n1z,
                            n2x, n2y, n2z
                        );

                        colors.push(
                            _tempColor0.r, _tempColor0.g, _tempColor0.b,
                            _tempColor1.r, _tempColor1.g, _tempColor1.b,
                            _tempColor2.r, _tempColor2.g, _tempColor2.b
                        );
                    }
                }
            }
        }

        // Load data into BufferGeometry attributes
        if (positions.length > 0) {
            this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            this.geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            this.geometry.computeBoundingSphere();
            this.geometry.computeBoundingBox();
            this.mesh.visible = true;
        } else {
            // Empty chunk
            this.geometry.deleteAttribute('position');
            this.geometry.deleteAttribute('normal');
            this.geometry.deleteAttribute('color');
            this.mesh.visible = false;
        }
    }
}
// ==========================================
// VOXEL TERRAIN MANAGEMENT CLASS
// ==========================================
export class VoxelTerrain {
    constructor(scene, width = 256, height = 64, depth = 256, voxelScale = 3.0) {
        this.scene = scene;
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.voxelScale = voxelScale;
        this.chunkSize = 16;
        
        // Vertical voxel range:
        // Sea level is at y = 40 (world Y = 120.0m).
        // 512m deep ocean floor reaches world Y = 120.0 - 512.0 = -392.0m (voxel y = -131).
        // Continental mountain summits reach up to world Y = 264.0m (voxel y = 88).
        this.minY = -131;
        this.maxY = 88;
        this.minWorldY = this.minY * this.voxelScale; // -393.0m
        this.maxWorldY = this.maxY * this.voxelScale; // 264.0m
        this.minChunkY = Math.floor(this.minY / this.chunkSize); // -9
        this.maxChunkY = Math.ceil(this.maxY / this.chunkSize);  // 6
        this.chunksY = this.maxChunkY - this.minChunkY;

        // Planetary Earth-like Generation Variables (Fully Configurable)
        this.planetaryConfig = {
            planetRadiusKm: 1800,           // Planet radius in kilometers
            equatorZ: 0,                    // Z-coordinate of Equator
            poleDistanceMeters: 32000,      // Distance from Equator to Polar Ice Caps (meters)
            continentFrequency: 0.00015,    // Scale of macro-continents (lower = larger continents)
            continentThreshold: 0.08,       // Continent vs Ocean sea level threshold
            mountainRidgeFrequency: 0.0007, // Density of interior continental mountain ranges
            beachWidth: 0.14,               // Continental beach span factor (creates wide idyllic beaches)
            maxMountainElevation: 32.0,     // Max extra height of interior mountain ranges (voxels, ~96m)
            polarIceDomeHeight: 22.0,       // Max height of polar glacier domes (voxels, ~66m)
            enableContinents: true,         // Toggle continental landmasses
            enableDeserts: true,            // Toggle equatorial continental deserts
            enableGlaciers: true,           // Toggle polar ice sheets and mountain glaciers
            enableAlpine: true,             // Toggle alpine meadows & pastures (alpeggi)
            enableForests: true             // Toggle temperate forests & woodlands
        };

        // Camera position uniform for planetary horizon curvature & detail LOD
        this.cameraPos = new THREE.Vector3();

        // Next-Gen Terrain Material with Smooth Normals + Procedural Triplanar Detail Shader
        this.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85,
            metalness: 0.04,
            flatShading: false, // Smooth organic shading with procedural normal bump detail
            side: THREE.FrontSide
        });

        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uCameraPos = { value: this.cameraPos };

            shader.vertexShader = `
                uniform vec3 uCameraPos;
                varying vec3 vMCWorldPos;
                varying vec3 vMCTerrainNormal;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                 vec4 mcWorldInit = modelMatrix * vec4(transformed, 1.0);
                 vMCWorldPos = mcWorldInit.xyz;
                 vMCTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);
                 float mcDistH = length(mcWorldInit.xz - uCameraPos.xz);
                 float mcPlanetR = 1800000.0;
                 if (mcDistH < mcPlanetR) {
                     float mcDrop = mcPlanetR - sqrt(mcPlanetR * mcPlanetR - mcDistH * mcDistH);
                     transformed.y -= mcDrop;
                 }`
            );

            shader.fragmentShader = `
                varying vec3 vMCWorldPos;
                varying vec3 vMCTerrainNormal;

                float mcHash31(vec3 p) {
                    p = fract(p * vec3(443.897, 441.423, 437.195));
                    p += dot(p, p.yzx + 19.19);
                    return fract((p.x + p.y) * p.z);
                }

                float mcNoise3(vec3 p) {
                    vec3 i = floor(p);
                    vec3 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(mix(mcHash31(i + vec3(0,0,0)), mcHash31(i + vec3(1,0,0)), f.x),
                            mix(mcHash31(i + vec3(0,1,0)), mcHash31(i + vec3(1,1,0)), f.x), f.y),
                        mix(mix(mcHash31(i + vec3(0,0,1)), mcHash31(i + vec3(1,0,1)), f.x),
                            mix(mcHash31(i + vec3(0,1,1)), mcHash31(i + vec3(1,1,1)), f.x), f.y),
                        f.z
                    );
                }

                float mcFbm3(vec3 p) {
                    float v = 0.0;
                    v += 0.500 * mcNoise3(p); p *= 2.03;
                    v += 0.250 * mcNoise3(p); p *= 2.01;
                    v += 0.125 * mcNoise3(p); p *= 2.02;
                    v += 0.0625 * mcNoise3(p);
                    return v;
                }
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                 float wy = vMCWorldPos.y;
                 float slope = clamp(vMCTerrainNormal.y, 0.0, 1.0);

                 // Multi-scale 3D procedural noise for rock strata, foliage & sand grain
                 float nMacro = mcFbm3(vMCWorldPos * 0.045);
                 float nMed   = mcFbm3(vMCWorldPos * 0.22);
                 float nFine  = mcNoise3(vMCWorldPos * 1.35);
                 float nMicro = mcNoise3(vMCWorldPos * 5.5);

                 // 1. Craggy Stratified Rock Cliffs (steep slopes or high peaks)
                 float rockMask = smoothstep(0.76, 0.52, slope);
                 float strata = sin(wy * 1.45 + nMed * 5.0) * 0.5 + 0.5;
                 float crevice = smoothstep(0.32, 0.68, nMed * 0.7 + nFine * 0.3);
                 vec3 darkRock = vec3(0.18, 0.17, 0.16);
                 vec3 midRock  = vec3(0.46, 0.43, 0.39);
                 vec3 lightRock = vec3(0.66, 0.62, 0.56);
                 vec3 rockCol = mix(darkRock, midRock, crevice);
                 rockCol = mix(rockCol, lightRock, strata * 0.55 + nMicro * 0.15);
                 // Subtle moss in damp horizontal rock ledges
                 float ledgeMoss = smoothstep(0.55, 0.78, slope) * smoothstep(0.45, 0.75, nMacro) * smoothstep(123.0, 130.0, wy);
                 rockCol = mix(rockCol, vec3(0.18, 0.36, 0.15), ledgeMoss * 0.65);

                 // 2. Lush Multi-Tone Tropical Grass & Jungle Undergrowth
                 vec3 deepJungle = vec3(0.10, 0.34, 0.13);
                 vec3 lushGrass  = vec3(0.22, 0.52, 0.17);
                 vec3 sunlitLeaf = vec3(0.38, 0.62, 0.20);
                 vec3 vegCol = mix(deepJungle, lushGrass, smoothstep(0.28, 0.72, nMacro));
                 vegCol = mix(vegCol, sunlitLeaf, smoothstep(0.45, 0.80, nMed) * 0.65);
                 vegCol *= (0.88 + 0.24 * nFine);

                 // 3. Warm Coral & Golden Beach Sand with Wet Shoreline Band
                 vec3 drySand = mix(vec3(0.94, 0.88, 0.74), vec3(0.86, 0.76, 0.58), nMed * 0.6 + nMicro * 0.25);
                 float wetZone = smoothstep(121.35, 119.95, wy);
                 vec3 sandCol = mix(drySand, drySand * vec3(0.64, 0.62, 0.58), wetZone);

                 // 4. Underwater Coral Reef & Turquoise Lagoon Shallows (< 120.0m)
                 if (wy < 120.0) {
                     float waterDepth = 120.0 - wy;
                     float coralPatch = smoothstep(0.42, 0.64, mcFbm3(vMCWorldPos * 0.14));
                     vec3 lagoonSand = vec3(0.55, 0.88, 0.86) * (0.9 + 0.2 * nFine);
                     vec3 coralCol = mix(vec3(0.06, 0.24, 0.28), vec3(0.14, 0.36, 0.32), nMed);
                     vec3 shallowBed = mix(lagoonSand, coralCol, coralPatch * 0.78);
                     float deepFade = clamp(waterDepth / 18.0, 0.0, 1.0);
                     diffuseColor.rgb = mix(shallowBed, diffuseColor.rgb * (0.75 + 0.35 * nMed), deepFade);
                 } else if (wy < 126.2) {
                     // Coastal beach to jungle transition
                     float grassBlend = smoothstep(123.8 + nMacro * 1.6, 126.0 + nMacro * 1.2, wy);
                     vec3 coastalSurface = mix(sandCol, vegCol, grassBlend);
                     diffuseColor.rgb = mix(coastalSurface, rockCol, rockMask);
                 } else {
                     // Inland hills, mountains & biome-tinted terrain
                     // Preserve special biome hues (snow/desert) while injecting rich procedural detail
                     float isTropicalOrForest = smoothstep(0.15, 0.45, diffuseColor.g - diffuseColor.r * 0.65);
                     vec3 detailedBase = mix(diffuseColor.rgb * (0.82 + 0.35 * nMed), vegCol, isTropicalOrForest * 0.85);
                     diffuseColor.rgb = mix(detailedBase, rockCol, rockMask);
                 }`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                `#include <normal_fragment_maps>
                 // Procedural 3D Bump / Normal Perturbation for craggy rocks and lush foliage
                 vec3 bumpPos = vMCWorldPos * mix(0.85, 0.42, rockMask);
                 float eps = 0.12;
                 float h0 = mcFbm3(bumpPos);
                 float hx = mcFbm3(bumpPos + vec3(eps, 0.0, 0.0)) - h0;
                 float hy = mcFbm3(bumpPos + vec3(0.0, eps, 0.0)) - h0;
                 float hz = mcFbm3(bumpPos + vec3(0.0, 0.0, eps)) - h0;
                 float bumpStrength = mix(0.14, 0.42, rockMask) * smoothstep(119.5, 121.5, wy);
                 normal = normalize(normal - vec3(hx, hy, hz) * (bumpStrength / eps));`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <roughnessmap_fragment>',
                `#include <roughnessmap_fragment>
                 float shorelineGloss = smoothstep(121.2, 119.9, vMCWorldPos.y) * step(119.8, vMCWorldPos.y);
                 roughnessFactor = mix(roughnessFactor, 0.22, shorelineGloss);`
            );
        };

        // Sparse map for modified voxels: key is "x,y,z"
        this.modifiedVoxels = new Map();
        this.modifiedColumns = new Set();
        this.locallyModifiedChunks = new Set();
        
        // Group to hold all chunk meshes
        this.group = new THREE.Group();
        this.group.position.set(0, 0, 0);
        this.scene.add(this.group);

        // Map of currently loaded VoxelChunk objects: key is "cx,cy,cz"
        this.loadedChunks = new Map();

        // Queue for progressive chunk building
        this.chunkBuildQueue = [];

        this.noise = new PerlinNoise();
    }

    getDensity(x, y, z) {
        // Out of bounds voxels are empty air
        if (y < this.minY || y >= this.maxY) {
            return -1.0;
        }
        if (Math.abs(x) > 600000 || Math.abs(z) > 600000) {
            return -1.0;
        }
        
        const key = `${x},${y},${z}`;
        if (this.modifiedVoxels.has(key)) {
            return this.modifiedVoxels.get(key);
        }
        return this.getBaseDensity(x, y, z);
    }

    setDensity(x, y, z, value) {
        if (y < this.minY || y >= this.maxY) return;
        if (Math.abs(x) > 600000 || Math.abs(z) > 600000) return;
        
        const key = `${x},${y},${z}`;
        this.modifiedVoxels.set(key, value);
        this.modifiedColumns.add(`${x},${z}`);

        // Mark chunks reading this voxel as dirty and update their local cache
        const cx1 = Math.floor((x - 1) / this.chunkSize);
        const cx2 = Math.floor(x / this.chunkSize);
        const cy1 = Math.floor((y - 1) / this.chunkSize);
        const cy2 = Math.floor(y / this.chunkSize);
        const cz1 = Math.floor((z - 1) / this.chunkSize);
        const cz2 = Math.floor(z / this.chunkSize);

        for (let cx = cx1; cx <= cx2; cx++) {
            for (let cy = cy1; cy <= cy2; cy++) {
                for (let cz = cz1; cz <= cz2; cz++) {
                    const chunkKey = `${cx},${cy},${cz}`;
                    if (this.loadedChunks.has(chunkKey)) {
                        const chunk = this.loadedChunks.get(chunkKey);
                        chunk.setLocalDensity(x, y, z, value);
                        this.locallyModifiedChunks.add(chunk);
                    }
                }
            }
        }
    }

    getPlanetaryBiome(worldX, worldY, worldZ) {
        const vx = worldX / this.voxelScale;
        const vz = worldZ / this.voxelScale;
        const wy = worldY;

        // Reset temporary struct
        _tempBiomeInfo.isGlacier = false;
        _tempBiomeInfo.isDesert = false;
        _tempBiomeInfo.isBeach = false;
        _tempBiomeInfo.isForest = false;
        _tempBiomeInfo.isAlpine = false;
        _tempBiomeInfo.isMountain = false;
        _tempBiomeInfo.isStartingEast = false;

        // Protected starting archipelago
        const distFromCenter = Math.sqrt(vx * vx + vz * vz);
        const dxEast = vx - 220.0;
        const dzEast = vz - 20.0;
        const distFromEastArchi = Math.sqrt(dxEast * dxEast * 0.7 + dzEast * dzEast * 0.4);

        if (distFromCenter < 180.0) {
            _tempBiomeInfo.type = 'lagoon_atoll';
            _tempBiomeInfo.name = '🏝️ ATOLLO E LAGUNA TROPICALE';
            return _tempBiomeInfo;
        }
        if (distFromEastArchi < 240.0) {
            _tempBiomeInfo.type = 'starting_east';
            _tempBiomeInfo.name = '🏜️ ARCIPELAGO ORIENTALE';
            _tempBiomeInfo.isStartingEast = true;
            return _tempBiomeInfo;
        }

        const poleDist = (this.planetaryConfig && this.planetaryConfig.poleDistanceMeters) ? this.planetaryConfig.poleDistanceMeters : 32000.0;
        const lat = Math.min(1.0, Math.abs(worldZ) / poleDist);
        _tempBiomeInfo.latitude = lat;

        // Continental noise
        const freq = (this.planetaryConfig && this.planetaryConfig.continentFrequency) ? this.planetaryConfig.continentFrequency : 0.00015;
        const c1 = this.noise.noise2d(vx * freq, vz * freq);
        const c2 = this.noise.noise2d(vx * freq * 3.3, vz * freq * 3.3) * 0.35;
        const c3 = this.noise.noise2d(vx * freq * 11.0, vz * freq * 11.0) * 0.12;
        const contRaw = c1 + c2 + c3;
        const thresh = (this.planetaryConfig && this.planetaryConfig.continentThreshold) ? this.planetaryConfig.continentThreshold : 0.08;
        const beachSpan = (this.planetaryConfig && this.planetaryConfig.beachWidth) ? this.planetaryConfig.beachWidth : 0.14;

        if (contRaw < thresh) {
            // Oceanic region & islands
            if (lat >= 0.75) {
                _tempBiomeInfo.type = 'polar_ocean';
                _tempBiomeInfo.name = '❄️ OCEANO POLARE & SCOGLI DI GHIACCIO';
                _tempBiomeInfo.isGlacier = true;
            } else if (lat < 0.25) {
                _tempBiomeInfo.type = 'tropical_ocean';
                _tempBiomeInfo.name = '🏝️ OCEANO TROPICALE & ATOLLI';
            } else {
                _tempBiomeInfo.type = 'open_ocean';
                _tempBiomeInfo.name = '🌊 OCEANO APERTO & ISOLE';
            }
            return _tempBiomeInfo;
        }

        // Continental landmass
        const contFactor = Math.min(1.0, (contRaw - thresh) / 0.35);
        _tempBiomeInfo.contFactor = contFactor;

        // 1. Polar Glaciers & Ice Sheets
        if (lat >= 0.70) {
            _tempBiomeInfo.type = 'glacier';
            _tempBiomeInfo.name = '❄️ CALOTTA GLACIALE POLARE';
            _tempBiomeInfo.isGlacier = true;
            return _tempBiomeInfo;
        }

        // 2. Equatorial Continental Interior Desert
        if (lat <= 0.25 && contFactor > 0.32) {
            _tempBiomeInfo.type = 'desert';
            _tempBiomeInfo.name = '🏜️ GRANDE DESERTO EQUATORIALE';
            _tempBiomeInfo.isDesert = true;
            return _tempBiomeInfo;
        }

        // 3. Continental Idyllic Beach
        if (contRaw < (thresh + beachSpan) && wy < 127.5) {
            _tempBiomeInfo.type = 'beach';
            _tempBiomeInfo.name = '🏖️ SPIAGGIA CONTINENTALE IDILLIACA';
            _tempBiomeInfo.isBeach = true;
            return _tempBiomeInfo;
        }

        // 4. Continental Altitude Zonation:
        // Mountain Peaks & Summit Glaciers
        if (wy >= 210.0 || (wy >= 185.0 && lat > 0.48)) {
            _tempBiomeInfo.type = 'summit_glacier';
            _tempBiomeInfo.name = '🏔️ VETTA GLACIALE & NEVI PERENNI';
            _tempBiomeInfo.isGlacier = true;
            return _tempBiomeInfo;
        }
        if (wy >= 175.0) {
            _tempBiomeInfo.type = 'mountain';
            _tempBiomeInfo.name = '⛰️ CATENA MONTUOSA & CRESTE';
            _tempBiomeInfo.isMountain = true;
            return _tempBiomeInfo;
        }
        // Alpine Pastures (Alpeggi)
        if (wy >= 150.0) {
            _tempBiomeInfo.type = 'alpine';
            _tempBiomeInfo.name = '🌱 ALPEGGI & PASCOLI ALPINI';
            _tempBiomeInfo.isAlpine = true;
            return _tempBiomeInfo;
        }
        // Temperate Woods & Forests
        _tempBiomeInfo.type = 'forest';
        _tempBiomeInfo.name = '🌲 FORESTA TEMPERATA & BOSCHI';
        _tempBiomeInfo.isForest = true;
        return _tempBiomeInfo;
    }

    getPlanetaryAtmosphereColor(worldX, worldY, worldZ) {
        const biome = this.getPlanetaryBiome(worldX, worldY, worldZ);
        if (biome.isGlacier) {
            return new THREE.Color(0xd0e8f2); // Crisp, icy polar atmospheric mist
        }
        if (biome.isDesert) {
            return new THREE.Color(0xf6e2c3); // Warm golden-amber desert haze
        }
        return new THREE.Color(0x8ce3ff); // Standard bright turquoise Caribbean / azure sky
    }

    getContinentalLand(x, z) {
        if (!this.planetaryConfig || !this.planetaryConfig.enableContinents) {
            return { weight: 0.0, hill: 0.0 };
        }

        const wz = z * this.voxelScale;
        const lat = Math.min(1.0, Math.abs(wz) / this.planetaryConfig.poleDistanceMeters);

        const freq = this.planetaryConfig.continentFrequency;
        const c1 = this.noise.noise2d(x * freq, z * freq);
        const c2 = this.noise.noise2d(x * freq * 3.3, z * freq * 3.3) * 0.35;
        const c3 = this.noise.noise2d(x * freq * 11.0, z * freq * 11.0) * 0.12;
        const contRaw = c1 + c2 + c3;

        const thresh = this.planetaryConfig.continentThreshold;
        if (contRaw < thresh) {
            return { weight: 0.0, hill: 0.0 };
        }

        const beachSpan = this.planetaryConfig.beachWidth;
        const shoreT = Math.min(1.0, (contRaw - thresh) / beachSpan);
        const inlandT = Math.max(0.0, (contRaw - (thresh + beachSpan)) / 0.35);

        const contWeight = Math.min(1.0, shoreT * 1.25);

        // 1. Idyllic gentle beach slope (Y=40 to 44.5)
        let hill = Math.pow(shoreT, 2.0) * 4.5;

        // 2. Rolling plains and forest lowlands
        if (shoreT >= 1.0) {
            const rollingHills = this.noise.noise2d(x * 0.012, z * 0.012) * 3.0 + 4.5;
            hill = Math.max(hill, rollingHills);
        }

        // 3. Interior Mountain Ranges ("catene montuose nell'interno")
        if (inlandT > 0.0) {
            const mFreq = this.planetaryConfig.mountainRidgeFrequency;
            const m1 = 1.0 - Math.abs(this.noise.noise2d(x * mFreq, z * mFreq));
            const m2 = this.noise.noise2d(x * mFreq * 3.5, z * mFreq * 3.5) * 0.35;
            const mRidge = Math.max(0.0, (m1 + m2 - 0.30) / 0.70);
            if (mRidge > 0.0) {
                const mountainRise = Math.pow(mRidge, 1.6) * this.planetaryConfig.maxMountainElevation * inlandT;
                hill += mountainRise;
            }
        }

        // 4. Equatorial Desert Dunes
        if (lat < 0.25 && inlandT > 0.20 && this.planetaryConfig.enableDeserts) {
            const dune = Math.sin(x * 0.035 + Math.cos(z * 0.018) * 2.2) * 2.8 + Math.sin(z * 0.05) * 1.2;
            hill = Math.max(hill, 5.0 + dune);
        }

        // 5. Polar Glaciers & Ice Domes
        if (lat >= 0.70 && this.planetaryConfig.enableGlaciers) {
            const polarDome = Math.pow((lat - 0.70) / 0.30, 1.3) * this.planetaryConfig.polarIceDomeHeight * Math.min(1.0, shoreT * 1.5);
            hill += polarDome;
        }

        return {
            weight: contWeight,
            hill: hill
        };
    }

    getGlobalProceduralLand(x, z) {
        // Exclude the starting archipelago zone to keep the initial islands pristine
        const distFromCenter = Math.sqrt(x * x + z * z);
        const dxEast = x - 220.0;
        const dzEast = z - 20.0;
        const distFromEastArchi = Math.sqrt(dxEast * dxEast * 0.7 + dzEast * dzEast * 0.4);
        
        // Inside the starting archipelago protected zone
        if (distFromCenter < 180.0 || distFromEastArchi < 240.0) {
            return { weight: 0.0, hill: 0.0 };
        }
        
        // Smooth transition mask between starting archipelago and infinite ocean
        const transitionDist = Math.min(distFromCenter - 180.0, distFromEastArchi - 240.0);
        const startAreaMask = Math.min(Math.max(transitionDist / 50.0, 0.0), 1.0);
        if (startAreaMask <= 0.0) {
            return { weight: 0.0, hill: 0.0 };
        }

        // Continental landmasses
        const cont = this.getContinentalLand(x, z);
        let maxWeight = cont.weight;
        let maxHill = cont.hill;

        // Planetary infinite cellular grid for procedural islands
        // Cell size = 260 voxels (780 meters)
        const cellSize = 260.0;
        const cellX = Math.floor(x / cellSize);
        const cellZ = Math.floor(z / cellSize);

        // Check the 3x3 neighborhood of cells
        for (let ox = -1; ox <= 1; ox++) {
            for (let oz = -1; oz <= 1; oz++) {
                const cx = cellX + ox;
                const cz = cellZ + oz;

                // Deterministic fast pseudo-random hash for this cell
                // 32-bit integer arithmetic (zero allocation, instantaneous)
                let h1 = ((cx * 374761393 + cz * 668265263 + 127412617) ^ 0x5bf03635);
                h1 = Math.imul(h1 ^ (h1 >>> 13), 127412617);
                const hasIsland = ((h1 ^ (h1 >>> 16)) >>> 0) / 4294967296.0;

                // 35% of cells are open ocean channels between islands
                if (hasIsland > 0.65) continue;

                let h2 = ((cx * 668265263 + cz * 374761393 + 289133645) ^ 0x3d7b42a1);
                h2 = Math.imul(h2 ^ (h2 >>> 13), 289133645);
                const randX = ((h2 ^ (h2 >>> 16)) >>> 0) / 4294967296.0;

                let h3 = ((cx * 127412617 + cz * 459123847 + 668265263) ^ 0x1f83c5e9);
                h3 = Math.imul(h3 ^ (h3 >>> 13), 668265263);
                const randZ = ((h3 ^ (h3 >>> 16)) >>> 0) / 4294967296.0;

                let h4 = ((cx * 459123847 + cz * 127412617 + 374761393) ^ 0x7a2c9183);
                h4 = Math.imul(h4 ^ (h4 >>> 13), 374761393);
                const typeHash = ((h4 ^ (h4 >>> 16)) >>> 0) / 4294967296.0;

                let h5 = ((cx * 289133645 + cz * 668265263 + 459123847) ^ 0x4e91b2c7);
                h5 = Math.imul(h5 ^ (h5 >>> 13), 459123847);
                const sizeHash = ((h5 ^ (h5 >>> 16)) >>> 0) / 4294967296.0;

                // Island center inside the cell with natural jitter
                const islandCenterX = (cx + 0.5 + (randX - 0.5) * 0.55) * cellSize;
                const islandCenterZ = (cz + 0.5 + (randZ - 0.5) * 0.55) * cellSize;

                const dx = x - islandCenterX;
                const dz = z - islandCenterZ;
                const distCenter = Math.sqrt(dx * dx + dz * dz);

                // Add organic fractal shoreline noise
                const shoreNoise = (this.noise.noise2d(x * 0.04, z * 0.04) * 8.0) +
                                   (this.noise.noise2d(x * 0.10, z * 0.10) * 2.5);

                let islandWeight = 0.0;
                let islandHill = 0.0;

                // TYPE 0: CORAL ATOLL WITH TURQUOISE LAGOON (typeHash < 0.25)
                if (typeHash < 0.25) {
                    const atollRadius = 45.0 + sizeHash * 35.0; // 45 to 80 voxels (135m to 240m radius)
                    const ringDist = Math.abs(distCenter - atollRadius);
                    const ringThickness = 18.0 + sizeHash * 8.0; // 18 to 26 voxels
                    const atollDistWithNoise = ringDist + shoreNoise;
                    
                    if (atollDistWithNoise < ringThickness) {
                        const t = Math.max(0.0, 1.0 - atollDistWithNoise / ringThickness);
                        islandWeight = t;
                        // Gentle sandy ring ridge
                        islandHill = Math.max(islandHill, 9.0 * Math.pow(t, 1.3));
                    }
                    // Shallow coral lagoon inside the atoll ring
                    if (distCenter < atollRadius) {
                        const lagoonT = Math.max(0.0, 1.0 - distCenter / atollRadius);
                        islandWeight = Math.max(islandWeight, 0.40 * lagoonT);
                    }
                }
                // TYPE 1: CONICAL VOLCANO ISLAND WITH CALDERA / CRATER (0.25 <= typeHash < 0.45)
                else if (typeHash < 0.45) {
                    const volcanoRadius = 50.0 + sizeHash * 35.0; // 50 to 85 voxels (150m to 255m radius)
                    // Slightly stretch or tilt the volcano
                    const stretchZ = (typeHash > 0.35) ? 0.75 : 1.15;
                    const vDist = Math.sqrt(dx * dx + (dz * stretchZ) * (dz * stretchZ)) + shoreNoise;
                    
                    if (vDist < volcanoRadius) {
                        const t = Math.max(0.0, 1.0 - vDist / volcanoRadius);
                        islandWeight = t;
                        // High conical volcanic elevation (up to 40m - 50m above base)
                        let vHeight = 14.0 * Math.pow(t, 1.25);
                        
                        // Crater bowl depression at center
                        const craterRadius = 12.0 + sizeHash * 6.0;
                        if (vDist < craterRadius) {
                            const craterT = Math.max(0.0, 1.0 - Math.max(0.0, vDist) / craterRadius);
                            vHeight -= 7.0 * Math.pow(craterT, 1.4);
                        }
                        islandHill = Math.max(islandHill, vHeight);
                    }
                }
                // TYPE 2: MOUNTAINOUS ARCHIPELAGO / RIDGE CHAINS (0.45 <= typeHash < 0.80)
                else if (typeHash < 0.80) {
                    const archiRadius = 60.0 + sizeHash * 55.0; // 60 to 115 voxels (180m to 345m radius)
                    // Ridge elongation along an angle
                    const angle = sizeHash * Math.PI;
                    const cosA = Math.cos(angle);
                    const sinA = Math.sin(angle);
                    const rotX = dx * cosA - dz * sinA;
                    const rotZ = dx * sinA + dz * cosA;
                    // Stretched along one axis to create natural island chains and mountain spines
                    const mDist = Math.sqrt(rotX * rotX * 0.65 + rotZ * rotZ * 1.35) + shoreNoise;
                    
                    if (mDist < archiRadius) {
                        const t = Math.max(0.0, 1.0 - mDist / archiRadius);
                        islandWeight = t;
                        
                        // Rolling high peaks and mountain ridges with valleys
                        const ridgeNoise = this.noise.noise2d(rotX * 0.04, rotZ * 0.04) * 5.0;
                        const peakNoise = this.noise.noise2d(rotX * 0.08, rotZ * 0.08) * 2.5;
                        const mHeight = Math.max(0.0, Math.pow(t, 1.2) * 16.0 + ridgeNoise + peakNoise);
                        islandHill = Math.max(islandHill, mHeight);
                    }
                }
                // TYPE 3: SCOGLI & FARAGLIONI / JAGGED SEA CRAGS (typeHash >= 0.80)
                else {
                    const cragRadius = 25.0 + sizeHash * 25.0; // 25 to 50 voxels (75m to 150m radius)
                    const cDist = distCenter + shoreNoise * 1.4;
                    
                    if (cDist < cragRadius) {
                        const t = Math.max(0.0, 1.0 - cDist / cragRadius);
                        // Sharp threshold for steep cliff walls rising out of the water
                        islandWeight = Math.pow(t, 0.7);
                        // High spire crag
                        const cragSpire = Math.pow(t, 1.1) * 12.0;
                        islandHill = Math.max(islandHill, cragSpire);
                    }
                }

                if (islandWeight > maxWeight) {
                    maxWeight = islandWeight;
                }
                if (islandHill > maxHill) {
                    maxHill = islandHill;
                }
            }
        }

        return {
            weight: maxWeight * startAreaMask,
            hill: maxHill * startAreaMask
        };
    }

    getBaseDensity(x, y, z) {
        // Center of the world is (0, 0) in voxel space
        const distFromCenter = Math.sqrt(x * x + z * z);
        
        // 1. Circular atoll ring at radius 38 voxels (114 meters) with a thickness/span of 22 voxels (66 meters)
        const distFromAtoll = Math.abs(distFromCenter - 38.0);
        const atollWeightRaw = Math.max(0.0, 1.0 - distFromAtoll / 22.0);
        
        // Keep a minimum land weight of 0.35 inside the lagoon (dist < 38)
        let atollWeight = atollWeightRaw;
        if (distFromCenter < 38.0) {
            atollWeight = Math.max(0.35, atollWeightRaw);
        }
        
        // 2. Volcano island centered at (0, 95) with a radius of 42 voxels (126 meters)
        // Stretched towards the south (dz < 0) to make a long flat tongue of land that enters the water smoothly
        const dx = x;
        let dz = z - 95.0;
        if (dz < 0.0) {
            dz = dz * 0.5; // Stretch by 2x along Z
        }
        
        const distToVolcanoRaw = Math.sqrt(dx * dx + dz * dz);
        // Add 2D Perlin noise to make the shoreline irregular
        const shoreNoise = this.noise.noise2d(x * 0.08, z * 0.08) * 5.0;
        const distToVolcano = distToVolcanoRaw + shoreNoise;
        
        const volcanoWeight = Math.max(0.0, 1.0 - distToVolcano / 42.0);
        
        // 3. Four-times enlarged Great Rocky Archipelago (X > 80 voxels, > 240 meters from center)
        // Spaced out to ensure a wide open sea channel (150m+ gap) between atoll and archipelago
        const eastShoreNoise = (this.noise.noise2d(x * 0.015, z * 0.015) * 16.0) + (this.noise.noise2d(x * 0.04, z * 0.04) * 6.0);
        
        // Island A (North-East): Center (250, 240), Radius 120 voxels (~720m diameter)
        const dxA = (x - 250.0) * 1.15;
        const dzA = (z - 240.0) * 0.85;
        const distA = Math.sqrt(dxA * dxA + dzA * dzA) + eastShoreNoise;
        const weightA = Math.max(0.0, 1.0 - distA / 120.0);
        
        // Island B (Center-East): Center (220, 20), Radius 100 voxels (~600m diameter)
        const dxB = (x - 220.0) * 1.1;
        const dzB = (z - 20.0) * 0.95;
        const distB = Math.sqrt(dxB * dxB + dzB * dzB) + eastShoreNoise;
        const weightB = Math.max(0.0, 1.0 - distB / 100.0);
        
        // Island C (South-East / Grand Island): Center (260, -220), Radius 150 voxels (~900m diameter, 1.5km long)
        const dxC = (x - 260.0) * 1.15;
        const dzC = (z - (-220.0)) * 0.70;
        const distC = Math.sqrt(dxC * dxC + dzC * dzC) + eastShoreNoise;
        const weightC = Math.max(0.0, 1.0 - distC / 150.0);
        
        // Combine the three giant eastern islands
        const eastIslandWeight = Math.max(weightA, weightB, weightC);
        
        // 4. Global procedural infinite island generator beyond the starting archipelago
        const globalLand = this.getGlobalProceduralLand(x, z);

        // Combine land weights of atoll, volcano, eastern islands and infinite global islands
        const landWeight = Math.max(atollWeight, volcanoWeight, eastIslandWeight, globalLand.weight);
        
        // Smooth falloffs
        const smoothWeightAbove = Math.pow(Math.max(0.0, Math.min(1.0, landWeight)), 1.2);
        const smoothWeightBelow = Math.pow(Math.max(0.0, Math.min(1.0, landWeight * 1.5)), 1.2);
        
        // Base terrain height factor using Perlin Noise fBm
        const n1 = this.noise.noise2d(x * 0.03, z * 0.03) * 3.5;
        const n2 = this.noise.noise2d(x * 0.10, z * 0.10) * 1.0;
        const baseHeightRaw = 4.0 + n1 + n2;
        
        // Calculate hill heights
        let hillHeight = 0;
        
        // Atoll hill height with scenic rocky crags and low sandy motu passes
        if (distFromAtoll < 22.0) {
            const t = Math.max(0.0, 1.0 - distFromAtoll / 22.0);
            const atollPeakNoise = Math.max(-1.5, this.noise.noise2d(x * 0.038, z * 0.038) * 3.8);
            hillHeight = Math.max(hillHeight, (11.5 + atollPeakNoise) * Math.pow(t, 1.25));
        }
        
        // Volcano hill height with a central crater bowl (lower and flatter)
        if (distToVolcano < 42.0) {
            const t = Math.max(0.0, 1.0 - distToVolcano / 42.0);
            let vHill = 10.5 * Math.pow(t, 1.25);
            
            // Subtract a bowl for the crater at the very center of the volcano island (distance < 10 voxels)
            if (distToVolcano < 10.0) {
                const craterT = Math.max(0.0, 1.0 - Math.max(0.0, distToVolcano) / 10.0);
                vHill -= 4.5 * Math.pow(craterT, 1.5); // Crater depression
            }
            hillHeight = Math.max(hillHeight, vHill);
        }
        
        // Eastern islands hill height (dramatic tropical volcanic ridges and peaks like Image 2)
        if (x > 80.0 && eastIslandWeight > 0.0) {
            const t = Math.pow(Math.max(0.0, eastIslandWeight), 1.25);
            const ridge = Math.max(0.0, 1.0 - Math.abs(this.noise.noise2d(x * 0.018, z * 0.018)));
            const hillNoise = this.noise.noise2d(x * 0.03, z * 0.03) * 3.0;
            const eHill = Math.max(0.0, t * 14.0 + Math.pow(ridge, 1.5) * t * 8.5 + hillNoise);
            hillHeight = Math.max(hillHeight, eHill);
        }

        // Global procedural islands hill height
        if (globalLand.hill > 0.0) {
            hillHeight = Math.max(hillHeight, globalLand.hill);
        }
        
        let density = 0;
        if (y >= 40) {
            const finalHeight = baseHeightRaw * smoothWeightAbove + hillHeight * smoothWeightAbove;
            density = finalHeight - (y - 32);
        } else if (y > 0) {
            // Natural bathymetry from sea level (y = 40) down to natural seabed (y = 0, 120m depth)
            const blend = y / 40.0;
            const mask = blend * smoothWeightAbove + (1.0 - blend) * smoothWeightBelow;
            const finalHeight = baseHeightRaw * mask + hillHeight * mask;
            density = finalHeight - (y * 0.2);
        } else {
            // Solid bedrock from natural seabed (y = 0) down to 512m maximum diggable depth (y = -131, -393m)
            density = 1.0;
        }
        
        // Add 3D bumpy noise ONLY on elevated hills/cliffs above the beach waterline (y > 40.8)
        // This prevents 3D noise blobs from poking through shallow water as ugly grey floating blotches!
        if (y > 40.8) {
            const noiseY = y - 32.0;
            const finalHeightAbove = baseHeightRaw * smoothWeightAbove + hillHeight * smoothWeightAbove;
            if (noiseY < finalHeightAbove + 2.0) {
                const aboveWaterMask = Math.min(1.0, (y - 40.8) / 2.2);
                const bumpyNoise = this.noise.noise3d(x * 0.12, noiseY * 0.12, z * 0.12) * 1.65 * aboveWaterMask;
                density += bumpyNoise;
            }
        }
        
        // Keep ocean bedrock floor solid at y <= -131 (512m depth)
        if (y <= -131) {
            density = Math.max(density, 1.0);
        }
        
        return density;
    }

    // Returns true if the column is naturally open ocean at sea level (y = 40, world Y = 120.0m)
    isNaturalOcean(vx, vz) {
        return this.getBaseDensity(vx, 40, vz) < 0.0;
    }

    hasPotentialTerrain(cx, cy, cz) {
        const startX = cx * this.chunkSize;
        const endX = startX + this.chunkSize;
        const startZ = cz * this.chunkSize;
        const endZ = startZ + this.chunkSize;

        // Underground chunks below the natural seabed (cy < 0, y <= 0) are 100% solid bedrock
        // and produce 0 triangles unless a player has dug into this column!
        if (cy < 0) {
            if (this.modifiedColumns.size > 0) {
                for (let x = startX; x <= endX; x += 2) {
                    for (let z = startZ; z <= endZ; z += 2) {
                        if (this.modifiedColumns.has(`${x},${z}`)) return true;
                    }
                }
            }
            return false;
        }

        const midX = (startX + endX) * 0.5;
        const midZ = (startZ + endZ) * 0.5;

        // Sample at chunk bottom, middle and top Y
        const yBottom = cy * this.chunkSize;
        const yTop = yBottom + this.chunkSize;
        const yMid = yBottom + this.chunkSize * 0.5;

        const d0 = this.getBaseDensity(midX, yBottom, midZ);
        const d1 = this.getBaseDensity(midX, yMid, midZ);
        const d2 = this.getBaseDensity(startX, yBottom, startZ);
        const d3 = this.getBaseDensity(endX, yBottom, startZ);
        const d4 = this.getBaseDensity(startX, yBottom, endZ);
        const d5 = this.getBaseDensity(endX, yBottom, endZ);
        const d6 = this.getBaseDensity(midX, yTop, midZ);

        // If any sample is near or above the surface and not 100% buried solid
        const hasSolid = (d0 > -0.92 || d1 > -0.92 || d2 > -0.92 || d3 > -0.92 || d4 > -0.92 || d5 > -0.92 || d6 > -0.92);
        const hasAir   = (d0 < 1.5 || d1 < 1.5 || d2 < 1.5 || d3 < 1.5 || d4 < 1.5 || d5 < 1.5 || d6 < 1.5);
        if (hasSolid && hasAir) return true;

        // Check if any modified voxels exist in this chunk
        if (this.modifiedColumns.size > 0) {
            for (let x = startX; x <= endX; x += 2) {
                for (let z = startZ; z <= endZ; z += 2) {
                    if (this.modifiedColumns.has(`${x},${z}`)) return true;
                }
            }
        }

        return false;
    }

    updateChunksAroundPlayer(playerPos, renderDistance = 750, immediateRadius = 180) {
        const now = performance.now();
        if (!this.lastScanPos) {
            this.lastScanPos = new THREE.Vector3(999999, 999999, 999999);
            this.lastScanTime = 0;
        }

        const distMovedSq = playerPos.distanceToSquared(this.lastScanPos);
        const shouldRescan = (now - this.lastScanTime > 250) && (distMovedSq > 25.0 || this.lastScanTime === 0);

        const pvx = Math.floor(playerPos.x / this.voxelScale);
        const pvy = Math.floor(playerPos.y / this.voxelScale);
        const pvz = Math.floor(playerPos.z / this.voxelScale);
        
        const pcx = Math.floor(pvx / this.chunkSize);
        const pcy = Math.floor(pvy / this.chunkSize);
        const pcz = Math.floor(pvz / this.chunkSize);

        if (shouldRescan) {
            this.lastScanTime = now;
            this.lastScanPos.copy(playerPos);
            
            const chunkRadius = Math.ceil(renderDistance / (this.chunkSize * this.voxelScale));
            const chunkRadiusSq = chunkRadius * chunkRadius;
            const immRadiusInChunks = Math.ceil(immediateRadius / (this.chunkSize * this.voxelScale));
            const immRadiusSq = immRadiusInChunks * immRadiusInChunks;
            
            const activeKeys = new Set();
            
            // Loop through chunks in a cylinder around player
            for (let cx = pcx - chunkRadius; cx <= pcx + chunkRadius; cx++) {
                for (let cz = pcz - chunkRadius; cz <= pcz + chunkRadius; cz++) {
                    if (Math.abs(cx) > 37500 || Math.abs(cz) > 37500) continue; // 1800km planetary globe boundary
                    
                    const dx = cx - pcx;
                    const dz = cz - pcz;
                    const distColSq = dx * dx + dz * dz;
                    if (distColSq > chunkRadiusSq) continue;
                    
                    for (let cy = this.minChunkY; cy < this.maxChunkY; cy++) {
                        // Skip chunks that are pure empty air
                        if (!this.hasPotentialTerrain(cx, cy, cz)) continue;

                        const key = `${cx},${cy},${cz}`;
                        activeKeys.add(key);
                        
                        if (!this.loadedChunks.has(key)) {
                            const chunk = new VoxelChunk(cx, cy, cz, this);
                            this.loadedChunks.set(key, chunk);
                            this.group.add(chunk.mesh);
                            
                            // If immediately around player, build right now without delay!
                            if (distColSq <= immRadiusSq) {
                                chunk.rebuild();
                            } else {
                                chunk.dirty = true;
                                this.chunkBuildQueue.push(chunk);
                            }
                        }
                    }
                }
            }
            
            // Unload chunks that are too far
            for (const [key, chunk] of this.loadedChunks.entries()) {
                if (!activeKeys.has(key)) {
                    this.group.remove(chunk.mesh);
                    chunk.geometry.dispose();
                    this.loadedChunks.delete(key);
                    
                    const idx = this.chunkBuildQueue.indexOf(chunk);
                    if (idx !== -1) {
                        this.chunkBuildQueue.splice(idx, 1);
                    }
                }
            }

            // Sort build queue: build closest chunks first
            if (this.chunkBuildQueue.length > 0) {
                this.chunkBuildQueue.sort((a, b) => {
                    const da = Math.pow(a.cx - pcx, 2) + Math.pow(a.cz - pcz, 2);
                    const db = Math.pow(b.cx - pcx, 2) + Math.pow(b.cz - pcz, 2);
                    return da - db;
                });
            }
        }

        // Process queued chunks with high efficiency
        const startTime = performance.now();
        const maxBuilds = 20;
        let builtCount = 0;
        while (this.chunkBuildQueue.length > 0 && builtCount < maxBuilds) {
            const chunk = this.chunkBuildQueue.shift();
            if (chunk && chunk.dirty) {
                chunk.rebuild();
                builtCount++;
            }
            if (performance.now() - startTime > 8.0) break;
        }
    }

    exportMapData() {
        return {
            version: 1,
            modifiedVoxels: Array.from(this.modifiedVoxels.entries()),
            modifiedColumns: Array.from(this.modifiedColumns)
        };
    }

    importMapData(data) {
        if (!data) return;
        this.modifiedVoxels.clear();
        this.modifiedColumns.clear();
        if (data.modifiedVoxels) {
            for (const [key, val] of data.modifiedVoxels) {
                if (Number.isFinite(val)) {
                    this.modifiedVoxels.set(key, val);
                }
            }
        }
        if (data.modifiedColumns) {
            for (const col of data.modifiedColumns) {
                this.modifiedColumns.add(col);
            }
        }
        for (const chunk of this.loadedChunks.values()) {
            chunk.dirty = true;
            this.chunkBuildQueue.push(chunk);
        }
    }

    update() {
        // Rebuild ONLY the chunks that were directly modified by player interaction
        if (this.locallyModifiedChunks && this.locallyModifiedChunks.size > 0) {
            for (const chunk of this.locallyModifiedChunks) {
                if (chunk.dirty) {
                    chunk.rebuild();
                }
            }
            this.locallyModifiedChunks.clear();
        }
    }

    // Dynamic interaction: Dig or Build terrain
    modifyTerrain(worldPosition, radius, mode) {
        const localPos = worldPosition.clone().divideScalar(this.voxelScale);
        
        const vx = Math.round(localPos.x);
        const vy = Math.round(localPos.y);
        const vz = Math.round(localPos.z);

        const rVox = Math.ceil(radius / this.voxelScale);
        let modified = false;

        const xMin = Math.max(-600000, vx - rVox);
        const xMax = Math.min(600000, vx + rVox);
        const yMin = Math.max(this.minY + 1, vy - rVox); // Prevent digging below the ocean floor level
        const yMax = Math.min(this.maxY - 1, vy + rVox);
        const zMin = Math.max(-600000, vz - rVox);
        const zMax = Math.min(600000, vz + rVox);

        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                for (let z = zMin; z <= zMax; z++) {
                    const dx = x - localPos.x;
                    const dy = y - localPos.y;
                    const dz = z - localPos.z;
                    const dSq = dx*dx + dy*dy + dz*dz;
                    const dist = Math.sqrt(dSq);

                    if (dist < rVox) {
                        const val = this.getDensity(x, y, z);
                        let newVal = val;

                        if (mode === 'dig') {
                            const brushFalloff = (dist / rVox) - 1.0;
                            newVal = Math.min(val, brushFalloff);
                        } else if (mode === 'build') {
                            const brushFalloff = 1.0 - (dist / rVox);
                            newVal = Math.max(val, brushFalloff);
                        }

                        if (newVal !== val) {
                            this.setDensity(x, y, z, newVal);
                            modified = true;
                        }
                    }
                }
            }
        }
        return modified;
    }

    // Physics helper: sample density at raw world coordinate without Vector3 allocation
    isPointSolid(wx, wy, wz) {
        const lx = wx / this.voxelScale;
        const ly = wy / this.voxelScale;
        const lz = wz / this.voxelScale;
        
        const fx = Math.floor(lx);
        const fy = Math.floor(ly);
        const fz = Math.floor(lz);

        if (fy < this.minY || fy >= this.maxY - 1 || Math.abs(fx) > 600000 || Math.abs(fz) > 600000) {
            return wy <= this.minWorldY;
        }

        // Trilinearly interpolate density values to check if point is solid (density > 0)
        const d000 = this.getDensity(fx,     fy,     fz);
        const d100 = this.getDensity(fx + 1, fy,     fz);
        const d010 = this.getDensity(fx,     fy + 1, fz);
        const d110 = this.getDensity(fx + 1, fy + 1, fz);
        const d001 = this.getDensity(fx,     fy,     fz + 1);
        const d101 = this.getDensity(fx + 1, fy,     fz + 1);
        const d011 = this.getDensity(fx,     fy + 1, fz + 1);
        const d111 = this.getDensity(fx + 1, fy + 1, fz + 1);

        const tx = lx - fx;
        const ty = ly - fy;
        const tz = lz - fz;

        const d00 = d000 * (1 - tx) + d100 * tx;
        const d10 = d010 * (1 - tx) + d110 * tx;
        const d01 = d001 * (1 - tx) + d101 * tx;
        const d11 = d011 * (1 - tx) + d111 * tx;

        const d0 = d00 * (1 - ty) + d10 * ty;
        const d1 = d01 * (1 - ty) + d11 * ty;

        const density = d0 * (1 - tz) + d1 * tz;
        return density >= 0.0;
    }

    // Physics helper: sample density at any continuous Vector3 position
    isPositionSolid(worldPosition) {
        return this.isPointSolid(worldPosition.x, worldPosition.y, worldPosition.z);
    }

    // Cylinder / capsule collision tester: checks if a player-sized cylinder at (x, y, z) touches solid terrain
    isCylinderColliding(x, y, z, radius = 0.45, height = 1.8) {
        // Sample at 3 heights along the player's body: chest, waist, and lower torso (above step height)
        const yLevels = [y - 0.35, y - 0.75, y - 1.15];
        const r = radius;
        const rDiag = radius * 0.7071;

        for (let l = 0; l < 3; l++) {
            const py = yLevels[l];
            // Center
            if (this.isPointSolid(x, py, z)) return true;
            // 4 Cardinal perimeter points
            if (this.isPointSolid(x + r, py, z)) return true;
            if (this.isPointSolid(x - r, py, z)) return true;
            if (this.isPointSolid(x, py, z + r)) return true;
            if (this.isPointSolid(x, py, z - r)) return true;
            // 4 Diagonal perimeter points
            if (this.isPointSolid(x + rDiag, py, z + rDiag)) return true;
            if (this.isPointSolid(x - rDiag, py, z + rDiag)) return true;
            if (this.isPointSolid(x + rDiag, py, z - rDiag)) return true;
            if (this.isPointSolid(x - rDiag, py, z - rDiag)) return true;
        }
        return false;
    }

    // Walk height solver: returns the exact surface height Y under or at a world coordinate
    getSurfaceHeight(worldPosition, startHeight = 64) {
        const testPos = worldPosition.clone();
        testPos.y = startHeight;
        
        // CASE 1: startHeight is inside solid terrain!
        // The surface is ABOVE startHeight. Search upwards to find where solid transitions to air.
        if (this.isPositionSolid(testPos)) {
            const maxUpY = Math.min(this.maxWorldY, startHeight + 35.0);
            const upStep = 0.5;
            let lastSolidY = testPos.y;
            
            while (testPos.y < maxUpY) {
                testPos.y += upStep;
                if (!this.isPositionSolid(testPos)) {
                    // Found transition: solid below (lastSolidY) to air above (testPos.y)
                    let low = lastSolidY;
                    let high = testPos.y;
                    for (let b = 0; b < 8; b++) {
                        const mid = (low + high) * 0.5;
                        testPos.y = mid;
                        if (this.isPositionSolid(testPos)) {
                            low = mid;
                        } else {
                            high = mid;
                        }
                    }
                    return low;
                }
                lastSolidY = testPos.y;
            }
            return lastSolidY;
        }

        // CASE 2: startHeight is in air. Search downwards to find where air transitions to solid.
        const step = 1.0;
        let lastAirY = testPos.y;

        while (testPos.y > this.minWorldY) {
            testPos.y -= step;
            const isSolid = this.isPositionSolid(testPos);
            if (!isSolid) {
                lastAirY = testPos.y;
            } else {
                // Found transition from air above (lastAirY) to solid below (testPos.y)
                let low = testPos.y;
                let high = lastAirY;
                for (let b = 0; b < 8; b++) {
                    const mid = (low + high) * 0.5;
                    testPos.y = mid;
                    if (this.isPositionSolid(testPos)) {
                        low = mid;
                    } else {
                        high = mid;
                    }
                }
                return low;
            }
        }
        return this.minWorldY; // Ocean floor base Y (-393.0m)
    }

    // Ceiling height solver: returns the ceiling surface Y above world coordinate, or Infinity if open air
    getCeilingHeight(worldPosition, maxDistance = 3.0) {
        const testPos = worldPosition.clone();
        if (this.isPositionSolid(testPos)) {
            return Infinity; // Embedded in solid terrain, not an open ceiling above an air pocket
        }
        const maxY = testPos.y + maxDistance;
        const step = 0.25;
        let lastAirY = testPos.y;
        while (testPos.y < maxY) {
            testPos.y += step;
            if (this.isPositionSolid(testPos)) {
                // Binary search between lastAirY (air) and testPos.y (solid)
                let low = lastAirY;
                let high = testPos.y;
                for (let b = 0; b < 6; b++) {
                    const mid = (low + high) * 0.5;
                    testPos.y = mid;
                    if (this.isPositionSolid(testPos)) {
                        high = mid;
                    } else {
                        low = mid;
                    }
                }
                return high;
            }
            lastAirY = testPos.y;
        }
        return Infinity;
    }

    getEstimatedSurfaceHeight(vx, vz) {
        const distFromCenter = Math.sqrt(vx * vx + vz * vz);
        
        // 1. Atoll ring at 38 voxels
        const distFromAtoll = Math.abs(distFromCenter - 38.0);
        const atollWeightRaw = Math.max(0.0, 1.0 - distFromAtoll / 22.0);
        let atollWeight = atollWeightRaw;
        if (distFromCenter < 38.0) {
            atollWeight = Math.max(0.35, atollWeightRaw);
        }
        
        // 2. Volcano island at (0, 95)
        const dx = vx;
        let dz = vz - 95.0;
        if (dz < 0.0) dz = dz * 0.5;
        const distToVolcanoRaw = Math.sqrt(dx * dx + dz * dz);
        const shoreNoise = this.noise.noise2d(vx * 0.08, vz * 0.08) * 5.0;
        const distToVolcano = distToVolcanoRaw + shoreNoise;
        const volcanoWeight = Math.max(0.0, 1.0 - distToVolcano / 42.0);

        // 3. Great Rocky Archipelago
        const eastShoreNoise = (this.noise.noise2d(vx * 0.015, vz * 0.015) * 16.0) + (this.noise.noise2d(vx * 0.04, vz * 0.04) * 6.0);
        const dxA = (vx - 250.0) * 1.15;
        const dzA = (vz - 240.0) * 0.85;
        const distA = Math.sqrt(dxA * dxA + dzA * dzA) + eastShoreNoise;
        const weightA = Math.max(0.0, 1.0 - distA / 120.0);
        
        const dxB = (vx - 220.0) * 1.1;
        const dzB = (vz - 20.0) * 0.95;
        const distB = Math.sqrt(dxB * dxB + dzB * dzB) + eastShoreNoise;
        const weightB = Math.max(0.0, 1.0 - distB / 100.0);
        
        const dxC = (vx - 260.0) * 1.15;
        const dzC = (vz - (-220.0)) * 0.70;
        const distC = Math.sqrt(dxC * dxC + dzC * dzC) + eastShoreNoise;
        const weightC = Math.max(0.0, 1.0 - distC / 150.0);
        
        const eastIslandWeight = Math.max(weightA, weightB, weightC);
        const globalLand = this.getGlobalProceduralLand(vx, vz);
        const landWeight = Math.max(atollWeight, volcanoWeight, eastIslandWeight, globalLand.weight);
        
        const smoothWeightAbove = Math.pow(Math.max(0.0, Math.min(1.0, landWeight)), 1.2);
        const smoothWeightBelow = Math.pow(Math.max(0.0, Math.min(1.0, landWeight * 1.5)), 1.2);
        
        const n1 = this.noise.noise2d(vx * 0.03, vz * 0.03) * 3.5;
        const n2 = this.noise.noise2d(vx * 0.10, vz * 0.10) * 1.0;
        const baseHeightRaw = 4.0 + n1 + n2;
        
        let hillHeight = 0;
        if (distFromAtoll < 22.0) {
            const t = Math.max(0.0, 1.0 - distFromAtoll / 22.0);
            const atollPeakNoise = Math.max(-1.5, this.noise.noise2d(vx * 0.038, vz * 0.038) * 3.8);
            hillHeight = Math.max(hillHeight, (11.5 + atollPeakNoise) * Math.pow(t, 1.25));
        }
        if (distToVolcano < 42.0) {
            const t = Math.max(0.0, 1.0 - distToVolcano / 42.0);
            let vHill = 10.5 * Math.pow(t, 1.25);
            if (distToVolcano < 10.0) {
                const craterT = Math.max(0.0, 1.0 - Math.max(0.0, distToVolcano) / 10.0);
                vHill -= 4.5 * Math.pow(craterT, 1.5);
            }
            hillHeight = Math.max(hillHeight, vHill);
        }
        if (vx > 80.0 && eastIslandWeight > 0.0) {
            const t = Math.pow(Math.max(0.0, eastIslandWeight), 1.25);
            const ridge = Math.max(0.0, 1.0 - Math.abs(this.noise.noise2d(vx * 0.018, vz * 0.018)));
            const hillNoise = this.noise.noise2d(vx * 0.03, vz * 0.03) * 3.0;
            const eHill = Math.max(0.0, t * 14.0 + Math.pow(ridge, 1.5) * t * 8.5 + hillNoise);
            hillHeight = Math.max(hillHeight, eHill);
        }
        if (globalLand.hill > 0.0) {
            hillHeight = Math.max(hillHeight, globalLand.hill);
        }
        
        const yAbove = 32.0 + (baseHeightRaw + hillHeight) * smoothWeightAbove;
        if (yAbove >= 40.0) {
            return yAbove;
        }
        // Continuous shallow-to-deep bathymetry for smooth heightmap & turquoise lagoon rendering
        const yBelow = (baseHeightRaw + hillHeight) * smoothWeightBelow * 5.0;
        return Math.max(0.0, Math.min(39.95, yBelow));
    }
}

// ==========================================
// MARCHING CUBES LOOKUP TABLES
// ==========================================
// Standard Marching Cubes edge table
const edgeTable = new Int32Array([
    0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
    0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
    0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
    0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
    0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
    0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
    0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
    0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
    0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c,
    0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
    0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc,
    0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
    0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c,
    0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
    0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc,
    0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
    0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
    0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
    0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
    0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
    0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
    0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
    0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
    0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
    0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
    0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
    0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
    0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
    0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
    0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
    0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
    0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0
]);

// Standard Marching Cubes triangulation table
const triTable = new Int32Array([
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 8, 3, 9, 8, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    9, 2, 10, 0, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    2, 8, 3, 2, 10, 8, 10, 9, 8, -1, -1, -1, -1, -1, -1, -1,
    3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 11, 2, 8, 11, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1,
    3, 10, 1, 11, 10, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 10, 1, 0, 8, 10, 8, 11, 10, -1, -1, -1, -1, -1, -1, -1,
    3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1, -1, -1, -1,
    9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 3, 0, 7, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 1, 9, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 1, 9, 4, 7, 1, 7, 3, 1, -1, -1, -1, -1, -1, -1, -1,
    1, 2, 10, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    3, 4, 7, 3, 0, 4, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1,
    9, 2, 10, 9, 0, 2, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1,
    2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1, -1, -1, -1,
    8, 4, 7, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    11, 4, 7, 11, 2, 4, 2, 0, 4, -1, -1, -1, -1, -1, -1, -1,
    9, 0, 1, 8, 4, 7, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1,
    4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1, -1, -1, -1,
    3, 10, 1, 3, 11, 10, 7, 8, 4, -1, -1, -1, -1, -1, -1, -1,
    1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1, -1, -1, -1,
    4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1, -1, -1, -1,
    4, 7, 11, 4, 11, 9, 9, 11, 10, -1, -1, -1, -1, -1, -1, -1,
    9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    9, 5, 4, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 5, 4, 1, 5, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    8, 5, 4, 8, 3, 5, 3, 1, 5, -1, -1, -1, -1, -1, -1, -1,
    1, 2, 10, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    3, 0, 8, 1, 2, 10, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1,
    5, 2, 10, 5, 4, 2, 4, 0, 2, -1, -1, -1, -1, -1, -1, -1,
    2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1, -1, -1, -1,
    9, 5, 4, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 11, 2, 0, 8, 11, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1,
    0, 5, 4, 0, 1, 5, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1,
    2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1, -1, -1, -1,
    10, 3, 11, 10, 1, 3, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1,
    4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1, -1, -1, -1,
    5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1, -1, -1, -1,
    5, 4, 8, 5, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1,
    9, 7, 8, 5, 7, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    9, 3, 0, 9, 5, 3, 5, 7, 3, -1, -1, -1, -1, -1, -1, -1,
    0, 7, 8, 0, 1, 7, 1, 5, 7, -1, -1, -1, -1, -1, -1, -1,
    1, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    9, 7, 8, 9, 5, 7, 10, 1, 2, -1, -1, -1, -1, -1, -1, -1,
    10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1, -1, -1, -1,
    8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1, -1, -1, -1,
    2, 10, 5, 2, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1,
    7, 9, 5, 7, 8, 9, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1,
    9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1, -1, -1, -1,
    2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1, -1, -1, -1,
    11, 2, 1, 11, 1, 7, 7, 1, 5, -1, -1, -1, -1, -1, -1, -1,
    9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1, -1, -1, -1,
    5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1,
    11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1,
    11, 10, 5, 7, 11, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    9, 0, 1, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 8, 3, 1, 9, 8, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1,
    1, 6, 5, 2, 6, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 6, 5, 1, 2, 6, 3, 0, 8, -1, -1, -1, -1, -1, -1, -1,
    9, 6, 5, 9, 0, 6, 0, 2, 6, -1, -1, -1, -1, -1, -1, -1,
    5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1, -1, -1, -1,
    2, 3, 11, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    11, 0, 8, 11, 2, 0, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1,
    0, 1, 9, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1,
    5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1, -1, -1, -1,
    6, 3, 11, 6, 5, 3, 5, 1, 3, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1, -1, -1, -1,
    3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1, -1, -1, -1,
    6, 5, 9, 6, 9, 11, 11, 9, 8, -1, -1, -1, -1, -1, -1, -1,
    5, 10, 6, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 3, 0, 4, 7, 3, 6, 5, 10, -1, -1, -1, -1, -1, -1, -1,
    1, 9, 0, 5, 10, 6, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1,
    10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1, -1, -1, -1,
    6, 1, 2, 6, 5, 1, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1,
    1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1, -1, -1, -1,
    8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1, -1, -1, -1,
    7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1,
    3, 11, 2, 7, 8, 4, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1,
    5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1, -1, -1, -1,
    0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1,
    9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1,
    8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1, -1, -1, -1,
    5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1,
    0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1,
    6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1, -1, -1, -1,
    10, 4, 9, 6, 4, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 10, 6, 4, 9, 10, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1,
    10, 0, 1, 10, 6, 0, 6, 4, 0, -1, -1, -1, -1, -1, -1, -1,
    8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1, -1, -1, -1,
    1, 4, 9, 1, 2, 4, 2, 6, 4, -1, -1, -1, -1, -1, -1, -1,
    3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1, -1, -1, -1,
    0, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    8, 3, 2, 8, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1,
    10, 4, 9, 10, 6, 4, 11, 2, 3, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1, -1, -1, -1,
    3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1, -1, -1, -1,
    6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1,
    9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1, -1, -1, -1,
    8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1,
    3, 11, 6, 3, 6, 0, 0, 6, 4, -1, -1, -1, -1, -1, -1, -1,
    6, 4, 8, 11, 6, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    7, 10, 6, 7, 8, 10, 8, 9, 10, -1, -1, -1, -1, -1, -1, -1,
    0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1, -1, -1, -1,
    10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1, -1, -1, -1,
    10, 6, 7, 10, 7, 1, 1, 7, 3, -1, -1, -1, -1, -1, -1, -1,
    1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1, -1, -1, -1,
    2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1,
    7, 8, 0, 7, 0, 6, 6, 0, 2, -1, -1, -1, -1, -1, -1, -1,
    7, 3, 2, 6, 7, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1, -1, -1, -1,
    2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1,
    1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1,
    11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1, -1, -1, -1,
    8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1,
    0, 9, 1, 11, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1, -1, -1, -1,
    7, 11, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    3, 0, 8, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 1, 9, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    8, 1, 9, 8, 3, 1, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1,
    10, 1, 2, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 2, 10, 3, 0, 8, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1,
    2, 9, 0, 2, 10, 9, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1,
    6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1, -1, -1, -1,
    7, 2, 3, 6, 2, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    7, 0, 8, 7, 6, 0, 6, 2, 0, -1, -1, -1, -1, -1, -1, -1,
    2, 7, 6, 2, 3, 7, 0, 1, 9, -1, -1, -1, -1, -1, -1, -1,
    1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1, -1, -1, -1,
    10, 7, 6, 10, 1, 7, 1, 3, 7, -1, -1, -1, -1, -1, -1, -1,
    10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1, -1, -1, -1,
    0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1, -1, -1, -1,
    7, 6, 10, 7, 10, 8, 8, 10, 9, -1, -1, -1, -1, -1, -1, -1,
    6, 8, 4, 11, 8, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    3, 6, 11, 3, 0, 6, 0, 4, 6, -1, -1, -1, -1, -1, -1, -1,
    8, 6, 11, 8, 4, 6, 9, 0, 1, -1, -1, -1, -1, -1, -1, -1,
    9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1, -1, -1, -1,
    6, 8, 4, 6, 11, 8, 2, 10, 1, -1, -1, -1, -1, -1, -1, -1,
    1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1, -1, -1, -1,
    4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1, -1, -1, -1,
    10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1,
    8, 2, 3, 8, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1,
    0, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1, -1, -1, -1,
    1, 9, 4, 1, 4, 2, 2, 4, 6, -1, -1, -1, -1, -1, -1, -1,
    8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1, -1, -1, -1,
    10, 1, 0, 10, 0, 6, 6, 0, 4, -1, -1, -1, -1, -1, -1, -1,
    4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1,
    10, 9, 4, 6, 10, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 9, 5, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, 4, 9, 5, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1,
    5, 0, 1, 5, 4, 0, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1,
    11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1, -1, -1, -1,
    9, 5, 4, 10, 1, 2, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1,
    6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1, -1, -1, -1,
    7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1, -1, -1, -1,
    3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1,
    7, 2, 3, 7, 6, 2, 5, 4, 9, -1, -1, -1, -1, -1, -1, -1,
    9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1, -1, -1, -1,
    3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1, -1, -1, -1,
    6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1,
    9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1, -1, -1, -1,
    1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1,
    4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1,
    7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1, -1, -1, -1,
    6, 9, 5, 6, 11, 9, 11, 8, 9, -1, -1, -1, -1, -1, -1, -1,
    3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1, -1, -1, -1,
    0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1, -1, -1, -1,
    6, 11, 3, 6, 3, 5, 5, 3, 1, -1, -1, -1, -1, -1, -1, -1,
    1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1, -1, -1, -1,
    0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1,
    11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1,
    6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1, -1, -1, -1,
    5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1, -1, -1, -1,
    9, 5, 6, 9, 6, 0, 0, 6, 2, -1, -1, -1, -1, -1, -1, -1,
    1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1,
    1, 5, 6, 2, 1, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1,
    10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1, -1, -1, -1,
    0, 3, 8, 5, 6, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    10, 5, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    11, 5, 10, 7, 5, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    11, 5, 10, 11, 7, 5, 8, 3, 0, -1, -1, -1, -1, -1, -1, -1,
    5, 11, 7, 5, 10, 11, 1, 9, 0, -1, -1, -1, -1, -1, -1, -1,
    10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1, -1, -1, -1,
    11, 1, 2, 11, 7, 1, 7, 5, 1, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1, -1, -1, -1,
    9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1, -1, -1, -1,
    7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1,
    2, 5, 10, 2, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1,
    8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1, -1, -1, -1,
    9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1, -1, -1, -1,
    9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1,
    1, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 7, 0, 7, 1, 1, 7, 5, -1, -1, -1, -1, -1, -1, -1,
    9, 0, 3, 9, 3, 5, 5, 3, 7, -1, -1, -1, -1, -1, -1, -1,
    9, 8, 7, 5, 9, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    5, 8, 4, 5, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1,
    5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1, -1, -1, -1,
    0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1, -1, -1, -1,
    10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1,
    2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1, -1, -1, -1,
    0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1,
    0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1,
    9, 4, 5, 2, 11, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1, -1, -1, -1,
    5, 10, 2, 5, 2, 4, 4, 2, 0, -1, -1, -1, -1, -1, -1, -1,
    3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1,
    5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1, -1, -1, -1,
    8, 4, 5, 8, 5, 3, 3, 5, 1, -1, -1, -1, -1, -1, -1, -1,
    0, 4, 5, 1, 0, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1, -1, -1, -1,
    9, 4, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 11, 7, 4, 9, 11, 9, 10, 11, -1, -1, -1, -1, -1, -1, -1,
    0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1, -1, -1, -1,
    1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1, -1, -1, -1,
    3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4, -1,
    4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2, -1, -1, -1, -1,
    9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1,
    11, 7, 4, 11, 4, 2, 2, 4, 0, -1, -1, -1, -1, -1, -1, -1,
    11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4, -1, -1, -1, -1,
    2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1, -1, -1, -1,
    9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7, -1,
    3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1,
    1, 10, 2, 8, 7, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 9, 1, 4, 1, 7, 7, 1, 3, -1, -1, -1, -1, -1, -1, -1,
    4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1, -1, -1, -1,
    4, 0, 3, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    4, 8, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    9, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    3, 0, 9, 3, 9, 11, 11, 9, 10, -1, -1, -1, -1, -1, -1, -1,
    0, 1, 10, 0, 10, 8, 8, 10, 11, -1, -1, -1, -1, -1, -1, -1,
    3, 1, 10, 11, 3, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 2, 11, 1, 11, 9, 9, 11, 8, -1, -1, -1, -1, -1, -1, -1,
    3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9, -1, -1, -1, -1,
    0, 2, 11, 8, 0, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    3, 2, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    2, 3, 8, 2, 8, 10, 10, 8, 9, -1, -1, -1, -1, -1, -1, -1,
    9, 10, 2, 0, 9, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1, -1, -1, -1,
    1, 10, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    1, 3, 8, 9, 1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 9, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    0, 3, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1
]);
