"use client";

import { m, useInView } from "motion/react";
import type { Variants } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/*
  Arrow-swap hover from the design storyboard: on hover the arrow
  slides off in the direction it points while fading, then re-enters
  from the opposite side and settles. dx/dy give the pointing
  direction (right = {1,0}, left = {-1,0}, up-right = {1,-1}).
*/

const DIST = 14;

const swap = (dx: number, dy: number): Variants => ({
  rest: { x: 0, y: 0, opacity: 1 },
  hover: {
    x: [0, dx * DIST, -dx * DIST, 0],
    y: [0, dy * DIST, -dy * DIST, 0],
    opacity: [1, 0, 0, 1],
    transition: {
      duration: 0.3,
      times: [0, 0.42, 0.58, 1],
      ease: ["easeIn", "linear", "easeOut"],
    },
  },
});

export function ArrowSwap({
  dx = 1,
  dy = 0,
  children,
}: {
  dx?: number;
  dy?: number;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex overflow-hidden">
      <m.span className="inline-flex" variants={swap(dx, dy)}>
        {children}
      </m.span>
    </span>
  );
}

/* Motion-enabled hover parents: set initial="rest" / whileHover="hover"
   so the ArrowSwap child animates when the whole control is hovered */

export function ArrowButton({
  disabled,
  ...props
}: React.ComponentProps<typeof m.button>) {
  return (
    <m.button
      initial="rest"
      whileHover={disabled ? undefined : "hover"}
      animate="rest"
      disabled={disabled}
      {...props}
    />
  );
}

/* Plays the swap once when scrolled into view (touch has no hover),
   then resets so pointer hover still replays it. State-driven, so the
   page transition's mount suppression can't skip it. */
export function ArrowInViewPlay({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (inView) setPlay(true);
  }, [inView]);
  return (
    <m.span
      ref={ref}
      className={className}
      initial="rest"
      whileHover="hover"
      animate={play ? "hover" : "rest"}
      onAnimationComplete={() => setPlay(false)}
    >
      {children}
    </m.span>
  );
}

/* internal hrefs ride next/link so the arrow CTAs navigate client-side;
   prefetch + scroll:false match SmartLink (PageTransition owns the
   scroll reset between fades) */
const MotionLink = m.create(Link);

export function ArrowLink({ href, ...props }: React.ComponentProps<typeof m.a>) {
  const internal = typeof href === "string" && href.startsWith("/");
  const Comp = (internal ? MotionLink : m.a) as typeof m.a;
  const linkProps = internal ? { prefetch: true, scroll: false } : {};
  return (
    <Comp
      href={href}
      initial="rest"
      whileHover="hover"
      animate="rest"
      {...linkProps}
      {...props}
    />
  );
}
