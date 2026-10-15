"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export function IngreignLoginButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? <LoaderCircle className="ingreign-spin" size={17} aria-hidden="true" /> : null}
      <span>{pending ? "Entering…" : "Enter workspace"}</span>
    </button>
  );
}
