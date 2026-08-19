import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Website Terms" };

export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link className="legal-back" href="/">← Back to TruShot Media</Link>
      <h1>Website terms</h1>
      <p>Last updated 19 August 2026. This website provides general information about TruShot Media’s services. Submitting an enquiry does not create a binding production agreement.</p>
      <h2>Pricing</h2>
      <p>Displayed prices are in Australian dollars and describe standard package starting points. Scope, timing, locations, travel, advertising spend and specialist production requirements may affect a final quote. GST treatment will be stated on the final proposal or invoice.</p>
      <h2>Intellectual property</h2>
      <p>Website copy, branding, imagery and design are owned by or licensed to TruShot Media and must not be reproduced without permission.</p>
      <h2>Availability and accuracy</h2>
      <p>We aim to keep information accurate and the website available, but do not guarantee uninterrupted access. A signed proposal or service agreement takes precedence over this website.</p>
    </main>
  );
}
