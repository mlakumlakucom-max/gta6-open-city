// Neon Bay — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. The game moves between four
// screens: title, play, paused and busted. ?seed=N fixes the city.
// ?shot=chase|drive|street|mission (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.

import * as THREE from 'three';
import { CAR, MISSIONS, PLAYER, POLICE, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH,
  ACTION_RELOAD, ACTION_SHOOT, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const random = createRandom(seed);
const world = createWorld(scene, random);
const vehicles = createVehicles(scene, world, random);
const pedestrians = createPedestrians(scene, world, random);
const police = createPolice(scene, world, random);
const combat = createCombat(scene, world);
const missions = createMissions(scene);
const hud = createHud(document);
const audio = createAudio();
const input = createInput(canvas);

// --- the player ------------------------------------------------------------
function makePlayerMesh() {
  const player = new THREE.Group();
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.8, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2e3238 }),
  );
  legs.position.y = 0.4;
  player.add(legs);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.65, 0.32),
    new THREE.MeshLambertMaterial({ color: 0x1f9e8a }),
  );
  torso.position.y = 1.12;
  torso.castShadow = true;
  player.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  );
  head.position.y = 1.62;
  head.castShadow = true;
  player.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.08, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8c33a }),
  );
  cap.position.y = 1.8;
  player.add(cap);
  return player;
}

const playerMesh = makePlayerMesh();
scene.add(playerMesh);

const player = {
  x: 0, z: 0, yaw: 0, health: PLAYER.health, cash: 0,
  mesh: playerMesh,
};

let driving = null;
let screen = 'title';
let cameraYaw = Math.PI * 0.75;
let cameraPitch = 0.42;
let lastDamageAt = -10;
let lastPedestrianHitAt = -10;
let lastAutoFireAt = -10;
let elapsed = 0;
let saveTimer = 0;

