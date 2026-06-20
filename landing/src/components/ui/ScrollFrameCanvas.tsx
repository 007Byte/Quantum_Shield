"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface ScrollFrameCanvasProps {
  /** Total number of frames in the sequence */
  frameCount: number;
  /** Path pattern prefix, e.g. "/frames/frame_" — appends "0001.webp" etc. */
  framePath: string;
  /** File extension for frames (default: "webp") */
  frameExtension?: string;
  /** Height of the scroll container that drives the animation (default: "300vh") */
  height?: string;
  /** Max width of the canvas (default: "1200px") */
  maxWidth?: string;
  /** Max height of the canvas (default: "80vh") */
  maxHeight?: string;
}

/**
 * Production-ready scroll-driven frame animation using a canvas element.
 *
 * Place a sequence of pre-rendered image frames (e.g. from Blender, After Effects,
 * or AI generation) in your public directory and point `framePath` at them.
 *
 * The component creates a tall scroll container with a sticky canvas that stays
 * fixed in the viewport. As the user scrolls, the frame index advances through
 * the sequence, creating a smooth scroll-driven animation like Apple product pages.
 *
 * Uses vanilla scroll listeners and requestAnimationFrame for maximum performance.
 */
export function ScrollFrameCanvas({
  frameCount,
  framePath,
  frameExtension = "webp",
  height = "300vh",
  maxWidth = "1200px",
  maxHeight = "80vh",
}: ScrollFrameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const frameIndexRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);

  // Pad frame number: 0 -> "0001", 1 -> "0002", etc.
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

      // Size canvas to match its CSS dimensions at device pixel ratio
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      // Draw image with "cover" behavior — fill the canvas, crop overflow
      const scaleRatio = Math.max(
        rect.width / img.width,
        rect.height / img.height,
      );
      const x = (rect.width - img.width * scaleRatio) / 2;
      const y = (rect.height - img.height * scaleRatio) / 2;
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.drawImage(
        img,
        x,
        y,
        img.width * scaleRatio,
        img.height * scaleRatio,
      );
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
      const scrollableDistance = rect.height - window.innerHeight;
      if (scrollableDistance <= 0) return;

      const scrollProgress = Math.max(
        0,
        Math.min(1, -rect.top / scrollableDistance),
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
    window.addEventListener("resize", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loaded, frameCount, drawFrame]);

  return (
    <section ref={containerRef} className="relative" style={{ height }}>
      <div className="sticky top-0 h-[100dvh] w-full flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ maxWidth, maxHeight }}
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
