// Neon Bay — combat on foot. F throws a punch (short range, knocks a
// pedestrian or a foot cop back — and the police notice), mouse click fires
// a pistol (a hitscan ray with a tracer line and a muzzle flash, 12 rounds
// a magazine, R reloads, yellow ammo crates refill the magazine). At
// wanted 2 or more, foot cops spawn while the player is on foot and chase
// them down; get in a car and the cars take over the chase instead.

import * as THREE from 'three';
import { COMBAT, FOOT_POLICE } from './config.js';

function makeCopMesh() {
  const cop = new THREE.Group();
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.8, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x1a2333 }),
  );
  legs.position.y = 0.4;
  cop.add(legs);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.65, 0.32),
    new THREE.MeshLambertMaterial({ color: 0x1e3a6e }),
  );
  torso.position.y = 1.12;
  torso.castShadow = true;
  cop.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
  );
  head.position.y = 1.62;
  head.castShadow = true;
  cop.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.08, 10),
    new THREE.MeshLambertMaterial({ color: 0x14203a }),
  );
  cap.position.y = 1.8;
  cop.add(cap);
  return cop;
}

function makeCrateMesh() {
  const crate = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshLambertMaterial({ color: 0x8a6f2e }),
  );
  box.position.y = 0.45;
  box.castShadow = true;
  crate.add(box);
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.12, 0.95),
    new THREE.MeshLambertMaterial({ color: 0xe8c33a }),
  );
  lid.position.y = 0.95;
  crate.add(lid);
  return crate;
}

