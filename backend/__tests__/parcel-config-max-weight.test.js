import { jest } from "@jest/globals";

/**
 * `ParcelConfig.getOrCreate` repairs a config document on every read, and one
 * of those repairs used to reset `maxWeightKg` whenever it was exactly 5.
 *
 * That was a one-off correction for an old bad default, left running
 * permanently. An admin could set Max Weight to 5 kg on /admin/parcels/pricing,
 * watch it save, and have the next fare calculation put it back to 1 — after
 * which every parcel over a kilo was refused with no explanation anywhere.
 */

// The real model is used: `getOrCreate` is plain logic over a document, and
// only the one database read it makes is stubbed.
const ParcelConfig = (await import("../app/models/parcelConfig.js")).default;

/** A saved config document, with just enough surface for getOrCreate. */
function configDoc(overrides = {}) {
  return {
    packageTypes: [{ value: "document", label: "Document", isActive: true }],
    packageCategories: [],
    packageDescriptionPlaceholder: "E.g. keys",
    maxWeightKg: 1,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
});

async function getOrCreateWith(doc) {
  jest.spyOn(ParcelConfig, "findOne").mockResolvedValue(doc);
  return ParcelConfig.getOrCreate.call(ParcelConfig);
}

describe("ParcelConfig.getOrCreate · max weight", () => {
  it("keeps 5 kg, which an admin is entitled to set", async () => {
    const doc = configDoc({ maxWeightKg: 5 });

    const result = await getOrCreateWith(doc);

    expect(result.maxWeightKg).toBe(5);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it.each([0.5, 2, 10, 25, 50])("keeps %s kg untouched", async (weight) => {
    const doc = configDoc({ maxWeightKg: weight });

    const result = await getOrCreateWith(doc);

    expect(result.maxWeightKg).toBe(weight);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["zero", 0],
    ["a negative limit", -3],
  ])("repairs %s back to 1 kg", async (_label, weight) => {
    const doc = configDoc({ maxWeightKg: weight });

    const result = await getOrCreateWith(doc);

    expect(result.maxWeightKg).toBe(1);
    expect(doc.save).toHaveBeenCalled();
  });

  it("still seeds package types when a config has none", async () => {
    const doc = configDoc({ packageTypes: [] });

    const result = await getOrCreateWith(doc);

    expect(result.packageTypes.length).toBeGreaterThan(0);
    expect(doc.save).toHaveBeenCalled();
  });
});
