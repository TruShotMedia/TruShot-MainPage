import type { NotionPage, NotionProperty, NotionRichText } from "@/lib/notion/types";

function normalizedPropertyName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function richTextValue(items: NotionRichText[] | undefined) {
  return (items ?? []).map((item) => item.plain_text ?? "").join("").trim();
}

export function findNotionProperty(page: NotionPage, aliases: string[]) {
  const wanted = new Set(aliases.map(normalizedPropertyName));
  return Object.entries(page.properties).find(([name]) => wanted.has(normalizedPropertyName(name)))?.[1] ?? null;
}

export function notionTitle(page: NotionPage, aliases: string[] = []) {
  const property = findNotionProperty(page, aliases) ?? Object.values(page.properties).find((item) => item.type === "title") ?? null;
  return property ? richTextValue(property.title) : "";
}

export function notionText(page: NotionPage, aliases: string[]) {
  const property = findNotionProperty(page, aliases);
  if (!property) return "";
  if (property.type === "rich_text") return richTextValue(property.rich_text);
  if (property.type === "title") return richTextValue(property.title);
  if (property.type === "url") return property.url?.trim() ?? "";
  if (property.type === "email") return property.email?.trim() ?? "";
  if (property.type === "phone_number") return property.phone_number?.trim() ?? "";
  if (property.type === "select") return property.select?.name?.trim() ?? "";
  if (property.type === "status") return property.status?.name?.trim() ?? "";
  if (property.type === "multi_select") return (property.multi_select ?? []).map((item) => item.name).filter(Boolean).join(", ");
  if (property.type === "formula" && property.formula?.type === "string") return property.formula.string?.trim() ?? "";
  return "";
}

export function notionSelect(page: NotionPage, aliases: string[]) {
  const property = findNotionProperty(page, aliases);
  if (!property) return "";
  if (property.type === "status") return property.status?.name?.trim() ?? "";
  if (property.type === "select") return property.select?.name?.trim() ?? "";
  return notionText(page, aliases);
}

export function notionMultiSelect(page: NotionPage, aliases: string[]) {
  const property = findNotionProperty(page, aliases);
  if (!property) return [];
  if (property.type === "multi_select") return (property.multi_select ?? []).flatMap((item) => item.name ? [item.name] : []);
  const value = notionText(page, aliases);
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

export function notionNumber(page: NotionPage, aliases: string[]) {
  const property = findNotionProperty(page, aliases);
  if (!property) return null;
  if (property.type === "number") return property.number ?? null;
  if (property.type === "formula" && property.formula?.type === "number") return property.formula.number ?? null;
  if (property.type === "rollup" && property.rollup?.type === "number") return property.rollup.number ?? null;
  return null;
}

export function notionBoolean(page: NotionPage, aliases: string[]) {
  const property = findNotionProperty(page, aliases);
  if (!property) return false;
  if (property.type === "checkbox") return Boolean(property.checkbox);
  if (property.type === "formula" && property.formula?.type === "boolean") return Boolean(property.formula.boolean);
  return /^(yes|true|active)$/i.test(notionText(page, aliases));
}

export function notionDate(page: NotionPage, aliases: string[]) {
  const property = findNotionProperty(page, aliases);
  const value = property?.type === "date"
    ? property.date?.start
    : property?.type === "formula" && property.formula?.type === "date"
      ? property.formula.date?.start
      : property?.type === "rollup" && property.rollup?.type === "date"
        ? property.rollup.date?.start
        : null;
  return value ? value.slice(0, 10) : null;
}

export function notionRelations(page: NotionPage, aliases: string[]) {
  const property = findNotionProperty(page, aliases);
  return property?.type === "relation" ? (property.relation ?? []).map((item) => item.id) : [];
}

export function notionLinks(page: NotionPage, aliases: string[]) {
  const property = findNotionProperty(page, aliases);
  if (!property) return [];
  if (property.type === "url") return property.url ? [property.url] : [];
  if (property.type === "files") return (property.files ?? []).flatMap((item) => {
    const url = item.type === "external" ? item.external?.url : item.file?.url;
    return url ? [url] : [];
  });
  if (property.type === "rich_text") return (property.rich_text ?? []).flatMap((item) => {
    if (item.href) return [item.href];
    const text = item.plain_text?.trim();
    return text && /^https?:\/\//i.test(text) ? [text] : [];
  });
  return [];
}

export function notionPropertyType(property: NotionProperty | null) {
  return property?.type ?? null;
}
