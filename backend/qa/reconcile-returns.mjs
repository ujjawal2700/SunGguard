import { withDb } from "./db.mjs";
const m2 = n => Math.round((Number(n)||0)*100)/100;
await withDb(async db => {
  const rows = await db.collection("cityparcels").find({
    $or: [{ status: { $in: ["RETURNED","RETURN_IN_TRANSIT","DELIVERY_FAILED"] } }, { "returnLeg.status": { $ne: "NONE" } }]
  }).toArray();
  const tx = await db.collection("transactions").find({}).toArray();

  console.log("REF              STATUS           RETURNLEG           FARE  TAXABLE   GST PAYABLE   COD  RTNchg DELIVern RTNern");
  for (const b of rows) {
    const fb = b.fareBreakdown||{};
    console.log(
      `${(b.referenceId||"").padEnd(16)} ${String(b.status).padEnd(16)} ${String(b.returnLeg?.status).padEnd(19)} ` +
      `${String(m2(b.fare)).padStart(6)} ${String(m2(fb.taxableAmount)).padStart(7)} ${String(m2(fb.gstAmount)).padStart(5)} ` +
      `${String(m2(b.payableFare)).padStart(7)} ${String(m2(b.codCollection?.amount)).padStart(6)} ${String(m2(fb.returnCharge)).padStart(6)} ` +
      `${String(m2(b.riderEarning)).padStart(7)} ${String(m2(b.riderReturnEarning)).padStart(6)}`);
  }
  console.log("\nPER-PARCEL LEDGER");
  for (const b of rows) {
    const id = String(b._id);
    const mine = tx.filter(t => String(t.reference||"").includes(id));
    console.log(`  ${b.referenceId}:`);
    mine.forEach(t=>console.log(`     ${String(t.type).padEnd(18)} ${String(m2(t.amount)).padStart(8)}  ${t.status}  ${t.reference}`));
    const ern = mine.filter(t=>/CTY-ERN-/.test(t.reference)).length;
    const rtn = mine.filter(t=>/CTY-RTN-/.test(t.reference)).length;
    console.log(`     -> delivery-earning rows: ${ern}   return-earning rows: ${rtn}  ${ern<=1&&rtn<=1?"(no duplicates)":"*** DUPLICATE ***"}`);
  }
  const dupes = {};
  tx.forEach(t=>{ dupes[t.reference]=(dupes[t.reference]||0)+1; });
  const dup = Object.entries(dupes).filter(([,c])=>c>1);
  console.log(`\nGLOBAL duplicate-reference check: ${dup.length? JSON.stringify(dup) : "none — every ledger reference is unique"}`);
  const neg = tx.filter(t=>t.type==="Delivery Earning" && Number(t.amount)<0);
  console.log(`Negative earning rows: ${neg.length}`);
});
