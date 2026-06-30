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

function mockDesign(payload) {
  const category = payload.category || "women's fashion item";
  const market = payload.market || "US";
  const platform = payload.platform || "TikTok Shop";
  return {
    mode: "demo",
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

