import { Captions } from "lucide-react";
import { CaptionLibrary } from "@/components/ingreign/caption-library";
import { getIngreignPresetsData } from "@/lib/data/ingreign";

export default async function IngreignCaptionsPage() {
  const data = await getIngreignPresetsData();
  if (!data) return null;
  return (
    <>
      <header className="ingreign-page-header">
        <div><span><Captions size={15} /> Approved words</span><h1>Copy. Post.<br />Keep moving.</h1></div>
        <p>Your approved caption library is one tap away. Date tokens automatically resolve to the next relevant INGREIGN post.</p>
      </header>
      <CaptionLibrary presets={data.presets} />
    </>
  );
}

