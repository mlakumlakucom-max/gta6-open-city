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
  steerSpeed: 2.2,
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
};

export const SAVE_KEY = 'neonbay-save-v1';

export const SHOT_SECONDS = { chase: 4.5, drive: 3.5, street: 4, mission: 5 };
