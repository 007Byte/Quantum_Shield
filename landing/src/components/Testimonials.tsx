"use client";

import { motion } from "framer-motion";
import { SectionWrapper } from "@/components/ui/SectionWrapper";
import { GlassCard } from "@/components/ui/GlassCard";
import { TESTIMONIALS } from "@/lib/constants";

const cardVariants = {
  hidden: (i: number) => ({
    opacity: 0,
    x: i % 2 === 0 ? -40 : 40,
  }),
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.55, delay: i * 0.12, ease: "easeOut" as const },
  }),
};

/**
 * Offset / staggered testimonials — cards zig-zag left and right
 * instead of sitting in a generic 3-equal-column grid.
 */
export function Testimonials() {
  return (
    <SectionWrapper
      id="testimonials"
      title="Trusted by Security-Conscious Users"
      subtitle="See why security professionals and organizations trust USBVault to protect their most sensitive data."
    >
      <div className="space-y-8 lg:space-y-10">
        {TESTIMONIALS.map((testimonial, i) => (
          <motion.div
            key={testimonial.name}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={cardVariants}
            className={`max-w-2xl ${i % 2 === 0 ? "mr-auto" : "ml-auto"}`}
          >
            <GlassCard hover className="relative overflow-hidden">
              {/* Decorative quote mark */}
              <span
                className="absolute -top-2 -left-1 text-vault-accent/15 text-[5rem] font-serif leading-none select-none pointer-events-none"
                aria-hidden="true"
              >
                &ldquo;
              </span>

              {/* Quote text */}
              <p className="relative text-vault-text-secondary text-base leading-relaxed italic pl-2 pt-4">
                {testimonial.quote}
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 mt-6">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-vault-accent to-vault-cyan flex-shrink-0" />
                <div>
                  <p className="font-display text-vault-text font-semibold text-sm">
                    {testimonial.name}
                  </p>
                  <p className="text-vault-text-muted text-xs">
                    {testimonial.title}, {testimonial.company}
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  );
}
