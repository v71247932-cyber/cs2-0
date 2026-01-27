import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- Global Variables ---
let camera, scene, renderer, controls, weapon;
let currentWeaponType = 'pistol'; // pistol, ak47, knife
let isFiring = false;
let lastShotTime = 0;
let fireRate = 0; // ms between shots
let inspectTimer = 0;
const INSPECT_DURATION = 2.5; // seconds
let recoilCounter = 0; // Counts bullets for spray pattern
const objects = []; // For collision (optional/simple)
const objectBoxes = []; // Precomputed Bounding Boxes for optimization
const enemies = [];
const bullets = [];
const enemyBullets = [];
const impacts = [];
let raycaster;

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let isCrouching = false;
const PLAYER_STAND_HEIGHT = 10;
const PLAYER_CROUCH_HEIGHT = 5;
const PLAYER_RADIUS = 2.5;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Game State
let health = 100;
let score = 0; // Kills? Or rounds?
let isGameOver = false;

// Round System
let playerWins = 0;
let enemyWins = 0;
let roundActive = false;
const MAX_WINS = 10;
const enemiesPerRound = 5;

// AI Logic
const enemyFireRate = 1000; // ms
const aiVisionRange = 500;
const enemySpeed = 15;

// Weapon Configs (Ammo)
const weaponConfigs = {
    'ak47': { magSize: 30, reserve: 120, name: 'AK-47', fireRate: 100 },
    'pistol': { magSize: 12, reserve: 36, name: 'USP-S', fireRate: 200 },
    'knife': { magSize: Infinity, reserve: Infinity, name: 'Knife', fireRate: 500 }
};

let weaponAmmo = {
    'ak47': { mag: 30, reserve: 120 },
    'pistol': { mag: 12, reserve: 36 },
    'knife': { mag: Infinity, reserve: Infinity }
};

let isReloading = false;

// DOM Elements
const instructionScreen = document.getElementById('instructions');
const hud = document.getElementById('hud');
const gameOverScreen = document.getElementById('game-over');
const healthDisplay = document.getElementById('health');
const scoreDisplay = document.getElementById('score');
const finalScoreDisplay = document.getElementById('final-score');
const ammoDisplay = document.createElement('div');
ammoDisplay.id = 'ammo';
ammoDisplay.style.position = 'absolute';
ammoDisplay.style.bottom = '20px';
ammoDisplay.style.right = '20px';
ammoDisplay.style.color = '#fff';
ammoDisplay.style.fontSize = '32px';
ammoDisplay.style.fontFamily = 'monospace';
ammoDisplay.style.textShadow = '2px 2px 4px #000';
hud.appendChild(ammoDisplay);

function init() {
    // 1. Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky Blue
    scene.fog = new THREE.Fog(0x87CEEB, 10, 1000);

    // 2. Setup Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.y = 10;

    // 3. Setup Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6); // Soft white overall
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8); // Sunlight
    dirLight.position.set(100, 200, 100);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 4. Setup Controls
    controls = new PointerLockControls(camera, document.body);

    // --- Weapon System ---
    switchWeapon('ak47'); // Start with AK-47 as requested






    // Add instruction listeners

    // Add instruction listeners
    instructionScreen.addEventListener('click', function () {
        controls.lock();
    });

    controls.addEventListener('lock', function () {
        instructionScreen.style.display = 'none';
        hud.style.display = 'block';
    });

    controls.addEventListener('unlock', function () {
        if (!isGameOver) {
            instructionScreen.style.display = 'flex';
            hud.style.display = 'none';
        }
    });

    scene.add(controls.getObject());

    // 5. Input Listeners
    const onKeyDown = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = true;
                break;
            case 'Space':
                if (canJump === true) velocity.y += 200;
                canJump = false;
                break;
            case 'Digit1':
                switchWeapon('ak47');
                break;
            case 'Digit2':
                switchWeapon('pistol');
                break;
            case 'Digit3':
                switchWeapon('knife');
                break;
            case 'KeyF':
                if (!isFiring) {
                    inspectTimer = INSPECT_DURATION;
                }
                break;
            case 'KeyR':
                reload();
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                isCrouching = true;
                break;
        }
    };

    const onKeyUp = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                isCrouching = false;
                break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Shoot Listener (MouseDown)
    document.addEventListener('mousedown', function (event) {
        if (controls.isLocked) {
            isFiring = true;
            if (currentWeaponType !== 'ak47') {
                shoot(); // Fire once immediately for semi-auto / melee
            }
        }
    });

    document.addEventListener('mouseup', function (event) {
        isFiring = false;
        // Reset weapon kick rotation if held
        if (weapon) {
            // Let animate loop handle lerp
        }
    });

    // 6. World Objects (Mirage Theme)
    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 10);

    // Floor (Sandstone)
    let floorGeometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2);

    let floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xdbc295, // Sandstone light
        roughness: 0.9
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    scene.add(floor);

    // Create Mirage-like Map (A Site Blockout)
    createMirageMap();

    // 7. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize);

    // Start Logic
    startRound();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function switchWeapon(type) {
    inspectTimer = 0; // Cancel inspect if active
    if (weapon) {
        camera.remove(weapon);
    }
    weapon = new THREE.Group();
    camera.add(weapon);
    currentWeaponType = type;

    // Reset offset
    weapon.position.set(1.2, -1.8, -2.0);

    if (type === 'pistol') {
        createPistol(weapon);
        fireRate = weaponConfigs['pistol'].fireRate;
    } else if (type === 'ak47') {
        createAK47(weapon);
        fireRate = weaponConfigs['ak47'].fireRate;
    } else if (type === 'knife') {
        createKnife(weapon);
        fireRate = weaponConfigs['knife'].fireRate;
    }

    // Update UI
    updateAmmoDisplay();

    // EQUIP ANIMATION (Initial State)
    weapon.rotation.x = -Math.PI / 2; // Point down
    weapon.position.y = -3.0; // Start lower

}

