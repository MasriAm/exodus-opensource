const numberFormatter = new Intl.NumberFormat(undefined);
const compactNumberFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
/** Calendar-day keys are UTC-encoded local dates — format them in UTC. */
const dayKeyFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export { pluralize } from "@/lib/ui-text";

export function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}

export function formatDate(value: number | string | Date): string {
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: number | string | Date): string {
  return dateTimeFormatter.format(new Date(value));
}

/**
 * Format a heatmap/calendar day key (UTC midnight standing for a local date)
 * without shifting it into the viewer's timezone.
 */
export function formatDayKey(value: number): string {
  return dayKeyFormatter.format(new Date(value));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Some browsers start the download asynchronously; delay revoke.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);
}
