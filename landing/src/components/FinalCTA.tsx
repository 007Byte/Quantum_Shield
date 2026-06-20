"use client";

import { motion } from "framer-motion";
import { GradientOrbs } from "@/components/ui/GradientOrbs";
import { Button } from "@/components/ui/Button";

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 md:py-36">
      <GradientOrbs variant="cta" />

      <motion.div
        className="relative z-10 flex flex-col items-center px-6"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 80, damping: 18 }}
      >
        <h2 className="font-display text-4xl md:text-6xl font-bold text-center text-glow gradient-text tracking-tight [text-wrap:balance]">
          Ready to Secure Your Digital Life?
        </h2>

        <p className="text-vault-text-secondary text-lg text-center max-w-xl mx-auto mt-8 mb-10">
          Join thousands of users who trust USBVault with their most sensitive
          data.
        </p>

        <Button variant="primary" size="lg" href="#pricing" className="btn-pulse">
          Get Started Free
        </Button>

        <p className="text-vault-text-muted text-sm mt-4">
          No credit card required. Free forever plan available.
        </p>
      </motion.div>
    </section>
  );
}