function createPistol(group) {
    const loader = new THREE.TextureLoader();
    const printstreamTex = loader.load('usp_printstream.png');

    // Materials - Precise Printstream Colors
    const silkWhiteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: printstreamTex,
        roughness: 0.2,
        metalness: 0.3,
        side: THREE.DoubleSide
    });

    const matteBlackMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.8,
        side: THREE.DoubleSide
    });

    const accentPearlescent = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.9,
        roughness: 0.1,
        iridescence: 1.0,
        iridescenceIOR: 1.3,
        side: THREE.DoubleSide
    });

    // 1. Silencer (Cylinder) - Distinctive fat white cylinder
    const silencerGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.4, 32);
    silencerGeo.rotateX(-Math.PI / 2);
    const silencer = new THREE.Mesh(silencerGeo, silkWhiteMat);
    silencer.position.set(0, 0.15, -1.5);
    group.add(silencer);

    // Silencer Connector (Ring)
    const connGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.1, 32);
    connGeo.rotateX(-Math.PI / 2);
    const connector = new THREE.Mesh(connGeo, accentPearlescent);
    connector.position.set(0, 0.15, -0.85);
    group.add(connector);

    // 2. Slide (Top Body) - White, sleek
    const slideGeo = new THREE.BoxGeometry(0.36, 0.42, 1.4);
    const slide = new THREE.Mesh(slideGeo, silkWhiteMat);
    slide.position.set(0, 0.2, -0.1);
    group.add(slide);

    // 3. Lower Body (Frame) - Black
    const frameGeo = new THREE.BoxGeometry(0.34, 0.3, 1.3);
    const frame = new THREE.Mesh(frameGeo, matteBlackMat);
    frame.position.set(0, -0.1, -0.1);
    group.add(frame);

    // 4. Handle (Grip) - Black, textured angled
    const handleGeo = new THREE.BoxGeometry(0.35, 1.0, 0.6);
    const handle = new THREE.Mesh(handleGeo, matteBlackMat);
    handle.position.set(0, -0.6, 0.4);
    handle.rotation.x = 0.25;
    group.add(handle);

    // 5. Trigger Guard & Details
    const guardGeo = new THREE.BoxGeometry(0.1, 0.05, 0.4);
    const guard = new THREE.Mesh(guardGeo, matteBlackMat);
    guard.position.set(0, -0.35, 0.0);
    guard.rotation.x = 0.4;
    group.add(guard);

    const guardVGeo = new THREE.BoxGeometry(0.1, 0.25, 0.05);
    const guardV = new THREE.Mesh(guardVGeo, matteBlackMat);
    guardV.position.set(0, -0.25, -0.2);
    group.add(guardV);

    // 6. Magazine Base
    const magGeo = new THREE.BoxGeometry(0.34, 0.1, 0.56);
    const mag = new THREE.Mesh(magGeo, silkWhiteMat); // White base on Printstream
    mag.position.set(0, -0.95, 0.5);
    group.add(mag);
}

function createAK47(group) {
    // Materials
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 }); // Brown wood
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 }); // Black metal
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });

    // 1. Barrel (Long thin cylinder)
    const barrelGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 16);
    barrelGeo.rotateX(-Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.position.set(0, 0.2, -1.8);
    group.add(barrel);

    // 2. Gas Tube (Top of barrel)
    const gasTubeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.5, 16);
    gasTubeGeo.rotateX(-Math.PI / 2);
    const gasTube = new THREE.Mesh(gasTubeGeo, metalMat);
    gasTube.position.set(0, 0.32, -1.5);
    group.add(gasTube);

    // 3. Handguard (Wood) - Lower part
    const handguardGeo = new THREE.BoxGeometry(0.25, 0.3, 1.2);
    const handguard = new THREE.Mesh(handguardGeo, woodMat);
    handguard.position.set(0, 0.15, -1.2);
    group.add(handguard);

    // 4. Receiver (Main Body) - Metal
    const receiverGeo = new THREE.BoxGeometry(0.3, 0.4, 1.2);
    const receiver = new THREE.Mesh(receiverGeo, darkMetalMat);
    receiver.position.set(0, 0.2, 0.1);
    group.add(receiver);

    // 5. Stock (Wood) - Back part
    const stockGeo = new THREE.BoxGeometry(0.25, 0.5, 1.0);
    const stock = new THREE.Mesh(stockGeo, woodMat);
    stock.position.set(0, 0.0, 1.2);
    stock.rotation.x = 0.1; // Angled down slightly
    group.add(stock);

    // 6. Pistol Grip (Wood/Plastic)
    const gripGeo = new THREE.BoxGeometry(0.25, 0.6, 0.4);
    const grip = new THREE.Mesh(gripGeo, woodMat);
    grip.position.set(0, -0.4, 0.2);
    grip.rotation.x = 0.2;
    group.add(grip);

    // 7. Magazine (Signature Curve)
    const magGeo = new THREE.BoxGeometry(0.28, 1.2, 0.4);
    const mag = new THREE.Mesh(magGeo, metalMat); // Usually metal (orange for bakelite?) lets stick to metal
    mag.position.set(0, -0.6, -0.3);
    mag.rotation.x = 0.4; // Curve forward
    group.add(mag);

    // 8. Sight (Front & Rear)
    const frontSightGeo = new THREE.BoxGeometry(0.05, 0.2, 0.05);
    const frontSight = new THREE.Mesh(frontSightGeo, metalMat);
    frontSight.position.set(0, 0.35, -2.8);
    group.add(frontSight);
}

