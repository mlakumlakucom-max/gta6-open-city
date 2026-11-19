// Neon Bay — the wanted level and the police. Stealing a car raises the
// wanted level; hitting a pedestrian or a police car raises it further.
// Each star keeps a police car on the player: they spawn on a road near the
// player and chase, steering toward the player and ramming. When every
// police car is far away for a few seconds, the heat cools and a star drops.

import * as THREE from 'three';
import { POLICE, WORLD } from './config.js';
import { makeCarMesh, setBrakes } from './vehicles.js';
import { nearestRoad, roadCentres } from './world.js';

const POLICE_PAINT = 0x1e2a3a;

function makePoliceMesh() {
  const { group, wheels, brakeMats } = makeCarMesh(POLICE_PAINT);
  // White doors and a light bar, so a police car reads at a glance.
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(2.04, 0.4, 1.6),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
  );
  door.position.y = 0.6;
  group.add(door);
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.18, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xff2020 }),
  );
  bar.position.set(0, 1.55, -0.2);
  group.add(bar);
  const bar2 = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.18, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x2040ff }),
  );
  bar2.position.set(0, 1.55, 0.25);
  group.add(bar2);
  // The mesh already carries brake lights (makeCarMesh builds them for
  // every car); police cars light theirs when lining up a ram.
  return { group, wheels, brakeMats, bar, bar2 };
}

export function createPolice(scene, world, random) {
  const cars = [];
  let wanted = 0;
  let escapeTimer = 0;

  function spawnCar(playerPos) {
    const centres = roadCentres();
    const road = nearestRoad(playerPos.x + random.range(-60, 60));
    const roadZ = nearestRoad(playerPos.z + random.range(-60, 60));
    const onXRoad = random.next() < 0.5;
    const x = onXRoad ? playerPos.x + random.pick([-1, 1]) * POLICE.spawnDistance : road;
    const z = onXRoad ? roadZ : playerPos.z + random.pick([-1, 1]) * POLICE.spawnDistance;
    const { group, wheels, brakeMats, bar, bar2 } = makePoliceMesh();
    group.position.set(x, 0, z);
    scene.add(group);
    const car = { mesh: group, wheels, brakeMats, bar, bar2, x, z, yaw: 0, speed: 0, ramCooldown: 0 };
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const index = cars.indexOf(car);
    if (index !== -1) cars.splice(index, 1);
  }

  return {
    get wanted() {
      return wanted;
    },
    get cars() {
      return cars;
    },
    raise(amount) {
      wanted = Math.min(3, wanted + amount);
      escapeTimer = 0;
    },
    lower(amount) {
      wanted = Math.max(0, wanted - amount);
      escapeTimer = 0;
    },
    clear() {
      wanted = 0;
      escapeTimer = 0;
      for (const car of [...cars]) removeCar(car);
    },
    /** Keep the right number of police cars, chase the player, ram on contact. */
    step(dt, playerPos, playerSpeed, onRam) {
      const want = POLICE.carsPerStar[wanted];
      while (cars.length < want) spawnCar(playerPos);
      while (cars.length > want) removeCar(cars[cars.length - 1]);

      let nearest = Infinity;
      for (const car of cars) {
        const dx = playerPos.x - car.x;
        const dz = playerPos.z - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist < nearest) nearest = dist;
        const targetYaw = Math.atan2(dx, dz);
        let dyaw = targetYaw - car.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        car.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, dyaw));
        // Brake lights flare while the car swings hard to line up a ram or
        // closes in for one — the same dim/bright pair as player and
        // traffic cars, so a chase reads the same from every angle.
        setBrakes(car.brakeMats, Math.abs(dyaw) > 0.6 || dist < 5);
        car.speed = Math.min(POLICE.chaseSpeed, car.speed + 12 * dt);
        car.x += Math.sin(car.yaw) * car.speed * dt;
        car.z += Math.cos(car.yaw) * car.speed * dt;
        const land = world.clampToLand(car.x, car.z);
        car.x = land.x;
        car.z = land.z;
        car.mesh.position.set(car.x, 0, car.z);
        car.mesh.rotation.y = car.yaw;
        for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt * 2.8;
        // Flashing light bar.
        const on = Math.sin(performance.now() / 120) > 0;
        car.bar.material.color.setHex(on ? 0xff2020 : 0x601010);
        car.bar2.material.color.setHex(on ? 0x101060 : 0x2040ff);
        // A ram hurts once per car per 1.5 s: without the cooldown three
        // police cars ramming every step would bust the player instantly.
        car.ramCooldown -= dt;
        if (dist < 3.2 && car.ramCooldown <= 0) {
          car.ramCooldown = 1.5;
          onRam(car);
          // Bounce the police car back so it does not sit inside the player.
          car.x -= Math.sin(car.yaw) * 6;
          car.z -= Math.cos(car.yaw) * 6;
          car.speed *= 0.4;
        }
      }

      // Cooling off: no police car close for long enough drops a star.
      if (wanted > 0 && cars.length > 0 && nearest > POLICE.escapeDistance) {
        escapeTimer += dt;
        if (escapeTimer > POLICE.escapeSeconds) {
          wanted -= 1;
          escapeTimer = 0;
        }
      } else {
        escapeTimer = 0;
      }
      void playerSpeed;
    },
  };
}
