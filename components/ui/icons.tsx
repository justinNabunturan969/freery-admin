/**
 * The small line drawings used in the admin console.
 *
 * They are inline SVG so they take the colour of the text around them and
 * they stay sharp on every screen.
 */

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function UsersIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...base}>
        <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
        <circle cx="10" cy="7.5" r="3" />
        <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.6a3 3 0 0 1 0 5.8" />
      </g>
    </svg>
  );
}

export function ShipIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...base}>
        <path d="M3 18.5c1.8 0 1.8 1.2 3.6 1.2s1.8-1.2 3.6-1.2 1.8 1.2 3.6 1.2 1.8-1.2 3.6-1.2 1.8 1.2 3.6 1.2" />
        <path d="M5 15.5 6.5 10h11L19 15.5z" />
        <path d="M12 10V4.5M12 4.5 8 7" />
      </g>
    </svg>
  );
}

export function PassengersIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...base}>
        <circle cx="9" cy="7" r="2.5" />
        <path d="M4 19v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1" />
        <circle cx="17" cy="8.5" r="2" />
        <path d="M15 19v-1a3 3 0 0 1 3-3h.5a2.5 2.5 0 0 1 2.5 2.5V19" />
      </g>
    </svg>
  );
}

export function SeatIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...base}>
        <path d="M6 4v8a2 2 0 0 0 2 2h8a2 2 0 0 1 2 2v4" />
        <path d="M6 10h9a3 3 0 0 1 3 3v1" />
        <path d="M4 20h6" />
      </g>
    </svg>
  );
}

export function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...base}>
        <path d="M12 5v14M5 12h14" />
      </g>
    </svg>
  );
}

export function ExternalIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...base}>
        <path d="M14 4h6v6" />
        <path d="M20 4 11 13" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </g>
    </svg>
  );
}

/** A map pin, for the station an account is assigned to. */
export function StationPinIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...base}>
        <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
        <path d="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      </g>
    </svg>
  );
}
