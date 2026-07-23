const MAX_FILENAME_LENGTH = 180;
export const FALLBACK_FILENAME = "unnamed-file";

export function sanitizeDisplayFilename(input: string): string {
  const normalized = input.normalize("NFKC");
  const withoutControls = normalized.replace(
    /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,
    "",
  );
  const basename =
    withoutControls
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? "";
  const safe = basename
    .replace(/[<>:"|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (!safe) return FALLBACK_FILENAME;
  if (safe.length <= MAX_FILENAME_LENGTH) return safe;
  const lastDot = safe.lastIndexOf(".");
  const extension =
    lastDot > 0 && safe.length - lastDot <= 16 ? safe.slice(lastDot) : "";
  const stemLength = MAX_FILENAME_LENGTH - extension.length;
  const stem = safe.slice(0, stemLength).replace(/[\s.]+$/g, "");
  return `${stem || FALLBACK_FILENAME.slice(0, stemLength)}${extension}`;
}
