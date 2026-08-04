"use client";

import { useEffect, useRef, useState } from "react";

/*
  A live thumbnail: the real section rendered in an iframe at desktop
  width and scaled down to fit the card. Live rather than a captured
  image so the grid can never drift from the code.
*/
const FRAME_W = 1440;

export function Thumb({ slug, height }: { slug: string; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / FRAME_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden bg-surface-2"
      style={{ height: scale ? height * scale : 200 }}
    >
      {scale > 0 && (
        <iframe
          src={`/library/${slug}?frame=1`}
          title={slug}
          loading="lazy"
          tabIndex={-1}
          scrolling="no"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: FRAME_W, height, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}
