"use client";

import { Fragment } from "react";
import { motion } from "framer-motion";
import { HOW_IT_WORKS } from "@/lib/constants";
import { SectionWrapper } from "@/components/ui/SectionWrapper";

const stepVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 20, delay: i * 0.04 },
  }),
};

const lineVariants = {
  hidden: { scaleX: 0 },
  visible: (i: number) => ({
    scaleX: 1,
    transition: { duration: 0.6, delay: i * 0.04 + 0.2 },
  }),
};

export function HowItWorks() {
  return (
    <SectionWrapper
      id="how-it-works"
      title="How It Works"
      subtitle="Three steps to quantum-grade security"
    >
      <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-4">
        {HOW_IT_WORKS.map((step, i) => (
          <Fragment key={step.step}>
            {/* Step card */}
            <motion.div
              className="flex flex-col items-center text-center max-w-xs"
              variants={stepVariants}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              {/* Number label with gradient text */}
              <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] gradient-text mb-3">
                Step {step.step}
              </span>

              {/* Number circle */}
              <div className="w-16 h-16 rounded-full bg-vault-accent/15 border-2 border-vault-accent flex items-center justify-center text-2xl font-bold text-vault-accent mb-4 font-display">
                {step.step}
              </div>

              {/* Title — display font */}
              <h3 className="font-display text-lg font-semibold text-vault-text mb-2 tracking-tight">
                {step.title}
              </h3>

              {/* Description */}
              <p className="text-vault-text-secondary text-sm leading-relaxed">
                {step.description}
              </p>
            </motion.div>

            {/* Connecting gradient line with shimmer (desktop only) */}
            {i < HOW_IT_WORKS.length - 1 && (
              <motion.div
                className="hidden lg:block h-0.5 flex-1 origin-left"
                style={{
                  background: "linear-gradient(90deg, #753cff, #22D3EE, #D946EF)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 3s linear infinite",
                }}
                variants={lineVariants}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
              />
            )}
          </Fragment>
        ))}
      </div>
    </SectionWrapper>
  );
}
