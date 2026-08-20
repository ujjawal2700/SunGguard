/**
 * Shrink a camera photo before it is uploaded.
 *
 * A modern phone produces 3-8 MB per shot. Three of those on a signup form is
 * a 10-20 MB upload over mobile data, which is slow enough to time out — and a
 * timeout surfaces as a request with no response, which is exactly the case an
 * app cannot explain to the person waiting.
 *
 * 1600px on the long edge at 80% quality keeps an ID card comfortably legible
 * for a human reviewer while bringing a typical photo under 500 KB.
 */
export async function compressImage(file, { maxEdge = 1600, quality = 0.8 } = {}) {
  if (!file || !file.type?.startsWith("image/")) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image"));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
    // Already small enough — re-encoding would only lose quality for nothing.
    if (scale === 1 && file.size < 500 * 1024) return file;

    const w = Math.max(1, Math.round((img.width || 1) * scale));
    const h = Math.max(1, Math.round((img.height || 1) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;

    // Never hand back something larger than we were given.
    if (blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // Compression is an optimisation, never a gate — upload the original.
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default compressImage;
