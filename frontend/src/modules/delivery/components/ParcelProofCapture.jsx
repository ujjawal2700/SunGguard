import React, { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@core/api/axios";

const MAX_DATA_URL_CHARS = 1_800_000; // ~1.3MB binary after base64

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

async function compressImageToDataUrl(file, maxEdge = 1280, quality = 0.72) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Invalid image"));
      el.src = objectUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
    const w = Math.max(1, Math.round((img.width || 1) * scale));
    const h = Math.max(1, Math.round((img.height || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Single photo capture for parcel pickup / hub-drop proofs.
 * Prefers POST /media/upload; falls back to compressed data-URL so proofs still save.
 */
const ParcelProofCapture = ({
  label = "Photo proof",
  hint = "Take a clear photo as proof",
  value = "",
  onChange,
  disabled = false,
}) => {
  const [preview, setPreview] = useState(value || "");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const clear = () => {
    setPreview("");
    onChange?.("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);

    try {
      let url = "";
      try {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await axiosInstance.post("/media/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        url =
          uploadRes.data?.result?.url ||
          uploadRes.data?.result?.secureUrl ||
          uploadRes.data?.data?.url ||
          uploadRes.data?.url ||
          "";
      } catch {
        url = "";
      }

      if (!url || !/^https?:\/\//i.test(url)) {
        // Cloudinary/media may be unavailable — keep proof as compressed data URL.
        const dataUrl = await compressImageToDataUrl(file).catch(() =>
          fileToDataUrl(file),
        );
        if (!dataUrl.startsWith("data:image/")) {
          throw new Error("Could not prepare image proof");
        }
        if (dataUrl.length > MAX_DATA_URL_CHARS) {
          throw new Error("Photo is too large. Try a clearer, smaller photo.");
        }
        url = dataUrl;
      }

      setPreview(url);
      onChange?.(url);
      toast.success("Photo ready");
    } catch (err) {
      clear();
      toast.error(
        err?.response?.data?.message || err.message || "Failed to upload photo",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-black uppercase tracking-wider text-slate-600">
        {label}
      </p>
      <p className="text-[11px] text-slate-500 leading-snug">{hint}</p>

      {preview ? (
        <div className="relative h-28 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <img src={preview} alt="Proof" className="h-full w-full object-cover" />
          {!disabled && !uploading && (
            <button
              type="button"
              onClick={clear}
              className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center"
              aria-label="Remove photo"
            >
              <X size={16} />
            </button>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full h-28 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 flex flex-col items-center justify-center gap-1.5 text-primary disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Camera className="h-6 w-6" />
          )}
          <span className="text-xs font-bold">
            {uploading ? "Uploading..." : "Take / Upload Photo"}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleSelect}
        disabled={disabled || uploading}
      />
    </div>
  );
};

export default ParcelProofCapture;
