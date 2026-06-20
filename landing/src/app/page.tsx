import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { ScrollAnimationPlaceholder } from "@/components/ScrollAnimationPlaceholder";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { Security } from "@/components/Security";
import { Pricing } from "@/components/Pricing";
import { Testimonials } from "@/components/Testimonials";
import { FAQ } from "@/components/FAQ";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main id="main-content">
      <Navbar />
      <Hero />
      <ScrollAnimationPlaceholder />
      <Features />
      <HowItWorks />
      <Security />
      <Pricing />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
