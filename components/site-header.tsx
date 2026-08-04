import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
      </div>
    </header>
  );
}