// --- save / load -------------------------------------------------------------
function readSave() {
  try {
    return JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: player.cash,
      missionDone: missions.doneIds,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

const saved = readSave();
if (saved) {
  player.cash = saved.cash || 0;
  missions.restore(saved.missionDone);
}

function announce(message) {
  status.textContent = message;
}

// --- entering and leaving cars ----------------------------------------------
function enterCar(car) {
  driving = car;
  playerMesh.visible = false;
  if (!car.owned) {
    vehicles.steal(car);
    police.raise(1);
    audio.denied();
    announce('Car stolen! The police are on to you.');
  }
}

function exitCar() {
  if (!driving || Math.abs(driving.speed) > 1) return;
  const car = driving;
  driving = null;
  player.x = car.x - Math.cos(car.yaw) * 3;
  player.z = car.z + Math.sin(car.yaw) * 3;
  const land = world.clampToLand(player.x, player.z);
  player.x = land.x;
  player.z = land.z;
  player.yaw = car.yaw;
  playerMesh.visible = true;
}

/**
 * Hurt the player. cause 'foot' (beaten down on foot) shows WASTED, any
 * other cause shows BUSTED — the police caught the player in a car.
 */
function damage(amount, cause) {
  if (screen !== 'play') return;
  player.health = Math.max(0, player.health - amount);
  lastDamageAt = elapsed;
  if (player.health <= 0) {
    if (cause === 'foot') {
      screen = 'wasted';
      document.getElementById('wasted-screen').style.display = 'flex';
      announce('Wasted. You went down on the streets of Neon Bay.');
    } else {
      screen = 'busted';
      document.getElementById('busted-screen').style.display = 'flex';
      announce('Busted. The Neon Bay police caught you.');
    }
  }
}

// --- the game object the mission, police and shot code share -----------------
const game = {
  get driving() {
    return driving;
  },
  get player() {
    return player;
  },
  get police() {
    return police;
  },
  get missions() {
    return missions;
  },
  get vehicles() {
    return vehicles;
  },
  get pedestrians() {
    return pedestrians;
  },
  get world() {
    return world;
  },
  get combat() {
    return combat;
  },
  get cameraYaw() {
    return cameraYaw;
  },
  get cameraPitch() {
    return cameraPitch;
  },
  get cameraPos() {
    return { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  },
  get elapsed() {
    return elapsed;
  },
  hurt(amount, cause) {
    damage(amount, cause);
  },
  autopilot: null,
  // Screenshot scenes set this to make the player fire the pistol on a
  // timer, so the combat shot shows a tracer in the frame.
  autoFire: false,
  // A fixed orbit angle for screenshot scenes: the loop keeps the camera
  // there instead of chasing behind the car (used to look back at a chase
  // or at the garage in the mission scene).
  cameraLock: null,
  setCamera(yaw, pitch) {
    cameraYaw = yaw;
    cameraPitch = pitch;
  },
  teleportPlayer(x, z, yaw) {
    player.x = x;
    player.z = z;
    player.yaw = yaw;
    playerMesh.position.set(x, 0, z);
    playerMesh.rotation.y = yaw;
  },
  enterCar,
  raiseWanted(n) {
    police.raise(n);
  },
  setCash(amount) {
    player.cash = amount;
  },
};

// --- one fixed step ------------------------------------------------------------
function stepPlayer(dt, move) {
  const speed = move.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const fx = -Math.sin(cameraYaw);
  const fz = -Math.cos(cameraYaw);
  const rx = -fz;
  const rz = fx;
  let mx = fx * move.forward + rx * move.strafe;
  let mz = fz * move.forward + rz * move.strafe;
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx /= len;
    mz /= len;
    const nx = player.x + mx * speed * dt;
    const nz = player.z + mz * speed * dt;
    const hit = world.collideCircle(nx, nz, PLAYER.radius);
    if (!hit) {
      player.x = nx;
      player.z = nz;
    }
    const land = world.clampToLand(player.x, player.z);
    player.x = land.x;
    player.z = land.z;
    player.yaw = Math.atan2(mx, mz);
    playerMesh.position.set(player.x, Math.abs(Math.sin(elapsed * 10)) * 0.04, player.z);
    playerMesh.rotation.y = player.yaw;
  }
}

function step(dt) {
  elapsed += dt;
  const drag = input.takeDrag();
  cameraYaw -= drag.x * 0.004;
  cameraPitch = Math.max(0.12, Math.min(1.1, cameraPitch + drag.y * 0.003));

  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    screen = 'paused';
    document.getElementById('pause-screen').style.display = 'flex';
    return;
  }
  if (actions & ACTION_MUTE) {
    audio.setMuted(!audio.muted);
    announce(audio.muted ? 'Sound muted.' : 'Sound on.');
  }
  // A failed timed mission retries on Enter.
  if (missions.failed && (actions & ACTION_CONFIRM)) {
    missions.retry();
    announce('Courier Run restarted — pick up the package at the depot.');
  }

  let move = input.move();
  if (game.autopilot) {
    move = game.autopilot(dt);
  }

  if (driving) {
    if (actions & ACTION_ENTER) exitCar();
    if (driving) {
      const crashed = vehicles.drivePlayer(driving, move, dt);
      if (crashed) {
        damage(POLICE.crashDamage);
        audio.crash(0.8);
      }
      // Bump into traffic: a gentle nudge, not a pile-up.
      for (const other of vehicles.traffic) {
        const d = Math.hypot(other.x - driving.x, other.z - driving.z);
        if (d < 4 && Math.abs(driving.speed) > 4) {
          driving.speed *= 0.5;
          audio.crash(0.4);
        }
      }
      // Running down a pedestrian is a crime, and the police notice.
      for (const w of pedestrians.walkers) {
        const d = Math.hypot(w.x - driving.x, w.z - driving.z);
        if (d < 2.2 && Math.abs(driving.speed) > 6 && elapsed - lastPedestrianHitAt > 5) {
          lastPedestrianHitAt = elapsed;
          w.pause = 3;
          police.raise(1);
          audio.crash(0.6);
        }
      }
      audio.engine(Math.abs(driving.speed) / CAR.topSpeed, true);
    }
  } else {
    stepPlayer(dt, move);
    audio.engine(0, false);
    if (actions & ACTION_ENTER) {
      const car = vehicles.nearestParked(player.x, player.z, PLAYER.enterCarRange);
      if (car) enterCar(car);
    }
    // Combat on foot: F punches, click fires, R reloads.
    if (!driving) {
      if (actions & ACTION_PUNCH) {
        const hit = combat.punch(game, elapsed);
        if (hit) audio.punch();
      }
      if (actions & ACTION_SHOOT) {
        combat.shoot(game, cameraYaw, cameraPitch, elapsed, audio);
      }
      if (actions & ACTION_RELOAD) {
        if (combat.startReload(elapsed)) announce('Reloading…');
      }
      if (game.autoFire && elapsed - lastAutoFireAt > 0.6) {
        lastAutoFireAt = elapsed;
        combat.shoot(game, cameraYaw, cameraPitch, elapsed, audio);
      }
    }
  }

  vehicles.stepTraffic(dt);
  pedestrians.step(dt, player);
  police.step(dt, driving || player, driving ? Math.abs(driving.speed) : 0, (policeCar) => {
    if (driving) {
      driving.speed *= 0.55;
    }
    damage(POLICE.ramDamage);
    audio.crash(1);
  });
  combat.step(dt, game, elapsed);
  audio.siren(police.wanted, elapsed);

  // Health comes back slowly once the heat is off.
  if (elapsed - lastDamageAt > 5 && player.health > 0) {
    player.health = Math.min(PLAYER.health, player.health + 1.5 * dt);
  }

  const reward = missions.step(game);
  if (reward > 0) {
    player.cash += reward;
    audio.pickup();
    writeSave();
    if (missions.storyDone) {
      announce(`Story Complete! +$${reward} — all three missions done. Neon Bay is yours.`);
    } else {
      announce(`Mission complete! +$${reward}`);
    }
  }
  missions.updateBeacon();

  // HUD.
  hud.setCash(player.cash);
  hud.setHealth(player.health);
  hud.setWanted(police.wanted);
  hud.setObjective(missions.stepText(game));
  hud.setTimer(missions.timeLeft(game));
  hud.setAmmo(combat.ammo, combat.magSize, combat.reloading, !!driving);
  document.getElementById('crosshair').style.display = driving ? 'none' : 'block';
  hud.setSpeed(driving ? Math.abs(driving.speed) * 3.6 : 0, !!driving);
  if (!driving) {
    const near = vehicles.nearestParked(player.x, player.z, PLAYER.enterCarRange);
    hud.setPrompt(near ? 'Press E to enter the car' : '');
  } else {
    hud.setPrompt('Press E to leave the car');
  }
  hud.drawMinimap(elapsed, world, player, vehicles, police, missions.targets(), combat.cops);

  saveTimer += dt;
  if (saveTimer > 10) {
    saveTimer = 0;
    writeSave();
  }

  // Third-person camera: behind the player, or chasing the car — unless a
  // screenshot scene locked the orbit angle.
  const target = driving || player;
  const dist = driving ? 11 : 7;
  if (game.cameraLock) {
    cameraYaw = game.cameraLock.yaw;
    cameraPitch = game.cameraLock.pitch;
  } else if (driving) {
    const wantYaw = driving.yaw + Math.PI;
    let dyaw = wantYaw - cameraYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    cameraYaw += dyaw * Math.min(1, 2.5 * dt);
  }
  const cx = target.x + Math.sin(cameraYaw) * Math.cos(cameraPitch) * dist;
  const cz = target.z + Math.cos(cameraYaw) * Math.cos(cameraPitch) * dist;
  const cy = 1.6 + Math.sin(cameraPitch) * dist;
  // Camera collision: pull the camera in along its ray until it is out of
  // every building, so the view never clips through a tower.
  let pull = 1;
  for (let t = 1; t >= 0.15; t -= 0.05) {
    const px = target.x + (cx - target.x) * t;
    const py = 1.6 + (cy - 1.6) * t;
    const pz = target.z + (cz - target.z) * t;
    if (py > 0.6 && !world.pointInBuilding(px, py, pz)) {
      pull = t;
      break;
    }
    pull = t;
  }
  camera.position.set(
    target.x + (cx - target.x) * pull,
    Math.max(0.6, 1.6 + (cy - 1.6) * pull),
    target.z + (cz - target.z) * pull,
  );
  camera.lookAt(target.x, 1.6, target.z);
}

function startGame() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('busted-screen').style.display = 'none';
  document.getElementById('wasted-screen').style.display = 'none';
  document.getElementById('pause-screen').style.display = 'none';
  audio.start();
  screen = 'play';
  announce('Playing Neon Bay. Steal a car and deliver it to the garage.');
}

