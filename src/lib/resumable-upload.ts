"use client";

import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

const WEBSITE_MEDIA_BUCKET = "website-media";
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

type UploadProgress = {
  bytesUploaded: number;
  bytesTotal: number;
  percentage: number;
};

type ResumableUploadOptions = {
  file: File;
  storagePath: string;
  cacheControl?: string;
  onProgress?: (progress: UploadProgress) => void;
};

function getResumableEndpoint(supabaseUrl: string) {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  if (!projectRef) throw new Error("The Supabase project URL is invalid.");
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}

export async function uploadWebsiteMediaResumable({
  file,
  storagePath,
  cacheControl = "31536000",
  onProgress,
}: ResumableUploadOptions) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error("Website media storage is not configured.");

  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your session expired. Refresh the page, sign in again and retry the upload.");
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: getResumableEndpoint(supabaseUrl),
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${data.session.access_token}`,
        apikey: publishableKey,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE,
      metadata: {
        bucketName: WEBSITE_MEDIA_BUCKET,
        objectName: storagePath,
        contentType: file.type,
        cacheControl,
      },
      fingerprint: () => Promise.resolve([
        "trushot-website-media",
        storagePath,
        file.name,
        file.type,
        file.size,
        file.lastModified,
      ].join("-")),
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress?.({
          bytesUploaded,
          bytesTotal,
          percentage: bytesTotal === 0 ? 0 : Math.round((bytesUploaded / bytesTotal) * 100),
        });
      },
      onError: (uploadError) => reject(new Error(uploadError.message || "The upload was interrupted.")),
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
        upload.start();
      })
      .catch((uploadError: unknown) => {
        reject(uploadError instanceof Error ? uploadError : new Error("The upload could not be started."));
      });
  });

  const { data: publicUrlData } = supabase.storage.from(WEBSITE_MEDIA_BUCKET).getPublicUrl(storagePath);
  return { publicUrl: publicUrlData.publicUrl, storagePath };
}
