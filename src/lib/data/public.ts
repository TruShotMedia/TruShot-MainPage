import { createPublicClient } from "@/lib/supabase/public";
import type { PricingPackage, PricingItem, WebsiteElement } from "@/lib/types";

export const fallbackWebsiteElements: WebsiteElement[] = [
  {
    id: "service-content",
    element_key: "service-content",
    element_type: "service",
    eyebrow: "Always-on attention",
    title: "Content systems",
    body: "Strategic short-form video and photography built into a consistent engine for attention, trust and demand.",
    media_kind: "none",
    media_url: null,
    media_path: null,
    media_alt: "TruShot Media content production in action",
    position: 10,
    is_published: true,
  },
  {
    id: "service-brand",
    element_key: "service-brand",
    element_type: "service",
    eyebrow: "Be known for something",
    title: "Brand growth",
    body: "Positioning and stories that make the right audience understand your value, remember your name and choose you.",
    media_kind: "none",
    media_url: null,
    media_path: null,
    media_alt: "A TruShot Media brand story production",
    position: 20,
    is_published: true,
  },
  {
    id: "service-campaigns",
    element_key: "service-campaigns",
    element_type: "service",
    eyebrow: "Turn attention into action",
    title: "Campaign momentum",
    body: "Connected creative, distribution and iteration designed around a business goal—not a pile of disconnected assets.",
    media_kind: "none",
    media_url: null,
    media_path: null,
    media_alt: "A TruShot Media campaign being produced",
    position: 30,
    is_published: true,
  },
  {
    id: "about-growth-partner",
    element_key: "about-growth-partner",
    element_type: "about",
    eyebrow: "Your creative growth partner",
    title: "Creative that moves the business.",
    body: "TruShot Media partners with ambitious businesses to build attention, trust and demand. We connect strategy, production and ongoing optimisation in one direct collaboration—from the first idea to measurable momentum.",
    media_kind: "none",
    media_url: null,
    media_path: null,
    media_alt: "The TruShot Media team working with a client",
    position: 40,
    is_published: true,
  },
];

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

export async function getPublishedWebsiteElements(): Promise<WebsiteElement[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("website-site-elements")
      .select("id,element_key,element_type,eyebrow,title,body,media_kind,media_url,media_path,media_alt,position,is_published")
      .eq("is_published", true)
      .order("position");

    if (error || !data?.length) return fallbackWebsiteElements;
    return data as WebsiteElement[];
  } catch {
    return fallbackWebsiteElements;
  }
}
