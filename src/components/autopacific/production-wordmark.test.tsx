import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ProductionWordmark } from "./production-wordmark";
import { PRODUCTION_WORDMARK } from "@/lib/production-branding";

vi.mock("next/image", () => ({ default: ({ preload, ...props }: { preload?: boolean; src: string; alt: string }) => createElement("img", { ...props, "data-preload": String(preload) }) }));

describe("shared MarketingTeamCRM wordmark", () => {
  it("keeps the approved PNG unchanged and reports its true dimensions", () => {
    const png = readFileSync(`public${PRODUCTION_WORDMARK.src}`);
    expect(createHash("sha256").update(png).digest("hex")).toBe("1945f2c977da2022d344aea9fe1b22122d8a4a66759f3019ab1efb108c2e16f8");
    expect(png.readUInt32BE(16)).toBe(PRODUCTION_WORDMARK.width);
    expect(png.readUInt32BE(20)).toBe(PRODUCTION_WORDMARK.height);
  });

  it("frames the artwork with accessible text and responsive image sizing", () => {
    const html = renderToStaticMarkup(<ProductionWordmark className="header-logo" preload sizes="168px" />);
    expect(html).toContain(PRODUCTION_WORDMARK.alt);
    expect(html).toContain(PRODUCTION_WORDMARK.src);
    expect(html).toContain('sizes="168px"');
    expect(html).toContain('data-preload="true"');
    expect(html).toContain("header-logo");
  });
});
