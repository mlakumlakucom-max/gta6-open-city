// Neon Bay — missions and the story. v1 ships one mission; the list is a
// small state machine so v2 adds more the same way. Each mission has steps
// with a text objective and a check that runs every frame; the active
// mission's marker (a light beam in the world and a dot on the minimap) is
// drawn by the HUD and by main.js from the mission's target.

import * as THREE from 'three';
import { MISSIONS, PLAYER } from './config.js';

function makeBeacon(scene) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x40ff80, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = 30;
  beam.visible = false;
  scene.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0x40ff80, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  ring.visible = false;
  scene.add(ring);
  return { beam, ring };
}

export function createMissions(scene) {
  const beacon = makeBeacon(scene);
  const list = [
    {
      id: 'first-wheels',
      title: 'First Wheels',
      intro: 'Rae needs wheels. Steal a car and bring it to the garage on Palm Row.',
      steps: [
        {
          text: 'Steal a car — walk up to a parked car and press E',
          target: null,
          check(game) {
            return game.driving !== null;
          },
        },
        {
          text: 'Deliver the car to the garage (follow the green beacon)',
          target: { x: MISSIONS.garage.x, z: MISSIONS.garage.z },
          check(game) {
            if (!game.driving) return false;
            return Math.hypot(game.driving.x - MISSIONS.garage.x, game.driving.z - MISSIONS.garage.z) < 8;
          },
        },
      ],
      reward: MISSIONS.firstWheelsReward,
    },
  ];
  let activeIndex = 0;
  let stepIndex = 0;
  let done = false;

  function active() {
    return list[activeIndex] || null;
  }

  function stepText() {
    const mission = active();
    if (!mission) return 'Free roam — explore Neon Bay';
    if (done) return `${mission.title}: complete!`;
    return `${mission.title}: ${mission.steps[stepIndex].text}`;
  }

  return {
    list,
    get done() {
      return done;
    },
    get activeMission() {
      return active();
    },
    get target() {
      const mission = active();
      if (!mission || done) return null;
      return mission.steps[stepIndex].target;
    },
    stepText,
    /** Advance the mission from the game's state; returns the reward when a mission completes. */
    step(game) {
      const mission = active();
      if (!mission || done) return 0;
      const step = mission.steps[stepIndex];
      if (step.check(game)) {
        stepIndex += 1;
        if (stepIndex >= mission.steps.length) {
          done = true;
          activeIndex += 1;
          stepIndex = 0;
          return mission.reward;
        }
      }
      return 0;
    },
    /** Move the beacon to the active step's target, or hide it. */
    updateBeacon() {
      const target = this.target;
      beacon.beam.visible = !!target;
      beacon.ring.visible = !!target;
      if (target) {
        beacon.beam.position.set(target.x, 30, target.z);
        beacon.ring.position.set(target.x, 0.1, target.z);
      }
    },
    restore(savedDone) {
      done = !!savedDone;
      if (done) {
        activeIndex = 1;
        stepIndex = 0;
      }
    },
  };
}
