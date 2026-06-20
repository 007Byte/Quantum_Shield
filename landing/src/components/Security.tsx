"use client";

import { motion } from "framer-motion";
import { SECURITY_BADGES } from "@/lib/constants";
import { SectionWrapper } from "@/components/ui/SectionWrapper";
import { GlassCard } from "@/components/ui/GlassCard";

const gridVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const badgeVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 16 },
  },
};

const CIPHER_SUITE = [
  { key: "KEX", value: "ML-KEM-1024 (FIPS 203)" },
  { key: "AEAD", value: "AES-256-GCM-SIV" },
  { key: "KDF", value: "Argon2id (64MB, t=3, p=4)" },
  { key: "SIG", value: "Ed25519 + ML-DSA-87" },
  { key: "AUTH", value: "FIDO2 WebAuthn" },
] as const;

export function Security() {
  return (
    <SectionWrapper
      id="security"
      title="Built on Unbreakable Foundations"
      subtitle="Protected by military-grade post-quantum cryptography"
      withOrbs
    >
      {/* Badge grid */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-3 gap-3"
        variants={gridVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        {SECURITY_BADGES.map((badge) => {
          const isCyan = badge.label === "Zero-Knowledge";
          return (
            <motion.div
              key={badge.label}
              variants={badgeVariants}
              className="group relative"
              whileHover={{
                scale: 1.04,
                boxShadow: isCyan
                  ? "0 0 30px rgba(34,211,238,0.25)"
                  : "0 0 30px rgba(117,60,255,0.25)",
                transition: { type: "spring", stiffness: 300, damping: 20 },
              }}
            >
              <GlassCard
                className="text-center gradient-border transition-all duration-200"
              >
                <p className="font-display text-lg font-bold text-vault-text tracking-tight">
                  {badge.label}
                </p>
                <p className="text-sm text-vault-accent mt-1">
                  {badge.sublabel}
                </p>

                {/* Tooltip on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-vault-bg-secondary border border-vault-border rounded-lg text-xs text-vault-text-secondary whitespace-nowrap z-10 pointer-events-none">
                  {badge.tooltip}
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Cipher suite display */}
      <motion.div
        className="mt-12"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.2 }}
      >
        <div className="glass rounded-3xl p-6 md:p-8 max-w-2xl mx-auto">
          <p className="font-display text-sm font-semibold text-vault-text-secondary uppercase tracking-wider mb-4">
            Active Cipher Suite
          </p>
          <div className="h-px bg-vault-border mb-4" />
          <div className="font-mono text-sm space-y-3">
            {CIPHER_SUITE.map((entry, index) => {
              const isLast = index === CIPHER_SUITE.length - 1;
              return (
                <div key={entry.key} className="flex items-start gap-3">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-vault-green shrink-0" />
                  <span className="text-vault-text-secondary min-w-[4ch]">
                    {entry.key}:
                  </span>
                  <span
                    className={`text-glow-green ${isLast ? "text-vault-text terminal-cursor" : "text-vault-text"}`}
                  >
                    {entry.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </SectionWrapper>
  );
}
