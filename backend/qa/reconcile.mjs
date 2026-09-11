import { withDb } from "./db.mjs";
const m2 = n => Math.round((Number(n)||0)*100)/100;
await withDb(async db => {
  const cp = await db.collection("cityparcels").find({}).toArray();
  const p  = await db.collection("parcels").find({}).toArray();
  const rows = [];
  const push = (b, type) => rows.push({
    ref: b.referenceId || `PCL-${String(b._id).slice(-6)}`,
    type, pay: b.paymentMethod, status: b.status,
    fare: m2(b.fare), disc: m2(b.discountAmount||0), payable: m2(b.payableFare||b.fare),
    taxable: m2(b.fareBreakdown?.taxableAmount||0), gst: m2(b.fareBreakdown?.gstAmount||0),
    rider: m2(b.riderEarning||0),
  });
  cp.forEach(b=>push(b,"LOCAL")); p.forEach(b=>push(b,"OUTSTN"));

  console.log("REF               TYPE   PAY  STATUS      FARE   DISC PAYABLE TAXABLE   GST  RIDER  CHECK");
  let T={fare:0,disc:0,pay:0,tax:0,gst:0,rider:0}; let bad=0;
  for(const r of rows){
    const active = r.status!=="CANCELLED";
    // invariant: taxable + gst == payable  (when a tax record exists)
    const rec = r.gst>0 ? m2(r.taxable+r.gst) : r.taxable;
    const ok = !active || Math.abs(rec - r.payable) < 0.02;
    if(!ok) bad++;
    if(active){ T.fare+=r.fare; T.disc+=r.disc; T.pay+=r.payable; T.tax+=r.taxable; T.gst+=r.gst; T.rider+=r.rider; }
    console.log(`${r.ref.padEnd(17)} ${r.type.padEnd(6)} ${String(r.pay).padEnd(4)} ${r.status.padEnd(11)} ${String(r.fare).padStart(6)} ${String(r.disc).padStart(6)} ${String(r.payable).padStart(7)} ${String(r.taxable).padStart(7)} ${String(r.gst).padStart(5)} ${String(r.rider).padStart(6)}  ${active?(ok?"OK":"MISMATCH"):"n/a"}`);
  }
  console.log("-".repeat(96));
  console.log(`TOTALS (non-cancelled)  fare ${m2(T.fare)} | discount ${m2(T.disc)} | payable ${m2(T.pay)} | taxable ${m2(T.tax)} | GST ${m2(T.gst)} | rider ${m2(T.rider)}`);
  console.log(`INVARIANT fare - discount == payable : ${m2(T.fare-T.disc)} vs ${m2(T.pay)}  ${Math.abs(m2(T.fare-T.disc)-m2(T.pay))<0.02?"OK":"MISMATCH"}`);
  console.log(`INVARIANT taxable + GST == payable   : ${m2(T.tax+T.gst)} vs ${m2(T.pay)}  ${Math.abs(m2(T.tax+T.gst)-m2(T.pay))<0.02?"OK":"MISMATCH"}`);
  console.log(`Per-booking taxable+GST mismatches   : ${bad}`);

  const tx = await db.collection("transactions").find({}).toArray();
  console.log("\nTRANSACTIONS");
  tx.forEach(t=>console.log(`  ${String(t.type).padEnd(18)} ${String(m2(t.amount)).padStart(9)}  ${t.status}`));
  const dep = await db.collection("cashdeposits").find({}).toArray();
  dep.forEach(d=>console.log(`  DEPOSIT            ${String(m2(d.amount)).padStart(9)}  ${d.status}`));
});
