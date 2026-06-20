"use client";

import { motion } from "framer-motion";
import { GradientOrbs } from "@/components/ui/GradientOrbs";

interface SectionWrapperProps {
  id?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  withOrbs?: boolean;
}

export function SectionWrapper({
  id,
  children,
  className = "",
  title,
  subtitle,
  withOrbs = false,
}: SectionWrapperProps) {
  return (
    <section
      id={id}
      className={`relative overflow-hidden py-20 md:py-32 ${className}`}
    >
      {withOrbs && <GradientOrbs variant="section" />}

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {title && (
          <h2 className="font-display text-3xl md:text-4xl font-bold text-center mb-4 tracking-tight [text-wrap:balance]">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-vault-text-secondary text-center max-w-2xl mx-auto mb-16">
            {subtitle}
          </p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          {children}
        </motion.div>
      </div>
    </section>
  );
}