function createKnife(group) {
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.4 });
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.95, roughness: 0.05 });
    const pivotMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.2 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xff6600, metalness: 0.7, roughness: 0.3 });

    // Create butterfly knife container - positioned to be visible in first person
    const butterflyKnife = new THREE.Group();
    butterflyKnife.position.set(0.3, -0.2, -0.8);
    butterflyKnife.rotation.y = Math.PI / 8;
    butterflyKnife.rotation.x = Math.PI / 12;
    butterflyKnife.rotation.z = -Math.PI / 16;

    // Blade (center) - longer and more visible
    const bladeGeo = new THREE.BoxGeometry(0.04, 0.15, 1.3);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, 0, -0.35);
    butterflyKnife.add(blade);

    // Blade tip (pointed)
    const tipGeo = new THREE.ConeGeometry(0.08, 0.25, 4);
    tipGeo.rotateX(Math.PI / 2);
    const tip = new THREE.Mesh(tipGeo, bladeMat);
    tip.position.set(0, 0, -1.1);
    butterflyKnife.add(tip);

    // Pivot points (small cylinders where handles rotate)
    const pivotGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.18, 12);
    pivotGeo.rotateZ(Math.PI / 2);

    const pivotTop = new THREE.Mesh(pivotGeo, pivotMat);
    pivotTop.position.set(0, 0.09, 0.25);
    butterflyKnife.add(pivotTop);

    const pivotBottom = new THREE.Mesh(pivotGeo, pivotMat);
    pivotBottom.position.set(0, -0.09, 0.25);
    butterflyKnife.add(pivotBottom);

    // Handle 1 (top) - rotates around pivot
    const handle1Group = new THREE.Group();
    handle1Group.position.set(0, 0.09, 0.25);

    const handleGeo1 = new THREE.BoxGeometry(0.09, 0.15, 1.2);
    const handle1 = new THREE.Mesh(handleGeo1, handleMat);
    handle1.position.set(0, 0, 0.6);
    handle1Group.add(handle1);

    // Orange accent stripe
    const accent1Geo = new THREE.BoxGeometry(0.095, 0.05, 0.18);
    const accent1 = new THREE.Mesh(accent1Geo, accentMat);
    accent1.position.set(0, 0, 0.9);
    handle1Group.add(accent1);

    butterflyKnife.add(handle1Group);

    // Handle 2 (bottom) - rotates around pivot
    const handle2Group = new THREE.Group();
    handle2Group.position.set(0, -0.09, 0.25);

    const handleGeo2 = new THREE.BoxGeometry(0.09, 0.15, 1.2);
    const handle2 = new THREE.Mesh(handleGeo2, handleMat);
    handle2.position.set(0, 0, 0.6);
    handle2Group.add(handle2);

    // Orange accent stripe
    const accent2Geo = new THREE.BoxGeometry(0.095, 0.05, 0.18);
    const accent2 = new THREE.Mesh(accent2Geo, accentMat);
    accent2.position.set(0, 0, 0.9);
    handle2Group.add(accent2);

    butterflyKnife.add(handle2Group);

    // Store references for animation
    group.userData.butterflyHandles = {
        handle1: handle1Group,
        handle2: handle2Group
    };

    group.add(butterflyKnife);
}



