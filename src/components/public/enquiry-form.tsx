"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, LoaderCircle } from "lucide-react";
import type { PricingPackage } from "@/lib/types";

export function EnquiryForm({ packages }: { packages: PricingPackage[] }) {
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    const onPackage = (event: Event) => {
      const slug = (event as CustomEvent<string>).detail;
      setSelected(packages.find((item) => item.slug === slug)?.id ?? "");
    };
    window.addEventListener("trushot:package", onPackage);
    return () => window.removeEventListener("trushot:package", onPackage);
  }, [packages]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch("/api/enquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setState(response.ok ? "sent" : "error");
    if (response.ok) event.currentTarget.reset();
  }

  if (state === "sent") {
    return (
      <div className="enquiry-success" role="status">
        <CheckCircle2 size={32} />
        <h3>Thanks — your request is in.</h3>
        <p>We’ll review the brief and come back to you shortly with the clearest next step.</p>
        <button className="text-button" onClick={() => setState("idle")}>Send another enquiry</button>
      </div>
    );
  }

  return (
    <form className="enquiry-form" onSubmit={submit} data-section="enquiry">
      <input name="company_website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="form-grid">
        <label>
          <span>Your name</span>
          <input name="name" required minLength={2} maxLength={120} placeholder="John Smith" />
        </label>
        <label>
          <span>Business</span>
          <input name="businessName" maxLength={160} placeholder="Your business" />
        </label>
        <label>
          <span>Email</span>
          <input name="email" type="email" required placeholder="you@business.com.au" />
        </label>
        <label>
          <span>Phone</span>
          <input name="phone" type="tel" placeholder="04xx xxx xxx" />
        </label>
        <label className="form-wide">
          <span>Package</span>
          <select name="packageId" value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">I’m not sure yet</option>
            {packages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label className="form-wide">
          <span>What are you looking to create?</span>
          <textarea name="message" maxLength={5000} rows={5} placeholder="Tell us what success looks like, what you need, and any key timing." />
        </label>
      </div>
      <label className="consent-row">
        <input type="checkbox" name="consent" value="true" required />
        <span>I agree that TruShot Media can use these details to respond to my enquiry.</span>
      </label>
      {state === "error" && <p className="form-error" role="alert">Something went wrong. Please try again or email info@fearlessau.com.</p>}
      <button className="button button-light form-submit" type="submit" disabled={state === "sending"} data-analytics-key="enquiry.submit">
        {state === "sending" ? <LoaderCircle className="spin" size={18} /> : <>Send enquiry <ArrowUpRight size={18} /></>}
      </button>
    </form>
  );
}
