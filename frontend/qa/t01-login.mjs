import * as H from "./helpers.mjs";

const browser = await H.launch();
console.log("\n=== T01: sign-in, all three roles ===");

// Admin
try {
  const { ctx, page } = await H.newCtx(browser, "admin");
  const url = await H.loginAdmin(page);
  const tok = await H.tokenOf(page);
  H.pass("ADMIN login", `${url}  token=${tok ? tok.key : "none"}`);
  await H.shot(page, "t01-admin");
  await ctx.close();
} catch (e) { H.fail("ADMIN login", e.message.split("\n")[0]); }

// Customer
try {
  const { ctx, page } = await H.newCtx(browser, "user");
  const url = await H.loginCustomer(page, H.USER_01);
  const tok = await H.tokenOf(page);
  H.pass("USER_01 login", `${url}  token=${tok ? tok.key : "none"}`);
  await H.shot(page, "t01-user");
  await ctx.close();
} catch (e) { H.fail("USER_01 login", e.message.split("\n")[0]); }

// Driver
try {
  const { ctx, page } = await H.newCtx(browser, "driver");
  const url = await H.loginDriver(page, H.DRIVER_01);
  const tok = await H.tokenOf(page);
  H.pass("DRIVER_01 login", `${url}  token=${tok ? tok.key : "none"}`);
  await H.shot(page, "t01-driver");
  await ctx.close();
} catch (e) { H.fail("DRIVER_01 login", e.message.split("\n")[0]); }

await browser.close();
