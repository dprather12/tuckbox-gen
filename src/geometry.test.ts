import { describe, expect, it } from "vitest";
import {
  calculateDieline,
  fitsOnPaper,
  getPaper,
  resolvePaper,
  toMillimeters
} from "./geometry";

describe("geometry", () => {
  it("converts inches to millimeters", () => {
    expect(toMillimeters(1, "in")).toBeCloseTo(25.4);
    expect(toMillimeters(10, "mm")).toBe(10);
  });

  it("builds the body strip from two widths, two depths, and a glue tab", () => {
    const result = calculateDieline({ width: 63.5, depth: 19.05, height: 88.9 });
    expect(result.totalWidth).toBeCloseTo(63.5 * 2 + 19.05 * 2 + result.glueTab);
    expect(result.panels.front.width).toBe(63.5);
    expect(result.panels.left.width).toBe(19.05);
    expect(result.panels.front.x).toBeCloseTo(82.55);
  });

  it("selects landscape when only landscape fits", () => {
    const paper = resolvePaper("letter", "auto", 250, 160);
    expect(paper.orientation).toBe("landscape");
  });

  it("rejects a dieline that exceeds the safe printable area", () => {
    expect(fitsOnPaper(205, 260, getPaper("letter", "portrait"))).toBe(false);
  });
});
