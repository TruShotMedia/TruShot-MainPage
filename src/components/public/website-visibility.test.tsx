// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PricingPackage } from "@/lib/types";
import { EnquiryForm } from "./enquiry-form";
import { PublicHeader } from "./public-header";

const testPackage: PricingPackage = {
  id: "11111111-1111-4111-8111-111111111112",
  slug: "growth",
  title: "Growth",
  eyebrow: "Build momentum",
  summary: "A test package.",
  price_cents: 175000,
  billing_interval: "monthly",
  price_suffix: "/month",
  badge: null,
  cta_label: "Enquire now",
  is_featured: false,
  position: 10,
  items: [],
};

describe("public pricing visibility", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("removes pricing navigation while keeping the partner enquiry CTA", async () => {
    await act(async () => root.render(<PublicHeader showPricing={false} />));

    expect(container.querySelector('a[href="#pricing"]')).toBeNull();
    expect(container.querySelector('a[href="#enquire"]')?.textContent).toContain("Become a partner");
  });

  it("shows pricing navigation when pricing is enabled", async () => {
    await act(async () => root.render(<PublicHeader showPricing />));

    expect(container.querySelector('a[href="#pricing"]')?.textContent).toBe("Pricing");
  });

  it("removes package selection from a general enquiry", async () => {
    await act(async () => root.render(<EnquiryForm packages={[]} showPackages={false} />));

    expect(container.querySelector('select[name="packageId"]')).toBeNull();
    expect(container.querySelector('form[data-section="enquiry"]')).not.toBeNull();
  });

  it("offers published packages when pricing is enabled", async () => {
    await act(async () => root.render(<EnquiryForm packages={[testPackage]} showPackages />));

    const packageSelect = container.querySelector<HTMLSelectElement>('select[name="packageId"]');
    expect(packageSelect).not.toBeNull();
    expect(packageSelect?.options[1]?.textContent).toBe("Growth");
  });
});
