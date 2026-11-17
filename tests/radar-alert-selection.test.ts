import { describe, expect, it } from "vitest";
import { resolveAlertSelection } from "../src/lib/radar/alert-selection";

const items = [
  { id: "phone", slug: "phone", variants: [{ id: "phone-white", slug: "white" }, { id: "phone-black", slug: "black" }], sources: [{ id: "apple-white", variantId: "phone-white" }, { id: "apple-black", variantId: "phone-black" }] },
  { id: "console", slug: "console", variants: [{ id: "console-standard", slug: "standard" }], sources: [{ id: "console-shop", variantId: "console-standard" }] },
];

describe("alert selection from a product link", () => {
  it("preserves a non-first variant selected by slug or id", () => {
    for (const variant of ["black", "phone-black"]) {
      expect(resolveAlertSelection(items, { item: "phone", variant, source: "apple-black" })).toMatchObject({ variantId: "phone-black", sourceIds: ["apple-black"] });
    }
  });
  it("infers the matching variant from a retailer source", () => {
    expect(resolveAlertSelection(items, { item: "phone", source: "apple-black" })).toMatchObject({ variantId: "phone-black", sourceIds: ["apple-black"] });
  });
  it("keeps explicit variant selection and drops a mismatched source", () => {
    expect(resolveAlertSelection(items, { item: "phone", variant: "white", source: "apple-black" })).toMatchObject({ variantId: "phone-white", sourceIds: [] });
  });
  it("never imports a variant or source from a different product", () => {
    expect(resolveAlertSelection(items, { item: "console", variant: "phone-black", source: "apple-black" })).toMatchObject({ variantId: "console-standard", sourceIds: [] });
  });
  it("falls back safely for unknown selections and handles an empty catalog", () => {
    expect(resolveAlertSelection(items, { item: "unknown", variant: "unknown", source: "unknown" })).toMatchObject({ variantId: "phone-white", sourceIds: [] });
    expect(resolveAlertSelection([], {})).toBeNull();
  });
});
