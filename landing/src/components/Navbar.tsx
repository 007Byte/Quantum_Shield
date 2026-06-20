"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { NAV_LINKS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const closeMenu = useCallback(() => setIsOpen(false), []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass border-b border-vault-border-glow rounded-b-2xl"
          : "bg-transparent"
      }`}
    >
      <div ref={sentinelRef} className="absolute top-[50px] left-0 h-px w-px" />
      <div className="max-w-7xl mx-auto px-6 h-20 md:h-24 flex items-center justify-between">
        {/* Logo */}
        <a
          href="/"
          className="flex items-center gap-3"
        >
          <Image
            src="/logo.png"
            alt="USBVault"
            width={1536}
            height={1024}
            className="w-28 md:w-36 h-auto"
          />
          <span className="text-xl md:text-2xl font-bold tracking-wider uppercase text-vault-text font-display">
            <span className="text-vault-accent">Quantum</span> Armor Vault
          </span>
        </a>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-10">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-vault-text-secondary hover:text-vault-text transition-colors text-base"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-5">
          <a
            href="/login"
            className="text-vault-text-secondary hover:text-vault-text transition-colors text-base"
          >
            Login
          </a>
          <Button variant="ghost" size="md" href="#pricing">
            Get Started Free
          </Button>
        </div>

        {/* Mobile hamburger button */}
        <button
          className="md:hidden relative w-8 h-8 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-vault-accent rounded"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
        >
          <div className="w-6 h-5 relative flex flex-col justify-between">
            <motion.span
              className="block h-0.5 w-6 bg-vault-text rounded-full origin-center"
              animate={
                isOpen
                  ? { rotate: 45, y: 9 }
                  : { rotate: 0, y: 0 }
              }
              transition={{ duration: 0.3 }}
            />
            <motion.span
              className="block h-0.5 w-6 bg-vault-text rounded-full"
              animate={isOpen ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.2 }}
            />
            <motion.span
              className="block h-0.5 w-6 bg-vault-text rounded-full origin-center"
              animate={
                isOpen
                  ? { rotate: -45, y: -9 }
                  : { rotate: 0, y: 0 }
              }
              transition={{ duration: 0.3 }}
            />
          </div>
        </button>
      </div>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="glass-strong fixed inset-0 top-20 md:top-24 z-40 flex flex-col items-center justify-start pt-12 md:hidden"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="flex flex-col items-center gap-6">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className="text-vault-text-secondary hover:text-vault-text transition-colors text-lg"
                >
                  {link.label}
                </a>
              ))}

              <div className="w-16 h-px bg-vault-border my-2" />

              <a
                href="/login"
                onClick={closeMenu}
                className="text-vault-text-secondary hover:text-vault-text transition-colors text-lg"
              >
                Login
              </a>

              <Button variant="primary" size="lg" href="#pricing">
                Get Started Free
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
