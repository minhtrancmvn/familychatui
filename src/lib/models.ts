import type { ModelInfo } from "./types";

const OPENAI = "/icons/models/openai.svg";
const DEEPSEEK = "/icons/models/deepseek.svg";

/**
 * Prototype catalog. Ids are the real ids from 9router's /v1/models on the owner's machine (2026-11-14).
 * Names, descriptions and tags are placeholders; the backend will merge this with live /v1/models data.
 * `search` and `vision` mirror `capabilities` from /v1/models on 2026-11-14. The server re-reads the live values
 * before each reply, so these only drive the UI (search badge, image warning).
 * Image models (`image: true`) aren't listed in /v1/models; 9router serves them on /v1/images/generations.
 * Logos: SVG Logos by Gil Barbara (CC0), fetched with the taste skill's icons.mjs.
 */
export const MODELS: ModelInfo[] = [
  {
    id: "9r-combo",
    search: true,
    vision: true,
    name: "Auto",
    description: {
      en: "Uses your 9router combo and switches to a backup model automatically if one is busy.",
      vi: "Dùng combo của 9router, tự chuyển sang mô hình dự phòng khi một mô hình bận.",
    },
    auto: true,
    initials: "Au",
    color: "#ff5500",
    tags: ["Auto"],
    via: "9router combo",
  },
  {
    id: "cx/gpt-6.1-sol",
    search: true,
    vision: true,
    name: "GPT-6.1 Sol",
    description: {
      en: "Strong all-rounder for writing, questions and code.",
      vi: "Giỏi toàn diện: viết, hỏi đáp và lập trình.",
    },
    logo: OPENAI,
    initials: "GS",
    color: "#0f8f7e",
    tags: ["Reasoning"],
    via: "ChatGPT (Codex)",
  },
  {
    id: "cx/gpt-6.1-terra",
    search: true,
    vision: true,
    name: "GPT-6.1 Terra",
    description: {
      en: "Another GPT-6.1 variant for everyday chat.",
      vi: "Một phiên bản GPT-6.1 khác cho trò chuyện hằng ngày.",
    },
    logo: OPENAI,
    initials: "GT",
    color: "#0b7466",
    tags: [],
    via: "ChatGPT (Codex)",
  },
  {
    id: "cx/gpt-6-luna[1m]",
    search: true,
    vision: true,
    name: "GPT-6 Luna",
    description: {
      en: "Built for very long documents and conversations.",
      vi: "Dành cho tài liệu và cuộc trò chuyện rất dài.",
    },
    logo: OPENAI,
    initials: "GL",
    color: "#127a6b",
    tags: ["Long context"],
    via: "ChatGPT (Codex)",
  },
  {
    // 9router's newest Codex image model on 2026-11-15 (about 10 s per picture; needs ChatGPT Plus accounts).
    id: "cx/gpt-image-2.6-flare",
    image: true,
    search: false,
    vision: true,
    name: "GPT Image",
    description: {
      en: "Makes pictures from your description. Attach a photo to change it. In the same chat, your next message changes the picture it just made.",
      vi: "Vẽ ảnh theo mô tả của bạn. Gửi kèm ảnh để chỉnh sửa ảnh đó. Trong cùng cuộc trò chuyện, tin nhắn ngay sau sẽ sửa ảnh vừa vẽ.",
    },
    logo: OPENAI,
    initials: "GI",
    color: "#0f8f7e",
    tags: ["Image"],
    via: "ChatGPT (Codex)",
  },
  {
    id: "ds/deepseek-v4-pro",
    search: false,
    vision: false,
    name: "DeepSeek V4 Pro",
    description: { en: "Careful, detailed answers.", vi: "Trả lời cẩn thận, chi tiết." },
    logo: DEEPSEEK,
    initials: "DP",
    color: "#4338ca",
    tags: ["Reasoning"],
    via: "DeepSeek API",
  },
  {
    id: "ds/deepseek-flash",
    search: false,
    vision: true,
    name: "DeepSeek Flash",
    description: { en: "Fast and light.", vi: "Nhanh và nhẹ." },
    logo: DEEPSEEK,
    initials: "DF",
    color: "#4f46e5",
    tags: ["Fast"],
    via: "DeepSeek API",
  },
  {
    id: "ds/deepseek-v4-flash-vision-exp",
    search: false,
    vision: true,
    name: "DeepSeek Vision",
    description: {
      en: "Can look at photos and screenshots you attach.",
      vi: "Xem được ảnh và ảnh chụp màn hình bạn gửi.",
    },
    logo: DEEPSEEK,
    initials: "DV",
    color: "#5b50e8",
    tags: ["Vision"],
    via: "DeepSeek API",
  },
  {
    id: "hive/zai-org/glm-5.3-flash",
    search: false,
    vision: true,
    name: "GLM 5.3 Flash",
    description: { en: "Fast general-purpose model.", vi: "Mô hình đa năng, nhanh." },
    initials: "GM",
    color: "#2563eb",
    tags: ["Fast"],
    via: "Hive",
  },
];

export const DEFAULT_MODEL_ID = "9r-combo";

/** Hidden from the family until turned on in Settings. */
export const DEFAULT_HIDDEN_MODEL_IDS = [
  "cx/gpt-6.1-terra",
  "cx/gpt-6-luna[1m]",
  "ds/deepseek-flash",
  "hive/zai-org/glm-5.3-flash",
];

const byId = new Map(MODELS.map((m) => [m.id, m]));

export function hasModel(id: string): boolean {
  return byId.has(id);
}

/** Falls back to the first model so a stale id never crashes the UI. */
export function getModel(id: string): ModelInfo {
  return byId.get(id) ?? MODELS[0];
}
