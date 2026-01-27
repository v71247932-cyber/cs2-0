import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- Multiplayer Variables ---
let socket;
let playerNumber = 0; // 1 or 2
let opponentId = null;
let isMatched = false;
let remotePlayer = null;

// --- Global Variables ---
let camera, scene, renderer, controls, weapon;
let currentWeaponType = 'pistol'; // pistol, ak47, knife
let isFiring = false;
let lastShotTime = 0;
let fireRate = 0; // ms between shots
let inspectTimer = 0;
const INSPECT_DURATION = 2.5; // seconds
let recoilCounter = 0;
const objects = [];
const objectBoxes = [];
const bullets = [];
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
let isGameOver = false;
let isReloading = false;

// Round System
let playerWins = 0;
let opponentWins = 0;
let roundActive = false;
const MAX_WINS = 10;

// Weapon Configs
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

// UI Elements
const instructionsDiv = document.getElementById('instructions');
const lobbyDiv = document.getElementById('lobby');
const lobbyStatus = document.getElementById('lobby-status');
const hud = document.getElementById('hud');
const healthDisplay = document.getElementById('health');
const scoreDisplay = document.getElementById('score');
const gameOverScreen = document.getElementById('game-over');
const finalScoreDisplay = document.getElementById('final-score');

// Ammo Display
const ammoDisplay = document.createElement('div');
ammoDisplay.style.position = 'absolute';
ammoDisplay.style.bottom = '20px';
ammoDisplay.style.right = '20px';
ammoDisplay.style.color = '#fff';
ammoDisplay.style.fontSize = '32px';
ammoDisplay.style.fontFamily = 'monospace';
ammoDisplay.style.textShadow = '2px 2px 4px #000';
hud.appendChild(ammoDisplay);

// Initialize Socket.io connection
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to server');
        lobbyStatus.textContent = 'Waiting for opponent...';
        document.querySelector('#connection-indicator div').style.background = 'green';
    });

    socket.on('waiting', (data) => {
        console.log('Waiting in room:', data.roomId);
        lobbyStatus.textContent = 'Waiting for opponent to join...';
        instructionsDiv.style.display = 'none';
        lobbyDiv.style.display = 'flex';
    });

    socket.on('matched', (data) => {
        console.log('Matched!', data);
        playerNumber = data.playerNumber;
        opponentId = data.opponentId;
        isMatched = true;

        lobbyStatus.textContent = 'Opponent found! Starting game...';

        setTimeout(() => {
            lobbyDiv.style.display = 'none';
            instructionsDiv.style.display = 'flex';
        }, 1500);
    });

    socket.on('opponentMove', (data) => {
        if (remotePlayer) {
            // Update remote player position and rotation
            remotePlayer.position.copy(data.position);
            remotePlayer.rotation.y = data.rotation.y;
        }
    });

    socket.on('opponentShoot', (data) => {
        // Create visual bullet from opponent
        createOpponentBullet(data);
    });

    socket.on('takeDamage', (data) => {
        health = data.health;
        healthDisplay.textContent = 'Health: ' + Math.floor(health);

        // Visual feedback
        document.body.style.backgroundColor = '#550000';
        setTimeout(() => { document.body.style.backgroundColor = 'transparent'; }, 50);

        if (health <= 0) {
            // Player died
            roundActive = false;
        }
    });

    socket.on('roundEnd', (data) => {
        roundActive = false;
        playerWins = data.yourWins;
        opponentWins = data.opponentWins;

        const result = data.won ? 'WON' : 'LOST';
        scoreDisplay.textContent = `Score: ${playerWins} - ${opponentWins} (${result} ROUND)`;
    });

    socket.on('newRound', () => {
        startNewRound();
    });

    socket.on('matchEnd', (data) => {
        isGameOver = true;
        controls.unlock();
        hud.style.display = 'none';
        gameOverScreen.style.display = 'flex';
        finalScoreDisplay.textContent = data.won ? 'VICTORY! Match Won.' : 'DEFEAT! Match Lost.';
    });

    socket.on('opponentLeft', () => {
        alert('Opponent disconnected!');
        location.reload();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        if (!isGameOver) {
            alert('Lost connection to server');
            location.reload();
        }
    });
}

function init() {
    // Initialize socket first
    initSocket();

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 750);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = PLAYER_STAND_HEIGHT;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(200, 500, 200);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -200;
    dirLight.shadow.camera.right = 200;
    dirLight.shadow.camera.top = 200;
    dirLight.shadow.camera.bottom = -200;
    scene.add(dirLight);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(2000, 2000);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xc2b280, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Controls
    controls = new PointerLockControls(camera, document.body);

    instructionsDiv.addEventListener('click', () => {
        if (isMatched) {
            controls.lock();
        }
    });

    controls.addEventListener('lock', () => {
        instructionsDiv.style.display = 'none';
        hud.style.display = 'block';
        if (!roundActive && isMatched) {
            startNewRound();
        }
    });

    controls.addEventListener('unlock', () => {
        if (!isGameOver) {
            instructionsDiv.style.display = 'flex';
            hud.style.display = 'none';
        }
    });

    scene.add(controls.getObject());

    // Input Listeners
    const onKeyDown = (event) => {
        switch (event.code) {
            case 'KeyW': moveForward = true; break;
            case 'KeyA': moveLeft = true; break;
            case 'KeyS': moveBackward = true; break;
            case 'KeyD': moveRight = true; break;
            case 'Space': if (canJump) velocity.y += 350; canJump = false; break;
            case 'KeyC': case 'ControlLeft': isCrouching = true; break;
            case 'KeyR': reload(); break;
            case 'KeyF': inspectTimer = INSPECT_DURATION; break;
            case 'Digit1': switchWeapon('pistol'); break;
            case 'Digit2': switchWeapon('ak47'); break;
            case 'Digit3': switchWeapon('knife'); break;
        }
    };

    const onKeyUp = (event) => {
        switch (event.code) {
            case 'KeyW': moveForward = false; break;
            case 'KeyA': moveLeft = false; break;
            case 'KeyS': moveBackward = false; break;
            case 'KeyD': moveRight = false; break;
            case 'KeyC': case 'ControlLeft': isCrouching = false; break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    document.addEventListener('mousedown', () => {
        if (controls.isLocked && roundActive) {
            isFiring = true;
            if (currentWeaponType !== 'ak47') shoot();
        }
    });

    document.addEventListener('mouseup', () => {
        isFiring = false;
    });

    window.addEventListener('resize', onWindowResize);

    // Create Map
    createMirageMap();

    // Create Weapon
    switchWeapon('pistol');

    // Create remote player representation
    createRemotePlayer();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function switchWeapon(type) {
    inspectTimer = 0;
    if (weapon) {
        camera.remove(weapon);
    }
    weapon = new THREE.Group();
    camera.add(weapon);
    currentWeaponType = type;

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

    updateAmmoDisplay();

    weapon.rotation.x = -Math.PI / 2;
    weapon.position.y = -3.0;

    // Notify opponent
    if (socket && isMatched) {
        socket.emit('weaponSwitch', { weapon: type });
    }
}
