/**
 * Hisab · Haptics
 *
 *   import { haptic } from '…/components/haptics.js';
 *   haptic('tap');       // a key, the +, a chip
 *   haptic('success');   // saved
 *   haptic('warn');      // a destructive step, a limit crossed
 *
 * navigator.vibrate where the phone has it (Android Chrome); a silent no-op
 * elsewhere (iOS Safari has no web vibration at all), so a caller never
 * checks for support. Patterns are a few milliseconds: a tick you feel, not
 * a buzz you hear on a desk.
 *
 * Off when the owner has turned haptics off in Settings (data-haptics="off"
 * on <html>, set by state.applyTheme()).
 */

const PATTERNS = {
  tap: 6,
  select: 4,
  success: [8, 40, 14],
  warn: [16, 50, 16],
  error: [24, 40, 24, 40, 24],
  drag: 3,   // crossing a threshold while dragging: "let go now and it closes"
};

let last = 0;

export function haptic(kind = 'tap') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (document.documentElement.dataset.haptics === 'off') return;
  // Two calls in one frame (a press that also toggles a chip) must be felt
  // once; a double tick reads as a fault.
  const now = performance.now();
  if (now - last < 30) return;
  last = now;
  try { navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tap); } catch { /* blocked by the browser: fine */ }
}
