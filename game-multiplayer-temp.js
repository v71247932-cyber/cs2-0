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
