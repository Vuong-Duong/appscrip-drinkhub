import { useState, useRef } from "react";
import UploadService from "../services/UploadService";
import { getDirectImageUrl } from "../utils/helpers";

/**
 * ImageInputField - Product image input with upload or URL
 * Supports both file upload (compressed) and URL input
 */
export default function ImageInputField({
  value = "",
  onChange,
  label = "Hình ảnh sản phẩm",
}) {
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState("url"); // "url" or "upload"
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(value);

  const handleUrlChange = (e) => {
    const url = e.target.value;
    setPreviewUrl(url);
    onChange?.(url);
    setError("");
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    const validation = UploadService.validateImage(file);
    if (!validation.valid) {
      setError(validation.error);
      setPreviewUrl("");
      onChange?.("");
      return;
    }

    setUploading(true);
    setError("");

    try {
      // Show preview while uploading
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreviewUrl(event.target.result);
      };
      reader.readAsDataURL(file);

      // Upload to Google Drive
      const result = await UploadService.uploadImage(file, {
        maxWidth: 1200,
        quality: 0.7,
      });

      if (result.success) {
        setPreviewUrl(result.url);
        onChange?.(result.url);
        setMode("url");
      } else {
        setError(result.error || "Upload failed");
        setPreviewUrl("");
        onChange?.("");
      }
    } catch (err) {
      setError(err.message || "Upload error");
      setPreviewUrl("");
      onChange?.("");
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-gray-600">{label}</span>

      {/* Mode toggle */}
      <div className="flex gap-2 bg-gray-50 p-2 rounded-lg">
        <button
          type="button"
          onClick={() => {
            setMode("url");
            setError("");
          }}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${
            mode === "url"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          URL
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("upload");
            setError("");
          }}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${
            mode === "upload"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Tải lên
        </button>
      </div>

      {/* URL input */}
      {mode === "url" && (
        <input
          type="text"
          className="w-full border rounded-lg px-4 py-3 text-sm"
          placeholder="Nhập URL hình ảnh"
          value={value}
          onChange={handleUrlChange}
        />
      )}

      {/* Upload input */}
      {mode === "upload" && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`w-full border-2 border-dashed rounded-lg px-4 py-3 text-center text-sm font-medium transition ${
              uploading
                ? "border-gray-300 text-gray-400 cursor-not-allowed"
                : "border-blue-300 text-blue-600 hover:border-blue-600 hover:bg-blue-50 cursor-pointer"
            }`}
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                Đang tải...
              </span>
            ) : (
              "Chọn ảnh từ máy tính"
            )}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            JPG, PNG, GIF, WebP • Max 5MB
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-2 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
          {error}
        </div>
      )}

      {/* Preview */}
      {previewUrl && (
        <div className="mt-3 border rounded-lg overflow-hidden bg-gray-100">
          <img
            src={getDirectImageUrl(previewUrl)}
            alt="Preview"
            className="w-full h-48 object-cover"
            onError={() => {
              setPreviewUrl("");
            }}
          />
        </div>
      )}
    </label>
  );
}
