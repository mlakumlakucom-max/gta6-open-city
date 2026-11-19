// Neon Bay — the one place every tunable number lives.
// All distances are metres, all speeds metres per second, angles in radians.

export const STEP = 1 / 60;

export const WORLD = {
  // Road centrelines sit every PITCH metres; roads are ROAD wide, blocks BLOCK wide.
  pitch: 52,
  road: 12,
  block: 40,
  // City roads run from -182 to +182 on both axes; the beach and sea are south (z > 182).
  half: 182,
  beachStart: 182,
  beachEnd: 214,
  seaStart: 214,
  seaEnd: 700,
  // A palm, a lamp or a bench never stands closer than this to a road centreline.
  clearOfRoad: 9,
};

export const PLAYER = {
  walkSpeed: 5,
  runSpeed: 9.5,
  radius: 0.7,
  height: 1.8,
  enterCarRange: 4.5,
  health: 100,
};

export const CAR = {
  // Arcade driving: top speed, acceleration, braking and how sharply a car turns.
  topSpeed: 34,
  reverseSpeed: 10,
  accel: 16,
  brake: 30,
  steerMax: 0.55,
  steerSpeed: 3.2,
  radius: 2.4,
};

export const TRAFFIC = {
  count: 16,
  minSpeed: 7,
  maxSpeed: 12,
  followGap: 9,
};

export const PEDESTRIAN = {
  count: 26,
  minSpeed: 1.1,
  maxSpeed: 2.1,
};

export const POLICE = {
  // Wanted stars and how many police cars each star level keeps on the player.
  carsPerStar: [0, 1, 2, 3],
  spawnDistance: 70,
  chaseSpeed: 30,
  ramDamage: 5,
  escapeDistance: 48,
  escapeSeconds: 5,
  // A hard crash (into a building or another car) costs this much health.
  crashDamage: 6,
};

export const MISSIONS = {
  // The delivery point stands on the road's edge in front of the garage's
  // south door — reachable by car, clear of the building's walls by more
  // than a car's radius, so the delivery check can actually trigger.
  garage: { x: 130, z: -110 },
  firstWheelsReward: 500,
  // Courier Run: pick up at the depot, then three drops in order, on the
  // clock. All points sit on road edges, clear of building walls.
  courierDepot: { x: -104, z: 44 },
  courierDrops: [
    { x: 104, z: -44 },
    { x: -52, z: 156 },
    { x: 156, z: 104 },
  ],
  courierTimeSeconds: 150,
  courierReward: 800,
  // Hot Pursuit: the safehouse is a beach hut at the south end of the sand.
  safehouse: { x: -130, z: 198 },
  pursuitReward: 1200,
  storyBonus: 1000,
};

export const COMBAT = {
  punchRange: 2.2,
  punchDamage: 12,
  punchCooldown: 0.45,
  pistolRange: 60,
  pistolDamage: 34,
  magSize: 12,
  reloadSeconds: 1.2,
  fireCooldown: 0.22,
  // Ammo crates sit on sidewalks, clear of roads and buildings.
  ammoCrates: [
    { x: -104, z: 60 },
    { x: 104, z: -60 },
    { x: 0, z: 190 },
  ],
};

export const FOOT_POLICE = {
  maxCops: 2,
  speed: 4.6,
  punchDamage: 4,
  punchCooldown: 1.2,
  spawnDistance: 25,
};

export const SAVE_KEY = 'neonbay-save-v1';

// Courier is 4 s, not 7: the frame is taken while the car is still on its
// straight first leg up Palm Row — by 7 s it is mid-turn at the
// intersection, where the road autopilot can stall against a building.
export const SHOT_SECONDS = { chase: 4.5, drive: 3.5, street: 4, mission: 5, combat: 4, courier: 4 };
