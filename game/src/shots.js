// Neon Bay — the screenshot scenes behind ?shot=chase|drive|street|mission.
// Each one starts the real game from a fresh world, sets up a real situation
// (a car to drive, police on the tail, a mission half done), hands the loop
// an autopilot instead of keys, and returns how many seconds main.js should
// run before the frame is taken. The frame is what a short game really
// looks like, and the same seed always gives the same frame.

import { MISSIONS, SHOT_SECONDS } from './config.js';

const ROAD_CENTRES = [-156, -104, -52, 0, 52, 104, 156];

function nearestRoadCentre(v) {
  let best = ROAD_CENTRES[0];
  for (const c of ROAD_CENTRES) {
    if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  }
  return best;
}

/**
 * Road-following autopilot: drive to the active mission target along the
 * road grid (nearest intersection first, then the final approach), so a
 * long cross-city leg does not cut diagonally through buildings.
 */
function makeRoadAutopilot(game) {
  return () => {
    const car = game.driving;
    if (!car) return { forward: 0, strafe: 0, run: false };
    const t = game.missions.target;
    if (!t) return { forward: 0, strafe: 0, run: false };
    const d = Math.hypot(t.x - car.x, t.z - car.z);
    if (d < 7) return { forward: car.speed > 2 ? -1 : 0, strafe: 0, run: false };
    const wx = nearestRoadCentre(t.x);
    const wz = nearestRoadCentre(t.z);
    const goal = Math.hypot(wx - car.x, wz - car.z) > 10 ? { x: wx, z: wz } : t;
    let gx, gz;
    const onXRoad = Math.abs(car.z - nearestRoadCentre(car.z)) <= 6;
    const onZRoad = Math.abs(car.x - nearestRoadCentre(car.x)) <= 6;
    if (onXRoad && Math.abs(car.x - goal.x) > 6) {
      gx = goal.x; gz = nearestRoadCentre(car.z);
    } else if (onZRoad && Math.abs(car.z - goal.z) > 6) {
      gx = nearestRoadCentre(car.x); gz = goal.z;
    } else if (onXRoad || onZRoad) {
      gx = goal.x; gz = goal.z;
    } else if (Math.abs(car.z - nearestRoadCentre(car.z)) <= Math.abs(car.x - nearestRoadCentre(car.x))) {
      gx = car.x; gz = nearestRoadCentre(car.z);
    } else {
      gx = nearestRoadCentre(car.x); gz = car.z;
    }
    const desired = Math.atan2(gx - car.x, gz - car.z);
    let dd = desired - car.yaw;
    while (dd > Math.PI) dd -= Math.PI * 2;
    while (dd < -Math.PI) dd += Math.PI * 2;
    // Coast through a sharp turn instead of swinging wide into a building.
    const fwd = Math.abs(dd) > 0.7 ? 0 : 1;
    return { forward: fwd, strafe: Math.max(-1, Math.min(1, dd * 1.8)), run: false };
  };
}

/** Drive toward a point (or straight ahead when none is given). */
function makeDriveAutopilot(game, target) {
  return () => {
    const car = game.driving;
    if (!car) return { forward: 0, strafe: 0, run: false };
    // Arrived: brake hard to a stop at the target instead of driving past
    // it — coasting alone takes 70 m to stop from flat out.
    if (target && Math.hypot(target.x - car.x, target.z - car.z) < 7) {
      return { forward: car.speed > 2 ? -1 : 0, strafe: 0, run: false };
    }
    const tx = target ? target.x : car.x + Math.sin(car.yaw) * 40;
    const tz = target ? target.z : car.z + Math.cos(car.yaw) * 40;
    const desired = Math.atan2(tx - car.x, tz - car.z);
    let d = desired - car.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return { forward: 1, strafe: Math.max(-1, Math.min(1, d * 1.8)), run: false };
  };
}

/** Walk straight ahead, the way a player crossing the street would. */
function makeWalkAutopilot() {
  return () => ({ forward: 1, strafe: 0, run: false });
}

function startPlaying() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('start-button').click();
}

