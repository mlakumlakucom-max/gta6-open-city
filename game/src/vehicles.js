// Neon Bay — cars. Traffic cars drive the road lanes with a simple brain:
// follow a road, turn at an intersection sometimes, slow for the car ahead,
// turn around at the edge of the city. Parked cars sit at the kerb and can
// be entered with E. The player's driven car is arcade physics: accelerate,
// brake, steer, collide with buildings and other cars.

import * as THREE from 'three';
import { CAR, TRAFFIC, WORLD } from './config.js';
import { isOnRoad, nearestRoad, roadCentres } from './world.js';

const PAINT = [
  0xd84040, 0x3a6fd8, 0xe8c33a, 0x40b878, 0xe8e8e8, 0x2e3238,
  0xd88a3a, 0x8a5fd8, 0xc9d6e8, 0x7d8a94, 0xf2a0c0, 0x3a8a8a,
];
const WHEEL_GEOM = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x1a1c1e });

export function makeCarMesh(colour) {
  const car = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colour });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.65, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1e2a3a }),
  );
  cabin.position.set(0, 1.15, -0.2);
  cabin.castShadow = true;
  car.add(cabin);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(WHEEL_GEOM, WHEEL_MAT);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    car.add(wheel);
    wheels.push(wheel);
  }
  // Brake lights on the rear: dim red at rest, bright red while braking.
  const brakeMats = [];
  for (const x of [-0.7, 0.7]) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x881111 });
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.08), mat);
    light.position.set(x, 0.62, -2.22);
    car.add(light);
    brakeMats.push(mat);
  }
  return { group: car, wheels, brakeMats };
}

/**
 * Set a car's brake lights bright (braking) or dim (coasting). Exported so
 * police cars — built from the same mesh — can light theirs too.
 */
export function setBrakes(brakeMats, on) {
  for (const mat of brakeMats) mat.color.setHex(on ? 0xff2222 : 0x881111);
}

function laneOffset(axis, dir) {
  // Right-hand traffic: the lane sits 3 m to the right of the travel direction.
  // Facing +x, right is +z; facing +z, right is -x.
  return axis === 'x' ? 3 * dir : -3 * dir;
}

