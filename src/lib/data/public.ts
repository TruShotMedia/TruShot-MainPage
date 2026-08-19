import { createPublicClient } from "@/lib/supabase/public";
import type { PricingPackage, PricingItem } from "@/lib/types";

const fallbackPackages: PricingPackage[] = [
  {
    id: "social-reel",
    slug: "social-reel",
    title: "Social Reel",
    eyebrow: "One sharp idea",
    summary: "A polished vertical reel built to stop the scroll.",
    price_cents: 35000,
    billing_interval: "one_off",
    price_suffix: "one-off",
    badge: null,
    cta_label: "Enquire now",
    is_featured: false,
    position: 10,
    items: ["1 vertical social video", "Planning, filming and edit", "One revision round"].map(
      (label, index) => ({
        id: `social-${index}`,
        kind: "inclusion" as const,
        label,
        detail: null,
        position: index,
      }),
    ),
  },
  {
    id: "essentials",
    slug: "essentials",
    title: "Essentials",
    eyebrow: "Stay consistently visible",
    summary: "A dependable monthly content rhythm for growing brands.",
    price_cents: 100000,
    billing_interval: "monthly",
    price_suffix: "/month",
    badge: null,
    cta_label: "Enquire now",
    is_featured: false,
    position: 20,
    items: ["Monthly planning session", "4 short-form videos", "8 edited photos"].map(
      (label, index) => ({ id: `essentials-${index}`, kind: "inclusion" as const, label, detail: null, position: index }),
    ),
  },
  {
    id: "growth",
    slug: "growth",
    title: "Growth",
    eyebrow: "Build real momentum",
    summary: "More creative range, more frequent publishing, more opportunities to convert.",
    price_cents: 175000,
    billing_interval: "monthly",
    price_suffix: "/month",
    badge: "Most popular",
    cta_label: "Enquire now",
    is_featured: true,
    position: 30,
    items: ["Monthly content strategy", "8 short-form videos", "20 edited photos", "Priority turnaround"].map(
      (label, index) => ({ id: `growth-${index}`, kind: "inclusion" as const, label, detail: null, position: index }),
    ),
  },
  {
    id: "partner",
    slug: "partner",
    title: "Partner",
    eyebrow: "Your embedded media team",
    summary: "High-output content support with strategic attention built in.",
    price_cents: 250000,
    billing_interval: "monthly",
    price_suffix: "/month",
    badge: null,
    cta_label: "Enquire now",
    is_featured: false,
    position: 40,
    items: ["Fortnightly production support", "12 short-form videos", "40 edited photos", "Creative direction and reporting"].map(
      (label, index) => ({ id: `partner-${index}`, kind: "inclusion" as const, label, detail: null, position: index }),
    ),
  },
  {
    id: "content-growth",
    slug: "content-growth",
    title: "Content + Growth",
    eyebrow: "Create and amplify",
    summary: "Production and campaign support working together for sustained growth.",
    price_cents: 350000,
    billing_interval: "monthly",
    price_suffix: "/month + ad spend",
    badge: null,
    cta_label: "Enquire now",
    is_featured: false,
    position: 50,
    items: ["Full Partner production package", "Campaign planning and optimisation", "Monthly performance reporting", "Advertising spend billed separately"].map(
      (label, index) => ({ id: `content-${index}`, kind: index === 3 ? "exclusion" as const : "inclusion" as const, label, detail: null, position: index }),
    ),
  },
];

export async function getPublishedPricing(): Promise<PricingPackage[]> {
  try {
    const supabase = createPublicClient();
    const { data: versions, error: versionError } = await supabase
      .from("website-pricing-versions")
      .select("id")
      .eq("status", "published")
      .limit(1);

    if (versionError || !versions?.[0]) return fallbackPackages;

    const { data: packages, error: packageError } = await supabase
      .from("website-pricing-packages")
      .select("id,slug,title,eyebrow,summary,price_cents,billing_interval,price_suffix,badge,cta_label,is_featured,position")
      .eq("version_id", versions[0].id)
      .eq("is_active", true)
      .order("position");

    if (packageError || !packages?.length) return fallbackPackages;

    const packageIds = packages.map((item) => item.id);
    const { data: items } = await supabase
      .from("website-pricing-package-items")
      .select("id,package_id,kind,label,detail,position")
      .in("package_id", packageIds)
      .order("position");

    return packages.map((item) => ({
      ...item,
      price_cents: Number(item.price_cents),
      items: ((items ?? []).filter((entry) => entry.package_id === item.id) as (PricingItem & { package_id: string })[]),
    })) as PricingPackage[];
  } catch {
    return fallbackPackages;
  }
}
