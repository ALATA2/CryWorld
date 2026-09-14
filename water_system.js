import * as THREE from 'three';

/**
 * WaterSystem
 * Gestisce la presenza dell'acqua, la simulazione idraulica proporzionale
 * per i canali scavati dal giocatore e il rendering dell'acqua che scorre.
 */
export class WaterSystem {
    constructor(scene, terrain, camera, waterNormalsTexture) {
        this.scene = scene;
        this.terrain = terrain;
        this.camera = camera;
        this.voxelScale = 3.0;
        this.seaLevel = 120.0;

        // Limiti della maschera 2D che copre l'intero arcipelago (2048m x 2048m)
        this.maskMinX = -724.0;
        this.maskMinZ = -1024.0;
        this.maskSize = 2048.0;
        this.maskRes = 512;
        this.maskTexelSize = this.maskSize / this.maskRes; // 4.0 metri per texel

        // Texture di mascheratura per il mare globale
        // 0 = Terraferma asciutta (il piano dell'oceano a 120m viene scartato nello shader)
        // 255 = Mare aperto naturale o canale allagato (l'oceano a 120m viene renderizzato)
        this.maskData = new Uint8Array(this.maskRes * this.maskRes);
        this.maskTexture = null;
        this.maskNeedsUpdate = false;

        // Mappatura delle celle scavate sotto quota 120.0m
        // Chiave: "vx,vz"
        this.excavatedCells = new Map();
        this.flowingCells = new Set();
        this.floodedCells = new Set();

        // Mesh dinamica per l'acqua nei canali durante la risalita (FLOWING)
        this.canalMesh = null;
        this.canalGeometry = null;

        // Sintesi audio procedurale per il rumore dell'acqua che scorre
        this.audioCtx = null;
        this.flowAudioNode = null;
        this.flowGainNode = null;
        this.targetAudioVolume = 0;

        this.initMaskTexture();
        this.initCanalMesh();
        this.initAudio();
    }

    /**
     * Inizializza la texture di mascheratura calcolando la costa naturale dell'isola.
     */
    initMaskTexture() {
        const start = performance.now();
        const halfStep = this.maskTexelSize * 0.5;

        for (let tz = 0; tz < this.maskRes; tz++) {
            const wz = this.maskMinZ + tz * this.maskTexelSize + halfStep;
            const vz = Math.round(wz / this.voxelScale);

            for (let tx = 0; tx < this.maskRes; tx++) {
                const wx = this.maskMinX + tx * this.maskTexelSize + halfStep;
                const vx = Math.round(wx / this.voxelScale);
                const idx = tx + tz * this.maskRes;

                // Se è oceano naturale all'esterno dell'isola, mask = 255
                // Se è terraferma dell'isola, mask = 0
                if (this.terrain.isNaturalOcean(vx, vz)) {
                    this.maskData[idx] = 255;
                } else {
                    this.maskData[idx] = 0;
                }
            }
        }

        this.maskTexture = new THREE.DataTexture(
            this.maskData,
            this.maskRes,
            this.maskRes,
            THREE.RedFormat,
            THREE.UnsignedByteType
        );
        this.maskTexture.minFilter = THREE.LinearFilter;
        this.maskTexture.magFilter = THREE.LinearFilter;
        this.maskTexture.needsUpdate = true;

        console.log(`[WaterSystem] Mask texture 512x512 creata in ${(performance.now() - start).toFixed(1)}ms`);
    }

    /**
     * Crea la mesh dinamica che renderizza il pelo dell'acqua nei canali mentre scorre e sale.
     * Utilizza un materiale luminoso e trasparente che non diventa mai nero o opaco.
     */
    initCanalMesh() {
        this.canalGeometry = new THREE.BufferGeometry();
        
        // Materiale brillante per l'acqua in movimento
        const canalMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff, // Bianco per non scurire i vertexColors
            roughness: 0.1,
            metalness: 0.05,
            transparent: true,
            opacity: 0.85,
            vertexColors: true,
            emissive: 0x007799, // Bagliore azzurro turchese per evitare ombre nere
            emissiveIntensity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.canalMesh = new THREE.Mesh(this.canalGeometry, canalMaterial);
        this.canalMesh.frustumCulled = false;
        this.scene.add(this.canalMesh);
    }

