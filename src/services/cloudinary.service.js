const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadBase64ToCloudinary(base64Str, publicId) {
  if (!base64Str) return null;

  // Cloudinary chấp nhận data URI hoặc raw base64
  const dataUri = base64Str.startsWith("data:")
    ? base64Str
    : `data:image/jpeg;base64,${base64Str}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    public_id: publicId,        // VD: "hoc_vien/K26B001_HV001"
    folder: "hoc_vien",
    overwrite: true,
    resource_type: "image",
  });

  return result.secure_url;    // trả về URL https://...
}

module.exports = {
  cloudinary,
  uploadBase64ToCloudinary
};
