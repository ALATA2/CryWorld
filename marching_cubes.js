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

    // 9. TROPICAL LAGOON & ATOLL (Cleito & Tropical Islands — lush verdant green up to the summit!)
    const sand = _sandColor;
    const vegetation = _grassColor;
    const rock = _rockColor;

    if (slope < 0.38) {
        target.copy(rock);
    } else if (worldY < 124.5) {
        target.copy(sand);
    } else if (worldY < 128.0) {
        const t = (worldY - 124.5) / 3.5;
        target.lerpColors(sand, vegetation, t);
    } else if (worldY < 208.0) {
        target.copy(vegetation);
    } else if (worldY < 222.0) {
        const t = (worldY - 208.0) / 14.0;
        target.lerpColors(vegetation, rock, t);
    } else {
        target.copy(rock);
    }

    if (slope < 0.54) {
        const t = Math.min(1.0, (0.54 - slope) / 0.18);
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
        this.inScene = false;
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

        // Load data into BufferGeometry attributes (only attach non-empty chunks to scene graph for 3x faster culling & raycasting!)
        if (positions.length > 0) {
            this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            this.geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            this.geometry.computeBoundingSphere();
            this.geometry.computeBoundingBox();
            this.mesh.visible = true;
            if (!this.inScene) {
                this.terrain.group.add(this.mesh);
                this.inScene = true;
            }
        } else {
            // Empty chunk: keep out of scene graph so shadow map & raycaster skip it completely
            this.geometry.deleteAttribute('position');
            this.geometry.deleteAttribute('normal');
            this.geometry.deleteAttribute('color');
            this.mesh.visible = false;
            if (this.inScene) {
                this.terrain.group.remove(this.mesh);
                this.inScene = false;
            }
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
        // Continental mountain summits reach up to world Y = 288.0m (voxel y = 96).
        this.minY = -131;
        this.maxY = Math.max(96, height);
        this.minWorldY = this.minY * this.voxelScale; // -393.0m
        this.maxWorldY = this.maxY * this.voxelScale; // 288.0m
        this.minChunkY = Math.floor(this.minY / this.chunkSize); // -9
        this.maxChunkY = Math.ceil(this.maxY / this.chunkSize);  // 6
        this.chunksY = this.maxChunkY - this.minChunkY;

        // Planetary Earth-like Generation Variables (Fully Configurable — Lunar-Scale Globe R = 1800 km)
        this.atlantisCenter   = { x: -10800.0, z: -10600.0 }; // Center of the North Atlantic Ocean
        this.tigrisSpawn      = { x:  14200.0, z: -13800.0 }; // Headwaters of the Tigris & Euphrates (Armenian Highland / Mount Ararat)
        this.borgosesiaCenter = { x:   2950.0, z: -15300.0 }; // Borgosesia — Valsesia, Sesia River & Monte Rosa (Piemonte, Italy)
        this.planetaryConfig = {
            planetRadiusKm: 1800,           // Planet radius in kilometers (Lunar scale!)
            equatorZ: 0,                    // Z-coordinate of Equator
            poleDistanceMeters: 32000,      // Distance from Equator to Polar Ice Caps (meters)
            worldWidthMeters: 128000,       // Full 360° West-to-East Earth continental span (-64km .. +64km)
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
                uniform vec3 uCameraPos;
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

                float mcBumpNoise(vec3 p) {
                    return 0.65 * mcNoise3(p) + 0.35 * mcNoise3(p * 2.35 + 7.1);
                }
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                 float wy = vMCWorldPos.y;
                 float slope = clamp(vMCTerrainNormal.y, 0.0, 1.0);

                 // Wrap coordinates modulo 4096m so 32-bit float noise stays sub-millimeter sharp across the entire planet!
                 vec3 mcPosW = mod(vMCWorldPos, 4096.0);

                 // Multi-scale 3D procedural noise for fractured coastal rock, dappled jungle turf & coral sand
                 float nMacro = mcFbm3(mcPosW * 0.038);
                 float nMed   = mcFbm3(mcPosW * 0.19);
                 float nFine  = mcNoise3(mcPosW * 1.15);
                 float nMicro = mcNoise3(mcPosW * 5.2);

                 // 1. Natural Warm Coastal Cliffs (ONLY on genuinely steep >57 deg bluffs — zero grey/black blotches on hills!)
                 float ridgeFrac1 = 1.0 - abs(mcNoise3(mcPosW * vec3(0.11, 0.15, 0.11)) * 2.0 - 1.0);
                 float ridgeFrac2 = 1.0 - abs(mcNoise3(mcPosW * 0.45 + 3.7) * 2.0 - 1.0);
                 float rockCrevice = smoothstep(0.25, 0.78, ridgeFrac1 * 0.62 + ridgeFrac2 * 0.38);

                 // Strictly expose coastal rock ONLY on near-vertical cliff walls (slope < 0.54, i.e. > 57 degrees)
                 float rockMask = smoothstep(0.54, 0.30, slope);

                 vec3 darkCreviceRock = vec3(0.145, 0.138, 0.125); // Soft warm limestone shadow (never black spots!)
                 vec3 weatheredRock   = vec3(0.275, 0.252, 0.218); // Warm coastal sandstone/limestone body
                 vec3 sunlitOchreRock = vec3(0.425, 0.380, 0.305); // Sun-kissed golden-ochre rock highlight
                 vec3 rockCol = mix(darkCreviceRock, weatheredRock, smoothstep(0.18, 0.62, rockCrevice));
                 rockCol = mix(rockCol, sunlitOchreRock, smoothstep(0.52, 0.90, rockCrevice * 0.72 + nMed * 0.35) * 0.68 + nMicro * 0.10);

                 // Lush creeping emerald moss & tropical vines clinging to cliff ledges
                 float ledgeMoss = smoothstep(0.34, 0.58, slope) * smoothstep(0.36, 0.70, nMacro * 0.65 + nMed * 0.35) * smoothstep(121.5, 126.5, wy);
                 rockCol = mix(rockCol, vec3(0.045, 0.205, 0.032), ledgeMoss * 0.78);

                 // 2. Vibrant, Sun-Drenched Tropical Canopy Turf, Emerald Hills & Sunlit Clearings (Linear RGB)
                 vec3 deepJungleShadow = vec3(0.028, 0.160, 0.026);
                 vec3 emeraldTurf      = vec3(0.068, 0.290, 0.038);
                 vec3 warmSunlitGrass  = vec3(0.175, 0.390, 0.055);
                 vec3 vegCol = mix(deepJungleShadow, emeraldTurf, smoothstep(0.22, 0.68, nMacro));
                 vegCol = mix(vegCol, warmSunlitGrass, smoothstep(0.42, 0.80, nMed) * 0.65);
                 vegCol *= (0.88 + 0.24 * nFine);

                 // 3. Luminous Ivory-Gold Coral Beach Sand with Wet Glossy Swash Band
                 vec3 ivorySand = vec3(0.90, 0.76, 0.49);
                 vec3 goldenSand = vec3(0.70, 0.53, 0.28);
                 vec3 drySand = mix(ivorySand, goldenSand, nMed * 0.55 + nMicro * 0.25);
                 float wetZone = smoothstep(121.25, 119.95, wy);
                 vec3 sandCol = mix(drySand, drySand * vec3(0.48, 0.45, 0.40), wetZone);

                 float rAtlantis   = length(vMCWorldPos.xz - vec2(-10800.0, -10600.0));
                 float rTigris     = length(vMCWorldPos.xz - vec2(14200.0, -13800.0));
                 float rBorgosesia = length(vMCWorldPos.xz - vec2(2950.0, -15300.0));

                 // 4. Continuous Seamless Shading from Coral Reef (< 120m) -> Soft Dune Scrub -> Lush Green Hills (ZERO sharp line!)
                 if (wy < 120.0) {
                     float waterDepth = 120.0 - wy;
                     float coralPatch = smoothstep(0.40, 0.65, mcFbm3(mcPosW * 0.09) * 0.7 + nMed * 0.3);
                     vec3 wetShoreSand = drySand * vec3(0.55, 0.62, 0.58);
                     vec3 lagoonSand   = vec3(0.10, 0.64, 0.62) * (0.90 + 0.20 * nFine);
                     vec3 sandByDepth  = mix(wetShoreSand, lagoonSand, clamp(waterDepth / 3.2, 0.0, 1.0));
                     vec3 coralCol     = mix(vec3(0.012, 0.065, 0.085), vec3(0.038, 0.13, 0.10), nMed);
                     float coralDepthMask = smoothstep(0.55, 2.2, waterDepth);
                     vec3 shallowBed   = mix(sandByDepth, coralCol, coralPatch * 0.86 * coralDepthMask);
                     float deepFade    = clamp(waterDepth / 19.0, 0.0, 1.0);
                     diffuseColor.rgb  = mix(shallowBed, diffuseColor.rgb * (0.75 + 0.35 * nMed), deepFade);
                 } else {
                     // Wide, domain-warped organic transition (121.2m .. 128.8m) with pioneer grass tufts & sandy hollows!
                     float duneWarp = (nMacro - 0.5) * 5.8 + (nMed - 0.5) * 3.0 + (nFine - 0.5) * 1.4;
                     float gentleCoveBoost = smoothstep(0.75, 0.96, slope) * 1.8;
                     float effCoastalY = wy + duneWarp - gentleCoveBoost;

                     // Stage A: Dry beach sand -> dappled pioneer coastal scrub / emerald dune grass tufts
                     float scrubBlend = smoothstep(121.2, 125.4, effCoastalY);
                     float tuftPatches = smoothstep(0.40, 0.66, nMed * 0.62 + nFine * 0.38) * smoothstep(120.8, 123.5, wy);
                     vec3 duneScrubCol = mix(vec3(0.22, 0.29, 0.075), vegCol, 0.68);
                     vec3 sandToScrub  = mix(sandCol, duneScrubCol, clamp(scrubBlend * 0.78 + tuftPatches * 0.55, 0.0, 1.0));

                     // Stage B: Pioneer dune scrub -> full lush emerald tropical/fertile canopy turf across Cleito, Mesopotamia & Borgosesia!
                     float fullVegBlend = smoothstep(123.2, 128.2, effCoastalY);
                     float inCleito = 1.0 - smoothstep(4600.0, 5200.0, rAtlantis);
                     float inMesopotamia = (1.0 - smoothstep(3800.0, 4800.0, rTigris)) * (1.0 - smoothstep(178.0, 198.0, wy));
                     float inBorgosesia = (1.0 - smoothstep(2600.0, 3300.0, rBorgosesia)) * (1.0 - smoothstep(178.0, 198.0, wy));
                     float isTropicalOrForest = smoothstep(0.04, 0.24, diffuseColor.g - diffuseColor.r * 0.65);
                     float coastalTropical = max(max(inCleito, max(inMesopotamia, inBorgosesia)), max(isTropicalOrForest, 1.0 - smoothstep(127.0, 136.0, wy)));
                     vec3 inlandSurface = mix(diffuseColor.rgb * (0.85 + 0.30 * nMed), vegCol, coastalTropical * 0.96);

                     vec3 organicGround = mix(sandToScrub, inlandSurface, fullVegBlend);
                     diffuseColor.rgb = mix(organicGround, rockCol, rockMask);
                 }

                 // Subtle mystical sea-mist veil along the outer boundary ring of 4x Cleito (r = 2400m .. 2880m)
                 float mistBand = smoothstep(2400.0, 2530.0, rAtlantis) * (1.0 - smoothstep(2740.0, 2880.0, rAtlantis));
                 if (mistBand > 0.001 && wy > 119.5) {
                     float mistHeightFade = 1.0 - smoothstep(165.0, 240.0, wy);
                     diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.76, 0.89, 0.96), mistBand * mistHeightFade * 0.72);
                 }`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                `#include <normal_fragment_maps>
                 // Distance-gated 3D Chiseled Micro-Normal Relief (crisp foreground rocks & sand ripples + 3x faster distant GPU!)
                 float camDistMC = length(vMCWorldPos - uCameraPos);
                 float bumpLod = 1.0 - smoothstep(48.0, 155.0, camDistMC);
                 if (bumpLod > 0.01) {
                     vec3 bumpPos = mod(vMCWorldPos, 4096.0) * mix(1.05, 0.52, rockMask);
                     float eps = 0.11;
                     float h0 = mcBumpNoise(bumpPos);
                     float hx = mcBumpNoise(bumpPos + vec3(eps, 0.0, 0.0)) - h0;
                     float hy = mcBumpNoise(bumpPos + vec3(0.0, eps, 0.0)) - h0;
                     float hz = mcBumpNoise(bumpPos + vec3(0.0, 0.0, eps)) - h0;
                     float bumpStrength = mix(0.12, 0.52, rockMask) * smoothstep(119.5, 121.2, wy) * bumpLod;
                     normal = normalize(normal - vec3(hx, hy, hz) * (bumpStrength / eps));
                 }`
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
        this.modifiedChunkSet = new Set();
        this.locallyModifiedChunks = new Set();
        this.columnBoundsCache = new Map();
        
        // Group to hold all chunk meshes
        this.group = new THREE.Group();
        this.group.position.set(0, 0, 0);
        this.scene.add(this.group);

        // Map of currently loaded VoxelChunk objects: key is "cx,cy,cz"
        this.loadedChunks = new Map();

        // Queue for progressive chunk building
        this.chunkBuildQueue = [];

        this.noise = new PerlinNoise();
        this.initEarthMapGrid();
    }

    // =========================================================
    // FAST O(1) PRECOMPUTED EARTH ALTIMETRY & BATHYMETRY RASTER
    // Precomputes a 1024x512 Float32Array (4 MB) in < 8 ms at startup
    // so runtime continental queries take < 5 nanoseconds (4 array reads)!
    // =========================================================
    initEarthMapGrid() {
        const W = 1024;
        const H = 512;
        this.earthGridW = W;
        this.earthGridH = H;
        this.earthWeightGrid = new Float32Array(W * H);
        this.earthHillGrid = new Float32Array(W * H);

        // Smooth Gaussian / Elliptical blob helper in normalized map coords (nx in [-1, 1], nz in [-1, 1])
        const evalBlob = (nx, nz, cx, cz, rx, rz, rotRad = 0.0) => {
            const dx = nx - cx;
            const dz = nz - cz;
            let ux = dx;
            let uz = dz;
            if (rotRad !== 0.0) {
                const c = Math.cos(rotRad);
                const s = Math.sin(rotRad);
                ux = dx * c - dz * s;
                uz = dx * s + dz * c;
            }
            const q = (ux * ux) / (rx * rx) + (uz * uz) / (rz * rz);
            if (q >= 1.0) return 0.0;
            const t = 1.0 - q;
            return t * t * (3.0 - 2.0 * t);
        };

        // Continent definitions in normalized planetary coordinates:
        // nx = worldX / 64000 (-1.0 = -64km West, 0.0 = Prime Meridian, +1.0 = +64km East)
        // nz = worldZ / 32000 (-1.0 = North Pole, 0.0 = Equator, +1.0 = South Pole)
        // Note: Atlantic Ocean is centered around nx = -0.17 (worldX = -10,800m, worldZ = -10,600m -> Cleito / Atlantis!)
        //       Tigris & Euphrates Headwaters are at nx = +0.222, nz = -0.431 (worldX = +14,200m, worldZ = -13,800m!)
        const landmassBlobs = [
            // NORTH AMERICA
            { cx: -0.62, cz: -0.52, rx: 0.24, rz: 0.25, rot:  0.22, w: 1.00, h: 10.5 },
            { cx: -0.50, cz: -0.34, rx: 0.13, rz: 0.14, rot:  0.40, w: 0.95, h:  8.5 },
            { cx: -0.44, cz: -0.22, rx: 0.07, rz: 0.10, rot:  0.55, w: 0.90, h:  7.5 }, // Central America
            { cx: -0.34, cz: -0.76, rx: 0.12, rz: 0.14, rot: -0.18, w: 1.00, h: 16.0 }, // Greenland
            // SOUTH AMERICA
            { cx: -0.36, cz:  0.12, rx: 0.14, rz: 0.22, rot:  0.15, w: 1.00, h:  9.5 },
            { cx: -0.38, cz:  0.38, rx: 0.09, rz: 0.24, rot: -0.12, w: 0.98, h: 10.0 },
            // EUROPE & SCANDINAVIA & IBERIA
            { cx: -0.02, cz: -0.45, rx: 0.06, rz: 0.06, rot:  0.05, w: 0.98, h:  9.5 }, // Iberia (North of Gibraltar)
            { cx:  0.07, cz: -0.54, rx: 0.14, rz: 0.11, rot: -0.08, w: 1.00, h:  9.0 }, // Western & Central Europe
            { cx:  0.05, cz: -0.44, rx: 0.03, rz: 0.06, rot:  0.35, w: 0.96, h:  9.5 }, // Italy Peninsula
            { cx:  0.11, cz: -0.44, rx: 0.04, rz: 0.05, rot:  0.10, w: 0.96, h: 10.5 }, // Greece & Balkans
            { cx:  0.09, cz: -0.68, rx: 0.11, rz: 0.10, rot:  0.25, w: 0.98, h: 12.5 }, // Scandinavia
            { cx:  0.22, cz: -0.58, rx: 0.18, rz: 0.14, rot:  0.00, w: 1.00, h:  8.5 }, // Eastern Europe / Russia
            // AFRICA (North Africa / Sahara / East & South Africa / Madagascar)
            { cx:  0.04, cz: -0.26, rx: 0.14, rz: 0.14, rot:  0.04, w: 1.00, h:  9.5 }, // Sahara & Atlas (South of Gibraltar)
            { cx:  0.12, cz: -0.04, rx: 0.12, rz: 0.18, rot: -0.05, w: 1.00, h:  9.0 }, // Central Africa
            { cx:  0.14, cz:  0.22, rx: 0.09, rz: 0.18, rot:  0.08, w: 0.98, h: 10.5 }, // Southern Africa
            { cx:  0.25, cz:  0.24, rx: 0.03, rz: 0.07, rot:  0.20, w: 0.92, h:  9.5 }, // Madagascar
            // ANATOLIA, ARMENIAN HIGHLAND, MESOPOTAMIA & ARABIA
            { cx:  0.19, cz: -0.44, rx: 0.07, rz: 0.05, rot:  0.02, w: 1.00, h: 12.5 }, // Anatolia & Taurus
            { cx:  0.23, cz: -0.43, rx: 0.08, rz: 0.07, rot: -0.10, w: 1.00, h: 13.0 }, // Armenian Highland & Mesopotamia
            { cx:  0.23, cz: -0.28, rx: 0.08, rz: 0.11, rot:  0.22, w: 0.98, h:  9.5 }, // Arabian Peninsula
            // ASIA, SIBERIA, INDIA, INDOCHINA & JAPAN
            { cx:  0.48, cz: -0.54, rx: 0.28, rz: 0.18, rot:  0.04, w: 1.00, h: 10.0 }, // Siberia & Central Asia
            { cx:  0.46, cz: -0.36, rx: 0.22, rz: 0.16, rot: -0.06, w: 1.00, h: 13.5 }, // Tibet & East Asia
            { cx:  0.39, cz: -0.20, rx: 0.08, rz: 0.13, rot:  0.05, w: 0.98, h:  9.5 }, // India Subcontinent
            { cx:  0.54, cz: -0.18, rx: 0.09, rz: 0.12, rot:  0.28, w: 0.95, h:  9.0 }, // Indochina
            { cx:  0.71, cz: -0.42, rx: 0.04, rz: 0.09, rot:  0.35, w: 0.92, h: 11.5 }, // Japan Archipelago
            // INDONESIA & AUSTRALIA & NEW ZEALAND
            { cx:  0.58, cz:  0.02, rx: 0.14, rz: 0.06, rot:  0.12, w: 0.88, h:  8.5 }, // Maritime SE Asia
            { cx:  0.64, cz:  0.28, rx: 0.14, rz: 0.12, rot: -0.08, w: 1.00, h:  9.0 }, // Australia
            { cx:  0.82, cz:  0.46, rx: 0.04, rz: 0.07, rot:  0.40, w: 0.92, h: 12.0 }, // New Zealand
            // ANTARCTICA
            { cx:  0.00, cz:  0.90, rx: 0.95, rz: 0.16, rot:  0.00, w: 1.00, h: 18.5 }  // Antarctic Ice Continent
        ];

        // Major Earth Mountain Chains (smooth, broad, realistic domes — never spiky)
        const mountainBlobs = [
            { cx: -0.66, cz: -0.48, rx: 0.07, rz: 0.22, rot:  0.25, h: 16.0 }, // Rocky Mountains
            { cx: -0.41, cz:  0.22, rx: 0.04, rz: 0.32, rot:  0.06, h: 19.0 }, // Andes Cordillera
            { cx: -0.01, cz: -0.35, rx: 0.06, rz: 0.03, rot: -0.15, h: 12.0 }, // Atlas Mountains
            { cx:  0.05, cz: -0.49, rx: 0.06, rz: 0.03, rot: -0.10, h: 16.5 }, // European Alps
            { cx:  0.22, cz: -0.45, rx: 0.06, rz: 0.04, rot:  0.12, h: 15.0 }, // Taurus, Caucasus & Ararat Massif
            { cx:  0.26, cz: -0.37, rx: 0.05, rz: 0.06, rot:  0.35, h: 13.5 }, // Zagros Mountains
            { cx:  0.43, cz: -0.33, rx: 0.12, rz: 0.06, rot: -0.12, h: 24.0 }, // Himalayas & Tibetan Plateau
            { cx:  0.16, cz:  0.04, rx: 0.04, rz: 0.12, rot:  0.05, h: 13.0 }  // East African Rift Highlands
        ];

        // Sea & Strait Carves (guarantees navigable Straits of Gibraltar, Mediterranean, Black Sea, Red Sea, Persian Gulf)
        const seaCarves = [
            // Strait of Gibraltar / Pillars of Heracles (worldX = -2100m, worldZ = -12750m -> nx = -0.033, nz = -0.398)
            { cx: -0.033, cz: -0.398, rx: 0.035, rz: 0.022, rot: 0.0, c: 1.0 },
            // Western & Central Mediterranean Basin
            { cx:  0.025, cz: -0.400, rx: 0.065, rz: 0.038, rot: 0.05, c: 1.0 },
            // Eastern Mediterranean Basin (Levant / Cyprus / Crete)
            { cx:  0.115, cz: -0.392, rx: 0.068, rz: 0.040, rot: -0.04, c: 1.0 },
            // Black Sea (North of Anatolia)
            { cx:  0.195, cz: -0.495, rx: 0.052, rz: 0.028, rot: 0.02, c: 1.0 },
            // Red Sea (between Egypt and Arabia)
            { cx:  0.182, cz: -0.255, rx: 0.022, rz: 0.085, rot: 0.26, c: 1.0 },
            // Persian Gulf (Southeast of Mesopotamia, nx = 0.255, nz = -0.320)
            { cx:  0.258, cz: -0.318, rx: 0.036, rz: 0.038, rot: 0.32, c: 1.0 },
            // Mid-Atlantic Ocean Basin (keeps Cleito/Atlantis & Surrounding Islands in pure open Atlantic Ocean!)
            { cx: -0.169, cz: -0.331, rx: 0.115, rz: 0.135, rot: 0.0, c: 1.0 }
        ];

        for (let iz = 0; iz < H; iz++) {
            const nz = (iz / (H - 1)) * 2.0 - 1.0; // -1.0 (North Pole) .. +1.0 (South Pole)
            const worldZ = nz * 32000.0;
            const lat = Math.abs(nz);

            for (let ix = 0; ix < W; ix++) {
                const nx = (ix / W) * 2.0 - 1.0; // -1.0 .. +1.0 (360° West-East)
                const worldX = nx * 64000.0;

                // Fractal coastline perturbation (periodic/smooth)
                const coastN1 = this.noise.noise2d(worldX * 0.00018, worldZ * 0.00018) * 0.028;
                const coastN2 = this.noise.noise2d(worldX * 0.00055, worldZ * 0.00055) * 0.010;
                const qx = nx + coastN1 + coastN2;
                const qz = nz + coastN1 * 0.8 - coastN2;

                let rawLand = 0.0;
                let baseHill = 0.0;

                for (let b = 0; b < landmassBlobs.length; b++) {
                    const lb = landmassBlobs[b];
                    const w = evalBlob(qx, qz, lb.cx, lb.cz, lb.rx, lb.rz, lb.rot);
                    if (w > 0.0) {
                        const contribW = w * lb.w;
                        if (contribW > rawLand) rawLand = contribW;
                        baseHill = Math.max(baseHill, w * lb.h);
                    }
                }

                // Carve seas & straits
                let seaCarve = 0.0;
                for (let s = 0; s < seaCarves.length; s++) {
                    const sc = seaCarves[s];
                    const cw = evalBlob(nx + coastN2 * 0.4, nz + coastN2 * 0.4, sc.cx, sc.cz, sc.rx, sc.rz, sc.rot);
                    if (cw * sc.c > seaCarve) seaCarve = cw * sc.c;
                }
                rawLand *= (1.0 - seaCarve);

                // Carve Major World Rivers (Nile River & Amazon River)
                // Nile River flowing south-to-north along nx ≈ 0.148, nz ∈ [-0.36, -0.05]
                if (nz > -0.37 && nz < -0.04 && Math.abs(nx - 0.148) < 0.018) {
                    const nileMeander = Math.sin(nz * 45.0) * 0.0035;
                    const dNile = Math.abs((nx - 0.148) - nileMeander);
                    if (dNile < 0.009) {
                        const nCarve = 0.5 + 0.5 * Math.cos((dNile / 0.009) * Math.PI);
                        rawLand *= (1.0 - 0.55 * nCarve);
                        baseHill *= (1.0 - 0.75 * nCarve);
                    }
                }

                let weight = 0.0;
                let hill = 0.0;

                if (rawLand > 0.12) {
                    const shoreT = Math.min(1.0, (rawLand - 0.12) / 0.18);
                    const smoothShore = shoreT * shoreT * (3.0 - 2.0 * shoreT);
                    weight = Math.min(1.0, smoothShore * 1.15);

                    const roll = (0.5 + 0.5 * this.noise.noise2d(worldX * 0.0008, worldZ * 0.0008)) * 3.5;
                    hill = 4.2 * smoothShore + (baseHill + roll) * Math.pow(smoothShore, 1.35);

                    // Add smooth continental mountain chains
                    for (let m = 0; m < mountainBlobs.length; m++) {
                        const mb = mountainBlobs[m];
                        const mw = evalBlob(qx, qz, mb.cx, mb.cz, mb.rx, mb.rz, mb.rot);
                        if (mw > 0.0) {
                            const ridgeMod = 0.72 + 0.28 * this.noise.noise2d(worldX * 0.0012, worldZ * 0.0012);
                            hill += mw * mb.h * ridgeMod * smoothShore;
                        }
                    }

                    // Polar ice sheet dome
                    if (lat > 0.76) {
                        const polarT = Math.min(1.0, (lat - 0.76) / 0.24);
                        hill += polarT * polarT * 14.0 * smoothShore;
                    }
                }

                const idx = iz * W + ix;
                this.earthWeightGrid[idx] = weight;
                this.earthHillGrid[idx] = hill;
            }
        }
    }

    // Fast O(1) bilinear lookup into the precomputed Earth grid
    sampleEarthGrid(worldX, worldZ) {
        if (!this.earthWeightGrid) {
            return { weight: 0.0, hill: 0.0 };
        }
        const W = this.earthGridW;
        const H = this.earthGridH;

        // Wrap worldX periodically every 128,000m [-64000, +64000]
        let u = ((worldX + 64000.0) / 128000.0) % 1.0;
        if (u < 0.0) u += 1.0;
        // Clamp worldZ between North Pole (-32000m) and South Pole (+32000m)
        const v = Math.max(0.0, Math.min(1.0, (worldZ + 32000.0) / 64000.0));

        const fx = u * W;
        const fz = v * (H - 1);
        const x0 = Math.floor(fx) % W;
        const x1 = (x0 + 1) % W;
        const z0 = Math.min(H - 2, Math.max(0, Math.floor(fz)));
        const z1 = z0 + 1;

        const tx = fx - Math.floor(fx);
        const tz = fz - z0;

        const i00 = z0 * W + x0;
        const i10 = z0 * W + x1;
        const i01 = z1 * W + x0;
        const i11 = z1 * W + x1;

        const w0 = this.earthWeightGrid[i00] * (1.0 - tx) + this.earthWeightGrid[i10] * tx;
        const w1 = this.earthWeightGrid[i01] * (1.0 - tx) + this.earthWeightGrid[i11] * tx;
        const h0 = this.earthHillGrid[i00] * (1.0 - tx) + this.earthHillGrid[i10] * tx;
        const h1 = this.earthHillGrid[i01] * (1.0 - tx) + this.earthHillGrid[i11] * tx;

        return {
            weight: w0 * (1.0 - tz) + w1 * tz,
            hill: h0 * (1.0 - tz) + h1 * tz
        };
    }

    // =========================================================
    // SORGENTI DEL TIGRI E DELL'EUFRATE, MONTE ARARAT & MESOPOTAMIA
    // High-resolution analytical terrain sculpting around (worldX = 14200, worldZ = -13800)
    // =========================================================
    getTigrisEuphratesRegion(x, z) {
        const tigrisVX = 4733.333333; // 14200.0m / 3.0
        const tigrisVZ = -4600.0;     // -13800.0m / 3.0
        const tx = x - tigrisVX;
        const tz = z - tigrisVZ;

        // Fast bounding-box exit so this costs 0 CPU outside Mesopotamia
        if (Math.abs(tx) > 1350.0 || tz < -750.0 || tz > 1450.0) {
            return { weight: 0.0, hill: 0.0, carve: 0.0 };
        }

        const roll1 = 0.5 + 0.5 * this.noise.noise2d(x * 0.0068 + 1.9, z * 0.0068 - 3.4);
        const roll2 = 0.5 + 0.5 * this.noise.noise2d(x * 0.015 - 4.2, z * 0.015 + 2.7);
        const gentleRoll = roll1 * 0.75 + roll2 * 0.25;

        // 1. Broad Fertile Crescent & Armenian Highland foundation
        const regionDist = Math.sqrt((tx * 0.85) * (tx * 0.85) + ((tz - 180.0) * 0.65) * ((tz - 180.0) * 0.65));
        const regionFade = 1.0 - Math.min(1.0, Math.max(0.0, (regionDist - 580.0) / 260.0));
        if (regionFade <= 0.0) {
            return { weight: 0.0, hill: 0.0, carve: 0.0 };
        }

        const sRegion = regionFade * regionFade * (3.0 - 2.0 * regionFade);
        let weight = 0.96 * sRegion;
        // Gentle green alluvial plain in Mesopotamia (Y ≈ 127m..135m) rising smoothly northward to the headwater terrace (Y ≈ 137m)
        const northRise = Math.max(0.0, Math.min(1.0, (260.0 - tz) / 420.0));
        const sNorth = northRise * northRise * (3.0 - 2.0 * northRise);
        let hill = (6.2 + gentleRoll * 2.4 + sNorth * 3.2) * sRegion;

        // Helper for broad, realistic cosine-bell mountains (gentle 7°-13° slopes, zero pointy peaks!)
        const addMountainMassif = (mx, mz, radX, radZ, peakH) => {
            const dx = (tx - mx) / radX;
            const dz = (tz - mz) / radZ;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d >= 1.0) return;
            const dome = 0.5 + 0.5 * Math.cos(d * Math.PI);
            const ridgeDetail = 0.88 + 0.12 * this.noise.noise2d(x * 0.012, z * 0.012);
            weight = Math.max(weight, 0.98);
            hill = Math.max(hill, 8.8 + peakH * dome * ridgeDetail);
        };

        // 2. MONTE ARARAT (Grande Ararat Y ≈ 252m snow-capped dome & Piccolo Ararat Y ≈ 210m) to the North-East
        addMountainMassif(185.0, -175.0, 175.0, 155.0, 38.5); // Grande Ararat
        addMountainMassif(305.0, -125.0, 105.0,  95.0, 24.5); // Piccolo Ararat

        // 3. CATENA DEL TAURO ORIENTALE (West/North-West amphitheater peaks, Y ≈ 190m..215m)
        addMountainMassif(-195.0, -135.0, 165.0, 130.0, 26.5);
        addMountainMassif( -25.0, -210.0, 155.0, 120.0, 28.0);
        addMountainMassif(-265.0,   45.0, 145.0, 160.0, 21.0);

        // 4. MONTI ZAGROS (East flanking hills along the Tigris valley, Y ≈ 180m..205m)
        addMountainMassif(285.0,  85.0, 140.0, 175.0, 22.5);
        addMountainMassif(310.0, 340.0, 150.0, 190.0, 20.0);

        // 5. SACRED HEADWATER TERRACE (Spawn Plateau at tx = 0, tz = +8.3 -> worldX = 14200, worldZ = -13775)
        // Guarantees a silky-smooth, scenic green mountain overlook (Y ≈ 137m, slope < 4°) between the two springs!
        const dSpawn = Math.sqrt(tx * tx + (tz - 8.0) * (tz - 8.0));
        if (dSpawn < 48.0) {
            const tPlat = 1.0 - dSpawn / 48.0;
            const sPlat = tPlat * tPlat * (3.0 - 2.0 * tPlat);
            hill = hill * (1.0 - 0.65 * sPlat) + 9.6 * (0.65 * sPlat);
        }

        // 6. TWIN RIVERS OF EDEN / MESOPOTAMIA: TIGRI (East) & EUFRATE (West)
        // Both rivers start at crystal-clear alpine/emerald springs just East & West of the player spawn,
        // wind southward enclosing the lush Fertile Crescent plain, unite at Shatt al-Arab, and empty into the Persian Gulf!
        let carve = 0.0;
        let riverFloorW = 0.72;
        let riverFloorH = 4.45;

        if (tz >= -28.0 && tz <= 1180.0) {
            const zNorm = Math.max(0.0, Math.min(1.0, (tz + 10.0) / 960.0));
            const meanderT = Math.sin(tz * 0.014 + 0.4) * 26.0 + Math.sin(tz * 0.031) * 10.0;
            const meanderE = Math.sin(tz * 0.013 - 1.1) * 28.0 + Math.cos(tz * 0.029) * 10.0;

            // Separation widens across central Mesopotamia (up to ~540m apart) then converges at Shatt al-Arab (zNorm > 0.88)
            const archSpread = Math.sin(Math.min(1.0, zNorm * 1.08) * Math.PI);
            const tigrisCenterX = 36.0 + archSpread * 82.0 + zNorm * 35.0 + meanderT * Math.min(1.0, zNorm * 3.5);
            const euphratesCenterX = -38.0 - archSpread * 92.0 + zNorm * 55.0 + meanderE * Math.min(1.0, zNorm * 3.5);

            // Distance to Tigris & Euphrates channels + Headwater Spring Lagoons
            const dSpringTigris = Math.sqrt((tx - 38.0) * (tx - 38.0) + (tz - 12.0) * (tz - 12.0));
            const dSpringEuphrates = Math.sqrt((tx + 40.0) * (tx + 40.0) + (tz - 15.0) * (tz - 15.0));

            const dTigris = (tz >= 10.0) ? Math.abs(tx - tigrisCenterX) : dSpringTigris;
            const dEuphrates = (tz >= 12.0) ? Math.abs(tx - euphratesCenterX) : dSpringEuphrates;
            const dRiver = Math.min(dTigris, dEuphrates, dSpringTigris * 0.85, dSpringEuphrates * 0.85);

            // River channel widens from 54m at the mountain springs to 114m across Mesopotamia and 220m at the Persian Gulf mouth
            const gulfFlare = Math.max(0.0, (tz - 860.0) / 240.0);
            const riverHalfWater = 11.0 + zNorm * 8.0 + gulfFlare * 28.0;
            const bankWidth = 16.0 + zNorm * 6.0; // 48m to 66m gentle sandy/emerald riverbank!

            if (dRiver < riverHalfWater + bankWidth) {
                if (dRiver <= riverHalfWater) {
                    carve = 1.0;
                } else {
                    const tBank = (dRiver - riverHalfWater) / bankWidth;
                    carve = 0.5 + 0.5 * Math.cos(tBank * Math.PI);
                }
                const startFade = Math.min(1.0, Math.max(0.0, (tz + 26.0) / 22.0));
                carve *= startFade;
            }
        }

        // 7. GOLFO PERSICO (Persian Gulf open turquoise sea basin south of tz > 980)
        if (tz > 940.0) {
            const dGulf = Math.sqrt(((tx - 55.0) * 0.65) * ((tx - 55.0) * 0.65) + (tz - 1180.0) * (tz - 1180.0));
            if (dGulf < 320.0) {
                const tGulf = 1.0 - dGulf / 320.0;
                const sGulf = tGulf * tGulf * (3.0 - 2.0 * tGulf);
                carve = Math.max(carve, sGulf);
                riverFloorW = 0.72 * (1.0 - 0.65 * sGulf);
                riverFloorH = 4.45 * (1.0 - 0.65 * sGulf);
            }
        }

        if (carve > 0.0) {
            weight = weight * (1.0 - carve) + riverFloorW * carve;
            hill = hill * (1.0 - carve) + riverFloorH * carve;
        }

        return { weight, hill, carve };
    }

    // =========================================================
    // BORGOSESIA — VALSESIA, FIUME SESIA, MONTE ROSA & MONTE FENERA (PIEMONTE, ITALIA)
    // High-resolution analytical terrain sculpting around (worldX = 2950, worldZ = -15300)
    // =========================================================
    getBorgosesiaRegion(x, z) {
        const borgoVX = 983.33333333; // 2950.0m / 3.0
        const borgoVZ = -5100.0;      // -15300.0m / 3.0
        const bx = x - borgoVX;
        const bz = z - borgoVZ;

        // Fast bounding-box exit so this costs 0 CPU outside Valsesia / Piemonte
        if (Math.abs(bx) > 950.0 || Math.abs(bz) > 950.0) {
            return { weight: 0.0, hill: 0.0, carve: 0.0 };
        }

        const roll1 = 0.5 + 0.5 * this.noise.noise2d(x * 0.0072 - 2.1, z * 0.0072 + 4.3);
        const roll2 = 0.5 + 0.5 * this.noise.noise2d(x * 0.016 + 3.8, z * 0.016 - 1.9);
        const gentleRoll = roll1 * 0.75 + roll2 * 0.25;

        const regionDist = Math.sqrt(bx * bx + bz * bz);
        const regionFade = 1.0 - Math.min(1.0, Math.max(0.0, (regionDist - 540.0) / 260.0));
        if (regionFade <= 0.0) {
            return { weight: 0.0, hill: 0.0, carve: 0.0 };
        }

        const sRegion = regionFade * regionFade * (3.0 - 2.0 * regionFade);
        let weight = 0.96 * sRegion;
        // Verdant Valsesia floor rising gently northwestward toward Alagna & Monte Rosa
        const alpineRise = Math.max(0.0, Math.min(1.0, (220.0 - (bx * 0.55 + bz * 0.83)) / 420.0));
        const sAlpine = alpineRise * alpineRise * (3.0 - 2.0 * alpineRise);
        let hill = (6.4 + gentleRoll * 2.3 + sAlpine * 2.8) * sRegion;

        const addMountainMassif = (mx, mz, radX, radZ, peakH) => {
            const dx = (bx - mx) / radX;
            const dz = (bz - mz) / radZ;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d >= 1.0) return;
            const dome = 0.5 + 0.5 * Math.cos(d * Math.PI);
            const ridgeDetail = 0.88 + 0.12 * this.noise.noise2d(x * 0.012, z * 0.012);
            weight = Math.max(weight, 0.98);
            hill = Math.max(hill, 8.8 + peakH * dome * ridgeDetail);
        };

        // 1. MASSICCIO DEL MONTE ROSA (Punta Dufour / Capanna Margherita Y ≈ 254m & Corno Bianco Y ≈ 225m to the NW)
        addMountainMassif(-175.0, -180.0, 175.0, 160.0, 41.0); // Monte Rosa (Punta Dufour / Gnifetti)
        addMountainMassif(-265.0,  -75.0, 135.0, 125.0, 29.5); // Corno Bianco & Alta Valsesia
        addMountainMassif( -55.0, -245.0, 145.0, 130.0, 28.0); // Cima di Jazzi / Macugnaga ridge

        // 2. ALPI VALSESIANE & ALPE DI MERA / SACRO MONTE DI VARALLO (Flanking the valley to the N/NE and W/SW)
        addMountainMassif( 155.0, -150.0, 145.0, 135.0, 25.5); // Monte Barone / Alpe Noveis / Cusio ridge
        addMountainMassif(-220.0,   95.0, 140.0, 150.0, 22.0); // Alpe di Mera / Monte Camparient

        // 3. MONTE FENERA (Iconic natural park mountain overlooking Borgosesia to the East/Southeast, Y ≈ 195m)
        addMountainMassif( 185.0,   75.0, 130.0, 140.0, 21.5);

        // 4. CONCA VERDE DI BORGOSESIA (Smooth riverside valley terrace at bx = 0, bz = 8.33 -> worldX = 2950, worldZ = -15275)
        const dBorgo = Math.sqrt(bx * bx + (bz - 8.0) * (bz - 8.0));
        if (dBorgo < 52.0) {
            const tPlat = 1.0 - dBorgo / 52.0;
            const sPlat = tPlat * tPlat * (3.0 - 2.0 * tPlat);
            hill = hill * (1.0 - 0.68 * sPlat) + 8.6 * (0.68 * sPlat);
        }

        // 5. FIUME SESIA: Crystal-clear alpine river descending from the Monte Rosa glacier (NW)
        // curving right alongside Borgosesia (bx ≈ -32, bz ≈ 0) and flowing southward toward the Po Valley!
        let carve = 0.0;
        const riverFloorW = 0.72;
        const riverFloorH = 4.45;

        if (bz >= -135.0 && bz <= 680.0) {
            const zProg = (bz + 135.0) / 815.0;
            const sesiaMeander = Math.sin(bz * 0.016 + 0.5) * 22.0 + Math.cos(bz * 0.033) * 8.0;
            // Curves from (-115, -135) at the foot of Monte Rosa, passes at x = -34 beside Borgosesia (bz = 0), then flows SE
            const sesiaCenterX = -34.0 + (bz * 0.22) + sesiaMeander * Math.min(1.0, Math.max(0.25, zProg * 2.0));
            const dSpringSesia = Math.sqrt((bx + 92.0) * (bx + 92.0) + (bz + 95.0) * (bz + 95.0));
            const dChannel = Math.abs(bx - sesiaCenterX);
            const dRiver = Math.min(dChannel, dSpringSesia * 0.85);

            const riverHalfWater = 12.0 + Math.max(0.0, zProg) * 5.0;
            const bankWidth = 16.0;

            if (dRiver < riverHalfWater + bankWidth) {
                if (dRiver <= riverHalfWater) {
                    carve = 1.0;
                } else {
                    const tBank = (dRiver - riverHalfWater) / bankWidth;
                    carve = 0.5 + 0.5 * Math.cos(tBank * Math.PI);
                }
                const startFade = Math.min(1.0, Math.max(0.0, (bz + 135.0) / 24.0));
                const endFade = 1.0 - Math.min(1.0, Math.max(0.0, (bz - 560.0) / 120.0));
                carve *= startFade * endFade;
            }
        }

        if (carve > 0.0) {
            weight = weight * (1.0 - carve) + riverFloorW * carve;
            hill = hill * (1.0 - carve) + riverFloorH * carve;
        }

        return { weight, hill, carve };
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
                    this.modifiedChunkSet.add(chunkKey);
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
        const wy = worldY;

        // Reset temporary struct
        _tempBiomeInfo.isGlacier = false;
        _tempBiomeInfo.isDesert = false;
        _tempBiomeInfo.isBeach = false;
        _tempBiomeInfo.isForest = false;
        _tempBiomeInfo.isAlpine = false;
        _tempBiomeInfo.isMountain = false;
        _tempBiomeInfo.isStartingEast = false;

        // 1. CLEITO — CAPITALE DI ATLANTIDE & ISOLE DEL CIRCONDARIO (Centro dell'Oceano Atlantico: X = -10800, Z = -10600)
        const ax = worldX - (-10800.0);
        const az = worldZ - (-10600.0);
        const distAtlantis = Math.sqrt(ax * ax + az * az);

        if (distAtlantis < 2920.0) {
            if (distAtlantis >= 2380.0) {
                _tempBiomeInfo.type = 'atlantis_mist';
                _tempBiomeInfo.name = '🌫️ NEBBIA DI CONFINE DI CLEITO';
                return _tempBiomeInfo;
            }
            if (az < -430.0 && az > -2360.0 && Math.abs(ax) < 68.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '⛵ GRANDE CANALE DI ATLANTIDE';
                return _tempBiomeInfo;
            }
            if (distAtlantis < 154.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '👑 SANTUARIO D\'ORO DI POSEIDONE E CLITO';
                return _tempBiomeInfo;
            }
            if (distAtlantis < 402.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '🔥 ACROPOLI CENTRALE & REGGIA (MURO DI ORICALCO)';
                return _tempBiomeInfo;
            }
            if (distAtlantis < 458.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '🏖️ LIDO DELL\'ACROPOLI DI CLEITO';
                return _tempBiomeInfo;
            }
            if (distAtlantis < 690.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '⚓ PORTO E LAGUNA INTERNA DI CLEITO';
                return _tempBiomeInfo;
            }
            if (distAtlantis < 990.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '🌿 1° ANELLO DI TERRA DI CLEITO';
                return _tempBiomeInfo;
            }
            if (distAtlantis < 1245.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '🌊 2° LAGUNA CORALLINA DI CLEITO';
                return _tempBiomeInfo;
            }
            if (distAtlantis < 1510.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '🌴 2° ANELLO DI TERRA DI CLEITO';
                return _tempBiomeInfo;
            }
            if (distAtlantis < 1605.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '🛡️ CINTA INTERMEDIA (MURO DI STAGNO)';
                return _tempBiomeInfo;
            }
            if (distAtlantis < 1860.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '🌊 3° LAGUNA CORALLINA DI CLEITO';
                return _tempBiomeInfo;
            }
            if (distAtlantis < 2145.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '🏝️ 3° ANELLO PERIFERICO DI CLEITO';
                return _tempBiomeInfo;
            }
            _tempBiomeInfo.type = 'lagoon_atoll';
            _tempBiomeInfo.name = '⚔️ CINTA ESTERNA (MURO DI BRONZO)';
            return _tempBiomeInfo;
        }
        if (distAtlantis < 5100.0) {
            _tempBiomeInfo.type = 'lagoon_atoll';
            _tempBiomeInfo.name = '🏝️ ISOLE DEL CIRCONDARIO DI ATLANTIDE (OCEANO ATLANTICO)';
            return _tempBiomeInfo;
        }

        // 2. SORGENTI DEL TIGRI E DELL'EUFRATE, MONTE ARARAT & MESOPOTAMIA (X = 14200, Z = -13800)
        const tx = worldX - 14200.0;
        const tz = worldZ - (-13800.0);
        if (Math.abs(tx) < 2800.0 && tz > -1650.0 && tz < 4100.0) {
            const dArarat = Math.sqrt((tx - 555.0) * (tx - 555.0) + (tz + 525.0) * (tz + 525.0));
            if (dArarat < 560.0 && wy >= 162.0) {
                if (wy >= 210.0) {
                    _tempBiomeInfo.type = 'summit_glacier';
                    _tempBiomeInfo.name = '🏔️ VETTA GHIACCIATA DEL MONTE ARARAT';
                    _tempBiomeInfo.isGlacier = true;
                } else {
                    _tempBiomeInfo.type = 'mountain';
                    _tempBiomeInfo.name = '⛰️ MASSICCIO DEL MONTE ARARAT (ALTOPIANO ARMENO)';
                    _tempBiomeInfo.isMountain = true;
                }
                return _tempBiomeInfo;
            }
            if (Math.sqrt(tx * tx + (tz - 25.0) * (tz - 25.0)) < 290.0) {
                _tempBiomeInfo.type = 'alpine';
                _tempBiomeInfo.name = '🏔️ SORGENTI DEL TIGRI E DELL\'EUFRATE (ALTOPIANO ARMENO)';
                _tempBiomeInfo.isAlpine = true;
                return _tempBiomeInfo;
            }
            if (tz > 2900.0) {
                _tempBiomeInfo.type = 'tropical_ocean';
                _tempBiomeInfo.name = '🌊 GOLFO PERSICO (OCEANO INDIANO)';
                return _tempBiomeInfo;
            }
            if (wy <= 122.8 && tz >= -20.0) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = (tx >= 0.0)
                    ? '🌊 FIUME TIGRI (MESOPOTAMIA)'
                    : '🌊 FIUME EUFRATE (MESOPOTAMIA)';
                return _tempBiomeInfo;
            }
            if (wy >= 165.0) {
                _tempBiomeInfo.type = 'mountain';
                _tempBiomeInfo.name = '⛰️ CATENA DEL TAURO & MONTI ZAGROS';
                _tempBiomeInfo.isMountain = true;
                return _tempBiomeInfo;
            }
            _tempBiomeInfo.type = 'forest';
            _tempBiomeInfo.name = '🌿 MEZZALUNA FERTILE — MESOPOTAMIA (TRA TIGRI ED EUFRATE)';
            _tempBiomeInfo.isForest = true;
            return _tempBiomeInfo;
        }

        // 3. BORGOSESIA — VALSESIA, FIUME SESIA & MONTE ROSA (PIEMONTE, ITALIA: X = 2950, Z = -15300)
        const bx = worldX - 2950.0;
        const bz = worldZ - (-15300.0);
        if (Math.abs(bx) < 2200.0 && Math.abs(bz) < 2200.0) {
            const dMonteRosa = Math.sqrt((bx + 525.0) * (bx + 525.0) + (bz + 540.0) * (bz + 540.0));
            if (dMonteRosa < 620.0 && wy >= 162.0) {
                if (wy >= 205.0) {
                    _tempBiomeInfo.type = 'summit_glacier';
                    _tempBiomeInfo.name = '🏔️ MASSICCIO DEL MONTE ROSA — PUNTA DUFOUR (ALPI VALSESIANE)';
                    _tempBiomeInfo.isGlacier = true;
                } else {
                    _tempBiomeInfo.type = 'mountain';
                    _tempBiomeInfo.name = '⛰️ PENDII DEL MONTE ROSA (ALTA VALSESIA)';
                    _tempBiomeInfo.isMountain = true;
                }
                return _tempBiomeInfo;
            }
            if (wy <= 122.8) {
                _tempBiomeInfo.type = 'lagoon_atoll';
                _tempBiomeInfo.name = '🌊 FIUME SESIA — BORGOSESIA (VALSESIA, PIEMONTE)';
                return _tempBiomeInfo;
            }
            if (Math.sqrt(bx * bx + (bz - 25.0) * (bz - 25.0)) < 380.0) {
                _tempBiomeInfo.type = 'alpine';
                _tempBiomeInfo.name = '🌲 BORGOSESIA — CONCA DELLA VALSESIA (PIEMONTE, ITALIA)';
                _tempBiomeInfo.isAlpine = true;
                return _tempBiomeInfo;
            }
            if (wy >= 162.0) {
                _tempBiomeInfo.type = 'mountain';
                _tempBiomeInfo.name = (bx > 150.0)
                    ? '⛰️ PARCO NATURALE DEL MONTE FENERA (BORGOSESIA)'
                    : '⛰️ ALPI VALSESIANE & ALPE DI MERA (PIEMONTE)';
                _tempBiomeInfo.isMountain = true;
                return _tempBiomeInfo;
            }
            _tempBiomeInfo.type = 'forest';
            _tempBiomeInfo.name = '🌲 VALSESIA — BORGOSESIA & VARALLO (PIEMONTE, ITALIA)';
            _tempBiomeInfo.isForest = true;
            return _tempBiomeInfo;
        }

        // 4. FAMOUS EARTH LANDMARKS (Colonne d'Ercole / Gibilterra, Mar Mediterraneo, Nilo)
        if (Math.hypot(worldX - (-2100.0), worldZ - (-12750.0)) < 1850.0) {
            _tempBiomeInfo.type = 'lagoon_atoll';
            _tempBiomeInfo.name = '🏛️ COLONNE D\'ERCOLE (STRETTO DI GIBILTERRA)';
            return _tempBiomeInfo;
        }
        if (worldX > -1800.0 && worldX < 10800.0 && worldZ > -14700.0 && worldZ < -10800.0 && wy < 123.0) {
            _tempBiomeInfo.type = 'open_ocean';
            _tempBiomeInfo.name = '⛵ MAR MEDITERRANEO (MARE NOSTRUM)';
            return _tempBiomeInfo;
        }
        if (Math.abs(worldX - 9470.0) < 1200.0 && worldZ > -11800.0 && worldZ < -1500.0) {
            _tempBiomeInfo.type = 'desert';
            _tempBiomeInfo.name = '🌴 VALLE E DELTA DEL NILO (EGITTO)';
            _tempBiomeInfo.isDesert = (wy > 125.0);
            return _tempBiomeInfo;
        }

        const poleDist = (this.planetaryConfig && this.planetaryConfig.poleDistanceMeters) ? this.planetaryConfig.poleDistanceMeters : 32000.0;
        const lat = Math.min(1.0, Math.abs(worldZ) / poleDist);
        _tempBiomeInfo.latitude = lat;

        const earthSample = this.sampleEarthGrid(worldX, worldZ);
        if (earthSample.weight < 0.16) {
            if (lat >= 0.75) {
                _tempBiomeInfo.type = 'polar_ocean';
                _tempBiomeInfo.name = '❄️ OCEANO POLARE ARTICO / ANTARTICO';
                _tempBiomeInfo.isGlacier = true;
            } else if (worldX > -24000.0 && worldX < -2000.0) {
                _tempBiomeInfo.type = 'open_ocean';
                _tempBiomeInfo.name = '🌊 OCEANO ATLANTICO CENTRALE';
            } else if (lat < 0.28) {
                _tempBiomeInfo.type = 'tropical_ocean';
                _tempBiomeInfo.name = '🏝️ OCEANO INDIANO & PACIFICO TROPICALE';
            } else {
                _tempBiomeInfo.type = 'open_ocean';
                _tempBiomeInfo.name = '🌊 GRANDE OCEANO PLANETARIO';
            }
            return _tempBiomeInfo;
        }

        _tempBiomeInfo.contFactor = earthSample.weight;

        // 1. Polar Glaciers & Ice Sheets
        if (lat >= 0.72) {
            _tempBiomeInfo.type = 'glacier';
            _tempBiomeInfo.name = '❄️ CALOTTA GLACIALE POLARE';
            _tempBiomeInfo.isGlacier = true;
            return _tempBiomeInfo;
        }

        // 2. Sahara & Arabian Belts
        if (worldX > -3500.0 && worldX < 18500.0 && worldZ > -10600.0 && worldZ < -3200.0 && earthSample.weight > 0.55) {
            _tempBiomeInfo.type = 'desert';
            _tempBiomeInfo.name = '🏜️ GRANDE DESERTO DEL SAHARA & ARABIA';
            _tempBiomeInfo.isDesert = true;
            return _tempBiomeInfo;
        }

        // 3. Continental Idyllic Beach
        if (earthSample.weight < 0.45 && wy < 126.5) {
            _tempBiomeInfo.type = 'beach';
            _tempBiomeInfo.name = '🏖️ LITORALE CONTINENTALE';
            _tempBiomeInfo.isBeach = true;
            return _tempBiomeInfo;
        }

        // 4. Continental Altitude Zonation
        if (wy >= 210.0 || (wy >= 185.0 && lat > 0.48)) {
            _tempBiomeInfo.type = 'summit_glacier';
            _tempBiomeInfo.name = '🏔️ ALTE VETTE GHIACCIATE (ALPI / HIMALAYA / ANDE)';
            _tempBiomeInfo.isGlacier = true;
            return _tempBiomeInfo;
        }
        if (wy >= 172.0) {
            _tempBiomeInfo.type = 'mountain';
            _tempBiomeInfo.name = '⛰️ CATENA MONTUOSA CONTINENTALE';
            _tempBiomeInfo.isMountain = true;
            return _tempBiomeInfo;
        }
        if (wy >= 148.0) {
            _tempBiomeInfo.type = 'alpine';
            _tempBiomeInfo.name = '🌱 ALTOPIANI & PASCOLI ALPINI';
            _tempBiomeInfo.isAlpine = true;
            return _tempBiomeInfo;
        }
        _tempBiomeInfo.type = 'forest';
        _tempBiomeInfo.name = '🌲 PIANURE E FORESTE CONTINENTALI';
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

        const wx = x * this.voxelScale;
        const wz = z * this.voxelScale;

        // 1. O(1) bilinear lookup into the precomputed Earth Altimetry & Bathymetry Raster Grid (< 5 ns)
        const earth = this.sampleEarthGrid(wx, wz);

        // 2. High-resolution analytical sculpting for the Tigris & Euphrates Headwaters, Mount Ararat & Mesopotamia
        const tigris = this.getTigrisEuphratesRegion(x, z);
        // 3. High-resolution analytical sculpting for Borgosesia, Fiume Sesia & Monte Rosa (Valsesia, Italy)
        const borgo = this.getBorgosesiaRegion(x, z);

        if (tigris.weight <= 0.0 && tigris.carve <= 0.0 && borgo.weight <= 0.0 && borgo.carve <= 0.0) {
            return earth;
        }

        let weight = Math.max(earth.weight, tigris.weight, borgo.weight);
        let hill = earth.hill;
        if (tigris.weight > 0.0 || tigris.carve > 0.0) {
            hill = Math.max(earth.hill * 0.55, tigris.hill);
        }
        if (borgo.weight > 0.0 || borgo.carve > 0.0) {
            hill = Math.max(earth.hill * 0.45, borgo.hill);
        }

        // Preserve navigable turquoise river channels & springs carved into Mesopotamia or Valsesia (Fiume Sesia)
        const activeCarve = Math.max(tigris.carve, borgo.carve);
        if (activeCarve > 0.0) {
            const riverW = 0.72;
            const riverH = 4.45;
            weight = weight * (1.0 - activeCarve) + riverW * activeCarve;
            hill = hill * (1.0 - activeCarve) + riverH * activeCarve;
        }

        return { weight, hill };
    }

    getGlobalProceduralLand(x, z) {
        // Keep the 4x Monumental Capital of Atlantis/Cleito & its Ring of Mist (around -10800m, -10600m -> vx = -3600, vz = -3533.33)
        // completely pristine inside r < 960 voxels (2880m)!
        const ax = x - (-3600.0);
        const az = z - (-3533.33333333);
        const distAtlantis = Math.sqrt(ax * ax + az * az);

        if (distAtlantis < 960.0) {
            return { weight: 0.0, hill: 0.0 };
        }

        const startAreaMask = Math.min(Math.max((distAtlantis - 960.0) / 100.0, 0.0), 1.0);
        if (startAreaMask <= 0.0) {
            return { weight: 0.0, hill: 0.0 };
        }

        // Continental landmasses (Earth 3D map + Tigris/Euphrates/Mesopotamia)
        const cont = this.getContinentalLand(x, z);
        let maxWeight = cont.weight;
        let maxHill = cont.hill;

        // Suppress random cellular sea-crags near the 10 Surrounding Islands of Atlantis (distAtlantis < 1680),
        // inside the Tigris & Euphrates / Mesopotamia Cradle, and around Borgosesia / Valsesia!
        const tx = x - 4733.33333333;
        const tz = z - (-4600.0);
        const distTigris = Math.sqrt(tx * tx + tz * tz);
        const bx = x - 983.33333333;
        const bz = z - (-5100.0);
        const distBorgo = Math.sqrt(bx * bx + bz * bz);
        if (distAtlantis < 1680.0 || distTigris < 1350.0 || distBorgo < 950.0) {
            return {
                weight: maxWeight * startAreaMask,
                hill: maxHill * startAreaMask
            };
        }

        // Planetary infinite cellular grid for procedural ocean islands outside continental shelves
        const cellSize = 260.0;
        const cellX = Math.floor(x / cellSize);
        const cellZ = Math.floor(z / cellSize);

        // Check the 3x3 neighborhood of cells
        for (let ox = -1; ox <= 1; ox++) {
            for (let oz = -1; oz <= 1; oz++) {
                const cx = cellX + ox;
                const cz = cellZ + oz;

                // Deterministic fast pseudo-random hash for this cell
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
                    const atollRadius = 45.0 + sizeHash * 35.0;
                    const ringDist = Math.abs(distCenter - atollRadius);
                    const ringThickness = 18.0 + sizeHash * 8.0;
                    const atollDistWithNoise = ringDist + shoreNoise;
                    
                    if (atollDistWithNoise < ringThickness) {
                        const t = Math.max(0.0, 1.0 - atollDistWithNoise / ringThickness);
                        islandWeight = t;
                        islandHill = Math.max(islandHill, 8.0 * Math.pow(t, 1.3));
                    }
                    if (distCenter < atollRadius) {
                        const lagoonT = Math.max(0.0, 1.0 - distCenter / atollRadius);
                        islandWeight = Math.max(islandWeight, 0.40 * lagoonT);
                    }
                }
                // TYPE 1: GENTLE VOLCANIC ATOLL ISLAND WITH CALDERA (0.25 <= typeHash < 0.45)
                else if (typeHash < 0.45) {
                    const volcanoRadius = 50.0 + sizeHash * 35.0;
                    const stretchZ = (typeHash > 0.35) ? 0.75 : 1.15;
                    const vDist = Math.sqrt(dx * dx + (dz * stretchZ) * (dz * stretchZ)) + shoreNoise;
                    
                    if (vDist < volcanoRadius) {
                        const t = Math.max(0.0, 1.0 - vDist / volcanoRadius);
                        const dome = 0.5 - 0.5 * Math.cos(t * Math.PI);
                        islandWeight = t;
                        let vHeight = 11.5 * dome;
                        
                        const craterRadius = 12.0 + sizeHash * 6.0;
                        if (vDist < craterRadius) {
                            const craterT = Math.max(0.0, 1.0 - Math.max(0.0, vDist) / craterRadius);
                            vHeight -= 5.0 * Math.pow(craterT, 1.4);
                        }
                        islandHill = Math.max(islandHill, vHeight);
                    }
                }
                // TYPE 2: ROLLING GREEN ARCHIPELAGO ISLANDS (0.45 <= typeHash < 0.85)
                else if (typeHash < 0.85) {
                    const archiRadius = 60.0 + sizeHash * 55.0;
                    const angle = sizeHash * Math.PI;
                    const cosA = Math.cos(angle);
                    const sinA = Math.sin(angle);
                    const rotX = dx * cosA - dz * sinA;
                    const rotZ = dx * sinA + dz * cosA;
                    const mDist = Math.sqrt(rotX * rotX * 0.65 + rotZ * rotZ * 1.35) + shoreNoise;
                    
                    if (mDist < archiRadius) {
                        const t = Math.max(0.0, 1.0 - mDist / archiRadius);
                        const dome = 0.5 - 0.5 * Math.cos(t * Math.PI);
                        islandWeight = t;
                        const ridgeNoise = this.noise.noise2d(rotX * 0.025, rotZ * 0.025) * 3.0;
                        const mHeight = Math.max(0.0, dome * 12.0 + ridgeNoise * dome);
                        islandHill = Math.max(islandHill, mHeight);
                    }
                }
                // TYPE 3: COASTAL REEF ISLETS (typeHash >= 0.85)
                else {
                    const cragRadius = 28.0 + sizeHash * 25.0;
                    const cDist = distCenter + shoreNoise * 1.1;
                    
                    if (cDist < cragRadius) {
                        const t = Math.max(0.0, 1.0 - cDist / cragRadius);
                        const dome = 0.5 - 0.5 * Math.cos(t * Math.PI);
                        islandWeight = Math.pow(t, 0.85);
                        islandHill = Math.max(islandHill, dome * 8.5);
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

    // =========================================================
    // CLEITO — 4X MONUMENTAL CAPITAL OF PLATO'S ATLANTIS & 10 SURROUNDING ISLANDS
    // Located in the Center of the Atlantic Ocean (worldX = -10800m, worldZ = -10600m)
    // =========================================================
    getAtlantisArchipelago(x, z) {
        const ax = x - (-3600.0);        // -10800.0m / 3.0
        const az = z - (-3533.33333333); // -10600.0m / 3.0
        const r = Math.sqrt(ax * ax + az * az);
        if (r > 1680.0) {
            return { weight: 0.0, hill: 0.0 };
        }

        // Gentle, natural coastline bay undulation (keeps wall perimeters regular while scalloping beaches naturally)
        const centerCalm = Math.min(1.0, Math.max(0.0, (r - 140.0) / 60.0));
        const shoreRipple = (
            this.noise.noise2d(ax * 0.0085, az * 0.0085) * 5.2 +
            this.noise.noise2d(ax * 0.021, az * 0.021) * 1.8
        ) * centerCalm;
        const rOrg = Math.max(0.0, r + shoreRipple);

        // Ultra-broad, gentle rolling Mediterranean/tropical hill swells (wavelength ~450m — ZERO pointy peaks!)
        const roll1 = 0.5 + 0.5 * this.noise.noise2d(ax * 0.0072 + 3.1, az * 0.0072 - 2.4);
        const roll2 = 0.5 + 0.5 * this.noise.noise2d(ax * 0.016 - 7.3, az * 0.016 + 5.8);
        const rollingHill = roll1 * 0.76 + roll2 * 0.24;
        const reefUndulation = this.noise.noise2d(ax * 0.032 + 2.3, az * 0.032 - 4.1) * 0.35;

        let weight = 0.0;
        let hill = 0.0;

        // Helper for realistic wide concentric land rings & surrounding islands (gentle 5°-10° slopes + shallow coral reef shelves!)
        const evalRingProfile = (distFromMid, landHalfVox, reefWidthVox, peakBase, peakRoll) => {
            const totalHalf = landHalfVox + reefWidthVox;
            if (distFromMid >= totalHalf) return;
            if (distFromMid > landHalfVox) {
                const tReef = 1.0 - (distFromMid - landHalfVox) / reefWidthVox;
                const sReef = tReef * tReef * (3.0 - 2.0 * tReef);
                weight = Math.max(weight, 0.72 + 0.21 * sReef);
                hill = Math.max(hill, 4.6 + 0.65 * sReef + reefUndulation);
            } else {
                const tLand = distFromMid / landHalfVox; // 0 at gentle ridge crest -> 1 at beach waterline
                const dome = 0.5 + 0.5 * Math.cos(tLand * Math.PI); // Smooth zero-slope crest & zero-slope beach!
                weight = Math.max(weight, 0.93 + 0.07 * dome);
                hill = Math.max(hill, 5.25 + (peakBase + rollingHill * peakRoll) * dome);
            }
        };

        // PART A: THE 10 SURROUNDING ISLANDS OF THE ATLANTEAN ARCHIPELAGO (Outside the Mist Ring: r = 980 .. 1660 vox = 2.94km .. 4.98km)
        if (r > 830.0) {
            if (r > 965.0) {
                const surroundingIslands = [
                    { ix:    0.0, iz: -1180.0, landR: 115.0, reefW: 36.0, peak: 5.2 }, // Northern Gateway Island (off Grand Canal mouth)
                    { ix:  760.0, iz:  -920.0, landR: 125.0, reefW: 38.0, peak: 5.8 }, // Atlas Island (NE)
                    { ix: 1240.0, iz:  -260.0, landR: 135.0, reefW: 40.0, peak: 6.4 }, // Gadir Island (East — facing Pillars of Heracles)
                    { ix: 1140.0, iz:   580.0, landR: 120.0, reefW: 36.0, peak: 5.5 }, // Ampheres Island (SE)
                    { ix:  520.0, iz:  1180.0, landR: 130.0, reefW: 38.0, peak: 6.0 }, // Evaemon Island (SSE)
                    { ix: -380.0, iz:  1240.0, landR: 125.0, reefW: 38.0, peak: 5.6 }, // Mneseus Island (SSW)
                    { ix:-1120.0, iz:   680.0, landR: 140.0, reefW: 42.0, peak: 6.5 }, // Autochthon Island (SW)
                    { ix:-1280.0, iz:  -180.0, landR: 130.0, reefW: 38.0, peak: 6.1 }, // Elasippus Island (West)
                    { ix: -840.0, iz:  -940.0, landR: 120.0, reefW: 36.0, peak: 5.4 }, // Mestor Island (NW)
                    { ix:  360.0, iz: -1380.0, landR: 110.0, reefW: 34.0, peak: 5.0 }  // Azaes Coral Atoll (NNE)
                ];
                for (let s = 0; s < surroundingIslands.length; s++) {
                    const isl = surroundingIslands[s];
                    const dx = ax - isl.ix;
                    const dz = az - isl.iz;
                    const dIsl = Math.sqrt(dx * dx + dz * dz) + shoreRipple * 0.85;
                    evalRingProfile(dIsl, isl.landR, isl.reefW, isl.peak, 2.2);
                }
            }
            return { weight, hill };
        }

        // PART B: CLEITO — THE 4X MONUMENTAL CAPITAL OF PLATO'S ATLANTIS (r <= 830 vox = 2,490m)
        const atollPlatformFade = 1.0 - Math.max(0.0, Math.min(1.0, (r - 765.0) / 60.0));
        weight = 0.70 * atollPlatformFade;
        hill = (4.5 + reefUndulation) * atollPlatformFade;

        // 0. ACROPOLI CENTRALE & SANTUARIO DI POSEIDONE E CLITO
        const rAcrop = r + shoreRipple * 0.25;
        if (rAcrop < 172.0) {
            if (rAcrop > 152.0) {
                const tReef = 1.0 - (rAcrop - 152.0) / 20.0;
                const sReef = tReef * tReef * (3.0 - 2.0 * tReef);
                weight = Math.max(weight, 0.72 + 0.21 * sReef);
                hill = Math.max(hill, 4.6 + 0.65 * sReef + reefUndulation);
            } else {
                const coastT = Math.min(1.0, (152.0 - rAcrop) / 26.0);
                const coastSmooth = coastT * coastT * (3.0 - 2.0 * coastT);
                weight = Math.max(weight, 0.93 + 0.07 * coastSmooth);

                const palaceT = Math.min(1.0, Math.max(0.0, (128.0 - r) / 74.0));
                const palaceSmooth = palaceT * palaceT * (3.0 - 2.0 * palaceT);

                const sanctT = Math.min(1.0, Math.max(0.0, (52.0 - r) / 34.0));
                const sanctPlateau = sanctT * sanctT * (3.0 - 2.0 * sanctT);

                const acropHill = 5.25 + coastSmooth * 3.8 + palaceSmooth * (4.1 + rollingHill * 0.8) + sanctPlateau * 2.2;
                hill = Math.max(hill, acropHill);
            }
        }

        // 1° LAGUNA INTERNA & 1° ANELLO DI TERRA
        evalRingProfile(Math.abs(rOrg - 280.0), 50.0, 18.0, 3.4, 2.2);

        // 2° LAGUNA CORALLINA & 2° ANELLO DI TERRA (Cinta dello Stagno — Tin Wall at r = 1545m)
        evalRingProfile(Math.abs(rOrg - 475.0), 60.0, 19.0, 4.0, 2.6);

        // 3° LAGUNA CORALLINA & 3° ANELLO DI TERRA (Anello Periferico del Bronzo — Bronze Wall at r = 2185m)
        evalRingProfile(Math.abs(rOrg - 685.0), 65.0, 22.0, 4.4, 3.0);

        // Picturesque low palm-fringed coral motu islets nestled inside the 3 wide concentric lagoons
        const lagoonIslets = [
            { ix: -135.0, iz:  130.0, landR: 13.0, reefW: 10.0, peak: 2.0 },
            { ix:  155.0, iz: -105.0, landR: 12.0, reefW: 10.0, peak: 1.9 },
            { ix: -265.0, iz:  255.0, landR: 15.0, reefW: 12.0, peak: 2.3 },
            { ix:  280.0, iz:  235.0, landR: 14.0, reefW: 11.0, peak: 2.1 },
            { ix: -345.0, iz: -150.0, landR: 14.5, reefW: 11.0, peak: 2.2 },
            { ix: -430.0, iz:  385.0, landR: 16.5, reefW: 13.0, peak: 2.5 },
            { ix:  445.0, iz: -365.0, landR: 16.0, reefW: 13.0, peak: 2.4 },
            { ix:  560.0, iz:  150.0, landR: 15.5, reefW: 12.0, peak: 2.3 }
        ];
        for (let m = 0; m < lagoonIslets.length; m++) {
            const isl = lagoonIslets[m];
            const dMotu = Math.sqrt((ax - isl.ix) * (ax - isl.ix) + (az - isl.iz) * (az - isl.iz)) + shoreRipple * 0.30;
            evalRingProfile(dMotu, isl.landR, isl.reefW, isl.peak, 1.0);
        }

        // Outer crown of 18 gentle sandy/green coral reef islets outside the Bronze Ring (r ≈ 782 vox = 2346m)
        if (r > 750.0 && r < 818.0 && az > -740.0) {
            const numIslets = 18;
            for (let k = 0; k < numIslets; k++) {
                const thetaI = -Math.PI * 0.5 + 0.28 + (k / (numIslets - 1)) * (Math.PI * 2.0 - 0.56);
                const radI = 782.0 + ((k % 2 === 0) ? 7.0 : -5.0);
                const ix = Math.cos(thetaI) * radI;
                const iz = Math.sin(thetaI) * radI;
                const dIslet = Math.sqrt((ax - ix) * (ax - ix) + (az - iz) * (az - iz)) + shoreRipple * 0.35;
                evalRingProfile(dIslet, 16.0, 12.0, 2.5, 1.4);
            }
        }

        // IL GRANDE CANALE DI ATLANTIDE: 108m-wide monumental waterway along -Z
        if (az < -144.0 && az > -815.0) {
            const zEntryFade = Math.min(1.0, Math.max(0.0, (-144.0 - az) / 22.0));
            const mouthFlare = Math.max(0.0, (-az - 715.0) / 85.0);
            const canalHalfWater = 18.0 + mouthFlare * 10.0;
            const canalTransition = 15.0;
            const absX = Math.abs(ax + this.noise.noise2d(ax * 0.015, az * 0.015) * 1.4);

            if (absX < canalHalfWater + canalTransition) {
                let carve = 0.0;
                if (absX <= canalHalfWater) {
                    carve = 1.0;
                } else {
                    const tBank = (absX - canalHalfWater) / canalTransition;
                    carve = 0.5 + 0.5 * Math.cos(tBank * Math.PI);
                }
                carve *= zEntryFade;
                const canalFloorW = 0.70 * (1.0 - mouthFlare * 0.35);
                const canalFloorH = (4.4 + reefUndulation) * (1.0 - mouthFlare * 0.35);
                weight = weight * (1.0 - carve) + canalFloorW * carve;
                hill = hill * (1.0 - carve) + canalFloorH * carve;
            }
        }

        return { weight, hill };
    }

    getBaseDensity(x, y, z) {
        // 1. Plato's 4x Monumental Capital of Atlantis / Cleito & 10 Surrounding Islands in the Atlantic Ocean
        const atlantis = this.getAtlantisArchipelago(x, z);

        // 2. Global Earth 3D Map + Tigris/Euphrates Headwaters + Outer Oceanic Islands
        const globalLand = this.getGlobalProceduralLand(x, z);

        const landWeight = Math.max(atlantis.weight, globalLand.weight);
        const hillHeight = Math.max(atlantis.hill, globalLand.hill);

        const smoothWeightAbove = Math.pow(Math.max(0.0, Math.min(1.0, landWeight)), 1.2);
        const smoothWeightBelow = Math.pow(Math.max(0.0, Math.min(1.0, landWeight * 1.5)), 1.2);

        // Inside Cleito/Atlantis (-3600, -3533.33), Tigris/Euphrates/Mesopotamia (4733.33, -4600), and Borgosesia (983.33, -5100),
        // use ultra-gentle realistic ground swells so all slopes stay natural and silky smooth!
        const ax = x - (-3600.0);
        const az = z - (-3533.33333333);
        const rAtlantis = Math.sqrt(ax * ax + az * az);
        const tx = x - 4733.33333333;
        const tz = z - (-4600.0);
        const rTigris = Math.sqrt(tx * tx + tz * tz);
        const bx = x - 983.33333333;
        const bz = z - (-5100.0);
        const rBorgo = Math.sqrt(bx * bx + bz * bz);
        const blendAtlantis = Math.min(1.0, Math.max(0.0, (rAtlantis - 1620.0) / 140.0));
        const blendTigris   = Math.min(1.0, Math.max(0.0, (rTigris - 1320.0) / 140.0));
        const blendBorgo    = Math.min(1.0, Math.max(0.0, (rBorgo - 900.0) / 120.0));
        const outerBlend = Math.min(blendAtlantis, blendTigris, blendBorgo);

        const cleitoBase = 4.0 + this.noise.noise2d(x * 0.0065, z * 0.0065) * 1.10 + this.noise.noise2d(x * 0.018, z * 0.018) * 0.32;
        const outerBase  = 4.0 + this.noise.noise2d(x * 0.022, z * 0.022) * 2.10 + this.noise.noise2d(x * 0.065, z * 0.065) * 0.55;
        const baseHeightRaw = cleitoBase * (1.0 - outerBlend) + outerBase * outerBlend;
        
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
        
        // Gentle 3D surface detail (ultra-smooth 0.16 inside Cleito & Mesopotamia so slopes stay silky & realistic)
        if (y > 41.0) {
            const noiseY = y - 32.0;
            const finalHeightAbove = baseHeightRaw * smoothWeightAbove + hillHeight * smoothWeightAbove;
            if (noiseY < finalHeightAbove + 2.0) {
                const aboveWaterMask = Math.min(1.0, (y - 41.0) / 3.0);
                const bumpAmp = 0.16 + 0.34 * outerBlend;
                const bumpyNoise = this.noise.noise3d(x * 0.075, noiseY * 0.075, z * 0.075) * bumpAmp * aboveWaterMask;
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

    getColumnSurfaceBounds(cx, cz) {
        const colKey = `${cx},${cz}`;
        let cached = this.columnBoundsCache.get(colKey);
        if (cached !== undefined) {
            return cached;
        }

        const startX = cx * this.chunkSize;
        const startZ = cz * this.chunkSize;
        let minH = Infinity;
        let maxH = -Infinity;

        // Dense 5x5 grid across the 16x16 chunk footprint (all corners, edges & interior every 4 voxels = 12m)
        for (let ix = 0; ix <= this.chunkSize; ix += 4) {
            const vx = startX + ix;
            for (let iz = 0; iz <= this.chunkSize; iz += 4) {
                const h = this.getEstimatedSurfaceHeight(vx, startZ + iz);
                if (h < minH) minH = h;
                if (h > maxH) maxH = h;
            }
        }

        if (this.columnBoundsCache.size > 16384) {
            this.columnBoundsCache.clear();
        }
        cached = { minH, maxH };
        this.columnBoundsCache.set(colKey, cached);
        return cached;
    }

    hasPotentialTerrain(cx, cy, cz) {
        // 1. Always include any chunk touched by player digging/building or Level Editor modifications
        if (this.modifiedChunkSet.has(`${cx},${cy},${cz}`)) {
            return true;
        }

        // 2. Underground chunks below the natural seabed (cy < 0, y <= 0) are 100% solid bedrock
        // and produce 0 triangles unless modified by digging
        if (cy < 0) {
            return false;
        }

        // 3. Exact 2D surface height envelope across the 16x16 column with a wide 12-voxel (36m) vertical safety margin
        // Guarantees ZERO skipped chunks on steep mountains, hills, concentric rings, sea stacks, or seabed slopes!
        const bounds = this.getColumnSurfaceBounds(cx, cz);
        const yBottom = cy * this.chunkSize;
        const yTop = yBottom + this.chunkSize;

        const clampedMinH = Math.min(bounds.minH, this.maxY - 2.0);
        const minSurface = Math.max(0.0, clampedMinH - 7.5);
        const maxSurface = bounds.maxH + 7.5;

        return (yTop >= minSurface && yBottom <= maxSurface);
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
                    if (chunk.inScene) {
                        this.group.remove(chunk.mesh);
                        chunk.inScene = false;
                    }
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
        const maxBuilds = 28;
        let builtCount = 0;
        while (this.chunkBuildQueue.length > 0 && builtCount < maxBuilds) {
            const chunk = this.chunkBuildQueue.shift();
            if (chunk && chunk.dirty) {
                chunk.rebuild();
                builtCount++;
            }
            if (performance.now() - startTime > 10.0) break;
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
        this.modifiedChunkSet.clear();
        if (data.modifiedVoxels) {
            for (const [key, val] of data.modifiedVoxels) {
                if (Number.isFinite(val)) {
                    this.modifiedVoxels.set(key, val);
                    const parts = key.split(',');
                    if (parts.length === 3) {
                        const vx = Number(parts[0]);
                        const vy = Number(parts[1]);
                        const vz = Number(parts[2]);
                        const cx1 = Math.floor((vx - 1) / this.chunkSize);
                        const cx2 = Math.floor(vx / this.chunkSize);
                        const cy1 = Math.floor((vy - 1) / this.chunkSize);
                        const cy2 = Math.floor(vy / this.chunkSize);
                        const cz1 = Math.floor((vz - 1) / this.chunkSize);
                        const cz2 = Math.floor(vz / this.chunkSize);
                        for (let cx = cx1; cx <= cx2; cx++) {
                            for (let cy = cy1; cy <= cy2; cy++) {
                                for (let cz = cz1; cz <= cz2; cz++) {
                                    this.modifiedChunkSet.add(`${cx},${cy},${cz}`);
                                }
                            }
                        }
                    }
                }
            }
        }
        if (data.modifiedColumns) {
            for (const col of data.modifiedColumns) {
                this.modifiedColumns.add(col);
            }
        }
        for (const chunk of this.loadedChunks.values()) {
            chunk.initialized = false;
            chunk.dirty = true;
            this.chunkBuildQueue.push(chunk);
        }
        // Force immediate chunk scan on next update so newly modified underground/sky chunks load right away
        this.lastScanTime = 0;
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
    isCylinderColliding(x, y, z, radius = 0.50, height = 1.8) {
        // Sample at 5 heights including camera eye-level (+8cm / -8cm) so camera near-plane never clips into overhanging rock walls!
        const yLevels = [y + 0.08, y - 0.08, y - 0.38, y - 0.78, y - 1.15];
        const r = radius;
        const rDiag = radius * 0.7071;

        for (let l = 0; l < 5; l++) {
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
        const atlantis = this.getAtlantisArchipelago(vx, vz);
        const globalLand = this.getGlobalProceduralLand(vx, vz);

        const landWeight = Math.max(atlantis.weight, globalLand.weight);
        const hillHeight = Math.max(atlantis.hill, globalLand.hill);

        const smoothWeightAbove = Math.pow(Math.max(0.0, Math.min(1.0, landWeight)), 1.2);
        const smoothWeightBelow = Math.pow(Math.max(0.0, Math.min(1.0, landWeight * 1.5)), 1.2);

        const ax = vx - (-3600.0);
        const az = vz - (-3533.33333333);
        const rAtlantis = Math.sqrt(ax * ax + az * az);
        const tx = vx - 4733.33333333;
        const tz = vz - (-4600.0);
        const rTigris = Math.sqrt(tx * tx + tz * tz);
        const blendAtlantis = Math.min(1.0, Math.max(0.0, (rAtlantis - 1620.0) / 140.0));
        const blendTigris   = Math.min(1.0, Math.max(0.0, (rTigris - 1320.0) / 140.0));
        const outerBlend = Math.min(blendAtlantis, blendTigris);

        const cleitoBase = 4.0 + this.noise.noise2d(vx * 0.0065, vz * 0.0065) * 1.10 + this.noise.noise2d(vx * 0.018, vz * 0.018) * 0.32;
        const outerBase  = 4.0 + this.noise.noise2d(vx * 0.022, vz * 0.022) * 2.10 + this.noise.noise2d(vx * 0.065, vz * 0.065) * 0.55;
        const baseHeightRaw = cleitoBase * (1.0 - outerBlend) + outerBase * outerBlend;

        const h0 = Math.max(0.0, baseHeightRaw + hillHeight);
        const yAbove = 32.0 + h0 * smoothWeightAbove;
        if (yAbove >= 40.0) {
            return yAbove;
        }
        // Exact closed-form zero-crossing of getBaseDensity(vx, y, vz) == 0 for 0 < y < 40:
        // Matches y = 40.0 continuously at the exact shoreline with zero false shallow shelf!
        const denom = 8.0 + h0 * Math.max(0.0, smoothWeightBelow - smoothWeightAbove);
        const yExact = (40.0 * h0 * smoothWeightBelow) / denom;
        return Math.max(0.0, Math.min(39.99, yExact));
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
