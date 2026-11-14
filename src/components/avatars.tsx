import clsx from "clsx";
import { Sparkles } from "lucide-react";
import Image from "next/image";

import type { ModelInfo, Profile } from "@/lib/types";

/** Provider logo on a white tile (logos are drawn for light grounds), a sparkle for Auto, else initials. */
export function ModelAvatar({ model, size = 32, className }: { model: ModelInfo; size?: number; className?: string }) {
  const box = { width: size, height: size };
  if (model.logo) {
    const inner = Math.round(size * 0.62);
    return (
      <span
        aria-hidden
        className={clsx("inline-flex shrink-0 items-center justify-center rounded-[30%] bg-white ring-1 ring-black/10", className)}
        style={box}
      >
        <Image src={model.logo} alt="" width={inner} height={inner} unoptimized className="object-contain" style={{ width: inner, height: inner }} />
      </span>
    );
  }
  if (model.auto) {
    return (
      <span
        aria-hidden
        className={clsx("inline-flex shrink-0 items-center justify-center rounded-[30%] bg-accent text-white", className)}
        style={box}
      >
        <Sparkles style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-[30%] font-semibold text-white",
        className,
      )}
      style={{ ...box, background: model.color, fontSize: Math.round(size * 0.38) }}
    >
      {model.initials}
    </span>
  );
}

export function ProfileAvatar({
  profile,
  size = 32,
  className,
}: {
  profile: Pick<Profile, "emoji" | "color">;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={clsx("inline-flex shrink-0 select-none items-center justify-center rounded-[22%]", className)}
      style={{ width: size, height: size, background: profile.color, fontSize: Math.round(size * 0.52) }}
    >
      {profile.emoji}
    </span>
  );
}