/** Put the player in the parked car nearest (x, z) and hand them the keys. */
function putPlayerInCar(game, x, z) {
  // Prefer a car parked along an east-west road: driving straight then
  // stays in the city for the whole scene instead of running to the beach.
  const alongX = game.vehicles.parked.filter((car) => Math.abs(Math.sin(car.yaw)) > 0.9);
  let best = null;
  let bestD = 500;
  for (const car of alongX.length > 0 ? alongX : game.vehicles.parked) {
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  const car = best || game.vehicles.nearestParked(x, z, 500);
  game.teleportPlayer(car.x - Math.cos(car.yaw) * 3, car.z + Math.sin(car.yaw) * 3, car.yaw);
  game.enterCar(car);
  return car;
}

const SCENES = {
  street(game) {
    startPlaying();
    // On foot at a busy intersection, facing east down Palm Row.
    game.teleportPlayer(-6, -52, Math.PI / 2);
    game.setCamera(-Math.PI / 2, 0.32);
    // A few pedestrians strolling the same sidewalk, for the frame.
    const walkers = game.pedestrians.walkers.slice(0, 6);
    walkers.forEach((w, i) => {
      w.x = -20 + i * 8;
      w.z = -52 + (i % 2 === 0 ? 8.5 : -8.5);
      w.axis = 'x';
      w.road = -52;
      w.dir = i % 2 === 0 ? 1 : -1;
    });
    game.autopilot = makeWalkAutopilot();
    return SHOT_SECONDS.street;
  },
  combat(game) {
    startPlaying();
    // On foot at a busy intersection, two stars up: foot cops close in
    // from down the street while the player fires at them — tracer, ammo
    // readout and wanted stars all in the frame.
    game.teleportPlayer(-6, -52, Math.PI / 2);
    game.setCamera(-Math.PI / 2, 0.32);
    game.raiseWanted(2);
    game.combat.placeCop(14, -52);
    game.combat.placeCop(20, -46);
    const walkers = game.pedestrians.walkers.slice(0, 4);
    walkers.forEach((w, i) => {
      w.x = -20 + i * 10;
      w.z = -52 + (i % 2 === 0 ? 8.5 : -8.5);
      w.axis = 'x';
      w.road = -52;
      w.dir = i % 2 === 0 ? 1 : -1;
    });
    game.autoFire = true;
    game.autopilot = makeWalkAutopilot();
    return SHOT_SECONDS.combat;
  },
  courier(game) {
    startPlaying();
    // Courier Run mid-route: the package is picked up, the clock is
    // running, and the player drives toward the first drop's beacon.
    game.missions.stage(1, 1, game);
    const car = game.vehicles.parked[0];
    // Face north up Palm Row already: the first leg is a straight run to
    // the intersection, so no 90° turn is needed at the start (a low-speed
    // turn spins the car in place and drifts it into the block).
    car.x = -52;
    car.z = 44;
    car.yaw = Math.PI;
    car.mesh.position.set(-52, 0, 44);
    car.mesh.rotation.y = Math.PI;
    game.teleportPlayer(-55, 44, Math.PI);
    game.enterCar(car);
    game.cameraLock = { yaw: Math.PI * 0.75, pitch: 0.35 };
    // Road-following: the straight-line route from here to the first drop
    // cuts diagonally through a block and wedges the car on a building.
    game.autopilot = makeRoadAutopilot(game);
    return SHOT_SECONDS.courier;
  },
  drive(game) {
    startPlaying();
    putPlayerInCar(game, 0, 0);
    game.autopilot = makeDriveAutopilot(game, null);
    return SHOT_SECONDS.drive;
  },
  chase(game) {
    startPlaying();
    putPlayerInCar(game, 0, 52);
    game.raiseWanted(2);
    // Look back down the road: the camera sits ahead of the stolen car, so
    // the police cars on its tail are in the frame, not behind the camera.
    game.cameraLock = { yaw: game.driving.yaw, pitch: 0.32 };
    game.autopilot = makeDriveAutopilot(game, null);
    return SHOT_SECONDS.chase;
  },
  mission(game) {
    startPlaying();
    // Park the target car a short drive from the garage, then steal it:
    // the mission's first step completes on entering, so the beacon and the
    // delivery objective are live for the frame.
    const car = game.vehicles.parked[0];
    car.x = 104;
    car.z = -104;
    car.yaw = Math.PI / 2;
    car.mesh.position.set(104, 0, -104);
    car.mesh.rotation.y = Math.PI / 2;
    game.teleportPlayer(101, -104, Math.PI / 2);
    game.enterCar(car);
    // The camera sits north-east of the delivery point, looking south-west:
    // the stopped car, the police car that chased it there and the $500
    // reward are all in frame.
    game.cameraLock = { yaw: Math.PI * 0.75, pitch: 0.35 };
    game.autopilot = makeDriveAutopilot(game, MISSIONS.garage);
    return SHOT_SECONDS.mission;
  },
};

/**
 * Stage the named scene. Returns the seconds main.js should run the loop
 * for before taking the frame.
 */
export function stageShot(game, name, seed) {
  const scene = SCENES[name] || SCENES.street;
  void seed;
  return scene(game);
}
