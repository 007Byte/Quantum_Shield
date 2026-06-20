"use client";

import { useEffect, useState } from "react";

interface Star {
  id: number;
  top: string;
  left: string;
  size: number;
  duration: string;
  delay: string;
}

/**
 * A fixed-position star field that renders behind all page content.
 * Stars are generated client-side only to avoid hydration mismatch
 * (Math.random produces different values on server vs client).
 */
export function GlobalStarField() {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    setStars(
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: Math.random() * 1.5 + 0.5,
        duration: `${Math.random() * 5 + 3}s`,
        delay: `${Math.random() * 6}s`,
      })),
    );
  }, []);

  if (stars.length === 0) return null;

  return (
    <div className="starfield" aria-hidden="true">
      {stars.map((star) => (
        <div
          key={star.id}
          className="star"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            ["--duration" as string]: star.duration,
            ["--delay" as string]: star.delay,
          }}
        />
      ))}
    </div>
  );
}