function createMirageMap() {
    // Materials
    const sandstoneMain = new THREE.MeshStandardMaterial({ color: 0xe6c29a, roughness: 0.9, side: THREE.DoubleSide }); // Light beige walls
    const sandstoneDark = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.9, side: THREE.DoubleSide }); // Darker trim
    const woodNew = new THREE.MeshStandardMaterial({ color: 0x8f6a4e, roughness: 0.8, side: THREE.DoubleSide }); // Clean wood (crates)
    const woodOld = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 1.0, side: THREE.DoubleSide }); // Dark scaffolding wood
    const floorTile = new THREE.MeshStandardMaterial({ color: 0xdcbfa6, roughness: 0.8, side: THREE.DoubleSide }); // Floor
    const darkSpace = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide }); // For "inside" doorways

    // Helper to add box
    function addBox(x, y, z, w, h, d, mat, rotY = 0, collidable = true) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.rotation.y = rotY;
        scene.add(mesh);
        if (collidable) {
            objects.push(mesh);
            // Compute and store bounding box
            const box = new THREE.Box3().setFromObject(mesh);
            objectBoxes.push(box);
        }
        return mesh;
    }

    // --- 1. Palace / Scaffolding Area (Left side of image) ---
    // The wooden platform
    addBox(60, 0, 10, 30, 12, 40, woodOld);
    // The "Roof" / Palace Entrance overhang
    addBox(60, 25, 10, 30, 2, 40, sandstoneMain);
    // Pillars holding the overhang
    addBox(50, 12, 25, 2, 13, 2, sandstoneDark);
    addBox(50, 12, -5, 2, 13, 2, sandstoneDark);

    // Dark Entrance to Palace
    addBox(70, 12, 10, 5, 10, 10, darkSpace);

    // --- 2. A-Ramp Walls (Where we are standing) ---
    // Left Wall (near Palace)
    addBox(40, 0, 40, 5, 20, 40, sandstoneMain);
    // Right Wall (Tetris side)
    addBox(-30, 0, 40, 5, 15, 40, sandstoneMain);

    // --- 3. Tetris (The boxes in front of Ramp) ---
    // Concrete-ish base or crate stack
    addBox(-20, 0, 10, 12, 10, 12, sandstoneDark);
    addBox(-20, 0, 22, 12, 6, 8, sandstoneDark);

    // --- 4. A-Site Structure (Triple / Firebox area) ---
    // Triple Box stack (Central view)
    addBox(0, 0, -30, 12, 12, 12, woodNew);
    addBox(12, 0, -35, 12, 8, 12, woodNew);

    // --- 5. Stairs (Background) ---
    // The stairs leading to Connector/Jungle
    for (let i = 0; i < 8; i++) {
        addBox(-40 - (i * 3), 0 + (i * 1.5), -20, 8, 2 + (i * 3), 20, sandstoneMain);
    }
    // Jungle / Connector platform
    addBox(-70, 0, -20, 30, 18, 25, sandstoneMain);
    // Arches / Window visual details
    addBox(-70, 18, -20, 30, 15, 25, sandstoneMain); // Upper wall

    // --- 6. Sandwich / Stairs Wall (Far back right) ---
    addBox(-40, 0, -50, 10, 25, 60, sandstoneMain);

    // --- 7. CT/Ticket Booth (Far Left Background) ---
    addBox(40, 0, -60, 10, 15, 10, sandstoneMain); // Ticket booth

    // --- 8. Background Walls (Tall buildings) ---
    // Making the world feel enclosed like the city
    addBox(0, 0, -100, 200, 60, 10, sandstoneMain); // Far back wall
    addBox(100, 0, 0, 10, 60, 200, sandstoneMain); // Right wall
    addBox(-100, 0, 0, 10, 60, 200, sandstoneMain); // Left wall

    // Floor override (since we passed in materials)
    // We already have a floor in init(), but let's place some "paving" stones for detail
    // Random flat stones on the ground
    for (let i = 0; i < 20; i++) {
        const sX = (Math.random() - 0.5) * 100;
        const sZ = (Math.random() - 0.5) * 100;
        addBox(sX, -0.4, sZ, 8, 0.5, 8, floorTile, 0, false);
    }
}

// --- Game Logic ---

function shoot() {
    if (isReloading) return;
    const ammo = weaponAmmo[currentWeaponType];
    if (currentWeaponType !== 'knife' && ammo.mag <= 0) {
        // Empty click? (Maybe add sound later)
        return;
    }

    inspectTimer = 0; // Cancel inspect
    if (currentWeaponType === 'knife') {
        meleeAttack();
        return;
    }

    const time = performance.now();
    if (time - lastShotTime < fireRate) return;
    lastShotTime = time;

    // Consume Ammo
    if (currentWeaponType !== 'knife') {
        ammo.mag--;
        updateAmmoDisplay();
    }

    // Create a bullet (Realistic Tracer)
    const bulletGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);
    bulletGeo.rotateX(-Math.PI / 2);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xd4af37 });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);

    // Start position: player position (0 offset to prevent wall clipping)
    bullet.position.copy(controls.getObject().position);
    const direction = new THREE.Vector3();
    controls.getDirection(direction);

    // Bullet Spread & Delayed Recoil
    let spreadAmount = isCrouching ? 0.005 : 0.01; // Higher accuracy while crouching
    let upwardRecoil = 0;

    if (currentWeaponType === 'ak47') {
        // RECOIL DELAY: Starts after 5 shots
        if (recoilCounter >= 5) {
            const activeScale = recoilCounter - 5;
            upwardRecoil = activeScale * (isCrouching ? 0.01 : 0.02); // Recoil reduced while crouching
            spreadAmount = (isCrouching ? 0.02 : 0.03) + (activeScale * 0.01);
        } else {
            upwardRecoil = 0;
            // Precise first 5 shots
        }
        recoilCounter++;
    } else {
        recoilCounter = 0;
    }

    // Apply Random Spread + Vertical Recoil
    const spreadX = (Math.random() - 0.5) * spreadAmount;
    const spreadY = (Math.random() - 0.5) * spreadAmount + upwardRecoil;
    const spreadZ = (Math.random() - 0.5) * spreadAmount;

    direction.y += spreadY;
    direction.x += spreadX;
    direction.z += spreadZ;
    direction.normalize();

    // Bullet lookAt
    bullet.lookAt(bullet.position.clone().add(direction));

    bullet.userData.velocity = direction.multiplyScalar(15);
    bullet.userData.weaponType = currentWeaponType;

    scene.add(bullet);
    bullets.push(bullet);

    // Visual Weapon Kick
    if (weapon) {
        weapon.position.z += 0.5;
        weapon.rotation.x += 0.1;
    }
}

