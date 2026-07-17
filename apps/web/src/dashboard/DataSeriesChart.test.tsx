import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHART_POINT_LIMIT, DataSeriesChart, downsampleSeries, type SeriesPoint } from "./DataSeriesChart";

afterEach(cleanup);

const ramp = (count: number): SeriesPoint[] => Array.from({ length: count }, (_, index) => ({ x: index, y: index / 10 }));

describe("chart downsampling", () => {
  it("keeps small series untouched", () => {
    const points = ramp(5);
    expect(downsampleSeries(points, 600)).toBe(points);
  });

  it("is deterministic and keeps the first and last point", () => {
    const points = ramp(5000);
    const first = downsampleSeries(points);
    const second = downsampleSeries(points);
    expect(first).toHaveLength(CHART_POINT_LIMIT);
    expect(first).toEqual(second);
    expect(first[0]).toEqual(points[0]);
    expect(first.at(-1)).toEqual(points.at(-1));
  });

  it("samples evenly so the drawn extent matches the supplied extent", () => {
    const points = ramp(5000);
    const sampled = downsampleSeries(points, 10);
    expect(sampled.map((point) => point.x)).toEqual([0, 555, 1111, 1666, 2222, 2777, 3333, 3888, 4444, 4999]);
  });
});

describe("data series chart", () => {
  it("summarizes the supplied series accessibly with units", () => {
    render(<DataSeriesChart title="Voltage" unit="V" xLabel="point index" points={ramp(4)} />);
    const chart = screen.getByRole("img");
    expect(chart).toHaveAccessibleName("Voltage against point index. 4 supplied points. Range 0.0000 to 0.3000 V.");
    expect(screen.getByText("V vs point index")).toBeInTheDocument();
  });

  it("reports the downsampling it performed instead of implying every point is drawn", () => {
    render(<DataSeriesChart title="Voltage" unit="V" xLabel="point index" points={ramp(3510)} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/3,510 supplied points, drawn from 600 evenly spaced samples/);
  });

  it("shows an empty state instead of a misleading line for a single point", () => {
    render(<DataSeriesChart title="Voltage" unit="V" xLabel="point index" points={ramp(1)} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/At least two validated points are required/)).toBeInTheDocument();
  });
});
