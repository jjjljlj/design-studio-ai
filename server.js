import http from "node:http";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const dataDir = join(__dirname, "data");
const feedbackFile = join(dataDir, "feedback.jsonl");
const projectsDir = join(dataDir, "projects");
const libraryDir = join(dataDir, "library");
const conceptLibraryFile = join(libraryDir, "concepts.jsonl");
const imageCooldownMap = new Map();
const imageCooldownMs = Math.max(Number(process.env.IMAGE_GENERATION_COOLDOWN_SECONDS || 45), 10) * 1000;

async function loadLocalEnv() {
  try {
    const envText = await readFile(join(__dirname, ".env"), "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // A local .env file is optional; demo mode works without it.
  }
}

await loadLocalEnv();

const port = Number(process.env.PORT || 5173);
const supabaseTable = process.env.SUPABASE_TABLE || "design_records";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8"
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    ...securityHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    ...securityHeaders
  });
  res.end(text);
}

function getStorageStatus() {
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    provider: supabaseConfigured ? "supabase" : "local-file",
    persistent: supabaseConfigured,
    table: supabaseConfigured ? supabaseTable : null
  };
}

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key, table: supabaseTable };
}

async function supabaseRequest(query = "", options = {}) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase storage is not configured.");
  const response = await fetch(`${config.url}/rest/v1/${config.table}${query}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Persistent storage error (${response.status}): ${text.slice(0, 240)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function persistentStorageEnabled() {
  return Boolean(getSupabaseConfig());
}

function storageRecord(recordType, recordId, payload) {
  const now = new Date().toISOString();
  return {
    record_type: recordType,
    record_id: recordId,
    created_at: payload.createdAt || now,
    updated_at: payload.updatedAt || payload.createdAt || now,
    payload
  };
}

async function insertPersistentRecords(records) {
  if (!persistentStorageEnabled() || !records.length) return false;
  await supabaseRequest("", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(records)
  });
  return true;
}

async function upsertPersistentRecord(record) {
  if (!persistentStorageEnabled()) return false;
  await supabaseRequest("?on_conflict=record_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(record)
  });
  return true;
}

async function readPersistentPayload(recordType, recordId) {
  if (!persistentStorageEnabled()) return null;
  const rows = await supabaseRequest(
    `?record_type=eq.${encodeURIComponent(recordType)}&record_id=eq.${encodeURIComponent(recordId)}&select=payload&limit=1`
  );
  return rows?.[0]?.payload || null;
}

async function listPersistentPayloads(recordType, limit = 80, orderField = "updated_at") {
  if (!persistentStorageEnabled()) return null;
  const rows = await supabaseRequest(
    `?record_type=eq.${encodeURIComponent(recordType)}&select=payload&order=${orderField}.desc&limit=${Number(limit) || 80}`
  );
  return (rows || []).map((row) => row.payload).filter(Boolean);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  return JSON.parse(body);
}

function buildDesignPrompt(payload) {
  const {
    module,
    category,
    customer,
    market,
    season,
    style,
    productNotes,
    material,
    colors,
    deliverables
  } = payload;

  return `
You are a senior cross-border ecommerce fashion operator and product development director.
Return concise JSON only. No markdown.

Business context:
- Current workspace module: ${module}
- Customer / brand: ${customer || "unknown"}
- Product category: ${category || "apparel or textile product"}
- Target market: ${market || "US"}
- Season: ${season || "not specified"}
- Style direction: ${style || "commercial, wearable, platform-ready"}
- Material / handfeel: ${material || "not specified"}
- Color / print direction: ${colors || "not specified"}
- Product notes and constraints: ${productNotes || "not specified"}
- Required deliverables: ${deliverables || "sample analysis, image plan, listing copy, TikTok scripts"}

Important constraints:
- Do not invent sales data, ratings, certifications, test reports, shipping promises, stock, or platform endorsements.
- Avoid luxury-brand imitation, trademark references, celebrity likeness, and risky claims.
- Keep garment structure, color, print, fabric texture, neckline, sleeve, length, buttons, zippers, and motifs consistent with the sample.
- Customer-facing title, bullets, keywords, voiceover, and captions should be natural English for overseas ecommerce buyers.
- Operator notes, risks, and missing inputs should be in Chinese.
- TikTok scripts should be directly shootable in 15-30 seconds.

JSON shape:
{
  "summary": "one Chinese sentence summarizing the deliverable",
  "conceptName": "English commercial launch-pack name",
  "positioning": ["3 Chinese bullets about target user, use case, and test priority"],
  "designDirections": [
    {"name":"English direction name","details":"Chinese execution note","risk":"Chinese production or compliance risk"}
  ],
  "imagePrompts": [
    {"usage":"main image / white background / model / lifestyle / detail / ad / TikTok cover","ratio":"1:1 or 4:5 or 3:4 or 9:16","prompt":"English image prompt","negative":"English negative prompt"}
  ],
  "vectorPrompt": "English prompt for clean editable textile vector artwork or digital tracing",
  "listingCopy": {
    "title": "English ecommerce title",
    "bullets": ["5 English bullets"],
    "keywords": ["30 English search keywords"]
  },
  "tiktokScripts": [
    {"hook":"English 3-second hook","shots":["4 short shot notes"],"voiceover":"English voiceover","caption":"English caption"}
  ],
  "nextInputsNeeded": ["Chinese list of missing fields"]
}`.trim();
}

function buildEmployeePrompt(payload) {
  const count = Math.min(12, Math.max(3, Number(payload.count || 6)));
  return `
You are "Lina", an AI employee for a cross-border fashion product development studio.
Your job is to create commercially usable style concepts and textile print concepts for an internal material library.
Return concise JSON only. No markdown.

Brief:
- Category: ${payload.category || "women apparel"}
- Target market: ${payload.market || "US"}
- Platform: ${payload.platform || "TikTok Shop / Shopify"}
- Season: ${payload.season || "Spring Summer"}
- Theme: ${payload.theme || "commercial trend development"}
- Style keywords: ${payload.styleKeywords || "wearable, photogenic, ecommerce-ready"}
- Fabric direction: ${payload.fabric || "not specified"}
- Price positioning: ${payload.pricePosition || "mid-market"}
- Required concept count: ${count}

Rules:
- Do not reference luxury brands, celebrities, trademarks, copyrighted characters, or fake certifications.
- Focus on realistic apparel development, textile print development, ecommerce photos, digital vector artwork, and TikTok content hooks.
- Product-facing copy, image prompts, vector prompts, and TikTok hooks should be natural English.
- Internal notes, risk notes, and next actions should be in Chinese.
- Color palettes must include practical color names and hex values.
- Each concept should be distinct enough to test as a separate customer direction.
- Treat each concept as a candidate product that can move toward listing material.
- For satin/silky-look sleepwear, pay attention to lace trim, contrast piping, bow details, bridal morning, giftable packaging, vacation resort styling, French apartment warm lifestyle imagery, and original small florals.

JSON shape:
{
  "batchTitle": "English batch name",
  "employee": {
    "name": "Lina",
    "role": "AI Style & Print Designer",
    "routine": "Chinese one-sentence working routine"
  },
  "libraryTags": ["English or Chinese tags"],
  "concepts": [
    {
      "name": "English commercial concept name",
      "category": "English category",
      "targetCustomer": "English target customer",
      "styleDirection": "Chinese style direction",
      "silhouette": "Chinese garment silhouette and details",
      "fabricAndCraft": "Chinese fabric/craft suggestion",
      "patternName": "English print/pattern name",
      "patternDescription": "Chinese print description",
      "colorPalette": [{"name":"English color name","hex":"#000000"}],
      "imagePrompt": "English ecommerce/model/lifestyle image prompt",
      "vectorPrompt": "English editable textile vector/seamless repeat prompt",
      "platformUsage": ["English platform/use case, e.g. TikTok Shop main image", "Shopify product page", "Amazon listing image"],
      "titleDirection": "English SEO-friendly title direction, not keyword stuffed",
      "coreSellingPoints": ["English selling point 1", "English selling point 2", "English selling point 3"],
      "listingAngle": "English ecommerce selling angle",
      "tiktokHook": "English 3-second hook",
      "riskNotes": ["Chinese compliance or production notes"],
      "nextAction": "Chinese next step for sampling, image generation, or customer validation"
    }
  ],
  "nextBrief": "Chinese suggestion for the next library generation brief"
}`.trim();
}

function mockDesign(payload) {
  const category = payload.category || "women's fashion item";
  const market = payload.market || "US";
  const platform = payload.platform || "TikTok Shop";
  return {
    mode: "demo",
    provider: "demo",
    summary: `已为 ${market} 市场生成一版样衣到上架素材包，可用于客户确认、图片生成和内容测试。`,
    conceptName: "Sample-to-Sell Launch Pack",
    positioning: [
      `${category} 先定位为轻商业测试款，重点验证主图点击、上身效果和短视频前 3 秒吸引力。`,
      `平台优先级建议：${platform} 先做快速内容测试，再把表现好的图片和卖点复用到其他渠道。`,
      "当前阶段先让客户确认款式方向、图片风格、英文卖点和补充资料。"
    ],
    designDirections: [
      {
        name: "Clean Marketplace Hero",
        details: "主图保持干净、真实、易判断版型。模特正面自然站姿，商品轮廓清晰，背景减少干扰。",
        risk: "需要补充样衣正反面图和细节图，避免生成图改变领口、袖型、长度、颜色或印花位置。"
      },
      {
        name: "Lifestyle Conversion Scene",
        details: "围绕通勤、度假或周末出行场景展示上身效果，让客户看到真实穿搭用途。",
        risk: "不要加入未经授权品牌、地标、明星脸或虚假折扣文字。"
      },
      {
        name: "TikTok Hook Test",
        details: "短视频先测 3 个角度：显瘦/舒适、场景穿搭、细节近拍。每条 15-30 秒。",
        risk: "不要承诺 100% 显瘦、永久不皱、不起球等无法验证的效果。"
      }
    ],
    imagePrompts: [
      {
        usage: "main image",
        ratio: "4:5",
        prompt: `Professional ecommerce model photo for ${category}, natural daylight studio, clean neutral background, accurate garment color and silhouette, realistic fabric texture, full outfit visible, marketplace-ready composition`,
        negative: "do not change garment color, no extra logo, no brand text, no distorted hands, no wrong neckline, no incorrect sleeve shape"
      },
      {
        usage: "lifestyle image",
        ratio: "4:5",
        prompt: `Lifestyle fashion photo for ${category}, bright street or vacation setting, natural movement, clear garment fit, authentic overseas ecommerce look, soft daylight`,
        negative: "no luxury brand reference, no celebrity face, no fake review text, no unreadable typography"
      },
      {
        usage: "TikTok cover",
        ratio: "9:16",
        prompt: `Vertical TikTok cover image for ${category}, model mid-motion, clear front view, strong outfit silhouette, space for short English headline`,
        negative: "no wrong text, no watermark, no logo, no extra accessories that hide the product"
      }
    ],
    vectorPrompt: "Create a clean editable textile vector artwork based on the product print direction, organized layers, flat colors, seamless repeat option, no brand marks, suitable for digital printing and colorway expansion.",
    listingCopy: {
      title: "Women Printed Midi Dress, Lightweight Casual Vacation Dress for Spring Summer Outfits",
      bullets: [
        "Easy everyday style designed for travel, brunch, weekend plans, and warm-weather outfits.",
        "Lightweight woven handfeel creates a soft, comfortable look without feeling too formal.",
        "Clean silhouette pairs well with sandals, sneakers, light jackets, and simple accessories.",
        "Small print direction adds visual interest while staying wearable for daily styling.",
        "Please check the size chart before ordering; manual measurement may vary slightly."
      ],
      keywords: [
        "women midi dress", "printed dress", "summer dress", "vacation dress", "casual dress",
        "floral dress", "spring outfit", "resort wear", "travel outfit", "weekend dress",
        "boutique dress", "lightweight dress", "women fashion", "TikTok outfit", "ecommerce fashion",
        "model photo", "lifestyle image", "product photo", "fashion listing", "women clothing",
        "daily wear", "soft dress", "comfortable dress", "gift for women", "work casual",
        "holiday outfit", "street style", "fashion content", "main image", "detail image"
      ]
    },
    tiktokScripts: [
      {
        hook: "This is the dress I pack when I do not want to overthink an outfit.",
        shots: ["0-3s front mirror movement", "4-10s close-up fabric and print", "11-20s walking shot", "21-28s styling with bag and sandals"],
        voiceover: "Light, easy, and ready in one piece. This dress works for brunch, travel, and warm weekend plans.",
        caption: "Easy vacation outfit, no overthinking."
      },
      {
        hook: "One dress, three simple ways to wear it.",
        shots: ["show base dress", "add light cardigan", "switch to sneakers", "detail close-up"],
        voiceover: "Keep it casual with sneakers, dress it up with sandals, or layer it for cooler evenings.",
        caption: "3 ways to style one printed dress."
      },
      {
        hook: "The print is subtle, but it makes the whole outfit feel finished.",
        shots: ["print close-up", "waist and neckline detail", "full-body pose", "final product hero shot"],
        voiceover: "A soft print gives the look personality without feeling too loud for everyday wear.",
        caption: "Small print, easy outfit."
      }
    ],
    nextInputsNeeded: ["样衣正面、背面、侧面和细节照片", "面料成分、克重、弹力和是否透光", "尺码表和模特身高体重参考", "目标售价、成本区间和主要竞品", "客户最想先测试的平台和预算"]
  };
}
function extractText(response) {
  if (response.output_text) return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function parseJsonObject(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON.");
  }
}

function chooseTextProvider() {
  const requested = (process.env.TEXT_PROVIDER || "auto").toLowerCase();
  if (requested !== "auto") return requested;
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) return "qwen";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "demo";
}

function chooseImageProvider() {
  const requested = (process.env.IMAGE_PROVIDER || "auto").toLowerCase();
  if (requested !== "auto") return requested;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) return "qwen";
  return "demo";
}

async function callOpenAICompatibleChat({ baseUrl, apiKey, model, prompt, provider }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.4
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider} Chat API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  return parseJsonObject(text);
}

async function callResponses(payload) {
  const provider = chooseTextProvider();
  const prompt = buildDesignPrompt(payload);

  if (provider === "demo") return mockDesign(payload);

  if (provider === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return mockDesign(payload);
    const result = await callOpenAICompatibleChat({
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      apiKey,
      model: process.env.DEEPSEEK_TEXT_MODEL || "deepseek-chat",
      prompt,
      provider: "DeepSeek"
    });
    return { ...result, mode: "live", provider: "deepseek" };
  }

  if (provider === "qwen") {
    const apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
    if (!apiKey) return mockDesign(payload);
    const result = await callOpenAICompatibleChat({
      baseUrl: process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey,
      model: process.env.QWEN_TEXT_MODEL || "qwen-plus",
      prompt,
      provider: "Qwen"
    });
    return { ...result, mode: "live", provider: "qwen" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return mockDesign(payload);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.5",
      input: prompt,
      text: {
        format: { type: "json_object" }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Responses API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = extractText(data);
  return { ...parseJsonObject(text), mode: "live", provider: "openai" };
}

function mockEmployeeDesigns(payload) {
  const category = payload.category || "women apparel";
  const theme = payload.theme || "commercial summer capsule";
  return {
    mode: "demo",
    provider: "demo",
    batchTitle: "Sample Library Capsule",
    employee: {
      name: "Lina",
      role: "AI Style & Print Designer",
      routine: "每天围绕目标市场生成可打样、可出图、可上架测试的款式与花型方向。"
    },
    libraryTags: [category, theme, "sample-to-sell", "print development"],
    concepts: [
      {
        name: "Soft Resort Midi",
        category,
        targetCustomer: "Women looking for easy vacation outfits",
        styleDirection: "轻度假、日常可穿、适合短视频展示上身效果。",
        silhouette: "V领中长款连衣裙，微收腰，短袖，裙摆有自然垂感。",
        fabricAndCraft: "轻薄梭织或人棉感面料，小批量先做数码印花。",
        patternName: "Coral Garden Micro Floral",
        patternDescription: "小比例碎花，珊瑚色与鼠尾草绿组合，适合春夏主图和场景图。",
        colorPalette: [
          { name: "Sage Green", hex: "#8BAE9B" },
          { name: "Soft Coral", hex: "#E98B78" },
          { name: "Ivory", hex: "#F7F0E6" }
        ],
        imagePrompt: "Ecommerce model photo of a soft resort midi dress, natural daylight, clean neutral background, accurate floral print, realistic fabric drape, full outfit visible",
        vectorPrompt: "Editable seamless micro floral textile vector, sage green base, ivory flowers, soft coral accents, clean layers, digital print ready",
        listingAngle: "Easy vacation-ready midi dress with a soft floral print and comfortable everyday styling.",
        tiktokHook: "The dress I pack when I do not want to overthink a vacation outfit.",
        riskNotes: ["避免花型过密导致主图不清晰。", "需要确认面料透光和尺码表。"],
        nextAction: "先生成一张4:5模特主图和一张9:16 TK封面，测试点击。"
      },
      {
        name: "Urban Airy Shirt Set",
        category,
        targetCustomer: "Women who want casual polished summer looks",
        styleDirection: "通勤休闲、可套装也可拆穿，适合独立站和TikTok Shop测试。",
        silhouette: "宽松短袖衬衫搭配直筒短裤，门襟简洁，口袋做轻量细节。",
        fabricAndCraft: "亚麻感混纺，建议开发素色和细条纹两个版本。",
        patternName: "Washed Pinstripe",
        patternDescription: "低对比细条纹，保留清爽感，适合多色组扩展。",
        colorPalette: [
          { name: "Washed Blue", hex: "#8DAFC3" },
          { name: "Warm White", hex: "#F5F1E8" },
          { name: "Graphite", hex: "#3F4A4D" }
        ],
        imagePrompt: "Lifestyle ecommerce photo of a relaxed shirt and shorts set, summer city street, natural movement, clear fit, clean modern styling",
        vectorPrompt: "Editable yarn-dyed pinstripe vector pattern, washed blue and warm white, repeat tile, production-ready layers",
        listingAngle: "A breathable matching set that looks put together with almost no styling effort.",
        tiktokHook: "This matching set makes a simple outfit look finished in five seconds.",
        riskNotes: ["套装需要注意上下装色差。", "短裤长度要避免目标市场尺码争议。"],
        nextAction: "先做素色与细条纹两套图，给客户选择更商业的方向。"
      },
      {
        name: "Weekend Knit Tank",
        category,
        targetCustomer: "Women building capsule wardrobes",
        styleDirection: "基础款升级，强调纹理、版型和百搭性。",
        silhouette: "修身但不紧身的针织背心，宽肩带，微方领，下摆到高腰位置。",
        fabricAndCraft: "棉感罗纹针织，重点测试白色不透与弹力恢复。",
        patternName: "Rib Texture Colorway",
        patternDescription: "以肌理和色组为主，不做复杂印花，适合素材库基础款方向。",
        colorPalette: [
          { name: "Oat Milk", hex: "#E8DECF" },
          { name: "Deep Teal", hex: "#0F766E" },
          { name: "Clay Rose", hex: "#C97867" }
        ],
        imagePrompt: "Clean ecommerce model photo of a ribbed knit tank top, capsule wardrobe styling, high-waist jeans, neutral studio light, realistic knit texture",
        vectorPrompt: "Editable rib knit texture swatch vector, clean vertical rib structure, colorway expansion, no logos",
        listingAngle: "A soft ribbed tank designed for easy layering and everyday capsule outfits.",
        tiktokHook: "The basic tank that makes jeans look cleaner instantly.",
        riskNotes: ["需要测试浅色透光。", "针织纹理生成图容易失真，提示词要强调真实罗纹。"],
        nextAction: "补充面料近拍和白底细节图，建立基础款素材模板。"
      }
    ],
    nextBrief: "下一轮可以按“美区夏季连衣裙花型”或“通勤套装低成本面料”继续扩展。"
  };
}

async function callEmployeeDesigner(payload) {
  const provider = chooseTextProvider();
  const prompt = buildEmployeePrompt(payload);

  if (provider === "demo") return mockEmployeeDesigns(payload);

  if (provider === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return mockEmployeeDesigns(payload);
    const result = await callOpenAICompatibleChat({
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      apiKey,
      model: process.env.DEEPSEEK_TEXT_MODEL || "deepseek-chat",
      prompt,
      provider: "DeepSeek"
    });
    return { ...result, mode: "live", provider: "deepseek" };
  }

  if (provider === "qwen") {
    const apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
    if (!apiKey) return mockEmployeeDesigns(payload);
    const result = await callOpenAICompatibleChat({
      baseUrl: process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey,
      model: process.env.QWEN_TEXT_MODEL || "qwen-plus",
      prompt,
      provider: "Qwen"
    });
    return { ...result, mode: "live", provider: "qwen" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return mockEmployeeDesigns(payload);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.5",
      input: prompt,
      text: {
        format: { type: "json_object" }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Responses API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return { ...parseJsonObject(extractText(data)), mode: "live", provider: "openai" };
}

async function callImageGeneration(payload) {
  const provider = chooseImageProvider();
  const imagePrompt = buildFashionImagePrompt(payload);
  const safePayload = { ...payload, prompt: imagePrompt };

  if (provider === "demo") {
    return {
      mode: "demo",
      provider: "demo",
      image: null,
      prompt: imagePrompt,
      qualityChecklist: fashionImageQualityChecklist(payload),
      note: "未配置图片模型 API Key，当前显示提示词，不消耗额度。"
    };
  }

  if (provider === "qwen") {
    return callQwenImageGeneration(safePayload);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      mode: "demo",
      provider: "demo",
      image: null,
      prompt: imagePrompt,
      qualityChecklist: fashionImageQualityChecklist(payload),
      note: "未配置 OPENAI_API_KEY，当前显示提示词，不消耗额度。"
    };
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      prompt: imagePrompt,
      size: payload.size || "1024x1536",
      quality: payload.quality || "medium"
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Images API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return {
    mode: "live",
    provider: "openai",
    image: `data:image/png;base64,${data.data?.[0]?.b64_json || ""}`,
    prompt: imagePrompt,
    qualityChecklist: fashionImageQualityChecklist(payload)
  };
}

function buildFashionImagePrompt(payload = {}) {
  const rawPrompt = sanitizeText(payload.prompt);
  const kind = String(payload.kind || payload.mode || payload.usage || "product").toLowerCase();
  const baseGuardrails = [
    "Do not add logos, brand marks, readable text, extra accessories that hide the garment, or luxury brand references.",
    "Keep garment category, neckline, sleeve length, set pieces, hem length, trim, piping, lace, bow details, color family, print scale, and fabric sheen consistent with the provided design brief.",
    "Avoid distorted hands, extra fingers, warped limbs, twisted torso, broken garment construction, asymmetrical straps, wrong trouser length, transparent fabric errors, and duplicate people.",
    "Marketplace-safe, realistic ecommerce photography, no sexualized posing, no misleading discount or review text."
  ].join(" ");

  if (kind === "pattern" || kind === "vector") {
    return [
      "Create a clean textile print concept preview for apparel production.",
      "Flat front-facing seamless repeat direction, no model, no body, no garment mockup unless explicitly requested.",
      "Show repeatable motifs clearly with production-friendly spacing, clean edges, editable vector-style layers, limited color palette, no brand marks.",
      rawPrompt,
      "Quality target: print direction must be clear enough for a designer to redraw as vector/repeat tile; do not generate random text.",
      baseGuardrails
    ].filter(Boolean).join("\n\n");
  }

  return [
    "Create a realistic fashion ecommerce model photo for apparel development review.",
    "Single adult female model, full body or 3/4 body visible, natural standing pose, garment clearly visible from front, clean posture, hands relaxed and not covering the product.",
    "Use a clean studio, warm bedroom, French apartment, or resort lifestyle scene only when it supports the garment; keep background secondary.",
    "Fabric should read as satin/silky-look when requested: soft sheen, smooth drape, realistic seams and hems, no plastic shine.",
    rawPrompt,
    "Quality target: the output must look like a usable apparel product-model preview, not an abstract fashion illustration.",
    baseGuardrails,
    "If exact sample consistency is required, this text-to-image workflow is only a concept preview; final commercial image requires image-reference / virtual try-on model support and human QA."
  ].filter(Boolean).join("\n\n");
}

function fashionImageQualityChecklist(payload = {}) {
  const kind = String(payload.kind || payload.mode || payload.usage || "product").toLowerCase();
  if (kind === "pattern" || kind === "vector") {
    return [
      "花型是否清楚可复绘",
      "是否可做连续 repeat",
      "是否有错误文字/品牌元素",
      "颜色数量是否适合打样",
      "是否需要重新矢量化"
    ];
  }
  return [
    "是否像真实服装模特照",
    "版型/领口/袖长/裤长/件数是否正确",
    "颜色/花型/蕾丝/piping 是否偏离",
    "手脚/脸/身体比例是否失真",
    "是否适合仅做内部预览，不能直接商用"
  ];
}

function tryOnQualityChecklist() {
  return [
    "服装件数是否正确",
    "领口/肩带/袖长/裤长/下摆是否接近样衣",
    "花型/颜色/蕾丝/piping/面料光泽是否偏离",
    "模特身体、脸、手脚是否明显失真",
    "是否保留内部预览/商用待确认标记"
  ];
}

function publicImageUrl(value, label) {
  const url = sanitizeText(value, "");
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid protocol");
    return parsed.toString();
  } catch {
    throw badRequest(`${label} 必须是可访问的 HTTP/HTTPS 图片 URL。`);
  }
}

function tryOnInstructions(provider = chooseTryOnProvider()) {
  return {
    provider,
    requiredInputs: [
      "modelImageUrl: 模特参考图 HTTP/HTTPS URL",
      "garmentImageUrl 或 topGarmentUrl: 上衣/套装主图 HTTP/HTTPS URL",
      "bottomGarmentUrl: 下装图 URL，可选",
      "category: pajama/loungewear/top/bottom/dress/set",
      "notes: 必须保留的样衣细节"
    ],
    safety: "客户素材上传第三方 API 前必须保留授权记录；结果默认内部预览，商用前人工质检。"
  };
}

async function callTryOnGeneration(payload = {}) {
  const provider = chooseTryOnProvider();
  const modelImageUrl = publicImageUrl(payload.modelImageUrl || payload.personImageUrl, "modelImageUrl");
  const garmentImageUrl = publicImageUrl(payload.garmentImageUrl || payload.topGarmentUrl, "garmentImageUrl");
  const bottomGarmentUrl = publicImageUrl(payload.bottomGarmentUrl, "bottomGarmentUrl");
  const category = sanitizeText(payload.category, "pajama/loungewear");
  const notes = sanitizeText(payload.notes);

  if (!modelImageUrl || !garmentImageUrl) {
    throw badRequest("请至少提供 modelImageUrl 和 garmentImageUrl。");
  }

  if (provider === "disabled") {
    return {
      mode: "dry-run",
      provider,
      image: null,
      modelImageUrl,
      garmentImageUrl,
      bottomGarmentUrl,
      category,
      notes,
      qualityChecklist: tryOnQualityChecklist(),
      instructions: tryOnInstructions(provider),
      note: "TRYON_PROVIDER=disabled，当前只校验参数，不调用付费虚拟试衣接口。"
    };
  }

  if (provider === "aliyun-aitryon") {
    return callAliyunTryOn({ modelImageUrl, garmentImageUrl, bottomGarmentUrl, category, notes });
  }

  if (provider === "fashn") {
    return callFalFashnTryOn({ modelImageUrl, garmentImageUrl, bottomGarmentUrl, category, notes });
  }

  throw badRequest(`未知虚拟试衣通道：${provider}`);
}

async function callAliyunTryOn(payload) {
  const apiKey = process.env.ALIYUN_TRYON_API_KEY || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return {
      mode: "dry-run",
      provider: "aliyun-aitryon",
      image: null,
      ...payload,
      qualityChecklist: tryOnQualityChecklist(),
      instructions: tryOnInstructions("aliyun-aitryon"),
      note: "未配置 ALIYUN_TRYON_API_KEY / QWEN_API_KEY / DASHSCOPE_API_KEY，未调用付费接口。"
    };
  }

  const apiBase = qwenImageApiBaseUrl();
  const response = await fetch(`${apiBase}/services/aigc/image2image/image-synthesis`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable"
    },
    body: JSON.stringify({
      model: process.env.ALIYUN_TRYON_MODEL || "aitryon-plus",
      input: {
        person_image_url: payload.modelImageUrl,
        top_garment_url: payload.garmentImageUrl,
        ...(payload.bottomGarmentUrl ? { bottom_garment_url: payload.bottomGarmentUrl } : {})
      },
      parameters: {
        restore_face: true
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Aliyun Try-On API error ${response.status}: ${errorText}`);
  }

  const taskData = await response.json();
  const taskId = taskData.output?.task_id;
  if (!taskId) throw new Error(`Aliyun Try-On did not return task_id: ${JSON.stringify(taskData)}`);

  for (let i = 0; i < 45; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const poll = await fetch(`${apiBase}/tasks/${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const statusData = await poll.json();
    const status = statusData.output?.task_status;
    if (status === "SUCCEEDED") {
      const imageUrl = extractQwenImageUrl(statusData);
      return {
        mode: "live",
        provider: "aliyun-aitryon",
        imageUrl,
        image: imageUrl || null,
        taskId,
        ...payload,
        qualityChecklist: tryOnQualityChecklist()
      };
    }
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`Aliyun Try-On task ${status}: ${JSON.stringify(statusData)}`);
    }
  }

  throw new Error("Aliyun Try-On task timed out.");
}

async function callFalFashnTryOn(payload) {
  const apiKey = process.env.FASHN_API_KEY || process.env.FAL_KEY;
  if (!apiKey) {
    return {
      mode: "dry-run",
      provider: "fashn",
      image: null,
      ...payload,
      qualityChecklist: tryOnQualityChecklist(),
      instructions: tryOnInstructions("fashn"),
      note: "未配置 FASHN_API_KEY / FAL_KEY，未调用付费接口。"
    };
  }

  const model = process.env.FASHN_TRYON_MODEL || "fal-ai/fashn/tryon/v1.5";
  const baseUrl = `https://queue.fal.run/${model}`;
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model_image: payload.modelImageUrl,
      garment_image: payload.garmentImageUrl,
      category: payload.bottomGarmentUrl ? "tops" : "auto",
      ...(payload.bottomGarmentUrl ? { bottom_garment_image: payload.bottomGarmentUrl } : {})
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FASHN/fal Try-On API error ${response.status}: ${errorText}`);
  }

  const queued = await response.json();
  const requestId = queued.request_id || queued.requestId;
  if (!requestId) {
    return {
      mode: "submitted",
      provider: "fashn",
      task: queued,
      ...payload,
      qualityChecklist: tryOnQualityChecklist(),
      note: "FASHN/fal 已返回结果，但未找到 request_id，请按平台返回检查。"
    };
  }

  for (let i = 0; i < 45; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const statusResponse = await fetch(`${baseUrl}/requests/${requestId}/status`, {
      headers: { "Authorization": `Key ${apiKey}` }
    });
    const statusData = await statusResponse.json();
    const status = String(statusData.status || "").toUpperCase();
    if (status === "COMPLETED") {
      const resultResponse = await fetch(`${baseUrl}/requests/${requestId}`, {
        headers: { "Authorization": `Key ${apiKey}` }
      });
      const result = await resultResponse.json();
      const imageUrl = result.image?.url || result.images?.[0]?.url || result.output?.image?.url || result.output?.images?.[0]?.url || "";
      return {
        mode: "live",
        provider: "fashn",
        imageUrl,
        image: imageUrl || null,
        requestId,
        ...payload,
        qualityChecklist: tryOnQualityChecklist(),
        raw: result
      };
    }
    if (status === "FAILED" || status === "ERROR") {
      throw new Error(`FASHN/fal Try-On task ${status}: ${JSON.stringify(statusData)}`);
    }
  }

  throw new Error("FASHN/fal Try-On task timed out.");
}

async function callQwenImageGeneration(payload) {
  const apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return {
      mode: "demo",
      provider: "demo",
      image: null,
      prompt: payload.prompt,
      qualityChecklist: fashionImageQualityChecklist(payload),
      note: "未配置 QWEN_API_KEY / DASHSCOPE_API_KEY，当前显示提示词，不消耗额度。"
    };
  }

  const model = process.env.QWEN_IMAGE_MODEL || "wanx2.1-t2i-turbo";
  const qwenSize = normalizeQwenImageSize(process.env.QWEN_IMAGE_SIZE || payload.size);
  const useWanMessageApi = isWanMessageImageModel(model);
  const apiBase = qwenImageApiBaseUrl();

  const response = await fetch(
    useWanMessageApi
      ? `${apiBase}/services/aigc/image-generation/generation`
      : "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
    {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable"
    },
    body: JSON.stringify(
      useWanMessageApi
        ? {
            model,
            input: {
              messages: [
                {
                  role: "user",
                  content: [
                    { text: payload.prompt }
                  ]
                }
              ]
            },
            parameters: {
              size: qwenSize,
              n: 1,
              watermark: false,
              thinking_mode: true
            }
          }
        : {
            model,
            input: {
              prompt: payload.prompt,
              negative_prompt: payload.negative || "low quality, blurry, distorted garment, wrong color, extra logo"
            },
            parameters: {
              size: qwenSize,
              n: 1
            }
          }
    )
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen Image API error ${response.status}: ${errorText}`);
  }

  const taskData = await response.json();
  const taskId = taskData.output?.task_id;
  if (!taskId) throw new Error(`Qwen Image API did not return task_id: ${JSON.stringify(taskData)}`);

  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const poll = await fetch(`${apiBase}/tasks/${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const statusData = await poll.json();
    const status = statusData.output?.task_status;
    if (status === "SUCCEEDED") {
      const imageUrl = extractQwenImageUrl(statusData);
      return {
        mode: "live",
        provider: "qwen",
        imageUrl,
        image: imageUrl || null,
        prompt: payload.prompt,
        qualityChecklist: fashionImageQualityChecklist(payload),
        taskId
      };
    }
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`Qwen Image task ${status}: ${JSON.stringify(statusData)}`);
    }
  }

  throw new Error("Qwen Image task timed out.");
}

function extractQwenImageUrl(statusData) {
  const output = statusData?.output || {};
  return (
    output.results?.[0]?.url ||
    output.results?.[0]?.image_url ||
    output.results?.[0]?.image ||
    output.choices?.[0]?.message?.content?.find?.((item) => item?.image)?.image ||
    output.choices?.[0]?.message?.content?.find?.((item) => item?.url)?.url ||
    output.choices?.[0]?.message?.content?.find?.((item) => item?.image_url)?.image_url ||
    output.task_result?.results?.[0]?.url ||
    output.task_result?.images?.[0]?.url ||
    output.images?.[0]?.url ||
    output.images?.[0] ||
    null
  );
}

function normalizeQwenImageSize(size) {
  const raw = String(size || "1024*1440").trim().replace("x", "*");
  const match = raw.match(/^(\d{3,4})\*(\d{3,4})$/);
  if (!match) return "1024*1440";
  const clamp = (value) => Math.min(4096, Math.max(768, Number(value)));
  return `${clamp(match[1])}*${clamp(match[2])}`;
}

function isWanMessageImageModel(model) {
  return /^(wan2\.[67]-image|qwen-image|z-image)/i.test(String(model || ""));
}

function qwenImageApiBaseUrl() {
  const explicitBase = String(process.env.QWEN_IMAGE_BASE_URL || process.env.DASHSCOPE_IMAGE_BASE_URL || "").trim();
  if (explicitBase) return explicitBase.replace(/\/$/, "").replace(/\/services\/aigc\/.*$/, "");

  const compatibleBase = String(process.env.QWEN_BASE_URL || "").trim();
  const workspaceMatch = compatibleBase.match(/^(https:\/\/[^/]+)\/compatible-mode\/v1\/?$/);
  if (workspaceMatch) return `${workspaceMatch[1]}/api/v1`;

  return "https://dashscope.aliyuncs.com/api/v1";
}

function getRuntimeStatus() {
  return {
    textProvider: chooseTextProvider(),
    imageProvider: chooseImageProvider(),
    tryonProvider: chooseTryOnProvider(),
    textModels: {
      openai: process.env.OPENAI_TEXT_MODEL || "gpt-5.5",
      deepseek: process.env.DEEPSEEK_TEXT_MODEL || "deepseek-chat",
      qwen: process.env.QWEN_TEXT_MODEL || "qwen-plus"
    },
    imageModels: {
      openai: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      qwen: process.env.QWEN_IMAGE_MODEL || "wanx2.1-t2i-turbo"
    },
    tryonModels: {
      aliyun: process.env.ALIYUN_TRYON_MODEL || "aitryon-plus",
      fal: process.env.FASHN_TRYON_MODEL || "fal-ai/fashn/tryon/v1.5"
    },
    configured: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      qwen: Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY),
      aliyunTryOn: Boolean(process.env.ALIYUN_TRYON_API_KEY || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY),
      fashnTryOn: Boolean(process.env.FASHN_API_KEY || process.env.FAL_KEY)
    },
    storage: getStorageStatus()
  };
}

function chooseTryOnProvider() {
  const requested = String(process.env.TRYON_PROVIDER || "disabled").toLowerCase();
  if (["aliyun-aitryon", "aliyun", "aitryon-plus"].includes(requested)) return "aliyun-aitryon";
  if (["fashn", "fal", "fal-fashn"].includes(requested)) return "fashn";
  return "disabled";
}

function sanitizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 1200) : fallback;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function sanitizeProjectId(id) {
  const safeId = String(id || "").trim();
  if (!/^[a-z0-9-]{20,80}$/i.test(safeId)) throw new Error("Invalid project id.");
  return safeId;
}

function getAdminPin(req, url) {
  return String(req.headers["x-admin-pin"] || url.searchParams.get("pin") || "").trim();
}

function assertAdmin(req, url) {
  const configuredPin = String(process.env.ADMIN_PIN || "").trim();
  if (!configuredPin) {
    const error = new Error("ADMIN_PIN is not configured.");
    error.statusCode = 503;
    throw error;
  }
  if (getAdminPin(req, url) !== configuredPin) {
    const error = new Error("Invalid admin PIN.");
    error.statusCode = 401;
    throw error;
  }
}

function clientFingerprint(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown-client";
}

function assertImageCooldown(req) {
  const key = `${getAdminPin(req, new URL(req.url, "http://localhost")).slice(0, 12)}:${clientFingerprint(req)}`;
  const now = Date.now();
  const lastUsedAt = imageCooldownMap.get(key) || 0;
  const waitMs = imageCooldownMs - (now - lastUsedAt);
  if (waitMs > 0) {
    const error = new Error(`图片生成冷却中，请等待 ${Math.ceil(waitMs / 1000)} 秒后再试。`);
    error.statusCode = 429;
    error.retryAfter = Math.ceil(waitMs / 1000);
    throw error;
  }
  imageCooldownMap.set(key, now);
}

function trimJsonValue(value, depth = 0) {
  if (depth > 8) return null;
  if (typeof value === "string") return value.slice(0, 8000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => trimJsonValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [String(key).slice(0, 80), trimJsonValue(item, depth + 1)])
    );
  }
  return null;
}

function projectPath(id) {
  return join(projectsDir, `${sanitizeProjectId(id)}.json`);
}

function publicOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || (String(req.headers.host || "").includes("onrender.com") ? "https" : "http");
  return `${proto}://${req.headers.host}`;
}

