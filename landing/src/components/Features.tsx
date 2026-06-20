"use client";

import { motion } from "framer-motion";
import { FEATURES } from "@/lib/constants";
import { SectionWrapper } from "@/components/ui/SectionWrapper";
import { GlassCard } from "@/components/ui/GlassCard";

const gridVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24, rotate: -0.5 },
  visible: {
    opacity: 1,
    y: 0,
    rotate: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 20 },
  },
};

/**
 * Bento grid layout — asymmetric card sizes break the generic 3-equal-column
 * AI pattern. Large cards (indices 0, 3) span 2 cols; wide card (index 4)
 * spans 2 cols on the last row.
 *
 * Desktop (lg):
 * ┌──────────────────────┬────────────┐
 * │   Feature 0 (2-col)  │ Feature 1  │
 * ├────────────┬─────────┴────────────┤
 * │ Feature 2  │   Feature 3 (2-col)  │
 * ├────────────┴────────────┬─────────┤
 * │   Feature 4 (2-col)    │ Feat 5   │
 * └─────────────────────────┴─────────┘
 */
export function Features() {
  return (
    <SectionWrapper
      id="features"
      title="Built for the Post-Quantum Era"
      subtitle="Every layer of USBVault is engineered with security-first principles, from the Rust cryptographic core to the zero-knowledge architecture."
      withOrbs
    >
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5"
        variants={gridVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        {FEATURES.map((feature, i) => {
          const isLarge = i === 0 || i === 3;
          const isWide = i === 4;

          return (
            <motion.div
              key={feature.title}
              variants={cardVariants}
              className={`
                ${isLarge ? "lg:col-span-2" : ""}
                ${isWide ? "md:col-span-2 lg:col-span-2" : ""}
              `}
            >
              {isLarge || isWide ? (
                /* ── Large / Wide card: Double-bezel + horizontal layout ── */
                <GlassCard hover className="!p-0 h-full">
                  <div className="rounded-3xl bg-vault-bg-secondary/30 p-1.5">
                    <div
                      className="rounded-xl p-6 md:p-8 flex flex-col md:flex-row items-start gap-5 md:gap-6"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(18,12,40,0.8), rgba(9,4,15,0.6))",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                      }}
                    >
                      {/* Icon — larger for featured cards */}
                      <div className="flex-shrink-0">
                        <div
                          className="w-16 h-16 rounded-2xl flex items-center justify-center"
                          style={{
                            backgroundColor: `${feature.accent}1A`,
                            borderWidth: 1,
                            borderColor: `${feature.accent}26`,
                          }}
                        >
                          <span className="animate-pulse-glow inline-flex">
                            <svg
                              width="28"
                              height="28"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={feature.accent}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d={feature.icon} />
                            </svg>
                          </span>
                        </div>
                      </div>

                      {/* Text */}
                      <div>
                        <h3 className="font-display text-xl font-semibold text-vault-text tracking-tight mb-2">
                          {feature.title}
                        </h3>
                        <p className="text-vault-text-secondary text-sm leading-relaxed max-w-[45ch]">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              ) : (
                /* ── Standard card: vertical layout ── */
                <GlassCard hover className="h-full">
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{
                      backgroundColor: `${feature.accent}1A`,
                      borderWidth: 1,
                      borderColor: `${feature.accent}26`,
                    }}
                  >
                    <span className="animate-pulse-glow inline-flex">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={feature.accent}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d={feature.icon} />
                      </svg>
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-display text-lg font-semibold text-vault-text tracking-tight mb-2">
                    {feature.title}
                  </h3>

                  {/* Description */}
                  <p className="text-vault-text-secondary text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </GlassCard>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </SectionWrapper>
  );
}
