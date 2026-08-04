import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
        <h1 className="text-lg font-semibold text-foreground sm:text-xl">Get Your Assignment Graded Instantly</h1>
      </div>
    </header>
  );
}
