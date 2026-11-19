// Neon Bay — the city. A sun-soaked coastal grid: roads on a 52 m pitch,
// buildings of varied height and colour on the blocks between them, palms
// along the sidewalks and the beach, lamps, a sand strip and the sea to the
// south, a sun with shadows and a warm sky. Everything is built from boxes,
// cylinders and cones with a seeded random generator, so the same seed
// always builds the same city. The module also answers the questions the
// rest of the game asks the city: is this point on a road, inside a
// building, or off the map — and where the roads run.

import * as THREE from 'three';
import { WORLD } from './config.js';

const BUILDING_COLOURS = [
  0xf2e3c6, 0xe8b4a0, 0xf6d9a0, 0xc9d6e8, 0xe8c9d6, 0xd6e8c9,
  0xf2c9a0, 0xc6b8e8, 0xe8e0c9, 0xf6f2e8, 0xd9a08c, 0xa8c8d8,
];
const ROOF_COLOURS = [0x8a6f5c, 0x6f7d8a, 0x9c8a7a, 0x5c6f7d];
const PALETTE = {
  ground: 0x9aa578,
  road: 0x3a3f45,
  roadLine: 0xe8e0c9,
  sidewalk: 0xb8b0a0,
  beach: 0xe8d9a8,
  sea: 0x2e7fa8,
  seaDeep: 0x1e5f8a,
};

/** Road centrelines, in metres, on one axis. */
export function roadCentres() {
  const centres = [];
  for (let c = -156; c <= 156; c += WORLD.pitch) centres.push(c);
  return centres;
}

export function isOnRoad(x, z) {
  const half = WORLD.road / 2;
  for (const c of roadCentres()) {
    if (Math.abs(x - c) < half + 0.5) return true;
    if (Math.abs(z - c) < half + 0.5) return true;
  }
  return false;
}

/** The nearest road centreline on the given axis, for traffic lanes. */
export function nearestRoad(value) {
  let best = roadCentres()[0];
  for (const c of roadCentres()) {
    if (Math.abs(c - value) < Math.abs(best - value)) best = c;
  }
  return best;
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A warm window grid, drawn once and shared by every building face. */
function windowTexture() {
  return canvasTexture(128, (g, size) => {
    g.fillStyle = '#f2e3c6';
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#2e3a4a';
    for (let y = 8; y < size - 8; y += 16) {
      for (let x = 8; x < size - 8; x += 16) {
        g.fillRect(x, y, 8, 10);
      }
    }
  });
}

function makePalm(random, trunkMat, leafMat) {
  const palm = new THREE.Group();
  const height = random.range(4, 6.5);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, height, 6), trunkMat);
  trunk.position.y = height / 2;
  trunk.rotation.z = random.range(-0.08, 0.08);
  palm.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 4), leafMat);
    const angle = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.9, height + 0.3, Math.sin(angle) * 0.9);
    leaf.rotation.z = Math.cos(angle) * 1.1;
    leaf.rotation.x = -Math.sin(angle) * 1.1;
    palm.add(leaf);
  }
  return palm;
}

