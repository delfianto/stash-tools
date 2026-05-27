import { parseCupCategory } from "../server/measurementParser";
import measurements from "./measurements.json";

describe("Tits Engine Assertion Tests", () => {
  test.each(measurements)(
    "categorizes $measurements ($name) as $expected",
    ({ measurements, expected }) => {
      expect(parseCupCategory(measurements)).toBe(expected);
    }
  );

  test("handles null and empty input", () => {
    expect(parseCupCategory(null)).toBeNull();
    expect(parseCupCategory("")).toBeNull();
    expect(parseCupCategory("invalid")).toBeNull();
  });
});
