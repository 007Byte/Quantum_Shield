"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { GradientOrbs } from "@/components/ui/GradientOrbs";
import { Button } from "@/components/ui/Button";

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.1,
    },
  },
};

const headlineVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.8 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 80, damping: 18 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 100, damping: 20 },
  },
};

const badgeVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 120, damping: 16 },
  },
};

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

const TRUST_BADGES = [
  { label: "Post-Quantum Encrypted", Icon: ShieldIcon },
  { label: "Zero-Knowledge", Icon: EyeOffIcon },
  { label: "Open Source", Icon: CodeIcon },
] as const;

function StarField() {
  const [stars, setStars] = useState<
    { id: number; top: string; left: string; size: number; duration: string; delay: string }[]
  >([]);

  useEffect(() => {
    setStars(
      Array.from({ length: 50 }, (_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: Math.random() * 2 + 1,
        duration: `${Math.random() * 4 + 2}s`,
        delay: `${Math.random() * 5}s`,
      })),
    );
  }, []);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none z-[1]"
      aria-hidden="true"
    >
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            animation: `twinkle ${star.duration} ease-in-out infinite`,
            animationDelay: star.delay,
            opacity: 0.1,
          }}
        />
      ))}
    </div>
  );
}

export function Hero() {
  return (
    <section className="min-h-[100dvh] flex items-center justify-center relative overflow-hidden grid-bg-hero">
      {/* Subtle bottom vignette */}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-vault-bg/80 to-transparent z-20 pointer-events-none" />
      {/* Background orbs */}
      <GradientOrbs variant="hero" />

      {/* Star field */}
      <StarField />

      {/* Content */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-12 px-6 py-24"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Eyebrow badge */}
        <motion.div variants={itemVariants} className="flex justify-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-vault-accent/8 border border-vault-accent/12 text-[11px] uppercase tracking-[0.2em] text-vault-text-secondary font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-vault-accent animate-pulse-glow" />
            Post-Quantum Security
          </span>
        </motion.div>

        {/* Logo */}
        <motion.div variants={itemVariants} className="flex justify-center">
          <Image
            src="/logo.png"
            alt="Quantum_Shield"
            width={1536}
            height={1024}
            priority
            className="w-64 sm:w-80 md:w-96 lg:w-[28rem] xl:w-[32rem] h-auto drop-shadow-[0_0_60px_rgba(117,60,255,0.5)]"
          />
        </motion.div>

        {/* Split Headline — each word on its own line with different color */}
        <motion.h1
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-[6rem] xl:text-[7.5rem] font-bold tracking-tighter uppercase text-center leading-[0.9] [text-wrap:balance]"
          variants={headlineVariants}
        >
          <motion.span
            className="block gradient-text text-glow-strong"
            variants={headlineVariants}
          >
            Quantum_Shield
          </motion.span>
        </motion.h1>

        {/* Subheadline with animated underline */}
        <motion.p
          className="text-lg md:text-xl lg:text-2xl text-vault-text-secondary text-center max-w-[55ch] mx-auto animated-underline"
          variants={itemVariants}
        >
          Military-grade encryption. Zero-knowledge. Hardware-isolated on USB.
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          className="flex flex-col sm:flex-row items-center gap-4"
          variants={itemVariants}
        >
          <Button variant="primary" size="lg" href="#pricing" className="btn-pulse">
            Get Started Free
          </Button>
          <Button variant="ghost" size="lg" href="#features">
            Learn More
          </Button>
        </motion.div>

        {/* Trust badges — individually staggered */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-3 mt-10"
          variants={containerVariants}
        >
          {TRUST_BADGES.map(({ label, Icon }) => (
            <motion.span
              key={label}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-vault-accent/6 border border-vault-accent/10 text-sm text-vault-text-secondary"
              variants={badgeVariants}
              whileHover={{ scale: 1.05, borderColor: "rgba(117, 60, 255, 0.6)" }}
              transition={{ duration: 0.2 }}
            >
              <Icon />
              {label}
            </motion.span>
          ))}
        </motion.div>

        {/* Scroll indicator arrow */}
        <motion.div
          className="mt-8"
          variants={itemVariants}
          aria-hidden="true"
        >
          <div
            className="flex flex-col items-center gap-1"
            style={{ animation: "scroll-bounce 2s ease-in-out infinite" }}
          >
            <span className="text-xs text-vault-text-muted uppercase tracking-widest">Scroll</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-vault-accent"
            >
              <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
            </svg>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