function restartGame() {
  player.health = PLAYER.health;
  player.cash = 0;
  police.clear();
  missions.reset();
  if (driving) {
    driving = null;
    playerMesh.visible = true;
  }
  player.x = 0;
  player.z = 0;
  player.yaw = 0;
  playerMesh.position.set(0, 0, 0);
  startGame();
}

document.getElementById('start-button').addEventListener('click', startGame);
document.getElementById('resume-button').addEventListener('click', () => {
  document.getElementById('pause-screen').style.display = 'none';
  screen = 'play';
});
document.getElementById('restart-button').addEventListener('click', restartGame);
document.getElementById('restart-button-wasted').addEventListener('click', restartGame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    screen = 'paused';
    document.getElementById('pause-screen').style.display = 'flex';
  }
});

// --- screenshot staging --------------------------------------------------------
if (shot) {
  const seconds = stageShot(game, shot, seed);
  for (let i = 0; i < Math.round(seconds * 60); i += 1) step(STEP);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
} else {
  // The title screen's backdrop: a slow orbit over the city.
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // The one-shot queue has one owner per screen: the loop owns it on the
    // title and pause screens, step() owns it while playing. Taking it in
    // both places swallowed the E press before step() ever saw it.
    if (screen === 'title' || screen === 'paused') {
      const actions = input.takeActions();
      if (screen === 'title' && (actions & ACTION_CONFIRM)) startGame();
      if (screen === 'paused' && (actions & ACTION_PAUSE)) {
        document.getElementById('pause-screen').style.display = 'none';
        screen = 'play';
      }
    }
    if (screen === 'play') {
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
      }
    } else if (screen === 'title') {
      while (accumulator >= STEP) {
        vehicles.stepTraffic(STEP);
        pedestrians.step(STEP, player);
        accumulator -= STEP;
      }
      cameraYaw += STEP * 0.05;
      camera.position.set(
        Math.sin(cameraYaw) * 120, 60, Math.cos(cameraYaw) * 120,
      );
      camera.lookAt(0, 0, 0);
    } else {
      accumulator = 0;
    }
    renderer.render(scene, camera);
  }
  announce('Neon Bay. Press Enter or click Start to play.');
  requestAnimationFrame(frame);
}

// Exposed for the scripted playability test, never shown in the game itself.
window.__game = game;
window.__screen = () => screen;