function meleeAttack() {
    const time = performance.now();
    if (time - lastShotTime < fireRate) return;
    lastShotTime = time;

    if (weapon) {
        // Butterfly knife flip animation
        if (currentWeaponType === 'knife' && weapon.userData.butterflyHandles) {
            const handles = weapon.userData.butterflyHandles;
            const duration = 400;
            const startTime = performance.now();

            const animateFlip = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                if (progress < 0.5) {
                    // Open handles
                    const angle = (progress * 2) * Math.PI;
                    handles.handle1.rotation.x = angle;
                    handles.handle2.rotation.x = -angle;
                } else {
                    // Close handles
                    const angle = (2 - progress * 2) * Math.PI;
                    handles.handle1.rotation.x = angle;
                    handles.handle2.rotation.x = -angle;
                }

                if (progress < 1) {
                    requestAnimationFrame(animateFlip);
                } else {
                    handles.handle1.rotation.x = 0;
                    handles.handle2.rotation.x = 0;
                }
            };

            animateFlip();
        }

        // Slash animation
        weapon.rotation.z = -1.0;
        weapon.rotation.x = -0.5;
        setTimeout(() => {
            if (weapon) {
                weapon.rotation.z = 0;
                weapon.rotation.x = 0;
            }
        }, 200);
    }

    const raycasterMelee = new THREE.Raycaster();
    raycasterMelee.set(controls.getObject().position, new THREE.Vector3().copy(controls.getDirection(new THREE.Vector3())));
    raycasterMelee.far = 10.0; // Slightly longer range for ease

    const intersects = raycasterMelee.intersectObjects(enemies);
    if (intersects.length > 0) {
        const e = intersects[0].object;
        e.userData.health -= 50;
        if (e.userData.health <= 0) {
            scene.remove(e);
            const idx = enemies.indexOf(e);
            if (idx > -1) enemies.splice(idx, 1);
            if (enemies.length === 0) endRound(true);
        }
    }
}

const textureLoader = new THREE.TextureLoader();
const targetTexture = textureLoader.load('character.png');

function startRound() {
    if (playerWins >= MAX_WINS || enemyWins >= MAX_WINS) {
        endGame(playerWins >= MAX_WINS);
        return;
    }

    roundActive = true;
    health = 100;
    healthDisplay.textContent = "Health: " + health;
    recoilCounter = 0;

    // Clear old stuff
    for (const e of enemies) scene.remove(e);
    enemies.length = 0;
    for (const b of bullets) scene.remove(b);
    bullets.length = 0;
    for (const b of enemyBullets) scene.remove(b);
    enemyBullets.length = 0;
    for (const i of impacts) scene.remove(i);
    impacts.length = 0;

    // Reset Player
    controls.getObject().position.set(0, 10, 80);
    controls.getObject().rotation.set(0, Math.PI, 0);

    spawnEnemies(enemiesPerRound);
    scoreDisplay.textContent = `Match: ${playerWins} - ${enemyWins}`;
}

function spawnEnemies(count) {
    for (let i = 0; i < count; i++) {
        // Narrower plane (5 vs 8) for tighter hitbox as requested
        const geometry = new THREE.PlaneGeometry(5, 15);
        const material = new THREE.MeshBasicMaterial({
            map: targetTexture,
            transparent: true,
            side: THREE.DoubleSide,
            alphaTest: 0.5
        });
        const enemy = new THREE.Mesh(geometry, material);

        enemy.position.x = (Math.random() - 0.5) * 150;
        enemy.position.z = (Math.random() - 0.5) * 100 - 20;
        enemy.position.y = 7.5;

        enemy.userData = {
            health: 100,
            lastShot: 0,
            mag: 30, // Bots have magazine now
            isReloading: false,
            reloadTimer: 0
        };
        enemies.push(enemy);
        scene.add(enemy);
    }
}

function updateEnemies(delta) {
    if (!roundActive) return;
    const playerPos = controls.getObject().position;
    const time = performance.now();

    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        const data = e.userData;

        e.lookAt(playerPos.x, e.position.y, playerPos.z);

        // AI Reload Logic
        if (data.isReloading) {
            data.reloadTimer -= delta;
            if (data.reloadTimer <= 0) {
                data.isReloading = false;
                data.mag = 30; // Refill
            }
            // Move while reloading but don't shoot
        }

        const toPlayer = new THREE.Vector3().subVectors(playerPos, e.position);
        const dist = toPlayer.length();
        const dir = toPlayer.normalize();

        // LOS check
        const aiRay = new THREE.Raycaster(e.position, dir, 0, dist);
        const intersects = aiRay.intersectObjects(objects);
        const canSee = intersects.length === 0;

        if (canSee && dist < aiVisionRange && !data.isReloading) {
            if (time - data.lastShot > enemyFireRate) {
                enemyShoot(e);
                data.lastShot = time + Math.random() * 500;

                // Consume bot ammo
                data.mag--;
                if (data.mag <= 0) {
                    data.isReloading = true;
                    data.reloadTimer = 2.0; // 2s reload for bots
                }
            }
        }

        // Bot Walking Animation (Swaying while moving)
        if (!canSee || dist > 60) {
            // Collision check for enemy movement
            const nextPos = e.position.clone().add(dir.clone().multiplyScalar(enemySpeed * delta));

            // Bot sway animation
            e.rotation.z = Math.sin(time * 0.01) * 0.1;
            e.position.y = 7.5 + Math.abs(Math.sin(time * 0.01)) * 0.5;

            // Check if next position would be inside a precomputed wall box
            const enemyBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(4, 15, 4));
            let collision = false;
            for (let j = 0; j < objectBoxes.length; j++) {
                if (objectBoxes[j].intersectsBox(enemyBox)) {
                    collision = true;
                    break;
                }
            }
            if (!collision) {
                e.position.x = nextPos.x;
                e.position.z = nextPos.z;
            }
        } else {
            // Reset bot pose if standing still
            e.rotation.z = THREE.MathUtils.lerp(e.rotation.z, 0, 5 * delta);
            e.position.y = THREE.MathUtils.lerp(e.position.y, 7.5, 5 * delta);
        }
    }
}

