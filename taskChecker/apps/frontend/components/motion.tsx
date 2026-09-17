"use client";

/* Shared Framer Motion primitives — one place for easings, durations and
   reusable variants so animations stay consistent across board, overlays,
   chat and pages. Respects prefers-reduced-motion via MotionConfig (see
   app/providers.tsx). */

import {
  AnimatePresence,
  MotionConfig,
  motion,
  type Variants,
} from "framer-motion";
import type { ReactNode } from "react";

export { AnimatePresence, MotionConfig, motion };
export type { Variants };

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;

export const DUR = {
  instant: 0.12,
  fast: 0.18,
  base: 0.25,
  slow: 0.35,
} as const;

/* ---------- generic variants ---------- */

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR.fast, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: DUR.instant, ease: "easeIn" } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.base, ease: [...EASE_OUT] },
  },
  exit: {
    opacity: 0,
    y: 6,
    transition: { duration: DUR.instant, ease: "easeIn" },
  },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: DUR.base, ease: [...EASE_OUT] },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 6,
    transition: { duration: DUR.instant, ease: "easeIn" },
  },
};

export const backdropFade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR.fast } },
  exit: { opacity: 0, transition: { duration: DUR.instant } },
};

export const sheetRight: Variants = {
  hidden: { opacity: 0, x: 48 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: DUR.slow, ease: [...EASE_OUT] },
  },
  exit: {
    opacity: 0,
    x: 32,
    transition: { duration: DUR.fast, ease: "easeIn" },
  },
};

export const dropdownMenu: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: -4 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: DUR.fast, ease: [...EASE_OUT] },
  },
  exit: { opacity: 0, scale: 0.98, y: -2, transition: { duration: DUR.instant } },
};

export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
  exit: {},
};

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.base, ease: [...EASE_OUT] },
  },
  exit: { opacity: 0, transition: { duration: DUR.instant } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.fast, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: DUR.instant } },
};

/* ---------- tiny wrappers ---------- */

/** Page-level entrance: fade + slight rise, no layout shift. */
export function PageEnter({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: [...EASE_OUT], delay }}
    >
      {children}
    </motion.div>
  );
}

/** Stagger container — wrap grids / columns / lists. */
export function Stagger({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={staggerParent}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}

/** Stagger child — each card / row inside <Stagger>. */
export function StaggerItem({
  children,
  className,
  style,
  layout,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  layout?: boolean;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={staggerChild}
      layout={layout}
    >
      {children}
    </motion.div>
  );
}
