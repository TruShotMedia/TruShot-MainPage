import { redirect } from "next/navigation";
import { getLifestyleContext } from "@/lib/data/lifestyle";

export default async function LifestyleAppLayout({ children }: { children: React.ReactNode }) {
  const context = await getLifestyleContext();
  if (!context) redirect("/lifestyle/login");
  return children;
}