export function createWorld(scene, random) {
  const buildings = []; // {minX, maxX, minZ, maxZ} — collision boxes.
  const colliders = [];
  const windows = windowTexture();

  // --- ground, roads, sidewalks, beach, sea -------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 80, WORLD.half * 2 + 80),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const centres = roadCentres();
  for (const c of centres) {
    for (const [mat, width, y] of [[walkMat, WORLD.road + 6, 0.02], [roadMat, WORLD.road, 0.04]]) {
      const alongX = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.half * 2, width), mat);
      alongX.rotation.x = -Math.PI / 2;
      alongX.position.set(0, y, c);
      alongX.receiveShadow = true;
      scene.add(alongX);
      const alongZ = new THREE.Mesh(new THREE.PlaneGeometry(width, WORLD.half * 2), mat);
      alongZ.rotation.x = -Math.PI / 2;
      alongZ.position.set(c, y, 0);
      alongZ.receiveShadow = true;
      scene.add(alongZ);
    }
    // Dashed centre line along each road.
    const dashMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
    for (let d = -WORLD.half; d < WORLD.half; d += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.4), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(d, 0.06, c);
      scene.add(dash);
      const dashZ = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 3), dashMat);
      dashZ.rotation.x = -Math.PI / 2;
      dashZ.position.set(c, 0.06, d);
      scene.add(dashZ);
    }
  }

  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 80, WORLD.beachEnd - WORLD.beachStart),
    new THREE.MeshLambertMaterial({ color: PALETTE.beach }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.03, (WORLD.beachStart + WORLD.beachEnd) / 2);
  beach.receiveShadow = true;
  scene.add(beach);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 800, WORLD.seaEnd - WORLD.seaStart + 400),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, WORLD.seaStart + (WORLD.seaEnd - WORLD.seaStart) / 2 + 100);
  scene.add(sea);

  // --- buildings ----------------------------------------------------------
  const blockCentres = [];
  for (let c = -130; c <= 130; c += WORLD.pitch) blockCentres.push(c);
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      if (bz > 130) continue; // the southern row of blocks is the beachfront.
      const count = random.int(1, 2);
      for (let i = 0; i < count; i += 1) {
        // A building's walls stay 3 m inside its block: a car driving the
        // road beside it never clips a corner that juts into the road.
        const w = count === 1 ? random.range(14, 28) : random.range(12, 15);
        const d = count === 1 ? random.range(14, 28) : random.range(12, 15);
        const h = random.range(8, 42);
        const maxOff = count === 1 ? 17 - Math.max(w, d) / 2 : 9;
        const ox = count === 1 ? random.range(-maxOff, maxOff) : (i === 0 ? -9 : 9);
        const oz = count === 1 ? random.range(-maxOff, maxOff) : (i === 0 ? -9 : 9);
        const x = bx + ox;
        const z = bz + oz;
        const colour = random.pick(BUILDING_COLOURS);
        const mat = new THREE.MeshLambertMaterial({ color: colour, map: windows });
        const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        building.position.set(x, h / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6),
          new THREE.MeshLambertMaterial({ color: random.pick(ROOF_COLOURS) }),
        );
        roof.position.set(x, h + 0.4, z);
        roof.castShadow = true;
        scene.add(roof);
        // A rooftop water tank on the taller towers, for the skyline.
        if (h > 24) {
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(1.6, 1.6, 2.6, 8),
            new THREE.MeshLambertMaterial({ color: 0x7d8a94 }),
          );
          tank.position.set(x + w / 4, h + 2, z - d / 4);
          tank.castShadow = true;
          scene.add(tank);
        }
        const box = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
        buildings.push(box);
        colliders.push(box);
      }
    }
  }

  // --- palms and lamps ------------------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2e3238 });
  const lampLight = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < 90; i += 1) {
    const onBeach = i < 24;
    const x = onBeach
      ? random.range(-WORLD.half, WORLD.half)
      : random.pick(centres) + random.pick([-8.5, 8.5]);
    const z = onBeach
      ? random.range(WORLD.beachStart + 4, WORLD.beachEnd - 4)
      : random.range(-WORLD.half, WORLD.half);
    if (!onBeach && isOnRoad(x, z)) continue;
    const palm = makePalm(random, trunkMat, leafMat);
    palm.position.set(x, 0, z);
    palm.traverse((part) => { if (part.isMesh) part.castShadow = true; });
    scene.add(palm);
  }
  for (const c of centres) {
    for (let d = -156; d <= 156; d += 52) {
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5, 6), lampMat);
      pole.position.y = 2.5;
      lamp.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lampLight);
      head.position.y = 5;
      lamp.add(head);
      lamp.position.set(c + 7.5, 0, d);
      scene.add(lamp);
    }
  }

  // --- the garage the first mission delivers to ----------------------------
  const garage = new THREE.Group();
  const garageBody = new THREE.Mesh(
    new THREE.BoxGeometry(18, 7, 12),
    new THREE.MeshLambertMaterial({ color: 0x4a6fa5, map: windows }),
  );
  garageBody.position.y = 3.5;
  garageBody.castShadow = true;
  garage.add(garageBody);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(8, 5, 0.4),
    new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }),
  );
  door.position.set(0, 2.5, 6.1);
  garage.add(door);
  // The garage sits inside its block, its door facing the road, its walls
  // clear of the road so cars can drive past it.
  garage.position.set(130, 0, -122);
  scene.add(garage);
  colliders.push({ minX: 121, maxX: 139, minZ: -128, maxZ: -116 });

  // --- sky, sun, light ------------------------------------------------------
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9ec8e8, 220, 620);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5c, 0.9));

  // A distant skyline silhouette across the bay, for depth on the horizon.
  const farMat = new THREE.MeshLambertMaterial({ color: 0x7fa8c8 });
  for (let i = 0; i < 14; i += 1) {
    const h = random.range(20, 70);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(random.range(14, 26), h, 14), farMat);
    tower.position.set(-320 + i * 50 + random.range(-8, 8), h / 2, 420);
    scene.add(tower);
  }

  return {
    buildings,
    colliders,
    /** Push a circle (x, z, radius) out of every building; returns true on a hit. */
    collideCircle(x, z, radius) {
      for (const box of colliders) {
        const cx = Math.max(box.minX, Math.min(x, box.maxX));
        const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz < radius * radius) return box;
      }
      return null;
    },
    /** Clamp a point to the playable land (city + beach), not the sea. */
    clampToLand(x, z) {
      return {
        x: Math.max(-WORLD.half, Math.min(WORLD.half, x)),
        z: Math.max(-WORLD.half, Math.min(WORLD.beachEnd - 2, z)),
      };
    },
  };
}