function publicProjectPayload(project) {
  return {
    id: project.id,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    status: project.status,
    brief: project.brief,
    result: project.result,
    assetNames: project.assetNames || [],
    confirmations: project.confirmations || []
  };
}

function normalizeConcept(concept, batch, index) {
  const now = batch.createdAt || new Date().toISOString();
  return {
    id: randomUUID(),
    batchId: batch.batchId,
    createdAt: now,
    source: "ai_employee",
    employee: batch.employee,
    status: "new",
    tags: batch.libraryTags || [],
    index,
    concept: trimJsonValue(concept || {})
  };
}

async function saveLibraryBatch(result, payload = {}) {
  const batch = {
    batchId: randomUUID(),
    createdAt: new Date().toISOString(),
    batchTitle: sanitizeText(result.batchTitle, "AI Design Library Batch"),
    employee: trimJsonValue(result.employee || { name: "Lina", role: "AI Style & Print Designer" }),
    libraryTags: trimJsonValue(result.libraryTags || []),
    brief: trimJsonValue(payload)
  };
  const concepts = Array.isArray(result.concepts) ? result.concepts : [];
  const records = concepts.map((concept, index) => normalizeConcept(concept, batch, index + 1));
  if (records.length) {
    const persistentRecords = records.map((record) => storageRecord("library_concept", record.id, record));
    const savedToPersistentStorage = await insertPersistentRecords(persistentRecords);
    if (!savedToPersistentStorage) {
      await mkdir(libraryDir, { recursive: true });
      await appendFile(conceptLibraryFile, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
    }
  }
  return {
    ...result,
    batchId: batch.batchId,
    createdAt: batch.createdAt,
    savedCount: records.length,
    concepts: records.map((record) => ({ ...record.concept, libraryId: record.id }))
  };
}

async function listLibraryConcepts(limit = 120) {
  const persistentRecords = await listPersistentPayloads("library_concept", limit, "created_at");
  if (persistentRecords) return persistentRecords;

  try {
    const content = await readFile(conceptLibraryFile, "utf8");
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function generateEmployeeLibrary(payload) {
  const result = await callEmployeeDesigner(payload);
  return saveLibraryBatch(result, payload);
}

async function saveProject(payload, req) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const project = {
    id,
    createdAt: now,
    updatedAt: now,
    status: "waiting_confirmation",
    brief: trimJsonValue(payload.brief || {}),
    result: trimJsonValue(payload.result || {}),
    assetNames: trimJsonValue(payload.assetNames || []),
    confirmations: []
  };
  const savedToPersistentStorage = await upsertPersistentRecord(storageRecord("project", id, project));
  if (!savedToPersistentStorage) {
    await mkdir(projectsDir, { recursive: true });
    await writeFile(projectPath(id), JSON.stringify(project, null, 2), "utf8");
  }
  return {
    ...publicProjectPayload(project),
    confirmationUrl: `${publicOrigin(req)}/confirm.html?id=${id}`
  };
}

async function loadProject(id) {
  const safeId = sanitizeProjectId(id);
  const persistentProject = await readPersistentPayload("project", safeId);
  if (persistentProject) return persistentProject;

  const content = await readFile(projectPath(id), "utf8");
  return JSON.parse(content);
}

async function listProjects(limit = 80) {
  const persistentProjects = await listPersistentPayloads("project", limit, "updated_at");
  if (persistentProjects) {
    return persistentProjects.map((project) => {
      const confirmations = project.confirmations || [];
      return {
        ...publicProjectPayload(project),
        confirmationCount: confirmations.length,
        latestConfirmation: confirmations.at(-1) || null,
        confirmationUrl: `/confirm.html?id=${project.id}`
      };
    });
  }

  try {
    const names = await readdir(projectsDir);
    const records = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .slice(0, 300)
        .map(async (name) => {
          try {
            const project = JSON.parse(await readFile(join(projectsDir, name), "utf8"));
            const confirmations = project.confirmations || [];
            return {
              ...publicProjectPayload(project),
              confirmationCount: confirmations.length,
              latestConfirmation: confirmations.at(-1) || null,
              confirmationUrl: `/confirm.html?id=${project.id}`
            };
          } catch {
            return null;
          }
        })
    );
    return records
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function saveProjectConfirmation(id, payload) {
  const project = await loadProject(id);
  const now = new Date().toISOString();
  const confirmation = {
    id: randomUUID(),
    createdAt: now,
    decision: sanitizeText(payload.decision, "需要修改"),
    selectedDirection: sanitizeText(payload.selectedDirection),
    customerName: sanitizeText(payload.customerName),
    company: sanitizeText(payload.company),
    contact: sanitizeText(payload.contact),
    notes: sanitizeText(payload.notes)
  };
  project.confirmations = [...(project.confirmations || []), confirmation];
  project.status = confirmation.decision === "整体通过" ? "approved" : "feedback_received";
  project.updatedAt = now;
  const savedToPersistentStorage = await upsertPersistentRecord(storageRecord("project", project.id, project));
  if (!savedToPersistentStorage) {
    await writeFile(projectPath(project.id), JSON.stringify(project, null, 2), "utf8");
  }
  return { ok: true, projectId: project.id, confirmationId: confirmation.id, createdAt: now };
}

async function saveFeedback(payload) {
  if (String(payload.agreeData || "").toLowerCase() !== "true") {
    throw badRequest("请先同意数据用途说明。");
  }
  if (!sanitizeText(payload.name)) {
    throw badRequest("请填写姓名或昵称。");
  }
  if (!sanitizeText(payload.email) && !sanitizeText(payload.phone)) {
    throw badRequest("请至少填写邮箱或手机号。");
  }
  if (!sanitizeText(payload.useCase)) {
    throw badRequest("请填写想解决的核心问题。");
  }
  const record = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: "customer_feedback",
    name: sanitizeText(payload.name),
    company: sanitizeText(payload.company),
    contact: {
      email: sanitizeText(payload.email),
      phone: sanitizeText(payload.phone),
      preferredContactTime: sanitizeText(payload.preferredContactTime)
    },
    businessStage: sanitizeText(payload.businessStage),
    sourceChannel: sanitizeText(payload.sourceChannel, "未填写"),
    useCase: sanitizeText(payload.useCase),
    expectedResult: sanitizeText(payload.expectedResult),
    budget: sanitizeText(payload.budget),
    notes: sanitizeText(payload.notes),
    source: sanitizeText(payload.source, "customer-page")
  };
  const savedToPersistentStorage = await insertPersistentRecords([storageRecord("feedback", record.id, record)]);
  if (!savedToPersistentStorage) {
    await mkdir(dataDir, { recursive: true });
    await appendFile(feedbackFile, `${JSON.stringify(record)}\n`, "utf8");
  }
  return record;
}

async function listFeedback(limit = 80) {
  const persistentFeedback = await listPersistentPayloads("feedback", limit, "created_at");
  if (persistentFeedback) return persistentFeedback;

  try {
    const content = await readFile(feedbackFile, "utf8");
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  } catch {
    return [];
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""').replace(/\r?\n/g, " ")}"`;
}

function feedbackCsv(feedback = []) {
  const rows = [
    ["提交时间", "姓名", "公司/品牌", "邮箱", "手机号", "偏好回复时间", "业务阶段", "来源渠道", "核心问题", "目标市场/人群", "预算范围", "备注", "来源"]
  ];
  for (const item of feedback) {
    rows.push([
      item.createdAt,
      item.name,
      item.company,
      item.contact?.email,
      item.contact?.phone,
      item.contact?.preferredContactTime,
      item.businessStage,
      item.sourceChannel,
      item.useCase,
      item.expectedResult,
      item.budget,
      item.notes,
      item.source
    ]);
  }
  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

async function adminSummary(req, url) {
  assertAdmin(req, url);
  const projects = await listProjects();
  const feedback = await listFeedback();
  const libraryConcepts = await listLibraryConcepts(20);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    status: getRuntimeStatus(),
    totals: {
      projects: projects.length,
      waiting: projects.filter((project) => project.status === "waiting_confirmation").length,
      feedbackReceived: projects.filter((project) => project.status === "feedback_received").length,
      approved: projects.filter((project) => project.status === "approved").length,
      leads: feedback.length,
      libraryConcepts: libraryConcepts.length
    },
    projects,
    feedback,
    libraryConcepts
  };
}

async function handleApi(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === "/api/status") {
      sendJson(res, 200, getRuntimeStatus());
      return;
    }

    if (req.method === "GET" && pathname === "/api/admin/summary") {
      sendJson(res, 200, await adminSummary(req, url));
      return;
    }

    if (req.method === "GET" && pathname === "/api/admin/feedback.csv") {
      assertAdmin(req, url);
      const csv = feedbackCsv(await listFeedback(1000));
      sendText(res, 200, csv, "text/csv; charset=utf-8");
      return;
    }

    if (req.method === "GET" && pathname === "/api/library/concepts") {
      assertAdmin(req, url);
      sendJson(res, 200, { ok: true, concepts: await listLibraryConcepts() });
      return;
    }

    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (req.method === "GET" && projectMatch) {
      const project = await loadProject(projectMatch[1]);
      sendJson(res, 200, publicProjectPayload(project));
      return;
    }

    const body = await readJson(req);
    if (pathname === "/api/generate/design") {
      assertAdmin(req, url);
      const result = await callResponses(body);
      sendJson(res, 200, { ...result, generatedAt: result.generatedAt || new Date().toISOString() });
      return;
    }
    if (pathname === "/api/generate/image") {
      assertAdmin(req, url);
      assertImageCooldown(req);
      const result = await callImageGeneration(body);
      sendJson(res, 200, result);
      return;
    }
    if (pathname === "/api/tryon") {
      assertAdmin(req, url);
      assertImageCooldown(req);
      const result = await callTryOnGeneration(body);
      sendJson(res, 200, result);
      return;
    }
    if (req.method === "POST" && pathname === "/api/employee/generate") {
      assertAdmin(req, url);
      const result = await generateEmployeeLibrary(body);
      sendJson(res, 200, result);
      return;
    }
    if (pathname === "/api/feedback") {
      const feedback = await saveFeedback(body);
      sendJson(res, 200, { ok: true, id: feedback.id, createdAt: feedback.createdAt });
      return;
    }
    if (req.method === "POST" && pathname === "/api/projects") {
      assertAdmin(req, url);
      const project = await saveProject(body, req);
      sendJson(res, 200, project);
      return;
    }
    const confirmationMatch = pathname.match(/^\/api\/projects\/([^/]+)\/confirm$/);
    if (req.method === "POST" && confirmationMatch) {
      const confirmation = await saveProjectConfirmation(confirmationMatch[1], body);
      sendJson(res, 200, confirmation);
      return;
    }
    sendJson(res, 404, { error: "API route not found" });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/customer.html" : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    const sensitivePage = ["/admin.html", "/employee.html", "/confirm.html", "/index.html"].includes(pathname);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      ...securityHeaders,
      ...(sensitivePage
        ? {
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow, noarchive"
          }
        : {})
    });
    res.end(content);
  } catch {
    const fallback = await readFile(join(publicDir, "customer.html"));
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      ...securityHeaders
    });
    res.end(fallback);
  }
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Design Studio AI running at http://localhost:${port}`);
});

