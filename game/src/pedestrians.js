// Neon Bay — pedestrians. Simple figures walk the sidewalks: along a road
// on one side, turning at intersections, pausing sometimes. They step aside
// a little when the player or a car comes close, and they never walk
// through buildings or into the sea.

import * as THREE from 'three';
import { PEDESTRIAN, WORLD } from './config.js';
import { nearestRoad, roadCentres } from './world.js';

const SHIRTS = [0xe84a4a, 0x4a7de8, 0x4ae87d, 0xe8c33a, 0xe87dc3, 0x7de8e0, 0xf2f2f2, 0x8a5fd8];
const PANTS = [0x2e3238, 0x3a4a6f, 0x6f5a3a, 0x4a3a3a];

function makePersonMesh(shirt, pants) {
  const person = new THREE.Group();
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.8, 0.3),
    new THREE.MeshLambertMaterial({ color: pants }),
  );
  legs.position.y = 0.4;
  person.add(legs);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.65, 0.32),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  torso.position.y = 1.12;
  torso.castShadow = true;
  person.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  );
  head.position.y = 1.62;
  head.castShadow = true;
  person.add(head);
  return person;
}

export function createPedestrians(scene, world, random) {
  const walkers = [];
  const centres = roadCentres();

  function spawnWalker() {
    const axis = random.pick(['x', 'z']);
    const road = random.pick(centres);
    const side = random.pick([-1, 1]);
    const along = random.range(-WORLD.half + 10, WORLD.half - 10);
    const x = axis === 'x' ? along : road + side * 8.5;
    const z = axis === 'x' ? road + side * 8.5 : along;
    const mesh = makePersonMesh(random.pick(SHIRTS), random.pick(PANTS));
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    walkers.push({
      mesh, axis, road, side, dir: random.pick([-1, 1]),
      speed: random.range(PEDESTRIAN.minSpeed, PEDESTRIAN.maxSpeed),
      x, z, pause: 0, yaw: 0,
    });
  }

  for (let i = 0; i < PEDESTRIAN.count; i += 1) spawnWalker();

  function step(dt, playerPos) {
    for (const w of walkers) {
      if (w.pause > 0) {
        w.pause -= dt;
        continue;
      }
      // Step aside from the player when they get close.
      const pdx = w.x - playerPos.x;
      const pdz = w.z - playerPos.z;
      const pd = Math.hypot(pdx, pdz);
      if (pd < 3 && pd > 0.01) {
        w.x += (pdx / pd) * 2 * dt;
        w.z += (pdz / pd) * 2 * dt;
      }
      const move = w.speed * w.dir * dt;
      if (w.axis === 'x') w.x += move;
      else w.z += move;
      const along = w.axis === 'x' ? w.x : w.z;
      // At an intersection, sometimes turn onto the crossing sidewalk.
      const cross = nearestRoad(along);
      if (Math.abs(along - cross) < 1 && random.next() < 0.01) {
        const newSide = random.pick([-1, 1]);
        if (w.axis === 'x') {
          w.axis = 'z';
          w.road = cross;
          w.z = cross + newSide * 8.5;
          w.x = cross;
        } else {
          w.axis = 'x';
          w.road = cross;
          w.x = cross + newSide * 8.5;
          w.z = cross;
        }
        w.side = newSide;
        w.dir = random.pick([-1, 1]);
      }
      if (along > WORLD.half - 6 || along < -WORLD.half + 6) {
        w.dir *= -1;
      }
      if (random.next() < 0.001) w.pause = random.range(1, 4);
      w.yaw = w.axis === 'x' ? (w.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (w.dir > 0 ? 0 : Math.PI);
      w.mesh.position.set(w.x, 0, w.z);
      w.mesh.rotation.y = w.yaw;
      // A simple walk bob.
      w.mesh.position.y = Math.abs(Math.sin((w.x + w.z) * 4)) * 0.05;
    }
  }

  return { walkers, step };
}
