import { z } from "zod";

export const briefSectionLabels = {
  output_specs: "Output specifications",
  shot_list: "Shot list",
  creative_direction: "Creative direction",
  approvals: "Approvals & publishing",
} as const;
export type BriefSectionKey = keyof typeof briefSectionLabels;
export type JobBrief = {
  objective?: string;
  audience?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  sections?: Array<{ key: BriefSectionKey; body: string }>;
};
export const jobBriefSchema = z
  .object({
    objective: z.string().trim().max(2000).optional(),
    audience: z.string().trim().max(500).optional(),
    contact_name: z.string().trim().max(200).optional(),
    contact_email: z.union([z.email(), z.literal("")]).optional(),
    contact_phone: z.string().trim().max(100).optional(),
    sections: z
      .array(
        z.object({
          key: z.enum([
            "output_specs",
            "shot_list",
            "creative_direction",
            "approvals",
          ]),
          body: z.string().trim().max(4000),
        }),
      )
      .max(4)
      .refine(
        (items) => new Set(items.map((item) => item.key)).size === items.length,
        "Each brief section can only be added once.",
      )
      .optional(),
  })
  .strict();
export const jobBriefInputSchema = z.preprocess(
  (value) => (typeof value === "string" ? JSON.parse(value) : value),
  jobBriefSchema,
);
export function briefAsMarkdown(brief: JobBrief = {}) {
  return [
    brief.objective ? `**Objective**\n${brief.objective}` : null,
    brief.audience ? `**Audience**\n${brief.audience}` : null,
    [brief.contact_name, brief.contact_email, brief.contact_phone].filter(
      Boolean,
    ).length
      ? `**Production contact**\n${[brief.contact_name, brief.contact_email, brief.contact_phone].filter(Boolean).join(" · ")}`
      : null,
    ...(brief.sections ?? [])
      .filter((section) => section.body.trim())
      .map(
        (section) => `**${briefSectionLabels[section.key]}**\n${section.body}`,
      ),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export const JOB_ATTACHMENT_BUCKET = "website-job-attachments";
export const JOB_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
export const jobAttachmentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
export type JobAttachment = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  url: string;
};
