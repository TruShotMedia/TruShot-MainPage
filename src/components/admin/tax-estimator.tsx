import { AlertTriangle, Landmark, PiggyBank, ReceiptText } from "lucide-react";
import { estimateSoleTraderTax } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";

export function TaxEstimator({ revenueCents, expenseCents, gstCollectedCents, gstCreditsCents, isGstRegistered }: { revenueCents: number; expenseCents: number; gstCollectedCents: number; gstCreditsCents: number; isGstRegistered: boolean }) {
  const profit = Math.max(0, revenueCents - expenseCents) / 100;
  const { estimatedTax } = estimateSoleTraderTax(profit);
  const gstPayable = isGstRegistered ? Math.max(0, gstCollectedCents - gstCreditsCents) : 0;
  const suggestedReserve = estimatedTax + gstPayable / 100;

  return (
    <section className="tax-panel">
      <div className="tax-heading"><div><p className="card-label">2026–27 estimate</p><h2>Tax position</h2></div><span>Australia · Sole trader</span></div>
      <div className="tax-grid">
        <div><span><Landmark size={17} /></span><p>Taxable profit</p><strong>{formatCurrency(Math.round(profit * 100))}</strong></div>
        <div><span><ReceiptText size={17} /></span><p>Income tax + levy</p><strong>{formatCurrency(Math.round(estimatedTax * 100))}</strong></div>
        <div><span><PiggyBank size={17} /></span><p>Suggested reserve</p><strong>{formatCurrency(Math.round(suggestedReserve * 100))}</strong></div>
      </div>
      <div className="tax-disclaimer"><AlertTriangle size={16} /><p>Planning estimate only. It uses resident 2026–27 brackets, a simple 2% Medicare levy and the small-business offset cap. It does not model levy thresholds, HELP debt, other income, private-use adjustments or every deduction. Confirm lodgement figures with your accountant.</p></div>
    </section>
  );
}
