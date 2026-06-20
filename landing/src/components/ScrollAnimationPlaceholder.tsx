"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export function ScrollAnimationPlaceholder() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Transform scroll progress into animation values
  const scale = useTransform(
    scrollYProgress,
    [0, 0.3, 0.5, 0.7, 1],
    [0.8, 1, 1.2, 1, 0.9],
  );
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 360]);
  const opacity = useTransform(
    scrollYProgress,
    [0, 0.1, 0.9, 1],
    [0, 1, 1, 0],
  );

  // Shell (outer casing) explodes outward
  const shellTopY = useTransform(scrollYProgress, [0.2, 0.5], [0, -60]);
  const shellBottomY = useTransform(scrollYProgress, [0.2, 0.5], [0, 60]);
  const shellLeftX = useTransform(scrollYProgress, [0.25, 0.55], [0, -80]);
  const shellRightX = useTransform(scrollYProgress, [0.25, 0.55], [0, 80]);
  const shellOpacity = useTransform(
    scrollYProgress,
    [0.2, 0.5, 0.7],
    [1, 0.3, 0],
  );

  // Circuit board reveals
  const circuitScale = useTransform(scrollYProgress, [0.3, 0.5], [0, 1]);
  const circuitOpacity = useTransform(
    scrollYProgress,
    [0.3, 0.5, 0.7],
    [0, 1, 0.5],
  );

  // Quantum core pulses in
  const coreScale = useTransform(scrollYProgress, [0.5, 0.7], [0, 1]);
  const coreGlow = useTransform(
    scrollYProgress,
    [0.5, 0.7, 0.9],
    [0, 1, 0.5],
  );

  // Labels
  const label1Opacity = useTransform(
    scrollYProgress,
    [0.15, 0.25, 0.4],
    [0, 1, 0],
  );
  const label2Opacity = useTransform(
    scrollYProgress,
    [0.35, 0.45, 0.6],
    [0, 1, 0],
  );
  const label3Opacity = useTransform(
    scrollYProgress,
    [0.55, 0.65, 0.8],
    [0, 1, 0],
  );
  const label4Opacity = useTransform(
    scrollYProgress,
    [0.75, 0.85, 0.95],
    [0, 1, 0],
  );

  // Particles that emanate outward
  const particleSpread = useTransform(scrollYProgress, [0.3, 0.7], [0, 200]);
  const particleOpacity = useTransform(
    scrollYProgress,
    [0.3, 0.5, 0.8],
    [0, 1, 0],
  );
  const particleScale = useTransform(scrollYProgress, [0.3, 0.5], [0, 1]);

  // Pre-compute particle positions at the top level (Rules of Hooks: never
  // call hooks inside loops or callbacks). The 12-particle array is fixed.
  const PARTICLE_COUNT = 12;
  const particleAngles = Array.from({ length: PARTICLE_COUNT }, (_, i) => (i / PARTICLE_COUNT) * Math.PI * 2);
  const particleX0 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[0]) * v - 4);
  const particleY0 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[0]) * v - 4);
  const particleX1 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[1]) * v - 4);
  const particleY1 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[1]) * v - 4);
  const particleX2 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[2]) * v - 4);
  const particleY2 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[2]) * v - 4);
  const particleX3 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[3]) * v - 4);
  const particleY3 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[3]) * v - 4);
  const particleX4 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[4]) * v - 4);
  const particleY4 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[4]) * v - 4);
  const particleX5 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[5]) * v - 4);
  const particleY5 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[5]) * v - 4);
  const particleX6 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[6]) * v - 4);
  const particleY6 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[6]) * v - 4);
  const particleX7 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[7]) * v - 4);
  const particleY7 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[7]) * v - 4);
  const particleX8 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[8]) * v - 4);
  const particleY8 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[8]) * v - 4);
  const particleX9 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[9]) * v - 4);
  const particleY9 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[9]) * v - 4);
  const particleX10 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[10]) * v - 4);
  const particleY10 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[10]) * v - 4);
  const particleX11 = useTransform(particleSpread, (v: number) => Math.cos(particleAngles[11]) * v - 4);
  const particleY11 = useTransform(particleSpread, (v: number) => Math.sin(particleAngles[11]) * v - 4);
  const particleXs = [particleX0, particleX1, particleX2, particleX3, particleX4, particleX5, particleX6, particleX7, particleX8, particleX9, particleX10, particleX11];
  const particleYs = [particleY0, particleY1, particleY2, particleY3, particleY4, particleY5, particleY6, particleY7, particleY8, particleY9, particleY10, particleY11];

  // Scroll indicator fade
  const scrollIndicatorOpacity = useTransform(
    scrollYProgress,
    [0, 0.1, 0.2],
    [1, 0.5, 0],
  );

  return (
    <section ref={containerRef} className="relative" style={{ height: "400vh" }}>
      {/* Subtle edge vignettes */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-vault-bg/60 to-transparent z-20 pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-vault-bg/60 to-transparent z-20 pointer-events-none" />
      <div className="sticky top-0 h-[100dvh] w-full flex items-center justify-center overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 grid-bg-hero" />

        {/* Gradient orbs behind */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-vault-accent blur-[120px]"
            style={{ opacity: coreGlow, scale: coreScale }}
          />
          <motion.div
            className="absolute bottom-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-vault-cyan blur-[100px]"
            style={{ opacity: coreGlow, scale: coreScale }}
          />
        </div>

        {/* Main animation container */}
        <motion.div className="relative z-10" style={{ scale, opacity }}>
          {/* USB Outer Shell */}
          <motion.div
            className="relative w-48 h-64 mx-auto"
            style={{ rotate }}
          >
            {/* USB body - top half moves up, bottom moves down */}
            <motion.div
              className="absolute inset-x-0 top-0 h-1/2 glass rounded-t-2xl border-b-0"
              style={{ y: shellTopY, opacity: shellOpacity }}
            />
            <motion.div
              className="absolute inset-x-0 bottom-0 h-1/2 glass rounded-b-2xl border-t-0"
              style={{ y: shellBottomY, opacity: shellOpacity }}
            />

            {/* Left/right shell pieces */}
            <motion.div
              className="absolute top-1/4 left-0 w-1/3 h-1/2 glass rounded-l-xl border-r-0"
              style={{ x: shellLeftX, opacity: shellOpacity }}
            />
            <motion.div
              className="absolute top-1/4 right-0 w-1/3 h-1/2 glass rounded-r-xl border-l-0"
              style={{ x: shellRightX, opacity: shellOpacity }}
            />

            {/* Circuit board layer */}
            <motion.div
              className="absolute inset-8 rounded-xl overflow-hidden"
              style={{ scale: circuitScale, opacity: circuitOpacity }}
            >
              <div className="w-full h-full bg-vault-bg-secondary border border-vault-cyan/30 rounded-xl p-3">
                {/* Circuit traces */}
                <div className="grid grid-cols-4 gap-1 h-full">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-sm"
                      style={{
                        background:
                          i % 3 === 0
                            ? "var(--color-vault-cyan-30)"
                            : i % 5 === 0
                              ? "var(--color-vault-accent-30)"
                              : "var(--color-vault-accent-10)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Quantum core - innermost */}
            <motion.div
              className="absolute inset-16 flex items-center justify-center"
              style={{ scale: coreScale, opacity: coreGlow }}
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-vault-accent via-vault-cyan to-vault-magenta animate-pulse-glow" />
              <div className="absolute w-28 h-28 rounded-full border border-vault-cyan/40 animate-float" />
              <div className="absolute w-36 h-36 rounded-full border border-vault-accent/20 animate-float-reverse" />
            </motion.div>
          </motion.div>

          {/* Floating particles — transforms pre-computed at top level */}
          {particleXs.map((px, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                background: i % 2 === 0 ? "var(--color-vault-accent)" : "var(--color-vault-cyan)",
                left: "50%",
                top: "50%",
                x: px,
                y: particleYs[i],
                opacity: particleOpacity,
                scale: particleScale,
              }}
            />
          ))}
        </motion.div>

        {/* Scroll-triggered labels */}
        <motion.div
          className="absolute left-8 md:left-16 top-1/4 text-left"
          style={{ opacity: label1Opacity }}
        >
          <p className="font-display text-vault-accent text-xs uppercase tracking-widest mb-1">
            Layer 1
          </p>
          <p className="font-display text-vault-text text-2xl md:text-3xl font-bold">
            Hardware Shell
          </p>
          <p className="text-vault-text-secondary text-sm mt-1 max-w-xs">
            Tamper-evident USB enclosure with secure element
          </p>
        </motion.div>

        <motion.div
          className="absolute right-8 md:right-16 top-1/3 text-right"
          style={{ opacity: label2Opacity }}
        >
          <p className="font-display text-vault-cyan text-xs uppercase tracking-widest mb-1">
            Layer 2
          </p>
          <p className="font-display text-vault-text text-2xl md:text-3xl font-bold">
            Encryption Engine
          </p>
          <p className="text-vault-text-secondary text-sm mt-1 max-w-xs">
            AES-256-GCM-SIV + XChaCha20-Poly1305
          </p>
        </motion.div>

        <motion.div
          className="absolute left-8 md:left-16 bottom-1/3 text-left"
          style={{ opacity: label3Opacity }}
        >
          <p className="font-display text-vault-magenta text-xs uppercase tracking-widest mb-1">
            Layer 3
          </p>
          <p className="font-display text-vault-text text-2xl md:text-3xl font-bold">
            Key Hierarchy
          </p>
          <p className="text-vault-text-secondary text-sm mt-1 max-w-xs">
            ML-KEM-1024 post-quantum key encapsulation
          </p>
        </motion.div>

        <motion.div
          className="absolute right-8 md:right-16 bottom-1/4 text-right"
          style={{ opacity: label4Opacity }}
        >
          <p className="font-display text-vault-green text-xs uppercase tracking-widest mb-1">
            Core
          </p>
          <p className="font-display text-vault-text text-2xl md:text-3xl font-bold gradient-text">
            Quantum Core
          </p>
          <p className="text-vault-text-secondary text-sm mt-1 max-w-xs">
            Zero-knowledge proof of encryption integrity
          </p>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          style={{ opacity: scrollIndicatorOpacity }}
        >
          <p className="text-vault-text-muted text-xs uppercase tracking-widest">
            Scroll to explore
          </p>
          <svg
            className="w-5 h-5 text-vault-text-muted animate-bounce"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </motion.div>
      </div>
    </section>
  );
}
