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
const _sandColor = new THREE.Color(0xfffdf0); // Ultra bright white coral sand (Maldives style)
const _grassColor = new THREE.Color(0x4cd137); // Bright tropical lime green
const _rockColor = new THREE.Color(0x95a5a6);  // Soft light grey granite rock
const _seabedColor = new THREE.Color(0x0096b2); // Vibrant tropical turquoise-blue

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
    if (Math.abs(isolevel - val1) < 0.00001) return target.copy(p1);
    if (Math.abs(isolevel - val2) < 0.00001) return target.copy(p2);
    if (Math.abs(val1 - val2) < 0.00001) return target.copy(p1);
    
    const mu = (isolevel - val1) / (val2 - val1);
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
    const dz = terrain.getDensity(rx, ry, rz + 1) - terrain.getDensity(rx, ry, rz - 1);
    
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (len === 0) {
        return target.set(0, 1, 0);
    }
    return target.set(-dx / len, -dy / len, -dz / len).normalize();
}

function getColorAt(worldY, normal, target) {
    const slope = normal.y; // 1.0 = flat upwards, 0.0 = vertical wall
    
    if (slope < 0.60) {
        // Very steep cliffs are always light grey granite rock
        target.copy(_rockColor);
    } else {
        // Maldives style beach (sea level is 120.0m)
        if (worldY < 125.0) {
            // Under sea level Y=120.0m
            if (worldY < 120.0) {
                // Seabed: transition sand color into a tropical turquoise color to avoid flat white/grey square under water
                const depthFactor = Math.min((120.0 - worldY) / 120.0, 1.0);
                target.lerpColors(_sandColor, _seabedColor, depthFactor);
            } else {
                target.copy(_sandColor);
            }
        } else if (worldY < 128.0) {
            // Beach to grass transition (125m to 128m)
            const t = (worldY - 125.0) / 3.0;
            target.lerpColors(_sandColor, _grassColor, t);
        } else if (worldY < 155.0) {
            // Grass slopes
            target.copy(_grassColor);
        } else if (worldY < 165.0) {
            // Grass to rock transition
            const t = (worldY - 155.0) / 10.0;
            target.lerpColors(_grassColor, _rockColor, t);
        } else {
            target.copy(_rockColor);
        }
        
        // Blend slopes that are slightly steep towards rock
        if (slope < 0.75) {
            const t = (0.75 - slope) / 0.15;
            target.lerp(_rockColor, t);
        }
    }
    
    // Add subtle noise/shading variation
    const noise = (Math.random() - 0.5) * 0.04;
    target.r = Math.min(1.0, Math.max(0.0, target.r + noise));
    target.g = Math.min(1.0, Math.max(0.0, target.g + noise));
    target.b = Math.min(1.0, Math.max(0.0, target.b + noise));
    
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
                        getColorAt(pt0.y * voxelScale, _tempNormal, _tempColor0);
                        
                        _tempNormal.set(n1x, n1y, n1z);
                        getColorAt(pt1.y * voxelScale, _tempNormal, _tempColor1);
                        
                        _tempNormal.set(n2x, n2y, n2z);
                        getColorAt(pt2.y * voxelScale, _tempNormal, _tempColor2);

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
        
        this.chunksY = Math.ceil(height / this.chunkSize);

        // Core terrain material with Vertex Colors and flat low-poly shading
        this.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            metalness: 0.05,
            flatShading: true, // Crucial for low-poly faceted look!
            side: THREE.FrontSide
        });

        // Sparse map for modified voxels: key is "x,y,z"
        this.modifiedVoxels = new Map();
        this.modifiedColumns = new Set();
        
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
        if (y < 0 || y >= this.height) {
            return -1.0;
        }
        if (x < -3666 || x > 3666 || z < -3666 || z > 3666) {
            return -1.0;
        }
        
        const key = `${x},${y},${z}`;
        if (this.modifiedVoxels.has(key)) {
            return this.modifiedVoxels.get(key);
        }
        return this.getBaseDensity(x, y, z);
    }

    setDensity(x, y, z, value) {
        if (y < 0 || y >= this.height) return;
        if (x < -3666 || x > 3666 || z < -3666 || z > 3666) return;
        
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
                    }
                }
            }
        }
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
        
        // Combine land weights of atoll and volcano
        const landWeight = Math.max(atollWeight, volcanoWeight);
        
        // Smooth falloffs
        const smoothWeightAbove = Math.pow(Math.min(1.0, landWeight), 1.2);
        const smoothWeightBelow = Math.pow(Math.min(1.0, landWeight * 1.5), 1.2);
        
        // Base terrain height factor using Perlin Noise fBm
        const n1 = this.noise.noise2d(x * 0.03, z * 0.03) * 3.5;
        const n2 = this.noise.noise2d(x * 0.10, z * 0.10) * 1.0;
        const baseHeightRaw = 4.0 + n1 + n2;
        
        // Calculate hill heights
        let hillHeight = 0;
        
        // Atoll hill height
        if (distFromAtoll < 22.0) {
            const t = 1.0 - distFromAtoll / 22.0;
            hillHeight = Math.max(hillHeight, 11.0 * Math.pow(t, 1.3));
        }
        
        // Volcano hill height with a central crater bowl (lower and flatter)
        if (distToVolcano < 42.0) {
            const t = 1.0 - distToVolcano / 42.0;
            let vHill = 9.0 * Math.pow(t, 1.3); // Lower height (9 voxels max, around 27m above base height)
            
            // Subtract a bowl for the crater at the very center of the volcano island (distance < 10 voxels)
            if (distToVolcano < 10.0) {
                const craterT = 1.0 - distToVolcano / 10.0;
                vHill -= 4.5 * Math.pow(craterT, 1.5); // Crater depression
            }
            hillHeight = Math.max(hillHeight, vHill);
        }
        
        let density = 0;
        if (y >= 40) {
            const finalHeight = baseHeightRaw * smoothWeightAbove + hillHeight * smoothWeightAbove;
            density = finalHeight - (y - 32);
        } else {
            const blend = y / 40.0;
            const mask = blend * smoothWeightAbove + (1.0 - blend) * smoothWeightBelow;
            const finalHeight = baseHeightRaw * mask + hillHeight * mask;
            density = finalHeight - (y * 0.2);
        }
        
        // Add 3D bumpy noise for organic detail
        const noiseY = y >= 40 ? (y - 32) : (y * 0.2);
        const finalHeightAbove = baseHeightRaw * smoothWeightAbove + hillHeight * smoothWeightAbove;
        if (noiseY > 1 && noiseY < finalHeightAbove + 2) {
            const bumpyNoise = this.noise.noise3d(x * 0.12, noiseY * 0.12, z * 0.12) * 1.8;
            density += bumpyNoise;
        }
        
        // Keep ocean floor flat and solid at y === 0
        if (y === 0) {
            density = 1.0;
        }
        
        return density;
    }

    updateChunksAroundPlayer(playerPos, renderDistance = 600) {
        const pvx = Math.floor(playerPos.x / this.voxelScale);
        const pvy = Math.floor(playerPos.y / this.voxelScale);
        const pvz = Math.floor(playerPos.z / this.voxelScale);
        
        const pcx = Math.floor(pvx / this.chunkSize);
        const pcy = Math.floor(pvy / this.chunkSize);
        const pcz = Math.floor(pvz / this.chunkSize);
        
        const chunkRadius = Math.ceil(renderDistance / (this.chunkSize * this.voxelScale));
        
        const activeKeys = new Set();
        let queueChanged = false;
        
        // Loop through chunks in a cylinder around player
        for (let cx = pcx - chunkRadius; cx <= pcx + chunkRadius; cx++) {
            for (let cz = pcz - chunkRadius; cz <= pcz + chunkRadius; cz++) {
                // Keep within 22km limits (cx from -229 to 229)
                if (cx < -229 || cx > 229 || cz < -229 || cz > 229) continue;
                
                for (let cy = 0; cy < this.chunksY; cy++) {
                    const dx = cx - pcx;
                    const dz = cz - pcz;
                    if (dx*dx + dz*dz > chunkRadius * chunkRadius) continue;
                    
                    const key = `${cx},${cy},${cz}`;
                    activeKeys.add(key);
                    
                    if (!this.loadedChunks.has(key)) {
                        const chunk = new VoxelChunk(cx, cy, cz, this);
                        this.loadedChunks.set(key, chunk);
                        this.group.add(chunk.mesh);
                        this.chunkBuildQueue.push(chunk);
                        queueChanged = true;
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
                    queueChanged = true;
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

        // Rebuild a max of 16 chunks per frame to avoid blocking the main thread and catch up faster
        const buildsPerFrame = 16;
        let builtCount = 0;
        while (this.chunkBuildQueue.length > 0 && builtCount < buildsPerFrame) {
            const chunk = this.chunkBuildQueue.shift();
            if (chunk.dirty) {
                chunk.rebuild();
                builtCount++;
            }
        }

        // Diagnostics for debugging missing chunk columns around the player
        if (!this.debugTimer) this.debugTimer = 0;
        this.debugTimer++;
        if (this.debugTimer % 180 === 0) {
            console.groupCollapsed(`--- CHUNK DIAGNOSTICS (pcx=${pcx}, pcz=${pcz}, Queue=${this.chunkBuildQueue.length}) ---`);
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const cx = pcx + dx;
                    const cz = pcz + dz;
                    const states = [];
                    for (let cy = 0; cy < this.chunksY; cy++) {
                        const key = `${cx},${cy},${cz}`;
                        const chunk = this.loadedChunks.get(key);
                        if (chunk) {
                            const posCount = chunk.geometry.attributes.position ? chunk.geometry.attributes.position.count : 0;
                            states.push(`cy=${cy}:v=${posCount}${chunk.dirty ? '(D)' : ''}`);
                        } else {
                            states.push(`cy=${cy}:NL`);
                        }
                    }
                    console.log(`Col (${cx},${cz}): ${states.join(" | ")}`);
                }
            }
            console.groupEnd();
        }

        // Automatic missing terrain and queue diagnostics
        if (!this.checkTimer) this.checkTimer = 0;
        this.checkTimer++;
        if (this.checkTimer % 180 === 0) {
            let dirtyCount = 0;
            let missingTerrainCount = 0;
            const size = this.chunkSize;
            
            for (const key of activeKeys) {
                const chunk = this.loadedChunks.get(key);
                if (chunk) {
                    if (chunk.dirty) {
                        dirtyCount++;
                    } else {
                        const posCount = chunk.geometry.attributes.position ? chunk.geometry.attributes.position.count : 0;
                        if (posCount === 0) {
                            // Check if the chunk should procedurally contain solid terrain
                            let shouldHaveTerrain = false;
                            for (let i = 0; i <= size; i += 4) {
                                for (let j = 0; j <= size; j += 4) {
                                    for (let k = 0; k <= size; k += 4) {
                                        const vx = chunk.cx * size + i;
                                        const vy = chunk.cy * size + j;
                                        const vz = chunk.cz * size + k;
                                        if (this.getBaseDensity(vx, vy, vz) > 0.1) {
                                            shouldHaveTerrain = true;
                                            break;
                                        }
                                    }
                                    if (shouldHaveTerrain) break;
                                }
                                if (shouldHaveTerrain) break;
                            }
                            if (shouldHaveTerrain) {
                                missingTerrainCount++;
                                if (missingTerrainCount <= 5) {
                                    console.warn(`[Missing Terrain] Chunk (${chunk.cx}, ${chunk.cy}, ${chunk.cz}) has 0 vertices but should be solid!`);
                                }
                            }
                        }
                    }
                }
            }
            if (dirtyCount > 0) {
                console.log(`[Queue Status] Active dirty chunks: ${dirtyCount} | Queue size: ${this.chunkBuildQueue.length}`);
            }
            if (missingTerrainCount > 5) {
                console.warn(`[Missing Terrain] ... and ${missingTerrainCount - 5} more chunks have 0 vertices but should be solid!`);
            }
        }
    }

    update() {
        // Rebuild loaded dirty chunks
        for (const chunk of this.loadedChunks.values()) {
            if (chunk.dirty) {
                chunk.rebuild();
            }
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

        const xMin = Math.max(-3666, vx - rVox);
        const xMax = Math.min(3666, vx + rVox);
        const yMin = Math.max(1, vy - rVox); // Prevent digging the ocean floor level (y=0)
        const yMax = Math.min(this.height - 1, vy + rVox);
        const zMin = Math.max(-3666, vz - rVox);
        const zMax = Math.min(3666, vz + rVox);

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

    // Physics helper: sample density at any continuous position to determine if solid
    isPositionSolid(worldPosition) {
        const localPos = worldPosition.clone().divideScalar(this.voxelScale);
        
        const fx = Math.floor(localPos.x);
        const fy = Math.floor(localPos.y);
        const fz = Math.floor(localPos.z);

        if (fy < 0 || fy >= this.height - 1 || fx < -3666 || fx >= 3666 || fz < -3666 || fz >= 3666) {
            return worldPosition.y <= 0;
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

        const tx = localPos.x - fx;
        const ty = localPos.y - fy;
        const tz = localPos.z - fz;

        // Trilinear interpolation interpolation
        const d00 = d000 * (1 - tx) + d100 * tx;
        const d10 = d010 * (1 - tx) + d110 * tx;
        const d01 = d001 * (1 - tx) + d101 * tx;
        const d11 = d011 * (1 - tx) + d111 * tx;

        const d0 = d00 * (1 - ty) + d10 * ty;
        const d1 = d01 * (1 - ty) + d11 * ty;

        const density = d0 * (1 - tz) + d1 * tz;

        return density >= 0.0;
    }

    // Walk height solver: returns the exact surface height Y under a world coordinate
    getSurfaceHeight(worldPosition, startHeight = 64) {
        const testPos = worldPosition.clone();
        testPos.y = startHeight;
        
        // Step downwards in larger voxel-sized steps (voxelScale = 3.0)
        const step = 3.0;
        while (testPos.y > 0) {
            if (this.isPositionSolid(testPos)) {
                // Find exact boundary Y using a mini binary search
                let low = testPos.y;
                let high = testPos.y + step;
                for (let b = 0; b < 6; b++) {
                    const mid = (low + high) / 2.0;
                    testPos.y = mid;
                    if (this.isPositionSolid(testPos)) {
                        low = mid;
                    } else {
                        high = mid;
                    }
                }
                return low;
            }
            testPos.y -= step;
        }
        return 0; // Water level base Y
    }

    getEstimatedSurfaceHeight(vx, vz) {
        const distFromCenter = Math.sqrt(vx * vx + vz * vz);
        
        // Main spawn island at center (radius of 90 voxels)
        const spawnIslandWeight = Math.max(0.0, 1.0 - distFromCenter / 90.0);
        
        // Procedural islands noise (archipelago)
        const landNoise = this.noise.noise2d(vx * 0.003, vz * 0.003);
        const islandNoiseWeight = Math.max(0.0, (landNoise + 0.1) * 1.5);
        
        const landWeight = Math.max(spawnIslandWeight, islandNoiseWeight);
        
        const smoothWeightAbove = Math.pow(Math.min(1.0, landWeight), 1.3);
        const smoothWeightBelow = Math.pow(Math.min(1.0, landWeight * 1.6), 1.3);
        
        const n1 = this.noise.noise2d(vx * 0.03, vz * 0.03) * 3.5;
        const n2 = this.noise.noise2d(vx * 0.10, vz * 0.10) * 1.0;
        const baseHeightRaw = 4.0 + n1 + n2;
        
        let hillHeight = 0;
        if (distFromCenter < 25.0) {
            const t = 1.0 - distFromCenter / 25.0;
            hillHeight = 3.5 * Math.pow(t, 1.4);
        }
        
        let estimatedY = 0;
        const yAbove = 32.0 + (baseHeightRaw + hillHeight) * smoothWeightAbove;
        if (yAbove >= 40.0) {
            estimatedY = yAbove;
        } else {
            estimatedY = 5.0 * (baseHeightRaw + hillHeight) * smoothWeightBelow;
            if (estimatedY > 40.0) estimatedY = 40.0;
        }
        
        return Math.max(0.0, Math.floor(estimatedY));
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
