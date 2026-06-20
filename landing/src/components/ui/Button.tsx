"use client";

import { motion } from "framer-motion";

type Variant = "primary" | "accent" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: Variant;
  size?: Size;
  href?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  "aria-label"?: string;
}

const sizeClasses: Record<Size, string> = {
  sm: "px-4 py-2 text-sm rounded-xl",
  md: "px-6 py-3 text-base rounded-xl",
  lg: "px-8 py-4 text-lg rounded-2xl",
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[#0099ff] hover:bg-[#00aaff] text-white shadow-[0_0_20px_rgba(0,153,255,0.25)] hover:shadow-[0_0_30px_rgba(0,153,255,0.35)]",
  accent:
    "bg-vault-accent hover:bg-vault-accent-hover text-white shadow-[0_0_24px_rgba(117,60,255,0.35)] hover:shadow-[0_0_32px_rgba(117,60,255,0.5)]",
  ghost:
    "bg-transparent border border-vault-border text-vault-text hover:border-vault-accent hover:text-white",
  outline:
    "bg-transparent border-2 border-vault-accent text-vault-accent hover:bg-vault-accent hover:text-white",
};

const hoverAnimation = {
  scale: 1.03,
  transition: { duration: 0.2 },
};

const tapAnimation = {
  scale: 0.97,
};

export function Button({
  variant = "primary",
  size = "md",
  href,
  className = "",
  children,
  onClick,
  type = "button",
  disabled,
  "aria-label": ariaLabel,
}: ButtonProps) {
  const classes = [
    "inline-flex items-center justify-center font-semibold transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-vault-accent focus-visible:outline-offset-2",
    sizeClasses[size],
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <motion.a
        href={href}
        className={classes}
        whileHover={hoverAnimation}
        whileTap={tapAnimation}
        aria-label={ariaLabel}
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button
      className={classes}
      whileHover={hoverAnimation}
      whileTap={tapAnimation}
      onClick={onClick}
      type={type}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </motion.button>
  );
}
