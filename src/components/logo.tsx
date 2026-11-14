// The app icon: Be Vietnam Pro Bold's lowercase "f" in the accent orange on an ink tile, the same
// drawing as src/app/icon.svg. Regenerate both with scripts/app-icon/build.sh.
const F_PATH =
  "M433.9 849.9V490.9H360.2V384.7H433.9V347.9Q433.9 322.4 440.9 292.6Q447.9 262.7 465.9 235.5Q483.9 208.3 516.4 191.2Q548.9 174.1 599.8 174.1Q627.9 174.1 645.9 178Q663.8 182 663.8 182V275.9Q663.8 275.9 653.3 274.1Q642.8 272.4 631.4 272.4Q595.4 272.4 581.3 293.4Q567.3 314.5 567.3 347.9V384.7H661.2V490.9H567.3V849.9Z";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      // The ink tile almost disappears on the dark background, so dark mode draws a hairline around it.
      className="shrink-0 rounded-[22.65%] dark:ring-1 dark:ring-border"
    >
      <rect width="1024" height="1024" rx="232" fill="#1a1a1f" />
      <path fill="#ff5500" d={F_PATH} />
    </svg>
  );
}
