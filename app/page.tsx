import { SiteHeader } from "@/components/site-header";
import { HeroSection } from "@/components/evaluator/hero-section";
import { EvaluatorApp } from "@/components/evaluator/evaluator-app";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <HeroSection />
      <EvaluatorApp />
    </>
  );
}
