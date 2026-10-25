import { describe, expect, it } from "vitest";
import { placeCard, spotlight } from "./placement";

const card = { width: 320, height: 200 };
const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };

describe("tour card placement", () => {
  it("puts the card to the right of a sidebar button", () => {
    const place = placeCard({ x: 180, y: 20, width: 32, height: 32 }, card, desktop);
    expect(place).toEqual({ side: "right", x: 228, y: 20 });
  });

  it("puts the card under a wide block that leaves no room at the sides", () => {
    const place = placeCard({ x: 260, y: 120, width: 1160, height: 300 }, card, desktop);
    expect(place.side).toBe("bottom");
    expect(place.y).toBe(436);
  });

  it("puts the card above the bottom navigation on a phone", () => {
    const place = placeCard({ x: 260, y: 790, width: 120, height: 50 }, card, phone);
    expect(place.side).toBe("top");
    expect(place.y).toBe(574);
    expect(place.x).toBe(54);
  });

  it("keeps the card on the screen when nothing fits", () => {
    const place = placeCard({ x: 0, y: 0, width: 390, height: 844 }, card, phone);
    expect(place.x).toBeGreaterThanOrEqual(16);
    expect(place.y + card.height).toBeLessThanOrEqual(phone.height - 16);
  });

  it("leaves some room around the highlighted element", () => {
    expect(spotlight({ x: 100, y: 50, width: 40, height: 20 })).toEqual({
      x: 92,
      y: 42,
      width: 56,
      height: 36,
    });
  });
});
