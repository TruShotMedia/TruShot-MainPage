"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function AutopacificLoginButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? <LoaderCircle size={18} className="spin" /> : <ArrowRight size={18} />} {pending ? "Signing in…" : "Open workspace"}</button>;
}
