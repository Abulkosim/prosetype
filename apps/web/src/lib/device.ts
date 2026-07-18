/**
 * The typing stage needs a physical keyboard (a hidden textarea driven by
 * `beforeinput`/`keydown`; Tab/Esc have no on-screen equivalent). A coarse
 * primary pointer with no fine one is the common signature of a phone or
 * tablet - used to show an honest notice instead of a silently dead stage.
 */
export function isKeyboardless(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
}

/**
 * Whether the user prefers reduced motion. The global CSS rule already zeroes
 * transitions/animations; this is for the JS-driven effects (WAAPI fades, the
 * credits typewriter) that need to branch themselves.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
