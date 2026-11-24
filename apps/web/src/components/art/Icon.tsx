/**
 * Line icons on a 24×24 grid, drawn in the current text colour. They replace
 * emoji, whose look changes from one OS to the next.
 */
export const ICON_SHAPES = {
  /** Valet Saboteur. */
  sword: (
    <>
      <path d="M14.5 3.5H20.5V9.5L10 20L4 14Z" />
      <path d="M7 12.5L11.5 17M3 21L6.5 17.5" />
    </>
  ),
  /** Dame Saboteuse. */
  tiara: (
    <>
      <path d="M4 17C4 11 7.5 8 12 8C16.5 8 20 11 20 17Z" />
      <path d="M12 4.5L13.6 8M12 4.5L10.4 8M4 17H20" />
      <circle cx="12" cy="12.5" r="1.6" />
    </>
  ),
  /** Roi Saboteur. */
  crown: <path d="M3 8L7.5 12L12 5L16.5 12L21 8L19 19H5Z" />,
  /** As Saboteur. */
  shield: (
    <>
      <path d="M12 3L20 6V11.5C20 16 16.7 19.6 12 21C7.3 19.6 4 16 4 11.5V6Z" />
      <path d="M12 7V17M8 11H16" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4H17V9C17 12 14.8 14 12 14C9.2 14 7 12 7 9Z" />
      <path d="M7 6H4V8C4 10 5.5 11 7.3 11M17 6H20V8C20 10 18.5 11 16.7 11M12 14V18M8 20H16M9.5 18H14.5" />
    </>
  ),
  /** Président's revolution: the order of ranks turns around. */
  swap: <path d="M4 9H18L14.5 5.5M20 15H6L9.5 18.5" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5V5.5M12 18.5V21.5M2.5 12H5.5M18.5 12H21.5M5.3 5.3L7.4 7.4M16.6 16.6L18.7 18.7M5.3 18.7L7.4 16.6M16.6 7.4L18.7 5.3" />
    </>
  ),
  star: <path d="M12 3L14.6 9.2L21 9.6L16 13.8L17.6 20.5L12 16.8L6.4 20.5L8 13.8L3 9.6L9.4 9.2Z" />,
} as const;

export type IconName = keyof typeof ICON_SHAPES;

export function Icon({ name, label, className }: { name: IconName; label?: string; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label && <title>{label}</title>}
      {ICON_SHAPES[name]}
    </svg>
  );
}
