"use server";

import { revalidatePath } from "next/cache";
import { getMyAccount, updateMyPhoto } from "@/lib/data/production-profile";

export async function loadMyAccount() { return getMyAccount(); }

export async function saveMyProfilePhoto(form: FormData) {
  const photo = form.get("photo");
  if (!(photo instanceof File)) throw new Error("Choose a photo first.");
  const result = await updateMyPhoto(photo);
  revalidatePath("/autopacific"); revalidatePath("/autopacific/mobile"); revalidatePath("/marketing");
  return result;
}

export async function removeMyProfilePhoto() {
  const result = await updateMyPhoto(null);
  revalidatePath("/autopacific"); revalidatePath("/autopacific/mobile"); revalidatePath("/marketing");
  return result;
}