function enemyShoot(enemy) {
    const bulletGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    bullet.position.copy(enemy.position).y += 2;

    const playerPos = controls.getObject().position.clone();
    playerPos.x += (Math.random() - 0.5) * 6;
    playerPos.y += (Math.random() - 0.5) * 6;
    playerPos.z += (Math.random() - 0.5) * 6;

    const dir = new THREE.Vector3().subVectors(playerPos, bullet.position).normalize();
    bullet.userData.velocity = dir.multiplyScalar(1.2);
    scene.add(bullet);
    enemyBullets.push(bullet);
}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const velocityVec = b.userData.velocity;
        const distPerFrame = velocityVec.length() + 0.5; // Slight look-ahead
        const directionVec = velocityVec.clone().normalize();

        const bulletRay = new THREE.Raycaster(b.position, directionVec, 0, distPerFrame);
        bulletRay.firstHitOnly = true; // Optimization if available in version

        // Check both Enemies and Objects
        const enemyHits = bulletRay.intersectObjects(enemies);
        const wallHits = bulletRay.intersectObjects(objects);

        let closestHit = null;
        let isEnemy = false;

        if (enemyHits.length > 0) {
            closestHit = enemyHits[0];
            isEnemy = true;
        }
        if (wallHits.length > 0) {
            if (!closestHit || wallHits[0].distance < closestHit.distance) {
                closestHit = wallHits[0];
                isEnemy = false;
            }
        }

        if (closestHit) {
            if (!isEnemy) {
                // WALL IMPACT
                const impactGeo = new THREE.CircleGeometry(0.15, 8);
                const impactMat = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
                const impact = new THREE.Mesh(impactGeo, impactMat);
                impact.position.copy(closestHit.point).add(closestHit.face.normal.multiplyScalar(0.02));
                impact.lookAt(closestHit.point.clone().add(closestHit.face.normal));
                scene.add(impact);
                impacts.push(impact);
                if (impacts.length > 100) scene.remove(impacts.shift());
            } else {
                // ENEMY HIT
                const enemy = closestHit.object;
                const relativeY = closestHit.point.y - enemy.position.y;
                let dmg = 20;
                const weaponType = b.userData.weaponType;

                if (relativeY > 3.5) { // Headshot
                    dmg = (weaponType === 'ak47') ? 100 : 70;
                    console.log("HEADSHOT!");
                } else {
                    dmg = (weaponType === 'ak47') ? 34 : 25;
                }

                enemy.userData.health -= dmg;
                if (enemy.userData.health <= 0) {
                    scene.remove(enemy);
                    enemies.splice(enemies.indexOf(enemy), 1);
                    if (enemies.length === 0) endRound(true);
                }
            }
            scene.remove(b);
            bullets.splice(i, 1);
            continue;
        }

        b.position.add(velocityVec);
        if (b.position.distanceTo(controls.getObject().position) > 1000) {
            scene.remove(b);
            bullets.splice(i, 1);
        }
    }
}

function updateEnemyBullets() {
    const playerPos = controls.getObject().position;
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        const vel = b.userData.velocity;
        const dist = vel.length() + 0.5;
        const dir = vel.clone().normalize();

        // Raycast against Walls
        const ray = new THREE.Raycaster(b.position, dir, 0, dist);
        const wallHits = ray.intersectObjects(objects);

        if (wallHits.length > 0) {
            scene.remove(b);
            enemyBullets.splice(i, 1);
            continue;
        }

        b.position.add(vel);

        if (b.position.distanceTo(playerPos) < 4) {
            takeDamage(10);
            scene.remove(b);
            enemyBullets.splice(i, 1);
            continue;
        }

        if (b.position.distanceTo(playerPos) > 1000) {
            scene.remove(b);
            enemyBullets.splice(i, 1);
        }
    }
}

function takeDamage(amount) {
    if (!roundActive) return;
    health -= amount;
    healthDisplay.textContent = "Health: " + Math.floor(health);
    document.body.style.backgroundColor = '#550000';
    setTimeout(() => { document.body.style.backgroundColor = 'transparent'; }, 50);

    if (health <= 0) endRound(false);
}

function endRound(playerWon) {
    if (!roundActive) return;
    roundActive = false;
    if (playerWon) playerWins++; else enemyWins++;

    scoreDisplay.textContent = `Score: ${playerWins} - ${enemyWins} (${playerWon ? "WON" : "LOST"} ROUND)`;

    if (playerWins >= MAX_WINS || enemyWins >= MAX_WINS) {
        setTimeout(() => endGame(playerWins >= MAX_WINS), 2000);
    } else {
        setTimeout(startRound, 3000);
    }
}

