"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PRICING_TIERS, type PricingTier } from "@/lib/constants";
import { SectionWrapper } from "@/components/ui/SectionWrapper";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 20, delay: i * 0.04 },
  }),
};

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 text-vault-green/70 shrink-0 mt-0.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ctaHref(tier: PricingTier): string | undefined {
  if (tier.name === "Enterprise") {
    return "mailto:ultimatepqcshield@gmail.com?subject=Enterprise%20Inquiry";
  }
  return undefined;
}

function CardContent({
  tier,
  price,
  period,
  isCustom,
  annual,
}: {
  tier: PricingTier;
  price: string;
  period: string;
  isCustom: boolean;
  annual: boolean;
}) {
  return (
    <>
      {/* Tier name — display font */}
      <p className="font-display text-xl font-bold text-vault-text tracking-tight">
        {tier.name}
      </p>

      {/* Price — display font */}
      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-4xl font-extrabold text-vault-text [font-variant-numeric:tabular-nums]">
          {isCustom ? "Custom" : price.replace(/\/mo$/, "")}
        </span>
        {!isCustom && (
          <span className="text-vault-text-secondary text-sm">
            {period}
          </span>
        )}
      </div>

      {/* Annual total callout */}
      {annual && tier.annualTotal && (
        <p className="text-vault-text-secondary text-xs mt-1">
          {tier.annualTotal}
        </p>
      )}

      {/* Description for Enterprise */}
      {tier.name === "Enterprise" && (
        <p className="text-vault-text-secondary text-sm mt-2">
          Tailored for organizations that need advanced controls and
          dedicated support.
        </p>
      )}

      {/* Divider */}
      <div className="border-t border-vault-border my-6" />

      {/* Feature list */}
      <ul className="space-y-3 flex-1">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <CheckIcon />
            <span className="text-vault-text-secondary text-sm">
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA — pinned to bottom */}
      <div className="mt-auto pt-8">
        <Button
          variant={tier.highlighted ? "primary" : "ghost"}
          size="md"
          href={ctaHref(tier)}
          className={`w-full ${tier.highlighted ? "btn-pulse" : ""}`}
        >
          {tier.cta}
        </Button>
      </div>
    </>
  );
}

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <SectionWrapper
      id="pricing"
      title="Simple, Transparent Pricing"
      subtitle="Start free, upgrade when you need more. Every plan includes post-quantum encryption."
      withOrbs
    >
      {/* Annual / Monthly sliding pill toggle */}
      <div className="flex items-center justify-center gap-2 mb-12">
        <div className="relative flex items-center bg-vault-glass-strong rounded-full p-1 border border-vault-border">
          {/* Sliding pill indicator */}
          <motion.div
            className="absolute top-1 bottom-1 rounded-full bg-vault-accent"
            initial={false}
            animate={{
              left: annual ? "50%" : "4px",
              right: annual ? "4px" : "50%",
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          />
          <button
            onClick={() => setAnnual(false)}
            className={`relative z-10 px-5 py-2 rounded-full text-sm font-semibold transition-colors duration-200 cursor-pointer ${
              !annual
                ? "text-white"
                : "text-vault-text-secondary hover:text-vault-text"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`relative z-10 px-5 py-2 rounded-full text-sm font-semibold transition-colors duration-200 cursor-pointer ${
              annual
                ? "text-white"
                : "text-vault-text-secondary hover:text-vault-text"
            }`}
          >
            Annual
          </button>
        </div>
        <span className="ml-2 px-3 py-1 bg-vault-green/20 text-vault-green text-xs font-semibold rounded-full">
          Save 20%
        </span>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {PRICING_TIERS.map((tier, i) => {
          const price = annual ? tier.annual : tier.monthly;
          const period = tier.name === "Enterprise"
            ? ""
            : annual
              ? "/mo billed annually"
              : "/mo";
          const isCustom = price === "Custom";

          return (
            <motion.div
              key={tier.name}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              className={`relative ${
                tier.highlighted ? "scale-105 z-10" : ""
              }`}
            >
              {/* "Most Popular" badge */}
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-vault-accent text-white text-xs font-semibold rounded-full z-20 animate-pulse-glow">
                  {tier.badge}
                </span>
              )}

              {/* Double-bezel wrapper for highlighted card */}
              {tier.highlighted ? (
                <div className="p-1 rounded-[1.75rem] bg-gradient-to-b from-vault-accent/20 to-vault-cyan/10 shadow-[0_0_40px_rgba(117,60,255,0.15)] h-full">
                  <div className="glass rounded-3xl p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] flex flex-col h-full">
                    <CardContent tier={tier} price={price} period={period} isCustom={isCustom} annual={annual} />
                  </div>
                </div>
              ) : (
                <GlassCard className="flex flex-col h-full">
                  <CardContent tier={tier} price={price} period={period} isCustom={isCustom} annual={annual} />
                </GlassCard>
              )}
            </motion.div>
          );
        })}
      </div>
    </SectionWrapper>
  );
}
