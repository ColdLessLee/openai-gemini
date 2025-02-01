// Google API 相关常量
export const BASE_URL = "https://generativelanguage.googleapis.com";
export const API_VERSION = "v1beta";
export const API_CLIENT = "genai-js/0.21.0";

// 默认模型常量
export const DEFAULT_MODEL = "gemini-1.5-pro-latest";
export const DEFAULT_EMBEDDINGS_MODEL = "text-embedding-004";

// 安全设置相关常量
export const harmCategory = [
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_CIVIC_INTEGRITY",
];

export const safetySettings = harmCategory.map(category => ({
  category,
  threshold: "BLOCK_NONE",
}));

// 字段映射
export const fieldsMap = {
  stop: "stopSequences",
  n: "candidateCount",
  max_tokens: "maxOutputTokens",
  max_completion_tokens: "maxOutputTokens",
  temperature: "temperature",
  top_p: "topP",
  top_k: "topK",
  frequency_penalty: "frequencyPenalty",
  presence_penalty: "presencePenalty",
};

// 响应流相关常量
export const SEP = "\n\n|>";
export const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;

// 结束原因映射
export const reasonsMap = {
  "STOP": "stop",
  "MAX_TOKENS": "length",
  "SAFETY": "content_filter",
  "RECITATION": "content_filter",
};