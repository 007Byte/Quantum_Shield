"use client";

import { motion } from "framer-motion";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: "purple" | "cyan" | "none";
  /** Opt-in animated gradient shimmer border. Default: false (clean white-border aesthetic). */
  shimmerBorder?: boolean;
}

const glowShadows: Record<NonNullable<GlassCardProps["glow"]>, string> = {
  purple: "shadow-[0_0_40px_rgba(117,60,255,0.3)]",
  cyan: "shadow-[0_0_40px_rgba(34,211,238,0.25)]",
  none: "",
};

const hoverGlowShadows: Record<NonNullable<GlassCardProps["glow"]>, string> = {
  purple:
    "0 8px 32px rgba(117,60,255,0.08), 0 0 1px rgba(255,255,255,0.15), 0 0 50px rgba(117,60,255,0.45)",
  cyan:
    "0 8px 32px rgba(34,211,238,0.08), 0 0 1px rgba(255,255,255,0.15), 0 0 50px rgba(34,211,238,0.4)",
  none:
    "0 8px 32px rgba(117,60,255,0.08), 0 0 1px rgba(255,255,255,0.15)",
};

export function GlassCard({
  children,
  className = "",
  hover = false,
  glow = "none",
  shimmerBorder = false,
}: GlassCardProps) {
  const glowClass = glowShadows[glow];

  const classes = [
    "glass-card p-6",
    shimmerBorder ? "gradient-border" : "",
    glowClass,
    hover
      ? "transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(117,60,255,0.08),0_0_1px_rgba(255,255,255,0.15)]"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (hover) {
    return (
      <motion.div
        className={classes}
        whileHover={{
          y: -4,
          boxShadow: hoverGlowShadows[glow],
          transition: { duration: 0.25, ease: "easeOut" },
        }}
      >
        {children}
      </motion.div>
    );
  }

  return <div className={classes}>{children}</div>;
}
