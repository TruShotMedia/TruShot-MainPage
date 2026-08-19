import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy", description: "How TruShot Media handles website and enquiry data." };

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="legal-back" href="/">← Back to TruShot Media</Link>
      <h1>Privacy policy</h1>
      <p>Last updated 19 August 2026. TruShot Media respects your privacy and handles personal information in line with applicable Australian privacy requirements.</p>
      <h2>What we collect</h2>
      <p>When you enquire, we collect the contact and project details you choose to provide. We also collect data-minimised website events such as pages viewed, selected calls to action, device class, referring domain and active time. We do not intentionally store form-field contents in analytics, full IP addresses, or raw user-agent strings.</p>
      <h2>How we use it</h2>
      <p>We use enquiry information to respond, prepare work and manage the resulting client relationship. Aggregate website analytics help us understand which information is useful and improve the experience.</p>
      <h2>Storage and disclosure</h2>
      <p>Information is stored using Supabase and application hosting providers. Access is limited to authorised TruShot administrators. We do not sell personal information.</p>
      <h2>Access, correction or deletion</h2>
      <p>Contact <a href="mailto:info@fearlessau.com">info@fearlessau.com</a> to request access, correction or deletion of personal information we hold about you.</p>
    </main>
  );
}
