/**
 * Motion for the website. Components, presets and the provider come from
 * @dueproof/ui/motion, like everywhere else. The scroll-linked hooks the home
 * page story needs (02 §7, "Website hero") are not exported there yet, so
 * they are re-exported here from the same `motion` version the UI package
 * uses, and nothing else in the site imports `motion` directly.
 * TODO(ui): move useScroll / useTransform into @dueproof/ui/motion.
 */
export { emphasis, fade, MotionProvider, m, standard, useReducedMotion } from "@dueproof/ui/motion";
export { type MotionValue, useMotionValue, useScroll, useTransform } from "motion/react";
