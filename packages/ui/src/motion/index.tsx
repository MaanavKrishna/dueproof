/**
 * @dueproof/ui/motion — Motion presets built from the motion tokens (02 §7).
 *
 * Apps never import `motion` directly: use these presets and the `m`
 * components re-exported here, inside <MotionProvider> (or <UIProvider>).
 */
import { motion as springs } from "@dueproof/tokens";
import { domAnimation, LazyMotion, MotionConfig, type Transition } from "motion/react";
import type { ReactNode } from "react";

export type { Transition } from "motion/react";
export { AnimatePresence, m, useReducedMotion } from "motion/react";

/** Toggles, checkboxes, segmented control thumb. */
export const snap: Transition = { ...springs.snap };
/** Popovers, menus, list reorder. */
export const standard: Transition = { ...springs.standard };
/** Sheets, inspector, dialogs. */
export const sheet: Transition = { ...springs.sheet };
/** Rare moments: proof jump, success. */
export const emphasis: Transition = { ...springs.emphasis };
/** Crossfades; the reduced-motion fallback. */
export const fade: Transition = { ...springs.fade };

export const presets = { snap, standard, sheet, emphasis, fade } as const;
export type PresetName = keyof typeof presets;

/** Enter/exit variants for common surfaces, so screens don't invent their own. */
export const variants = {
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  pop: {
    initial: { opacity: 0, scale: 0.97 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 },
  },
  rise: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
  },
} as const;

/**
 * Components that animate wrap themselves in this, so they still animate when an
 * app forgets <MotionProvider>. The feature bundle is shared, so this costs nothing.
 */
export function MotionFeatures({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}

const loadLayoutFeatures = () => import("motion/react").then((mod) => mod.domMax);

/**
 * Layout animations (`layout`, `layoutId`) need Motion's larger `domMax`
 * feature set. Wrap only the parts that use them (the proof viewer's jump
 * pulse); the features load lazily.
 */
export function LayoutMotionFeatures({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadLayoutFeatures}>{children}</LazyMotion>;
}

export interface MotionProviderProps {
  children: ReactNode;
}

/**
 * Loads the `domAnimation` feature set lazily-bundled (no layout or drag) and
 * honours the OS "reduce motion" setting: transforms are dropped, fades stay.
 */
export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user" transition={standard}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