function endGame(playerWonGame) {
    isGameOver = true;
    controls.unlock();
    hud.style.display = 'none';
    gameOverScreen.style.display = 'flex';
    finalScoreDisplay.textContent = playerWonGame ? "VICTORY! Match Won." : "DEFEAT! Match Lost.";
}

function updateAmmoDisplay() {
    const config = weaponConfigs[currentWeaponType];
    const ammo = weaponAmmo[currentWeaponType];
    if (currentWeaponType === 'knife') {
        ammoDisplay.textContent = config.name;
    } else {
        ammoDisplay.textContent = `${config.name} | ${ammo.mag} / ${ammo.reserve}`;
    }
}

function reload() {
    if (isReloading || currentWeaponType === 'knife') return;
    const ammo = weaponAmmo[currentWeaponType];
    const config = weaponConfigs[currentWeaponType];

    if (ammo.mag === config.magSize || ammo.reserve <= 0) return;

    isReloading = true;
    ammoDisplay.textContent = "RELOADING...";

    // Weapon Animation (Simple visual feedback)
    if (weapon) {
        weapon.rotation.x = -0.5;
        weapon.position.y = -2.5;
    }

    setTimeout(() => {
        const needed = config.magSize - ammo.mag;
        const toLoad = Math.min(needed, ammo.reserve);
        ammo.mag += toLoad;
        ammo.reserve -= toLoad;
        isReloading = false;
        updateAmmoDisplay();
    }, 2000); // 2 second reload
}