export function createCombat(scene, world) {
  // One tracer line and one muzzle flash, reused for every shot.
  const tracerGeom = new THREE.BufferGeometry();
  tracerGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.Line(
    tracerGeom,
    new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0 }),
  );
  tracer.frustumCulled = false;
  scene.add(tracer);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0 }),
  );
  scene.add(flash);

  const crates = COMBAT.ammoCrates.map((spot) => {
    const mesh = makeCrateMesh();
    mesh.position.set(spot.x, 0, spot.z);
    scene.add(mesh);
    return { x: spot.x, z: spot.z, mesh, respawnAt: 0 };
  });

  const cops = [];
  let ammo = COMBAT.magSize;
  let reloading = false;
  let reloadEndsAt = 0;
  let lastFireAt = -10;
  let lastPunchAt = -10;
  let lastCrimeAt = -10;
  let tracerUntil = 0;
  let flashUntil = 0;

  function spawnCop(x, z) {
    const mesh = makeCopMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const cop = { mesh, x, z, hp: 60, punchAt: 0, leaving: false, leaveAt: 0 };
    cops.push(cop);
    return cop;
  }

  function removeCop(cop) {
    scene.remove(cop.mesh);
    const i = cops.indexOf(cop);
    if (i !== -1) cops.splice(i, 1);
  }

  function knockBack(target, fromX, fromZ, metres) {
    const dx = target.x - fromX;
    const dz = target.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    target.x += (dx / len) * metres;
    target.z += (dz / len) * metres;
    const land = world.clampToLand(target.x, target.z);
    target.x = land.x;
    target.z = land.z;
    target.mesh.position.set(target.x, 0, target.z);
  }

  /** The closest shootable target along the ray, or null. */
  function rayHit(origin, dir) {
    let best = null;
    let bestT = COMBAT.pistolRange;
    const consider = (x, z, radius, kind, ref) => {
      const dx = x - origin.x;
      const dz = z - origin.z;
      const t = dx * dir.x + dz * dir.z;
      if (t < 1 || t > bestT) return;
      const px = origin.x + dir.x * t;
      const pz = origin.z + dir.z * t;
      if (Math.hypot(x - px, z - pz) < radius) {
        best = { kind, ref, t, x: px, z: pz };
        bestT = t;
      }
    };
    // best is read after every consider() call, so expose it by getter.
    return { consider, get best() { return best; } };
  }

  return {
    /** Stage a foot cop at an exact spot (screenshot scenes only). */
    placeCop(x, z) {
      return spawnCop(x, z);
    },
    get ammo() {
      return ammo;
    },
    get magSize() {
      return COMBAT.magSize;
    },
    get reloading() {
      return reloading;
    },
    get cops() {
      return cops;
    },
    get crates() {
      return crates;
    },
    /** F: punch whatever is in front of the player. Returns 'ped' | 'cop' | null. */
    punch(game, now) {
      if (now - lastPunchAt < COMBAT.punchCooldown) return null;
      lastPunchAt = now;
      const p = game.player;
      const fx = Math.sin(p.yaw);
      const fz = Math.cos(p.yaw);
      let hit = null;
      let hitKind = null;
      let hitD = COMBAT.punchRange;
      const consider = (x, z, ref, kind) => {
        const dx = x - p.x;
        const dz = z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > hitD || d < 0.01) return;
        if ((dx * fx + dz * fz) / d < 0.4) return;
        hit = ref;
        hitKind = kind;
        hitD = d;
      };
      for (const w of game.pedestrians.walkers) consider(w.x, w.z, w, 'ped');
      for (const cop of cops) consider(cop.x, cop.z, cop, 'cop');
      if (!hit) return null;
      if (hitKind === 'ped') {
        hit.pause = 2;
        knockBack(hit, p.x, p.z, 3);
      } else {
        hit.hp -= COMBAT.punchDamage;
        knockBack(hit, p.x, p.z, 2.5);
        if (hit.hp <= 0) removeCop(hit);
      }
      if (now - lastCrimeAt > 5) {
        lastCrimeAt = now;
        game.raiseWanted(1);
      }
      return hitKind;
    },
    /** Mouse click: one hitscan pistol shot along the camera's forward ray. */
    shoot(game, cameraYaw, cameraPitch, now, audio) {
      if (reloading || now - lastFireAt < COMBAT.fireCooldown) return null;
      if (ammo <= 0) {
        if (audio) audio.denied();
        return 'empty';
      }
      lastFireAt = now;
      ammo -= 1;
      const p = game.player;
      const origin = { x: p.x, y: 1.4, z: p.z };
      const dir = {
        x: -Math.sin(cameraYaw) * Math.cos(cameraPitch),
        y: -Math.sin(cameraPitch),
        z: -Math.cos(cameraYaw) * Math.cos(cameraPitch),
      };
      const ray = rayHit(origin, dir);
      for (const w of game.pedestrians.walkers) ray.consider(w.x, w.z, 1.1, 'ped', w);
      for (const cop of cops) ray.consider(cop.x, cop.z, 1.1, 'cop', cop);
      for (const car of game.police.cars) ray.consider(car.x, car.z, 2.4, 'police-car', car);
      const best = ray.best;
      const endX = origin.x + dir.x * (best ? best.t : COMBAT.pistolRange);
      const endY = origin.y + dir.y * (best ? best.t : COMBAT.pistolRange);
      const endZ = origin.z + dir.z * (best ? best.t : COMBAT.pistolRange);
      const pos = tracerGeom.attributes.position;
      pos.setXYZ(0, origin.x + dir.x * 0.6, origin.y, origin.z + dir.z * 0.6);
      pos.setXYZ(1, endX, endY, endZ);
      pos.needsUpdate = true;
      tracer.material.opacity = 0.9;
      tracerUntil = now + 0.09;
      flash.position.set(origin.x + dir.x * 0.7, origin.y, origin.z + dir.z * 0.7);
      flash.material.opacity = 0.95;
      flashUntil = now + 0.06;
      if (audio) audio.shot();
      if (!best) return 'miss';
      if (best.kind === 'ped') {
        best.ref.pause = 2;
        knockBack(best.ref, p.x, p.z, 2.5);
      } else if (best.kind === 'cop') {
        best.ref.hp -= COMBAT.pistolDamage;
        knockBack(best.ref, p.x, p.z, 2);
        if (best.ref.hp <= 0) removeCop(best.ref);
      }
      if (now - lastCrimeAt > 5) {
        lastCrimeAt = now;
        game.raiseWanted(1);
      }
      return best.kind;
    },
    /** R: start a reload (the magazine refills when the timer runs out). */
    startReload(now) {
      if (reloading || ammo >= COMBAT.magSize) return false;
      reloading = true;
      reloadEndsAt = now + COMBAT.reloadSeconds;
      return true;
    },
    /** Foot-cop AI, tracer/flash fade, reload timer, ammo crates. */
    step(dt, game, now) {
      if (tracer.material.opacity > 0 && now > tracerUntil) tracer.material.opacity = 0;
      if (flash.material.opacity > 0 && now > flashUntil) flash.material.opacity = 0;
      if (reloading && now >= reloadEndsAt) {
        reloading = false;
        ammo = COMBAT.magSize;
      }
      // Ammo crates: walk over one to refill, it comes back after 30 s.
      const p = game.player;
      for (const crate of crates) {
        if (crate.respawnAt > 0) {
          if (now >= crate.respawnAt) {
            crate.respawnAt = 0;
            crate.mesh.visible = true;
          }
          continue;
        }
        if (Math.hypot(crate.x - p.x, crate.z - p.z) < 2 && ammo < COMBAT.magSize) {
          ammo = COMBAT.magSize;
          crate.mesh.visible = false;
          crate.respawnAt = now + 30;
        }
      }
      // Foot cops only hunt while the player is on foot and wanted.
      const hunting = !game.driving && game.police.wanted >= 2;
      if (hunting) {
        while (cops.length < FOOT_POLICE.maxCops) {
          const angle = Math.random() * Math.PI * 2;
          spawnCop(
            p.x + Math.sin(angle) * FOOT_POLICE.spawnDistance,
            p.z + Math.cos(angle) * FOOT_POLICE.spawnDistance,
          );
        }
      }
      for (const cop of [...cops]) {
        if (!hunting) {
          // The chase is over (player in a car, or the heat died): cops leave.
          if (!cop.leaving) {
            cop.leaving = true;
            cop.leaveAt = now + 3;
          }
          if (now >= cop.leaveAt) removeCop(cop);
          continue;
        }
        cop.leaving = false;
        const dx = p.x - cop.x;
        const dz = p.z - cop.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.6) {
          cop.x += (dx / d) * FOOT_POLICE.speed * dt;
          cop.z += (dz / d) * FOOT_POLICE.speed * dt;
          cop.mesh.position.set(cop.x, 0, cop.z);
          cop.mesh.rotation.y = Math.atan2(dx, dz);
        } else if (now - cop.punchAt > FOOT_POLICE.punchCooldown) {
          cop.punchAt = now;
          game.hurt(FOOT_POLICE.punchDamage, 'foot');
        }
      }
    },
  };
}
