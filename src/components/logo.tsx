// The app icon: a white house-shaped speech bubble with three typing dots on the accent orange, the
// same drawing as src/app/icon.svg. Keep HOUSE and the dots in step with scripts/app-icon/draw.mjs.
const HOUSE = "M512 195L800 435V725H450L292 845L330 725H224V435Z";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 1024 1024" width={size} height={size} className="shrink-0">
      <rect width="1024" height="1024" rx="232" fill="#ff5500" />
      <path d={HOUSE} fill="#ffffff" stroke="#ffffff" strokeWidth="56" strokeLinejoin="round" />
      {[392, 512, 632].map((cx) => (
        <circle key={cx} cx={cx} cy="565" r="46" fill="#ff5500" />
      ))}
    </svg>
  );
}