    /**
     * Inizializza il generatore audio procedurale per l'acqua che scorre nella breccia.
     */
    initAudio() {
        const initAudioOnGesture = () => {
            if (this.audioCtx) return;
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                this.audioCtx = new AudioContext();

                // Generatore di rumore bianco filtrato (suono naturale di torrente/acqua)
                const bufferSize = this.audioCtx.sampleRate * 2;
                const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1;
                }

                const whiteNoise = this.audioCtx.createBufferSource();
                whiteNoise.buffer = noiseBuffer;
                whiteNoise.loop = true;

                // Filtro passa-banda per frequenze acquatiche (300Hz - 1200Hz)
                const filter = this.audioCtx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(650, this.audioCtx.currentTime);
                filter.Q.setValueAtTime(1.8, this.audioCtx.currentTime);

                this.flowGainNode = this.audioCtx.createGain();
                this.flowGainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);

                whiteNoise.connect(filter);
                filter.connect(this.flowGainNode);
                this.flowGainNode.connect(this.audioCtx.destination);
                whiteNoise.start();

                window.removeEventListener('pointerdown', initAudioOnGesture);
                window.removeEventListener('keydown', initAudioOnGesture);
            } catch (e) {
                // Audio non disponibile o bloccato
            }
        };

        window.addEventListener('pointerdown', initAudioOnGesture);
        window.addEventListener('keydown', initAudioOnGesture);
    }

    /**
     * Converte coordinate voxel in coordinate texel della mask texture,
     * coprendo con precisione l'area della cella per abilitare l'oceano a quota 120m.
     */
    setMaskTexel(vx, vz, value) {
        const wx = vx * this.voxelScale;
        const wz = vz * this.voxelScale;
        const halfV = this.voxelScale * 0.6;

        const tx0 = Math.floor((wx - halfV - this.maskMinX) / this.maskTexelSize);
        const tx1 = Math.floor((wx + halfV - this.maskMinX) / this.maskTexelSize);
        const tz0 = Math.floor((wz - halfV - this.maskMinZ) / this.maskTexelSize);
        const tz1 = Math.floor((wz + halfV - this.maskMinZ) / this.maskTexelSize);

        for (let tz = tz0; tz <= tz1; tz++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                if (tx >= 0 && tx < this.maskRes && tz >= 0 && tz < this.maskRes) {
                    this.maskData[tx + tz * this.maskRes] = value;
                }
            }
        }
        this.maskNeedsUpdate = true;
    }

    /**
     * Chiamato quando il giocatore scava con il manipolatore.
     * Rileva scavi sotto quota 120m e controlla se viene aperta una breccia verso il mare.
     */
    onTerrainExcavated(hitPoint, radius) {
        const rVox = Math.ceil((radius + 1.5) / this.voxelScale);
        const centerVx = Math.round(hitPoint.x / this.voxelScale);
        const centerVz = Math.round(hitPoint.z / this.voxelScale);

        const touchedColumns = [];

        for (let dx = -rVox; dx <= rVox; dx++) {
            for (let dz = -rVox; dz <= rVox; dz++) {
                const vx = centerVx + dx;
                const vz = centerVz + dz;
                const wx = vx * this.voxelScale;
                const wz = vz * this.voxelScale;

                const distSq = (wx - hitPoint.x) * (wx - hitPoint.x) + (wz - hitPoint.z) * (wz - hitPoint.z);
                if (distSq > (radius + 1.5) * (radius + 1.5)) continue;

                // Se è già mare naturale aperto, non necessita di gestione canale
                if (this.terrain.isNaturalOcean(vx, vz)) continue;

                // Cerca la quota del fondo partendo da aria aperta sopra lo scavo
                const searchY = Math.max(this.seaLevel + 1.5, hitPoint.y + 1.0);
                const testPos = new THREE.Vector3(wx, searchY, wz);

                // Se il punto di partenza è roccia solida, non è una trincea a cielo aperto
                if (this.terrain.isPositionSolid(testPos)) continue;

                const floorY = this.terrain.getSurfaceHeight(testPos, searchY);

                // Uno scavo valido per un canale a cielo aperto ha fondo tra 105m e 120m
                // (elimina false letture di fondo abissale a -393m)
                if (floorY >= 105.0 && floorY < this.seaLevel) {
                    const key = `${vx},${vz}`;
                    let cell = this.excavatedCells.get(key);

                    if (!cell) {
                        cell = {
                            vx, vz,
                            worldX: wx,
                            worldZ: wz,
                            floorY: floorY,
                            waterLevel: floorY, // Inizia asciutta sul fondo effettivo dello scavo!
                            state: 'DRY',
                            inflowRate: 0,
                            flowDir: new THREE.Vector2(0, 0),
                            foamIntensity: 0
                        };
                        this.excavatedCells.set(key, cell);
                    } else {
                        // Aggiorna profondità se scavata più a fondo (mantenendo limite ragionevole)
                        cell.floorY = Math.max(105.0, Math.min(cell.floorY, floorY));
                    }
                    touchedColumns.push(cell);
                }
            }
        }

        // Controlla se una delle colonne tocca l'oceano aperto o una cella già allagata
        this.checkBreaches(touchedColumns);
    }

    /**
     * Verifica la presenza di brecce tra le celle asciutte e sorgenti d'acqua.
     */
    checkBreaches(cellsToCheck) {
        const neighbors = [
            { dx: 1, dz: 0 },
            { dx: -1, dz: 0 },
            { dx: 0, dz: 1 },
            { dx: 0, dz: -1 }
        ];

        for (const cell of cellsToCheck) {
            if (cell.state !== 'DRY') continue;

            for (const n of neighbors) {
                const nx = cell.vx + n.dx;
                const nz = cell.vz + n.dz;
                const nwx = nx * this.voxelScale;
                const nwz = nz * this.voxelScale;

                const isOcean = this.terrain.isNaturalOcean(nx, nz);
                const nCell = this.excavatedCells.get(`${nx},${nz}`);
                const isFlooded = nCell && (nCell.state === 'FLOODED' || (nCell.state === 'FLOWING' && nCell.waterLevel > cell.floorY + 0.2));

                if (isOcean || isFlooded) {
                    // Controlla se il varco è aperto verificando che ci sia aria a quota 120m
                    const mx = (cell.worldX + nwx) * 0.5;
                    const mz = (cell.worldZ + nwz) * 0.5;
                    const midPos = new THREE.Vector3(mx, this.seaLevel + 1.0, mz);

                    // Il passaggio deve essere aria aperta (non una barriera solida di roccia)
                    if (this.terrain.isPositionSolid(midPos)) continue;

                    const midFloorY = this.terrain.getSurfaceHeight(midPos, this.seaLevel + 1.0);

                    if (midFloorY >= 105.0 && midFloorY < this.seaLevel) {
                        // BRECCIA APERTA!
                        // Calcolo idraulico: Sezione = Larghezza (3m) x Profondità varco
                        const openingDepth = Math.min(10.0, Math.max(0.3, this.seaLevel - midFloorY));
                        const openingWidth = this.voxelScale; // 3 metri per voxel
                        const inletArea = openingWidth * openingDepth;

                        // Portata volumetrica Q (m³/s) = Area * velocità ingresso (~2.8 m/s)
                        const inflowRate = inletArea * 2.8;

                        cell.state = 'FLOWING';
                        cell.inflowRate = Math.max(cell.inflowRate, inflowRate);
                        cell.flowDir.set(cell.worldX - nwx, cell.worldZ - nwz).normalize();
                        cell.foamIntensity = Math.min(1.0, inflowRate / 18.0);
                        this.flowingCells.add(cell);

                        // Imposta volume audio proporzionato alla portata
                        this.targetAudioVolume = Math.min(0.35, (inflowRate / 40.0) * 0.35);
                        break;
                    }
                }
            }
        }
    }

    /**
     * Loop di aggiornamento fisico e idraulico (chiamato ogni frame).
     */
    update(delta) {
        if (this.flowingCells.size === 0 && !this.maskNeedsUpdate) return;

        const neighbors = [
            { dx: 1, dz: 0 },
            { dx: -1, dz: 0 },
            { dx: 0, dz: 1 },
            { dx: 0, dz: -1 }
        ];

        const cellsToFlood = [];
        const newFlowingCells = [];
        const cellArea = this.voxelScale * this.voxelScale; // 9.0 m²

        for (const cell of this.flowingCells) {
            // Velocità di salita dell'acqua: dY = (Portata / AreaCella) * delta
            // Maggiore la portata della breccia, più rapida è la salita.
            // Più è profondo lo scavo, più volume occorre per colmarlo.
            const riseSpeed = (cell.inflowRate / cellArea);
            const clampedRise = Math.min(riseSpeed, 6.0) * delta;

            cell.waterLevel += clampedRise;

            // Se l'acqua ha raggiunto il livello del mare (120m)
            if (cell.waterLevel >= this.seaLevel) {
                cell.waterLevel = this.seaLevel;
                cell.state = 'FLOODED';
                cell.foamIntensity = 0;
                cellsToFlood.push(cell);
            } else {
                // Calcola intensità schiuma proporzionata alla velocità e vicinanza al fondo
                const fillProgress = (cell.waterLevel - cell.floorY) / Math.max(0.1, this.seaLevel - cell.floorY);
                cell.foamIntensity = (1.0 - fillProgress) * Math.min(1.0, cell.inflowRate / 15.0);
            }

            // Propaga l'acqua alle celle asciutte adiacenti
            for (const n of neighbors) {
                const nx = cell.vx + n.dx;
                const nz = cell.vz + n.dz;
                const nCell = this.excavatedCells.get(`${nx},${nz}`);

                if (nCell && nCell.state === 'DRY') {
                    // Controlla se il varco è aperto e se la quota d'acqua supera il dosso
                    const mx = (cell.worldX + nCell.worldX) * 0.5;
                    const mz = (cell.worldZ + nCell.worldZ) * 0.5;
                    const midPos = new THREE.Vector3(mx, this.seaLevel + 1.0, mz);

                    if (!this.terrain.isPositionSolid(midPos)) {
                        const midFloorY = this.terrain.getSurfaceHeight(midPos, this.seaLevel + 1.0);

                        if (midFloorY >= 105.0 && cell.waterLevel > midFloorY + 0.1) {
                            nCell.state = 'FLOWING';
                            // La portata si distribuisce lungo il canale
                            nCell.inflowRate = cell.inflowRate * 0.92;
                            nCell.flowDir.set(nCell.worldX - cell.worldX, nCell.worldZ - cell.worldZ).normalize();
                            newFlowingCells.push(nCell);
                        }
                    }
                }
            }
        }

        // Applica le transizioni di stato
        for (const cell of cellsToFlood) {
            this.flowingCells.delete(cell);
            this.floodedCells.add(cell);
            // Abilita il mare globale a quota 120m per questa cella
            this.setMaskTexel(cell.vx, cell.vz, 255);
        }

        for (const cell of newFlowingCells) {
            this.flowingCells.add(cell);
        }

        // Se non ci sono più celle che scorrono, sfuma l'audio
        if (this.flowingCells.size === 0) {
            this.targetAudioVolume = 0;
        }

        // Aggiorna volume audio gradualmente
        if (this.flowGainNode && this.audioCtx) {
            const currentVol = this.flowGainNode.gain.value;
            const newVol = currentVol + (this.targetAudioVolume - currentVol) * 5.0 * delta;
            this.flowGainNode.gain.setValueAtTime(Math.max(0, newVol), this.audioCtx.currentTime);
        }

        // Aggiorna texture di mascheratura della GPU se modificata
        if (this.maskNeedsUpdate && this.maskTexture) {
            this.maskTexture.needsUpdate = true;
            this.maskNeedsUpdate = false;
        }

        // Ricostruisce la geometria 3D del pelo dell'acqua nel canale
        this.updateCanalMeshGeometry();
    }

    /**
     * Ricostruisce la mesh 3D locale dell'acqua SOLO per le celle che stanno salendo (FLOWING).
     * Quando una cella è colmata a quota 120m (FLOODED), non viene più disegnata da questa mesh
     * ma direttamente dal mare globale con riflessi perfetti del cielo e onde naturali.
     */
    updateCanalMeshGeometry() {
        const positions = [];
        const normals = [];
        const colors = [];
        const uvs = [];

        const halfV = this.voxelScale * 0.5;

        // Renderizza SOLO le celle attivamente in fase di riempimento (FLOWING)
        // Le celle FLOODED sono renderizzate direttamente dal piano mare globale
        const activeCells = [...this.flowingCells];

        for (const cell of activeCells) {
            const y = cell.waterLevel;
            const x0 = cell.worldX - halfV;
            const x1 = cell.worldX + halfV;
            const z0 = cell.worldZ - halfV;
            const z1 = cell.worldZ + halfV;

            // Colore: blu turchese caraibico brillante sfumato verso il bianco della schiuma
            const foam = Math.min(1.0, Math.max(0.0, cell.foamIntensity || 0));
            const cr = THREE.MathUtils.lerp(0.0, 1.0, foam);
            const cg = THREE.MathUtils.lerp(0.74, 1.0, foam);
            const cb = THREE.MathUtils.lerp(0.83, 1.0, foam);

            // Triangolo 1 (x0, z0) -> (x0, z1) -> (x1, z1)
            positions.push(x0, y, z0,  x0, y, z1,  x1, y, z1);
            normals.push(0, 1, 0,  0, 1, 0,  0, 1, 0);
            colors.push(cr, cg, cb,  cr, cg, cb,  cr, cg, cb);
            uvs.push(x0 * 0.2, z0 * 0.2,  x0 * 0.2, z1 * 0.2,  x1 * 0.2, z1 * 0.2);

            // Triangolo 2 (x0, z0) -> (x1, z1) -> (x1, z0)
            positions.push(x0, y, z0,  x1, y, z1,  x1, y, z0);
            normals.push(0, 1, 0,  0, 1, 0,  0, 1, 0);
            colors.push(cr, cg, cb,  cr, cg, cb,  cr, cg, cb);
            uvs.push(x0 * 0.2, z0 * 0.2,  x1 * 0.2, z1 * 0.2,  x1 * 0.2, z0 * 0.2);
        }

        if (positions.length > 0) {
            this.canalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            this.canalGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            this.canalGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            this.canalGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            this.canalMesh.visible = true;
        } else {
            this.canalMesh.visible = false;
        }
    }

    /**
     * Ritorna la quota dell'acqua a qualsiasi coordinata del mondo.
     * Utilizzato dalla fisica del giocatore per determinare se si trova in acqua o all'asciutto.
     */
    getWaterLevelAt(worldX, worldZ) {
        // Fuori dai limiti della maschera è sempre oceano naturale a 120.0m
        if (worldX < this.maskMinX || worldX > (this.maskMinX + this.maskSize) ||
            worldZ < this.maskMinZ || worldZ > (this.maskMinZ + this.maskSize)) {
            return this.seaLevel;
        }

        const vx = Math.round(worldX / this.voxelScale);
        const vz = Math.round(worldZ / this.voxelScale);

        // Se è oceano naturale all'esterno delle isole
        if (this.terrain.isNaturalOcean(vx, vz)) {
            return this.seaLevel;
        }

        // Se è un canale scavato
        const cell = this.excavatedCells.get(`${vx},${vz}`);
        if (cell) {
            if (cell.state === 'FLOODED') {
                return this.seaLevel;
            }
            if (cell.state === 'FLOWING' && cell.waterLevel > cell.floorY + 0.15) {
                return cell.waterLevel;
            }
        }

        // Terraferma asciutta o canale non ancora allagato
        return -999.0;
    }
}
