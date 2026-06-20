"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionWrapper } from "@/components/ui/SectionWrapper";
import { GlassCard } from "@/components/ui/GlassCard";
import { FAQ_ITEMS } from "@/lib/constants";

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(i: number) {
    setOpenIndex(openIndex === i ? null : i);
  }

  return (
    <SectionWrapper
      id="faq"
      title="Frequently Asked Questions"
      subtitle="Everything you need to know about USBVault's security, features, and pricing."
    >
      <div className="max-w-3xl mx-auto">
        <GlassCard>
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openIndex === i;

            return (
              <div key={i}>
                {i > 0 && <div className="border-t border-vault-border/50" />}

                <button
                  role="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between gap-4 py-4 text-left cursor-pointer"
                >
                  <span className="text-vault-text font-semibold">
                    {item.question}
                  </span>

                  <motion.svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-vault-text-secondary flex-shrink-0"
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </motion.svg>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-answer-${i}`}
                      role="region"
                      aria-labelledby={`faq-question-${i}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <p className="text-vault-text-secondary text-sm leading-relaxed pb-4">
                        {item.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </GlassCard>
      </div>
    </SectionWrapper>
  );
}
