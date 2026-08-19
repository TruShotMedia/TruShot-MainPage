import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/data/admin";

export default async function AdminPage() {
  const context = await getAdminContext();
  redirect(context ? "/admin/overview" : "/admin/login");
}
