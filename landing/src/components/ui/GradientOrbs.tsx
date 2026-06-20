"use client";

type OrbVariant = "hero" | "section" | "cta";

interface GradientOrbsProps {
  variant?: OrbVariant;
}

interface OrbConfig {
  color: string;
  size: string;
  position: string;
  blur: string;
  opacity: string;
  animation: string;
}

const heroOrbs: OrbConfig[] = [
  {
    color: "bg-vault-accent",
    size: "w-[600px] h-[600px]",
    position: "top-[10%] left-[10%]",
    blur: "blur-[120px]",
    opacity: "opacity-50",
    animation: "animate-float",
  },
  {
    color: "bg-vault-cyan",
    size: "w-[400px] h-[400px]",
    position: "top-[30%] right-[10%]",
    blur: "blur-[100px]",
    opacity: "opacity-35",
    animation: "animate-float-reverse",
  },
  {
    color: "bg-vault-magenta",
    size: "w-[350px] h-[350px]",
    position: "bottom-[15%] left-[20%]",
    blur: "blur-[100px]",
    opacity: "opacity-35",
    animation: "animate-float-slow",
  },
  {
    color: "bg-vault-cyan",
    size: "w-[200px] h-[200px]",
    position: "top-16 right-1/4",
    blur: "blur-[80px]",
    opacity: "opacity-35",
    animation: "animate-pulse-glow",
  },
  {
    color: "bg-vault-accent",
    size: "w-[300px] h-[300px]",
    position: "top-1/2 left-1/2",
    blur: "blur-[140px]",
    opacity: "opacity-20",
    animation: "animate-float-slow",
  },
];

const sectionOrbs: OrbConfig[] = [
  {
    color: "bg-vault-accent",
    size: "w-[250px] h-[250px]",
    position: "top-1/4 right-1/6",
    blur: "blur-[120px]",
    opacity: "opacity-15",
    animation: "animate-float-slow",
  },
  {
    color: "bg-vault-cyan",
    size: "w-[200px] h-[200px]",
    position: "bottom-1/4 left-1/6",
    blur: "blur-[120px]",
    opacity: "opacity-10",
    animation: "animate-pulse-glow",
  },
];

const ctaOrbs: OrbConfig[] = [
  {
    color: "bg-vault-accent",
    size: "w-[400px] h-[400px]",
    position: "top-[10%] left-1/4",
    blur: "blur-[110px]",
    opacity: "opacity-40",
    animation: "animate-float",
  },
  {
    color: "bg-vault-magenta",
    size: "w-[350px] h-[350px]",
    position: "bottom-[10%] right-1/4",
    blur: "blur-[100px]",
    opacity: "opacity-30",
    animation: "animate-float-reverse",
  },
];

const orbMap: Record<OrbVariant, OrbConfig[]> = {
  hero: heroOrbs,
  section: sectionOrbs,
  cta: ctaOrbs,
};

export function GradientOrbs({ variant = "hero" }: GradientOrbsProps) {
  const orbs = orbMap[variant];

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden z-0"
      aria-hidden="true"
    >
      {orbs.map((orb, index) => (
        <div
          key={index}
          className={[
            "absolute rounded-full will-change-transform",
            orb.color,
            orb.size,
            orb.position,
            orb.blur,
            orb.opacity,
            orb.animation,
          ].join(" ")}
        />
      ))}
    </div>
  );
}
