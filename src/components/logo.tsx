import { MessagesSquare } from "lucide-react";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[30%] bg-accent text-white shadow-sm"
      style={{ width: size, height: size }}
    >
      <MessagesSquare style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}
