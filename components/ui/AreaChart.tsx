/**
 * The little area chart on the signed in users card.
 *
 * It is drawn with SVG so it stays sharp on any screen and needs no chart
 * library. The data is read from the database, so it shows the real number
 * of sessions over the last hours.
 */
export function AreaChart({
  points,
  height = 160,
  label,
}: {
  points: { label: string; value: number }[];
  height?: number;
  label: string;
}) {
  const width = 640;
  const pad = { top: 14, right: 10, bottom: 28, left: 34 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;

  const maxValue = Math.max(10, ...points.map((point) => point.value));
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const coords = points.map((point, index) => ({
    ...point,
    x: pad.left + index * step,
    y:
      pad.top +
      innerHeight -
      (point.value / maxValue) * innerHeight,
  }));

  const first = coords[0];
  const last = coords.at(-1);

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");

  const area =
    first && last
      ? `${line} L${last.x.toFixed(1)},${(pad.top + innerHeight).toFixed(1)} L${first.x.toFixed(1)},${(
          pad.top + innerHeight
        ).toFixed(1)} Z`
      : "";

  const ticks = [maxValue, Math.round(maxValue / 2), 0];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="freery-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#93C2C2" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#93C2C2" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {ticks.map((tick, index) => {
        const y = pad.top + (innerHeight / (ticks.length - 1)) * index;
        return (
          <g key={tick}>
            <line
              x1={pad.left}
              y1={y}
              x2={width - pad.right}
              y2={y}
              stroke="#E3EAED"
              strokeWidth="1"
            />
            <text
              x={pad.left - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="#8A9BA7"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {area ? <path d={area} fill="url(#freery-area)" /> : null}
      {line ? (
        <path
          d={line}
          fill="none"
          stroke="#087E83"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}

      {first && last && points.length > 1 ? (
        <>
          <text x={first.x} y={height - 8} fontSize="11" fill="#8A9BA7">
            {first.label}
          </text>
          <text
            x={(first.x + last.x) / 2}
            y={height - 8}
            fontSize="11"
            fill="#8A9BA7"
            textAnchor="middle"
          >
            {coords[Math.floor(coords.length / 2)]?.label}
          </text>
          <text
            x={last.x}
            y={height - 8}
            fontSize="11"
            fill="#8A9BA7"
            textAnchor="end"
          >
            {last.label}
          </text>
        </>
      ) : null}
    </svg>
  );
}
