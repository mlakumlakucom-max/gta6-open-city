// Neon Bay — missions and the story. Three missions in order, each a small
// state machine: steps with a text objective and a check that runs every
// frame, plus an optional clock. The active mission's marker (a light beam
// in the world and dots on the minimap) is drawn by the HUD and by main.js
// from the mission's target. Courier Run fails when its timer runs out and
// offers a retry; finishing all three pays a story bonus and opens free
// roam. A mission only starts when the player is ready for it: the first
// two need a car, Hot Pursuit needs two wanted stars.

import * as THREE from 'three';
import { MISSIONS } from './config.js';

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

function nearPoint(x, z, radius) {
  return (game) => {
    const at = game.driving || game.player;
    return Math.hypot(at.x - x, at.z - z) < radius;
  };
}

export function createMissions(scene) {
  const beacon = makeBeacon(scene);
  const drops = MISSIONS.courierDrops;
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
    {
      id: 'courier-run',
      title: 'Courier Run',
      intro: 'Rae has a package job: pick it up at the depot, then three drops across the city — on the clock.',
      timerSeconds: MISSIONS.courierTimeSeconds,
      steps: [
        {
          text: 'Pick up the package at the courier depot (green beacon)',
          target: { x: MISSIONS.courierDepot.x, z: MISSIONS.courierDepot.z },
          // 8 m, like every other delivery: a car braking to a stop 7 m
          // out must still be inside the pickup, or the mission stalls.
          check: nearPoint(MISSIONS.courierDepot.x, MISSIONS.courierDepot.z, 8),
        },
        {
          text: 'Drop 1 of 3 — the north-west tower block',
          target: { x: drops[0].x, z: drops[0].z },
          check: nearPoint(drops[0].x, drops[0].z, 8),
        },
        {
          text: 'Drop 2 of 3 — the beachfront promenade',
          target: { x: drops[1].x, z: drops[1].z },
          check: nearPoint(drops[1].x, drops[1].z, 8),
        },
        {
          text: 'Drop 3 of 3 — the east marina gate',
          target: { x: drops[2].x, z: drops[2].z },
          check: nearPoint(drops[2].x, drops[2].z, 8),
        },
      ],
      reward: MISSIONS.courierReward,
    },
    {
      id: 'hot-pursuit',
      title: 'Hot Pursuit',
      intro: 'The cops are on to Rae. Lose them — get to the safehouse on the beach before they bust you.',
      steps: [
        {
          text: 'The heat is on: two stars and counting — run!',
          target: null,
          check(game) {
            return game.police.wanted >= 2;
          },
        },
        {
          text: 'Reach the safehouse on the beach (follow the green beacon)',
          target: { x: MISSIONS.safehouse.x, z: MISSIONS.safehouse.z },
          check: nearPoint(MISSIONS.safehouse.x, MISSIONS.safehouse.z, 8),
        },
      ],
      reward: MISSIONS.pursuitReward,
      /** Hot Pursuit opens with the police already on the player's tail. */
      onStart(game) {
        game.raiseWanted(2);
      },
    },
  ];
  let activeIndex = 0;
  let stepIndex = 0;
  let doneIds = [];
  let failed = false;
  let failedText = '';
  let timerEndsAt = 0;
  let timerStarted = false;
  let storyDone = false;

  function active() {
    return list[activeIndex] || null;
  }

  function timeLeft(game) {
    const mission = active();
    if (!mission || !mission.timerSeconds || !timerStarted) return null;
    return Math.max(0, timerEndsAt - game.elapsed);
  }

  function stepText(game) {
    if (storyDone) return 'Story Complete! Free roam — Neon Bay is yours';
    const mission = active();
    if (!mission) return 'Free roam — explore Neon Bay';
    if (failed) return `${mission.title}: FAILED — ${failedText} Press Enter to retry.`;
    const left = timeLeft(game);
    const clock = left === null ? '' : ` — ${Math.ceil(left)}s left`;
    return `${mission.title}: ${mission.steps[stepIndex].text}${clock}`;
  }

  return {
    list,
    get done() {
      return doneIds.length > 0;
    },
    get doneIds() {
      return [...doneIds];
    },
    get activeMission() {
      return active();
    },
    get failed() {
      return failed;
    },
    get storyDone() {
      return storyDone;
    },
    get timeLeft() {
      return timeLeft;
    },
    get target() {
      const mission = active();
      if (!mission || failed) return null;
      return mission.steps[stepIndex].target;
    },
    /** Every marker the minimap should draw for the active step. */
    targets() {
      const t = this.target;
      return t ? [t] : [];
    },
    stepText,
    /** Advance the mission from the game's state; returns the reward when a mission completes. */
    step(game) {
      const mission = active();
      if (!mission || failed || storyDone) return 0;
      // The clock starts on the pickup step of a timed mission.
      if (mission.timerSeconds && !timerStarted && stepIndex > 0) {
        timerStarted = true;
        timerEndsAt = game.elapsed + mission.timerSeconds;
      }
      const left = timeLeft(game);
      if (left !== null && left <= 0) {
        failed = true;
        failedText = 'the package is late.';
        return 0;
      }
      const step = mission.steps[stepIndex];
      if (step.check(game)) {
        stepIndex += 1;
        if (stepIndex >= mission.steps.length) {
          doneIds.push(mission.id);
          activeIndex += 1;
          stepIndex = 0;
          timerStarted = false;
          const next = active();
          if (next && next.onStart) next.onStart(game);
          if (!next) {
            storyDone = true;
            return mission.reward + MISSIONS.storyBonus;
          }
          return mission.reward;
        }
      }
      return 0;
    },
    /** Retry the failed mission from its first step, clock reset. */
    retry() {
      failed = false;
      failedText = '';
      stepIndex = 0;
      timerStarted = false;
      timerEndsAt = 0;
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
    /**
     * Stage a mission step for a screenshot scene: jump straight to the
     * named mission and step, with earlier missions marked done. A timed
     * mission past its pickup starts its clock from the game's clock.
     */
    stage(missionIndex, step, game) {
      // NOTE: the parameter is `step`, not `stepIndex` — naming it the
      // same as the closure variable made `stepIndex = stepIndex` a no-op
      // and left the mission on its first step with the clock running.
      activeIndex = missionIndex;
      stepIndex = step;
      doneIds = list.slice(0, missionIndex).map((m) => m.id);
      failed = false;
      const mission = active();
      if (mission && mission.timerSeconds && step > 0) {
        timerStarted = true;
        timerEndsAt = game.elapsed + mission.timerSeconds;
      }
    },
    /** Reset all three missions (the Try Again button after WASTED/BUSTED). */
    reset() {
      activeIndex = 0;
      stepIndex = 0;
      doneIds = [];
      failed = false;
      failedText = '';
      timerStarted = false;
      timerEndsAt = 0;
      storyDone = false;
    },
    restore(saved) {
      // v1 saved one boolean (mission 1 done); v2 saves the id list.
      const ids = Array.isArray(saved) ? saved : (saved ? ['first-wheels'] : []);
      doneIds = ids.filter((id) => list.some((m) => m.id === id));
      activeIndex = doneIds.length;
      stepIndex = 0;
      if (activeIndex >= list.length) storyDone = true;
      const next = active();
      if (next && next.onStart && doneIds.length > 0) {
        // Do not re-raise the heat on load: the player starts clean.
      }
    },
  };
}
