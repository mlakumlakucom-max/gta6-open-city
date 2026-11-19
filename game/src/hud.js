// Neon Bay — the HUD: cash, health, wanted stars, the objective line, the
// speed readout and the 2D canvas minimap (roads, buildings, sea, player,
// cars, police and the mission marker). The start and pause screens are
// plain DOM in index.html; this module only fills in the live numbers.

import { WORLD } from './config.js';

export function createHud(document) {
  const cashEl = document.getElementById('cash');
  const healthEl = document.getElementById('health-fill');
  const starsEl = document.getElementById('stars');
  const objectiveEl = document.getElementById('objective');
  const speedEl = document.getElementById('speed');
  const promptEl = document.getElementById('prompt');
  const minimap = document.getElementById('minimap');
  const mapCtx = minimap.getContext('2d');
  const MAP_SIZE = minimap.width;
  const RANGE = WORLD.half + 40;

  function toMap(x, z) {
    return [
      ((x + RANGE) / (RANGE * 2)) * MAP_SIZE,
      ((z + RANGE) / (RANGE * 2)) * MAP_SIZE,
    ];
  }

  const timerEl = document.getElementById('timer');
  const ammoEl = document.getElementById('ammo');
  let lastMap = 0;
  function drawMinimap(now, world, player, vehicles, police, missionTargets, footCops) {
    if (now - lastMap < 0.1) return;
    lastMap = now;
    const g = mapCtx;
    g.fillStyle = '#20262e';
    g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Sea along the bottom edge.
    g.fillStyle = '#2e7fa8';
    const [, seaY] = toMap(0, WORLD.seaStart);
    g.fillRect(0, seaY, MAP_SIZE, MAP_SIZE - seaY);
    g.fillStyle = '#e8d9a8';
    const [, beachY] = toMap(0, WORLD.beachStart);
    g.fillRect(0, beachY, MAP_SIZE, seaY - beachY);
    // Roads.
    g.strokeStyle = '#5a6068';
    g.lineWidth = 3;
    for (let c = -156; c <= 156; c += 52) {
      const [x] = toMap(c, 0);
      const [, z] = toMap(0, c);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, MAP_SIZE); g.stroke();
      g.beginPath(); g.moveTo(0, z); g.lineTo(MAP_SIZE, z); g.stroke();
    }
    // Buildings.
    g.fillStyle = '#8a93a3';
    for (const b of world.buildings) {
      const [x1, z1] = toMap(b.minX, b.minZ);
      const [x2, z2] = toMap(b.maxX, b.maxZ);
      g.fillRect(x1, z1, Math.max(1, x2 - x1), Math.max(1, z2 - z1));
    }
    // Mission markers: a pulsing green ring around a green diamond, one
    // per target the active step still has (courier drops, safehouse).
    for (const target of missionTargets || []) {
      const [mx, mz] = toMap(target.x, target.z);
      const r = 5 + 2 * Math.sin(now * 4);
      g.strokeStyle = '#40ff80';
      g.lineWidth = 2;
      g.beginPath(); g.arc(mx, mz, r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#40ff80';
      g.beginPath();
      g.moveTo(mx, mz - 4); g.lineTo(mx + 4, mz); g.lineTo(mx, mz + 4); g.lineTo(mx - 4, mz);
      g.closePath(); g.fill();
    }
    // Parked cars in yellow, traffic in pale yellow.
    g.fillStyle = '#e8c33a';
    for (const car of vehicles.parked) {
      const [x, z] = toMap(car.x, car.z);
      g.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    g.fillStyle = '#f2e3c6';
    for (const car of vehicles.traffic) {
      const [x, z] = toMap(car.x, car.z);
      g.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // Police cars: flashing red/blue circles with a white ring, so they
    // never read as traffic. Foot cops: small dark-blue squares.
    const flash = Math.sin(now * 8) > 0;
    for (const car of police.cars) {
      const [x, z] = toMap(car.x, car.z);
      g.fillStyle = flash ? '#ff2020' : '#2040ff';
      g.beginPath(); g.arc(x, z, 3.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;
      g.beginPath(); g.arc(x, z, 5, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#2040ff';
    for (const cop of footCops || []) {
      const [x, z] = toMap(cop.x, cop.z);
      g.fillRect(x - 2, z - 2, 4, 4);
    }
    // The player: a white arrow pointing where they face.
    const [px, pz] = toMap(player.x, player.z);
    g.save();
    g.translate(px, pz);
    g.rotate(player.yaw);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath();
    g.fill();
    g.restore();
    // North is up: a small N in the corner.
    g.fillStyle = '#eef1f5';
    g.font = 'bold 11px system-ui, sans-serif';
    g.fillText('N', 6, 14);
  }

  return {
    drawMinimap,
    setCash(cash) {
      cashEl.textContent = `$${cash}`;
    },
    setHealth(health) {
      healthEl.style.width = `${Math.max(0, Math.min(100, health))}%`;
      healthEl.style.background = health > 50 ? '#40b878' : health > 25 ? '#e8c33a' : '#e84a4a';
    },
    setWanted(stars) {
      starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      starsEl.style.color = stars > 0 ? '#ffd23a' : '#5a6068';
    },
    setObjective(text) {
      if (objectiveEl.textContent !== text) objectiveEl.textContent = text;
    },
    setSpeed(kmh, driving) {
      speedEl.textContent = driving ? `${Math.round(kmh)} km/h` : '';
    },
    /** The mission clock (Courier Run), or null to hide it. */
    setTimer(seconds) {
      if (!timerEl) return;
      if (seconds === null || seconds === undefined) {
        timerEl.textContent = '';
        return;
      }
      const s = Math.max(0, Math.ceil(seconds));
      timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      timerEl.style.color = s <= 30 ? '#ff5a5a' : '#ffd23a';
    },
    /** Pistol ammo on foot (hidden while driving). */
    setAmmo(ammo, mag, reloading, driving) {
      if (!ammoEl) return;
      if (driving) {
        ammoEl.textContent = '';
        return;
      }
      ammoEl.textContent = reloading ? 'RELOADING…' : `AMMO ${ammo} / ${mag}`;
    },
    setPrompt(text) {
      if (promptEl.textContent !== text) promptEl.textContent = text;
    },
  };
}
