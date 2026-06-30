import http from "node:http";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const dataDir = join(__dirname, "data");
const feedbackFile = join(dataDir, "feedback.jsonl");

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

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
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
You are an expert cross-border fashion product development director.
Return concise JSON only. No markdown.

Business context:
- Module: ${module}
- Customer / brand: ${customer || "unknown"}
- Product category: ${category || "apparel or textile product"}
- Target market: ${market || "US"}
- Season: ${season || "not specified"}
- Style direction: ${style || "commercial, wearable, platform-ready"}
- Material / handfeel: ${material || "not specified"}
- Color direction: ${colors || "not specified"}
- Product notes: ${productNotes || "not specified"}
- Required deliverables: ${deliverables || "style concept, pattern direction, product image prompt, vector prompt"}

Important constraints:
- Do not invent certifications, sales data, user reviews, brand authorization, or test reports.
- Avoid luxury-brand imitation, trademark references, celebrity likeness, and risky claims.
- Keep garment structure, color, print, fabric texture, neckline, sleeve, length, buttons, zippers, and motifs consistent when reference photos are supplied.
- Customer-facing copy should be natural English for overseas ecommerce buyers.

JSON shape:
{
  "summary": "one sentence Chinese summary for the operator",
  "conceptName": "English commercial concept name",
  "positioning": ["3 Chinese bullets"],
  "designDirections": [
    {"name":"English direction name","details":"Chinese execution note","risk":"Chinese production or compliance risk"}
  ],
  "imagePrompts": [
    {"usage":"main image / detail / ad / social","ratio":"1:1 or 4:5 or 9:16","prompt":"English image prompt","negative":"English negative prompt"}
  ],
  "vectorPrompt": "English prompt for clean repeatable vector artwork / digital tracing",
  "listingCopy": {
    "title": "English ecommerce title",
    "bullets": ["5 English bullets"],
    "keywords": ["30 English search keywords"]
  },
  "nextInputsNeeded": ["Chinese list of missing fields"]
}`.trim();
}

function mockDesign(payload) {
  const category = payload.category || "women's fashion top";
  const market = payload.market || "US";
  return {
    mode: "demo",
    summary: "已生成一版可用于客户沟通、图片生成和上架准备的设计方案。",
    conceptName: "Soft Utility Resort Capsule",
    positioning: [
      `面向 ${market} 市场的轻商业款式，适合快速打样和平台测试。`,
      "视觉重点放在上身效果、面料垂感、花型清晰度和可批量延展性。",
      "先用 3 个方向做客户选择，再确定版型、色组和图案密度。"
    ],
    designDirections: [
      {
        name: "Clean Everyday Fit",
        details: `${category} 保持简洁轮廓，突出舒适、百搭、易搭配，适合作为主推基础款。`,
        risk: "需要补充尺码表和面料克重，避免后续客户对版型预期不一致。"
      },
      {
        name: "Botanical Micro Print",
        details: "采用小面积植物花型，适合连衣裙、上衣、家居服和度假系列延展。",
        risk: "花型必须避开现有品牌图案和版权图库素材。"
      },
      {
        name: "Marketplace Hero Image",
        details: "主图用干净模特图，详情页补充面料、版型、场景和细节卖点。",
        risk: "生成图必须锁定样衣颜色、领口、袖型、长度和印花位置。"
      }
    ],
    imagePrompts: [
      {
        usage: "main image",
        ratio: "4:5",
        prompt: `Professional ecommerce model photo for ${category}, natural daylight studio, clean background, realistic fabric texture, accurate garment structure, relaxed confident pose, high detail, marketplace-ready composition`,
        negative: "do not change garment color, no extra logo, no brand text, no distorted hands, no wrong buttons, no messy seams"
      },
      {
        usage: "social ad",
        ratio: "9:16",
        prompt: `TikTok-style lifestyle product shot for ${category}, casual movement, real street or bright home setting, clear full outfit, natural expression, commercial fashion photography`,
        negative: "no luxury brand reference, no celebrity face, no fake discount text, no unreadable typography"
      }
    ],
    vectorPrompt: "Create a clean seamless botanical vector repeat, editable flat colors, organized layers, no brand marks, suitable for textile digital printing and colorway expansion.",
    listingCopy: {
      title: "Women Casual Printed Top, Soft Everyday Blouse for Work, Travel and Weekend Outfits",
      bullets: [
        "Soft, easy-to-style look designed for everyday wear and travel packing.",
        "Clean fit pairs well with jeans, skirts, trousers, and layered outfits.",
        "Print direction adds visual interest without feeling too loud for daily use.",
        "Great for casual office days, weekend plans, vacation styling, and gifting.",
        "Check the size chart before ordering for the best fit."
      ],
      keywords: [
        "women printed top",
        "casual blouse",
        "everyday shirt",
        "soft blouse",
        "travel outfit",
        "work blouse",
        "weekend top",
        "botanical print",
        "summer blouse",
        "lightweight top",
        "women fashion",
        "resort wear",
        "vacation top",
        "office casual",
        "comfortable shirt",
        "loose fit top",
        "gift for women",
        "stylish blouse",
        "day to night outfit",
        "layering top",
        "printed blouse",
        "spring outfit",
        "fall outfit",
        "basic fashion top",
        "boutique style",
        "ecommerce fashion",
        "model photo prompt",
        "textile print",
        "vector pattern",
        "product image"
      ]
    },
    nextInputsNeeded: ["样衣正反面照片", "面料成分和克重", "目标平台", "成本区间", "尺码表", "颜色和库存计划"]
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

async function callResponses(payload) {
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
      input: buildDesignPrompt(payload),
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
  return JSON.parse(text);
}

async function callImageGeneration(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      mode: "demo",
      image: null,
      prompt: payload.prompt,
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
      prompt: payload.prompt,
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
    image: `data:image/png;base64,${data.data?.[0]?.b64_json || ""}`,
    prompt: payload.prompt
  };
}

function sanitizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 1200) : fallback;
}

async function saveFeedback(payload) {
  await mkdir(dataDir, { recursive: true });
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
    useCase: sanitizeText(payload.useCase),
    expectedResult: sanitizeText(payload.expectedResult),
    budget: sanitizeText(payload.budget),
    notes: sanitizeText(payload.notes),
    source: sanitizeText(payload.source, "customer-page")
  };
  await appendFile(feedbackFile, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

async function handleApi(req, res) {
  try {
    const body = await readJson(req);
    if (req.url === "/api/generate/design") {
      const result = await callResponses(body);
      sendJson(res, 200, result);
      return;
    }
    if (req.url === "/api/generate/image") {
      const result = await callImageGeneration(body);
      sendJson(res, 200, result);
      return;
    }
    if (req.url === "/api/feedback") {
      const feedback = await saveFeedback(body);
      sendJson(res, 200, { ok: true, id: feedback.id, createdAt: feedback.createdAt });
      return;
    }
    sendJson(res, 404, { error: "API route not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
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
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    res.end(content);
  } catch {
    const fallback = await readFile(join(publicDir, "customer.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
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
