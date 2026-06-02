/**
 * UploadService - Image upload handling
 * Handles compression, base64 conversion, and uploading to Google Drive
 * Separate from CrudService - does not affect cache/state
 */

import { uploadApi } from "../api/Api.js";

class UploadService {
  /**
   * Compress image using canvas
   * @param {File} file - Image file
   * @param {Object} options - {maxWidth, quality}
   * @returns {Promise<Blob>} Compressed blob
   */
  static async compressImage(file, options = {}) {
    const { maxWidth = 1200, quality = 0.7 } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();

        img.onload = () => {
          try {
            // Calculate new dimensions
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }

            // Create canvas and draw resized image
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to blob with quality setting
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error("Canvas conversion failed"));
                }
              },
              "image/jpeg",
              quality,
            );
          } catch (err) {
            reject(err);
          }
        };

        img.onerror = () => reject(new Error("Image load failed"));
        img.src = e.target.result;
      };

      reader.onerror = () => reject(new Error("File read failed"));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Convert blob to base64
   * @param {Blob} blob
   * @returns {Promise<string>} Base64 string (without data:image/...;base64, prefix)
   */
  static async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          // Remove "data:image/...;base64," prefix
          const result = reader.result;
          const base64 = result.split(",")[1] || result;
          resolve(base64);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error("Base64 conversion failed"));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Upload image to Google Drive
   * @param {File} file - Image file from input
   * @param {Object} options - {maxWidth, quality}
   * @returns {Promise<Object>} {success, url, fileId, error}
   */
  static async uploadImage(file, options = {}) {
    try {
      if (!file) {
        throw new Error("File is required");
      }

      // Validate file type
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!validTypes.includes(file.type)) {
        throw new Error("Invalid file type. Supported: JPG, PNG, GIF, WebP");
      }

      // Validate file size (max 5MB before compression)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        throw new Error("File too large. Max 5MB.");
      }

      console.log(`[UploadService] Starting upload: ${file.name}`);

      // Compress image
      const compressedBlob = await this.compressImage(file, options);
      console.log(
        `[UploadService] Compressed: ${file.size} → ${compressedBlob.size} bytes`,
      );

      // Convert to base64
      const base64 = await this.blobToBase64(compressedBlob);

      // Check compressed payload size to avoid GAS execution/payload limit (safe limit: ~4MB raw)
      const maxBase64Length = 4 * 1024 * 1024 * 1.33; // ~5.3MB base64 string
      if (base64.length > maxBase64Length) {
        throw new Error("Dung lượng ảnh sau khi nén vẫn vượt quá giới hạn tải lên (4MB). Vui lòng sử dụng ảnh có độ phân giải hoặc dung lượng nhỏ hơn.");
      }

      // Call backend upload
      const result = await uploadApi.uploadImageToGrive(base64, file.name);

      console.log("[UploadService] Upload success:", result);

      return {
        success: true,
        url: result.url,
        fileId: result.fileId,
      };
    } catch (error) {
      console.error("[UploadService] Upload failed:", error.message || error);
      return {
        success: false,
        error: error.details ? `${error.message}: ${error.details}` : (error.message || String(error)),
      };
    }
  }

  /**
   * Validate image file
   * @param {File} file
   * @returns {Object} {valid, error}
   */
  static validateImage(file) {
    if (!file) {
      return { valid: false, error: "File is required" };
    }

    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return {
        valid: false,
        error: "Invalid file type. Supported: JPG, PNG, GIF, WebP",
      };
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: "File too large. Max 5MB.",
      };
    }

    return { valid: true };
  }
}

export default UploadService;
