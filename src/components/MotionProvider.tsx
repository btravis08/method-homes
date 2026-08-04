"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

/*
  App-wide LazyMotion: every component uses the slim `m.*` primitives,
  and the animation feature set loads once here — the full `motion.*`
  runtime (~25-30KB parsed + executed at startup) stays out of the
  bundle. domAnimation covers everything the site uses: animate props,
  variants, exit animations, and hover/tap gestures. (Layout
  animations and drag would need domMax — we use neither; FLIP moves
  and slider drags are hand-rolled on motion values.)
*/
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      {/* honors the OS prefers-reduced-motion setting: transforms
          snap instead of animating, opacity fades remain */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