export function createVehicles(scene, world, random) {
  const traffic = [];
  const parked = [];
  const centres = roadCentres();

  // Skid marks and dust puffs: small pools of fading planes, reused so a
  // long drift never allocates. Marks lie flat on the road; dust rises.
  const skidPool = [];
  for (let i = 0; i < 80; i += 1) {
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0 }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.07;
    mark.visible = false;
    scene.add(mark);
    skidPool.push({ mesh: mark, life: 0 });
  }
  let skidNext = 0;
  const dustPool = [];
  for (let i = 0; i < 24; i += 1) {
    const puff = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xd8cdb2, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    puff.visible = false;
    scene.add(puff);
    dustPool.push({ mesh: puff, life: 0 });
  }
  let dustNext = 0;

  function placeSkid(x, z, yaw) {
    const slot = skidPool[skidNext];
    skidNext = (skidNext + 1) % skidPool.length;
    slot.mesh.position.set(x, 0.07, z);
    slot.mesh.rotation.z = -yaw;
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 0.55;
    slot.life = 4;
  }
  function puffDust(x, z) {
    const slot = dustPool[dustNext];
    dustNext = (dustNext + 1) % dustPool.length;
    slot.mesh.position.set(x, 0.5, z);
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 0.4;
    slot.life = 0.9;
  }
  function stepEffects(dt) {
    for (const slot of skidPool) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.material.opacity = Math.max(0, slot.life / 4) * 0.55;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    for (const slot of dustPool) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.position.y += dt * 1.2;
      slot.mesh.material.opacity = Math.max(0, slot.life / 0.9) * 0.4;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
  }

  function spawnTrafficCar() {
    const axis = random.pick(['x', 'z']);
    const road = random.pick(centres);
    const dir = random.pick([-1, 1]);
    const along = random.range(-WORLD.half + 10, WORLD.half - 10);
    const off = laneOffset(axis, dir);
    const x = axis === 'x' ? along : road + off;
    const z = axis === 'x' ? road + off : along;
    const { group, wheels, brakeMats } = makeCarMesh(random.pick(PAINT));
    group.position.set(x, 0, z);
    group.rotation.y = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    scene.add(group);
    const car = {
      mesh: group, wheels, brakeMats, axis, dir, road, speed: random.range(TRAFFIC.minSpeed, TRAFFIC.maxSpeed),
      cruise: random.range(TRAFFIC.minSpeed, TRAFFIC.maxSpeed), x, z, yaw: group.rotation.y,
    };
    traffic.push(car);
    return car;
  }

  function spawnParkedCar(x, z, yaw) {
    const { group, wheels, brakeMats } = makeCarMesh(random.pick(PAINT));
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    const car = { mesh: group, wheels, brakeMats, x, z, yaw, speed: 0, parked: true, owned: false };
    parked.push(car);
    return car;
  }

  // Traffic on the roads, parked cars at the kerbs.
  for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar();
  for (let i = 0; i < 10; i += 1) {
    const axis = random.pick(['x', 'z']);
    const road = random.pick(centres);
    const along = random.range(-WORLD.half + 15, WORLD.half - 15);
    const side = random.pick([-1, 1]);
    // Parked at the kerb, on the road itself: pulling out straight ahead
    // never runs the car into a building face on the sidewalk.
    const x = axis === 'x' ? along : road + side * 5;
    const z = axis === 'x' ? road + side * 5 : along;
    const yaw = axis === 'x' ? Math.PI / 2 : 0;
    spawnParkedCar(x, z, yaw + (side < 0 ? Math.PI : 0));
  }

  function carAhead(car) {
    let nearest = Infinity;
    for (const other of traffic) {
      if (other === car || other.axis !== car.axis || other.dir !== car.dir || other.road !== car.road) continue;
      const gap = car.axis === 'x'
        ? (other.x - car.x) * car.dir
        : (other.z - car.z) * car.dir;
      if (gap > 0 && gap < nearest) nearest = gap;
    }
    return nearest;
  }

  function stepTraffic(dt) {
    stepEffects(dt);
    for (const car of traffic) {
      // Slow for the car ahead, stop bumper to bumper.
      const gap = carAhead(car);
      const target = gap < TRAFFIC.followGap ? 0 : car.cruise;
      const wasFaster = car.speed > target + 0.5;
      car.speed += Math.max(-14 * dt, Math.min(8 * dt, target - car.speed));
      setBrakes(car.brakeMats, wasFaster && car.speed > 0.5);
      const move = car.speed * car.dir * dt;
      if (car.axis === 'x') car.x += move;
      else car.z += move;

      // At an intersection, sometimes turn onto the crossing road.
      const along = car.axis === 'x' ? car.x : car.z;
      const cross = nearestRoad(along);
      if (Math.abs(along - cross) < 1.2 && random.next() < 0.012) {
        const newDir = random.pick([-1, 1]);
        const off = laneOffset(car.axis === 'x' ? 'z' : 'x', newDir);
        if (car.axis === 'x') {
          car.axis = 'z';
          car.road = cross;
          car.z = cross + off;
          car.x = cross;
        } else {
          car.axis = 'x';
          car.road = cross;
          car.x = cross + off;
          car.z = cross;
        }
        car.dir = newDir;
      }

      // At the city's edge, turn around.
      const pos = car.axis === 'x' ? car.x : car.z;
      if (pos > WORLD.half - 4 || pos < -WORLD.half + 4) {
        car.dir *= -1;
        const off = laneOffset(car.axis, car.dir);
        if (car.axis === 'x') car.z = car.road + off;
        else car.x = car.road + off;
      }

      car.yaw = car.axis === 'x'
        ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (car.dir > 0 ? 0 : Math.PI);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.yaw;
      for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt * 2.8;
    }
  }

  return {
    traffic,
    parked,
    /** The nearest parked car within range of (x, z), or null. */
    nearestParked(x, z, range) {
      let best = null;
      let bestD = range;
      for (const car of parked) {
        const d = Math.hypot(car.x - x, car.z - z);
        if (d < bestD) {
          best = car;
          bestD = d;
        }
      }
      return best;
    },
    /** Drive one arcade step for the player's car. Returns true on a hard hit. */
    drivePlayer(car, input, dt) {
      const fwd = input.forward;
      const steer = input.strafe;
      let crashed = false;
      if (fwd > 0) car.speed += CAR.accel * dt;
      else if (fwd < 0) {
        car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
      } else {
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
      }
      car.speed = Math.max(-CAR.reverseSpeed, Math.min(CAR.topSpeed, car.speed));
      // Braking lights up the rear; a hard turn at speed leaves skid marks
      // and kicks up dust at the rear wheels.
      const braking = fwd < 0 && car.speed > 0.5;
      setBrakes(car.brakeMats, braking);
      const drifting = Math.abs(steer) > 0.35 && Math.abs(car.speed) > 15;
      if (drifting) {
        const back = -1.45;
        const rx = Math.cos(car.yaw);
        const rz = -Math.sin(car.yaw);
        for (const side of [-0.95, 0.95]) {
          placeSkid(
            car.x + Math.sin(car.yaw) * back + rx * side,
            car.z + Math.cos(car.yaw) * back + rz * side,
            car.yaw,
          );
          puffDust(
            car.x + Math.sin(car.yaw) * back + rx * side,
            car.z + Math.cos(car.yaw) * back + rz * side,
          );
        }
      }
      const steerAngle = steer * CAR.steerMax * (1 - Math.min(0.6, Math.abs(car.speed) / CAR.topSpeed));
      // Steering stays useful at low speed: without this floor the turn
      // radius is wider than a city block and a U-turn wedges the car in a
      // building. Top speed keeps the same wide, fast feel.
      const speedFactor = 0.25 + 0.75 * Math.min(1, Math.abs(car.speed) / CAR.topSpeed);
      car.yaw += steerAngle * speedFactor * CAR.steerSpeed * dt * (car.speed >= 0 ? 1 : -1);
      const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
      const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
      const hit = world.collideCircle(nx, nz, CAR.radius);
      if (hit) {
        // Slide along the wall instead of stopping dead: keep the tangential part.
        const cx = Math.max(hit.minX, Math.min(nx, hit.maxX));
        const cz = Math.max(hit.minZ, Math.min(nz, hit.maxZ));
        const dx = nx - cx;
        const dz = nz - cz;
        const len = Math.hypot(dx, dz) || 1;
        const push = CAR.radius - Math.hypot(nx - cx, nz - cz);
        if (Math.abs(car.speed) > 6) crashed = true;
        car.speed *= 0.35;
        car.x = nx + (dx / len) * Math.max(0, push);
        car.z = nz + (dz / len) * Math.max(0, push);
      } else {
        car.x = nx;
        car.z = nz;
      }
      const land = world.clampToLand(car.x, car.z);
      car.x = land.x;
      car.z = land.z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.yaw;
      for (const wheel of car.wheels) wheel.rotation.x += car.speed * dt * 2.8;
      return crashed;
    },
    stepTraffic,
    /** A parked car becomes the player's: mark it owned (no longer a theft). */
    steal(car) {
      car.parked = false;
      car.owned = false;
    },
  };
}
