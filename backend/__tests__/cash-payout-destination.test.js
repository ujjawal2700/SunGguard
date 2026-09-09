import { jest } from "@jest/globals";

/**
 * Where a rider's cash deposit is supposed to go.
 *
 * Before this, a rider picked a method and typed a reference with nothing on
 * screen saying whose account it was. This is the admin-set, rider-read
 * config that fills that gap — the rules matter because a half-typed bank
 * account here is worse than none: money sent to it would fail to land.
 */

const settingFindOne = jest.fn();
const settingFindOneAndUpdate = jest.fn();

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: { findOne: settingFindOne, findOneAndUpdate: settingFindOneAndUpdate },
}));

const chain = (result) => ({ select: () => ({ lean: () => Promise.resolve(result) }) });

const { getCashPayoutDestination, updateCashPayoutDestination } = await import(
  "../app/services/riderCashService.js"
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getCashPayoutDestination", () => {
  it("returns empty defaults when nothing has been configured", async () => {
    settingFindOne.mockReturnValue(chain(null));

    const result = await getCashPayoutDestination();

    expect(result).toEqual({
      upiId: "",
      qrImageUrl: "",
      bankAccountHolder: "",
      bankAccountNumber: "",
      bankIfsc: "",
      bankName: "",
    });
  });

  it("returns whatever admin has saved", async () => {
    settingFindOne.mockReturnValue(
      chain({ cashDepositPayout: { upiId: "admin@okhdfc", qrImageUrl: "https://cdn/qr.png" } }),
    );

    const result = await getCashPayoutDestination();

    expect(result.upiId).toBe("admin@okhdfc");
    expect(result.qrImageUrl).toBe("https://cdn/qr.png");
    // Untouched fields stay at their empty defaults rather than undefined.
    expect(result.bankAccountNumber).toBe("");
  });
});

describe("updateCashPayoutDestination", () => {
  beforeEach(() => {
    settingFindOne.mockReturnValue(chain(null));
    settingFindOneAndUpdate.mockReturnValue({
      lean: () =>
        Promise.resolve(
          settingFindOneAndUpdate.mock.calls.length
            ? { cashDepositPayout: settingFindOneAndUpdate.mock.calls.at(-1)[1].$set.cashDepositPayout }
            : null,
        ),
    });
  });

  it("saves a UPI ID", async () => {
    const result = await updateCashPayoutDestination({ upiId: "admin@okhdfc" });

    expect(result.upiId).toBe("admin@okhdfc");
    const [, update, options] = settingFindOneAndUpdate.mock.calls[0];
    expect(options.upsert).toBe(true);
    expect(update.$set.cashDepositPayout.upiId).toBe("admin@okhdfc");
  });

  it("rejects an invalid UPI ID", async () => {
    await expect(updateCashPayoutDestination({ upiId: "not-a-upi-id" })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(settingFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects a bank account number with no IFSC or holder name", async () => {
    await expect(
      updateCashPayoutDestination({ bankAccountNumber: "123456789012" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a malformed IFSC", async () => {
    await expect(
      updateCashPayoutDestination({
        bankAccountNumber: "123456789012",
        bankAccountHolder: "Admin",
        bankIfsc: "not-an-ifsc",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepts a complete bank account", async () => {
    const result = await updateCashPayoutDestination({
      bankAccountNumber: "123456789012",
      bankAccountHolder: "Platform Admin",
      bankIfsc: "hdfc0001234",
      bankName: "HDFC Bank",
    });

    expect(result.bankAccountNumber).toBe("123456789012");
    // Normalized to uppercase regardless of how the admin typed it.
    expect(result.bankIfsc).toBe("HDFC0001234");
  });

  it("accepts a QR image with nothing else", async () => {
    const result = await updateCashPayoutDestination({ qrImageUrl: "https://cdn/qr.png" });
    expect(result.qrImageUrl).toBe("https://cdn/qr.png");
  });

  it("refuses to clear everything down to nothing", async () => {
    await expect(
      updateCashPayoutDestination({ upiId: "", qrImageUrl: "", bankAccountNumber: "" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("merges onto the existing saved value rather than replacing it", async () => {
    // A valid existing triple — bankAccountNumber never exists without its
    // holder and IFSC, since save() enforces that invariant.
    settingFindOne.mockReturnValue(
      chain({
        cashDepositPayout: {
          upiId: "old@bank",
          bankAccountNumber: "111111111111",
          bankAccountHolder: "Platform Admin",
          bankIfsc: "HDFC0001234",
        },
      }),
    );

    await updateCashPayoutDestination({ upiId: "new@bank" });

    const [, update] = settingFindOneAndUpdate.mock.calls[0];
    // The bank account nobody touched this call must survive the update.
    expect(update.$set.cashDepositPayout.bankAccountNumber).toBe("111111111111");
    expect(update.$set.cashDepositPayout.bankIfsc).toBe("HDFC0001234");
    expect(update.$set.cashDepositPayout.upiId).toBe("new@bank");
  });
});
