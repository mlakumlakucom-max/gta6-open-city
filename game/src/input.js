// Neon Bay — keyboard and mouse input. Held keys are read every frame;
// one-shot presses (enter car, pause, confirm) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost and
// never counted twice. Dragging the mouse orbits the third-person camera.

export const ACTION_ENTER = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CONFIRM = 4;
export const ACTION_PUNCH = 8;
export const ACTION_RELOAD = 16;
export const ACTION_MUTE = 32;
export const ACTION_SHOOT = 64;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const ENTER = new Set(['KeyE']);
const PAUSE = new Set(['Escape', 'KeyP']);
const CONFIRM = new Set(['Enter', 'Space']);
const PUNCH = new Set(['KeyF']);
const RELOAD = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let dragX = 0;
  let dragY = 0;
  let dragging = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (ENTER.has(event.code)) actions |= ACTION_ENTER;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (RELOAD.has(event.code)) actions |= ACTION_RELOAD;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code)
      || RIGHT.has(event.code) || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.clear();
  });

  // A click (press and release almost in place) fires the pistol; a drag
  // orbits the camera. Both start on pointerdown — the release decides.
  let downX = 0;
  let downY = 0;
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    downX = event.clientX;
    downY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    dragX += event.movementX;
    dragY += event.movementY;
  });
  canvas.addEventListener('pointerup', (event) => {
    dragging = false;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) < 6) {
      actions |= ACTION_SHOOT;
    }
  });

  function axis(neg, pos) {
    return (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  }

  return {
    /** Forward/back: +1 forward, -1 back. Left/right: +1 right, -1 left. */
    move() {
      let f = 0;
      let s = 0;
      for (const code of FORWARD) if (keys.has(code)) f += 1;
      for (const code of BACK) if (keys.has(code)) f -= 1;
      for (const code of RIGHT) if (keys.has(code)) s += 1;
      for (const code of LEFT) if (keys.has(code)) s -= 1;
      return { forward: f, strafe: s, run: [...RUN].some((code) => keys.has(code)) };
    },
    /** Mouse drag since the last call, in pixels; the loop turns it into yaw/pitch. */
    takeDrag() {
      const taken = { x: dragX, y: dragY };
      dragX = 0;
      dragY = 0;
      return taken;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Drive straight from tests and screenshot staging, bypassing real keys. */
    setTestKeys(next) {
      keys.clear();
      for (const code of next) keys.add(code);
    },
  };
}
