export interface SeriesPoint { x: number; y: number }

export const CHART_POINT_LIMIT = 600;

/**
 * Deterministic, evenly spaced downsampling that always keeps the first and last
 * point, so thousands of curve rows render without dropping the curve's extent.
 */
export function downsampleSeries(points: SeriesPoint[], limit: number = CHART_POINT_LIMIT): SeriesPoint[] {
  if (limit < 2 || points.length <= limit) return points;
  const step = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]);
}

interface DataSeriesChartProps {
  title: string;
  unit: string;
  xLabel: string;
  points: SeriesPoint[];
  accent?: "volt" | "copper";
}

const WIDTH = 640;
const HEIGHT = 200;
const PAD = 8;

function format(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

export function DataSeriesChart({ title, unit, xLabel, points, accent = "volt" }: DataSeriesChartProps) {
  const sampled = downsampleSeries(points);
  if (sampled.length < 2) {
    return <figure className="chart">
      <figcaption className="chart__caption"><span className="mono chart__title">{title}</span><span className="chart__unit">{unit}</span></figcaption>
      <p className="chart__empty">At least two validated points are required to draw {title.toLowerCase()}.</p>
    </figure>;
  }

  const yValues = sampled.map((point) => point.y);
  const xValues = sampled.map((point) => point.x);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const spanY = maxY - minY || 1;
  const spanX = maxX - minX || 1;
  const path = sampled
    .map((point) => `${PAD + ((point.x - minX) / spanX) * (WIDTH - PAD * 2)},${HEIGHT - PAD - ((point.y - minY) / spanY) * (HEIGHT - PAD * 2)}`)
    .join(" ");
  const summary = `${title} against ${xLabel}. ${points.length.toLocaleString()} supplied points${sampled.length < points.length ? `, drawn from ${sampled.length.toLocaleString()} evenly spaced samples` : ""}. Range ${format(minY)} to ${format(maxY)} ${unit}.`;

  return <figure className="chart">
    <figcaption className="chart__caption">
      <span className="mono chart__title">{title}</span>
      <span className="chart__unit">{unit} vs {xLabel}</span>
    </figcaption>
    {/* The bounds are y-axis ticks, so they sit at the top and bottom of the plot rather than side by side. */}
    <div className="chart__plot">
      <svg className={`chart__svg chart__svg--${accent}`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={summary}>
        <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} className="chart__grid" />
        <line x1="0" y1={PAD} x2={WIDTH} y2={PAD} className="chart__grid" />
        <line x1="0" y1={HEIGHT - PAD} x2={WIDTH} y2={HEIGHT - PAD} className="chart__grid" />
        <polyline points={path} className="chart__line" />
      </svg>
      <span className="chart__tick chart__tick--max mono">{format(maxY)} {unit}</span>
      <span className="chart__tick chart__tick--min mono">{format(minY)} {unit}</span>
    </div>
    <p className="chart__axis mono">{xLabel} →</p>
    <p className="chart__summary">{summary}</p>
  </figure>;
}