function animate() {
    requestAnimationFrame(animate);

    if (isGameOver) return;

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked === true) {

        // --- Movement Logic ---
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta; // 100.0 = mass

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize(); // this ensures consistent movements in all directions

        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        const currentTargetHeight = isCrouching ? PLAYER_CROUCH_HEIGHT : PLAYER_STAND_HEIGHT;
        const lerpSpeed = 10 * delta;
        const playerObj = controls.getObject();

        // 1. Horizontal Movement & Collision
        const oldPos = playerObj.position.clone();

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        const horizPos = playerObj.position.clone();
        // lift the box slightly (0.1 epsilon) to avoid colliding with the floor we are standing on
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            horizPos.clone().setY(horizPos.y - (currentTargetHeight / 2) + 0.1),
            new THREE.Vector3(PLAYER_RADIUS * 2, currentTargetHeight - 0.2, PLAYER_RADIUS * 2)
        );

        for (let i = 0; i < objectBoxes.length; i++) {
            if (playerBox.intersectsBox(objectBoxes[i])) {
                // Revert horizontal only
                playerObj.position.x = oldPos.x;
                playerObj.position.z = oldPos.z;
                velocity.x = 0;
                velocity.z = 0;
                break;
            }
        }

        // 2. Vertical Movement & Collision
        const yBefore = playerObj.position.y;
        playerObj.position.y += (velocity.y * delta);
        const yAfter = playerObj.position.y;

        // Crouch height lerp (smooth transition)
        // If standing on ground, we can lerp. If in air, we lerp too.
        // We use a separate target to avoid jitter during collision math.

        // Robust vertical check: check the volume covered by the move
        const yMin = Math.min(yBefore, yAfter) - currentTargetHeight;
        const yMax = Math.max(yBefore, yAfter);
        const verticalSpanBox = new THREE.Box3(
            new THREE.Vector3(playerObj.position.x - PLAYER_RADIUS, yMin, playerObj.position.z - PLAYER_RADIUS),
            new THREE.Vector3(playerObj.position.x + PLAYER_RADIUS, yMax, playerObj.position.z + PLAYER_RADIUS)
        );

        let landed = false;
        for (let i = 0; i < objectBoxes.length; i++) {
            const box = objectBoxes[i];
            if (verticalSpanBox.intersectsBox(box)) {
                if (velocity.y < 0) {
                    // Falling: Check if we hit the top of the box
                    if (yBefore - currentTargetHeight >= box.max.y - 1.0) {
                        velocity.y = 0;
                        playerObj.position.y = box.max.y + currentTargetHeight;
                        canJump = true;
                        landed = true;
                        break;
                    }
                } else if (velocity.y > 0) {
                    // Jumping: Check if we hit the bottom
                    if (yBefore <= box.min.y + 1.0) {
                        velocity.y = 0;
                        playerObj.position.y = box.min.y - 0.1;
                        break;
                    }
                }
            }
        }

        // Floor collision fallback
        if (!landed && playerObj.position.y < currentTargetHeight) {
            velocity.y = 0;
            playerObj.position.y = THREE.MathUtils.lerp(playerObj.position.y, currentTargetHeight, lerpSpeed);
            if (playerObj.position.y < currentTargetHeight + 0.1) {
                playerObj.position.y = currentTargetHeight;
            }
            canJump = true;
        } else if (!landed && !isCrouching && playerObj.position.y < PLAYER_STAND_HEIGHT) {
            // Smoothing when standing up from crouch
            playerObj.position.y = THREE.MathUtils.lerp(playerObj.position.y, PLAYER_STAND_HEIGHT, lerpSpeed);
        }

        // --- Game Logic Updates ---
        updateBullets();
        updateEnemyBullets();
        updateEnemies(delta);

    }

    // Weapon Recoil & Animation Logic
    if (weapon) {
        // VIEW BOBBING & SWAY
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        const isMoving = speed > 0.1 && canJump;

        if (isMoving) {
            const bob = Math.sin(time * 0.01) * 0.15;
            const sway = Math.cos(time * 0.005) * 0.1;
            weapon.position.y += bob * 0.3;
            weapon.position.x += sway * 0.5;
            camera.position.y += bob * 0.1;

            // Side tilt while moving
            weapon.rotation.z = THREE.MathUtils.lerp(weapon.rotation.z, (Number(moveLeft) - Number(moveRight)) * 0.1, 5 * delta);
        } else {
            weapon.rotation.z = THREE.MathUtils.lerp(weapon.rotation.z, 0, 5 * delta);
        }

        // Recoil Reset Logic: reset spray if 3 seconds idle
        if (time - lastShotTime > 3000) {
            recoilCounter = 0;
        }

        if (isReloading) {
            // RELOAD ANIMATION (Enhanced)
            weapon.position.y = THREE.MathUtils.lerp(weapon.position.y, -3.5, 5 * delta);
            weapon.rotation.x = THREE.MathUtils.lerp(weapon.rotation.x, -0.8, 5 * delta);
            weapon.rotation.z = THREE.MathUtils.lerp(weapon.rotation.z, 0.5, 5 * delta);
        }
        else if (inspectTimer > 0) {
            // INSPECT ANIMATION
            inspectTimer -= delta;
            if (inspectTimer < 0) inspectTimer = 0;

            // Normalized Progress: 0 (start) -> 1 (mid) -> 0 (end)? 
            // Better: 0 to 1 based on remaining time.
            const t = 1.0 - (inspectTimer / INSPECT_DURATION);

            // Animation Curve: 
            // 0.0 - 0.2: Rotate to side
            // 0.2 - 0.8: Hold
            // 0.8 - 1.0: Return

            let targetRotY = 0;
            let targetRotZ = 0;
            let targetRotX = 0;
            let targetPosX = 1.2;

            if (t < 0.2) {
                // Entry
                const p = t / 0.2; // 0 to 1
                targetRotY = THREE.MathUtils.lerp(0, 0.5, p); // Turn side 45 deg
                targetRotZ = THREE.MathUtils.lerp(0, 0.5, p); // Tilt 45 deg
                targetRotX = THREE.MathUtils.lerp(0, 0.2, p); // Slight lift
                targetPosX = THREE.MathUtils.lerp(1.2, 0.8, p); // Move center
            } else if (t < 0.8) {
                // Hold
                targetRotY = 0.5 + Math.sin((t - 0.2) * 5) * 0.1; // Wiggle
                targetRotZ = 0.5 + Math.cos((t - 0.2) * 5) * 0.05;
                targetRotX = 0.2;
                targetPosX = 0.8;
            } else {
                // Exit
                const p = (t - 0.8) / 0.2; // 0 to 1
                targetRotY = THREE.MathUtils.lerp(0.5 + Math.sin((0.6) * 5) * 0.1, 0, p);
                targetRotZ = THREE.MathUtils.lerp(0.5 + Math.cos((0.6) * 5) * 0.05, 0, p);
                targetRotX = THREE.MathUtils.lerp(0.2, 0, p);
                targetPosX = THREE.MathUtils.lerp(0.8, 1.2, p);
            }

            // Apply directly or lerp? Direct is fine for calculated curve
            // But we need to account for existing rotation/pos if switching from recoil
            // Let's force set for now, as inspect overrides idle

            // However, we must respect the base Y/Z pos from recoil recovery logic if we want smooth transitions?
            // Actually, let's override recoil recovery.

            weapon.rotation.set(targetRotX, targetRotY, targetRotZ);
            // Keep Y and Z steady, modify X
            weapon.position.set(targetPosX, -1.8, -2.5);

        } else {
            // IDLE / RECOIL RECOVERY (Default Layout)
            // Lerp back to original position (-2.5) and rotation (0)
            weapon.position.z = THREE.MathUtils.lerp(weapon.position.z, -2.5, 10 * delta); // Recoil Z
            weapon.position.y = THREE.MathUtils.lerp(weapon.position.y, -1.8, 5 * delta); // Equip Y (-1.8 default)
            weapon.rotation.x = THREE.MathUtils.lerp(weapon.rotation.x, 0, 10 * delta); // Recoil/Equip Rotation X
            weapon.rotation.y = THREE.MathUtils.lerp(weapon.rotation.y, 0, 10 * delta);
            weapon.rotation.z = THREE.MathUtils.lerp(weapon.rotation.z, 0, 10 * delta);
            weapon.position.x = THREE.MathUtils.lerp(weapon.position.x, 1.2, 10 * delta);

            // Butterfly knife idle animation
            if (currentWeaponType === 'knife' && weapon.userData.butterflyHandles) {
                const handles = weapon.userData.butterflyHandles;
                const idleSpeed = 0.002;
                const idleAngle = Math.sin(time * idleSpeed) * 0.3; // Gentle opening/closing
                handles.handle1.rotation.x = idleAngle;
                handles.handle2.rotation.x = -idleAngle;
            }
        }
    }

    prevTime = time;

    // Weapon Auto-Fire Logic
    if (isFiring && currentWeaponType === 'ak47') {
        shoot();
    }

    renderer.render(scene, camera);
}
init();
animate();
