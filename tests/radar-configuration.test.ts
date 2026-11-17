import { describe, expect, it } from "vitest";
import { chooseConfiguration, configurationValues, type Configuration } from "../src/lib/radar/configuration";

const models: Configuration[] = [
  { slug: "base-silver-16", label: "Base silver", attributes: { chip: "Base", color: "Silver", memory: "16GB" } },
  { slug: "base-black-16", label: "Base black", attributes: { chip: "Base", color: "Black", memory: "16GB" } },
  { slug: "pro-silver-24", label: "Pro silver", attributes: { chip: "Pro", color: "Silver", memory: "24GB" } },
  { slug: "pro-black-24", label: "Pro black", attributes: { chip: "Pro", color: "Black", memory: "24GB" } },
];
describe("product configuration selection", () => {
  it("keeps a chosen finish when a chip requires a different memory configuration", () => {
    expect(chooseConfiguration(models, models[1], "chip", "Pro")?.slug).toBe("pro-black-24");
  });
  it("cannot create a memory and chip combination the product does not offer", () => {
    const next = chooseConfiguration(models, models[3], "memory", "16GB");
    expect(next).toBe(models[1]);
    expect(models).toContain(next);
  });
  it("rejects absent choices instead of silently selecting an unrelated product", () => {
    expect(chooseConfiguration(models, models[0], "chip", "Ultra")).toBeUndefined();
    expect(chooseConfiguration([], undefined, "color", "Silver")).toBeUndefined();
  });
  it("shows only documented option values in their catalog order", () => {
    expect(configurationValues(models, "memory")).toEqual(["16GB", "24GB"]);
    expect(configurationValues(models, "display")).toEqual([]);
  });
});
