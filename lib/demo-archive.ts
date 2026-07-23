/**
 * Load the synthetic Instagram demo as a File.
 * Prefer the same-origin public ZIP (fast). Fall back to the embedded
 * base64 module when fetch fails (offline / OneDrive / SW edge cases).
 */

function decodeBase64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  // Chunked fill — faster than a naive per-index loop on large ZIPs.
  const chunk = 0x8000;
  for (let offset = 0; offset < binary.length; offset += chunk) {
    const slice = binary.slice(offset, offset + chunk);
    for (let index = 0; index < slice.length; index += 1) {
      bytes[offset + index] = slice.charCodeAt(index);
    }
  }
  return bytes;
}

async function fileFromPublicDemo(): Promise<File | null> {
  try {
    const response = await fetch("/demo-instagram.zip", {
      cache: "force-cache",
    });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (blob.size < 1_000) {
      return null;
    }
    return new File([blob], "demo-instagram.zip", {
      type: "application/zip",
    });
  } catch {
    return null;
  }
}

async function fileFromEmbeddedDemo(): Promise<File> {
  const generated = await import("@/lib/generated/demo-instagram");
  const bytes = decodeBase64ToBytes(generated.DEMO_INSTAGRAM_ZIP_BASE64);
  // Copy into a plain ArrayBuffer so File/Blob always receives a supported view.
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new File([buffer], generated.DEMO_INSTAGRAM_FILE_NAME, {
    type: "application/zip",
  });
}

export async function loadSyntheticInstagramFile(): Promise<File> {
  const fromPublic = await fileFromPublicDemo();
  if (fromPublic) {
    return fromPublic;
  }
  return fileFromEmbeddedDemo();
}

/** Warm the public demo (and optionally the embed) so the button feels instant. */
export function preloadSyntheticInstagram(): void {
  if (typeof window === "undefined") {
    return;
  }
  void fetch("/demo-instagram.zip", { cache: "force-cache" }).catch(() => {
    void import("@/lib/generated/demo-instagram").catch(() => undefined);
  });
}
