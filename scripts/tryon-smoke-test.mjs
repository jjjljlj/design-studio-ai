const baseUrl = process.env.TEST_BASE_URL || "http://localhost:5173";
const adminPin = process.env.ADMIN_PIN || process.env.TEST_ADMIN_PIN || "";

if (!adminPin) {
  console.error("Missing ADMIN_PIN or TEST_ADMIN_PIN.");
  process.exit(1);
}

const payload = {
  modelImageUrl: process.env.TEST_MODEL_IMAGE_URL || "https://example.com/model.jpg",
  garmentImageUrl: process.env.TEST_GARMENT_IMAGE_URL || "https://example.com/garment.jpg",
  bottomGarmentUrl: process.env.TEST_BOTTOM_GARMENT_IMAGE_URL || "",
  category: process.env.TEST_TRYON_CATEGORY || "pajama/loungewear",
  notes: "Satin camisole shorts set, keep lace trim, straps, shorts length, satin sheen, and color family."
};

const response = await fetch(`${baseUrl}/api/tryon`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Admin-Pin": adminPin
  },
  body: JSON.stringify(payload)
});

const data = await response.json().catch(() => ({}));

console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  provider: data.provider,
  mode: data.mode,
  hasImage: Boolean(data.image || data.imageUrl),
  hasChecklist: Array.isArray(data.qualityChecklist) && data.qualityChecklist.length > 0,
  note: data.note || "",
  error: data.error || ""
}, null, 2));

if (!response.ok) process.exit(1);
