import Image from "next/image";
import { cn } from "@/lib/utils";

const NATIVE_WIDTH = 256;
const NATIVE_HEIGHT = 121;

/** ML Academy wordmark, served from public/mla-logo.png. */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  const height = compact ? 24 : 40;
  const width = Math.round((height / NATIVE_HEIGHT) * NATIVE_WIDTH);

  return (
    <Image
      src="/mla-logo.png"
      alt="Machine Learning Academy"
      width={width}
      height={height}
      className={cn("shrink-0", className)}
      priority
    />
  );
}
