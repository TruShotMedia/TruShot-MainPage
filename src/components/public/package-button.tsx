"use client";

import { ArrowUpRight } from "lucide-react";

export function PackageButton({ slug, label }: { slug: string; label: string }) {
  function selectPackage() {
    window.dispatchEvent(new CustomEvent("trushot:package", { detail: slug }));
    document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <button
      className="package-cta"
      onClick={selectPackage}
      data-analytics-key={`pricing.${slug}.select`}
      data-package-slug={slug}
    >
      {label} <ArrowUpRight size={17} />
    </button>
  );
}
