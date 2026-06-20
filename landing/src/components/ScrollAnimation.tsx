"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface ScrollAnimationProps {
  frameCount: number;
  framePath: string;
  frameExtension?: string;
  height?: string;
}

export function ScrollAnimation({
  frameCount,
  framePath,
  frameExtension = "webp",
  height = "300vh",
}: ScrollAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const frameIndexRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);

  // Pad frame number: 1 -> "0001"
  const getFrameUrl = useCallback(
    (index: number) => {
      const padded = String(index + 1).padStart(4, "0");
      return `${framePath}${padded}.${frameExtension}`;
    },
    [framePath, frameExtension],
  );

  // Draw a frame to the canvas
  const drawFrame = useCallback(
    (index: number, images?: HTMLImageElement[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imgs = images || imagesRef.current;
      const img = imgs[index];
      if (!img || !img.complete) return;

      // Size canvas to match container
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      // Draw image centered/covered
      const scale = Math.max(
        rect.width / img.width,
        rect.height / img.height,
      );
      const x = (rect.width - img.width * scale) / 2;
      const y = (rect.height - img.height * scale) / 2;
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
    },
    [],
  );

  // Preload all frames — with isMounted guard to prevent setState after unmount
  useEffect(() => {
    let isMounted = true;
    let loadedCount = 0;
    const images: HTMLImageElement[] = [];

    for (let i = 0; i < frameCount; i++) {
      const img = new Image();
      img.src = getFrameUrl(i);
      img.onload = () => {
        loadedCount++;
        if (!isMounted) return;
        setLoadProgress(Math.round((loadedCount / frameCount) * 100));
        if (loadedCount === frameCount) {
          setLoaded(true);
          // Draw first frame
          drawFrame(0, images);
        }
      };
      img.onerror = () => {
        loadedCount++;
        if (!isMounted) return;
        setLoadProgress(Math.round((loadedCount / frameCount) * 100));
      };
      images.push(img);
    }
    imagesRef.current = images;

    return () => { isMounted = false; };
  }, [frameCount, getFrameUrl, drawFrame]);

  // Scroll handler — map scroll position to frame index
  useEffect(() => {
    if (!loaded) return;

    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const scrollProgress = Math.max(
        0,
        Math.min(1, -rect.top / (rect.height - window.innerHeight)),
      );
      const newIndex = Math.min(
        frameCount - 1,
        Math.floor(scrollProgress * frameCount),
      );

      if (newIndex !== frameIndexRef.current) {
        frameIndexRef.current = newIndex;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => drawFrame(newIndex));
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial position
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loaded, frameCount, drawFrame]);

  return (
    <section ref={containerRef} className="relative" style={{ height }}>
      {/* Sticky canvas that stays in viewport */}
      <div className="sticky top-0 h-[100dvh] w-full flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ maxWidth: "1200px", maxHeight: "80vh" }}
        />

        {/* Loading indicator */}
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-vault-bg/90 z-10">
            <div className="w-48 h-1.5 rounded-full bg-vault-border overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-vault-accent to-vault-cyan transition-all duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
            <p className="text-vault-text-secondary text-sm font-display">
              Loading animation... {loadProgress}%
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
