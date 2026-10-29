import type { TeamRole } from "./production-team";

export const PROFILE_PHOTO_BUCKET = "website-team-avatars";
export const PROFILE_PHOTO_MAX_BYTES = 512 * 1024;
export type MyAccount = {
  userId: string; displayName: string; email: string; username: string | null;
  role: TeamRole | "admin"; createdAt: string; avatarUrl: string | null;
  mfaEnabled: boolean; verifiedSession: boolean;
};

export function profilePhotoUrl(userId: string, revision: string) {
  return `/api/autopacific/profile-photo/${encodeURIComponent(userId)}?v=${encodeURIComponent(revision)}`;
}

export function ownsProfilePhoto(path: string, workspace: string, userId: string) {
  const parts = path.split("/");
  return parts.length === 3 && parts[0] === workspace && parts[1] === userId
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(parts[2]);
}

export async function validateProfilePhoto(file: File) {
  if (file.type !== "image/webp" || !file.size || file.size > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error("Choose a photo and let it finish preparing before saving.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = String.fromCharCode(...bytes.slice(0, 12));
  if (bytes.length < 12 || header.slice(0, 4) !== "RIFF" || header.slice(8, 12) !== "WEBP") {
    throw new Error("This image could not be read. Try a JPG, PNG or WebP photo.");
  }
  return bytes;
}
