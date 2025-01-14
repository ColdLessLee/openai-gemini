import { Buffer } from "node:buffer";

// 导出一个默认对象，该对象包含一个名为 fetch 的异步方法。
export default {
  async fetch (request) {
    // 如果请求方法是 OPTIONS，则处理预检请求。
    if (request.method === "OPTIONS") {
      return handleOPTIONS();
    }
    // 定义一个错误处理函数。
    const errHandler = (err) => {
      console.error(err);
      return new Response(err.message, fixCors({ status: err.status ?? 500 }));
    };
    try {
      // 从请求头中获取 Authorization 字段。
      const auth = request.headers.get("Authorization");
      // 从 Authorization 字段中提取 API 密钥。
      const apiKey = auth?.split(" ")[1];
      // 定义一个断言函数，用于检查条件是否为真，如果不为真则抛出异常。
      const assert = (success) => {
        if (!success) {
          throw new HttpError("The specified HTTP method is not allowed for the requested resource", 400);
        }
      };
      // 从请求 URL 中获取路径名。
      const { pathname } = new URL(request.url);
      console.log("request pathname:", pathname);
      // 根据路径名选择不同的处理函数。
      switch (true) {
        case pathname.endsWith("/chat/completions"):
          // 如果路径名以 /chat/completions 结尾，则处理聊天完成请求。
          assert(request.method === "POST");
          return handleCompletions(await request.json(), apiKey)
            .catch(errHandler);
        case pathname.endsWith("/embeddings"):
          // 如果路径名以 /embeddings 结尾，则处理嵌入请求。
          assert(request.method === "POST");
          return handleEmbeddings(await request.json(), apiKey)
            .catch(errHandler);
        case pathname.endsWith("/models"):
          // 如果路径名以 /models 结尾，则处理模型列表请求。
          assert(request.method === "GET");
          return handleModels(apiKey)
            .catch(errHandler);
        default:
          // 如果路径名不匹配任何已知的路径，则抛出 404 错误。
          throw new HttpError("404 Not Found", 404);
      }
    } catch (err) {
      // 捕获并处理错误。
      return errHandler(err);
    }
  }
};

// 定义一个 HttpError 类，用于表示 HTTP 错误。
class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

// 定义一个 fixCors 函数，用于向响应头中添加跨域资源共享 (CORS) 相关的头信息。
const fixCors = ({ headers, status, statusText }) => {
  headers = new Headers(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return { headers, status, statusText };
};

// 定义一个 handleOPTIONS 函数，用于处理 OPTIONS 预检请求。
const handleOPTIONS = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
    }
  });
};

// 定义 Google API 的基础 URL。
const BASE_URL = "https://generativelanguage.googleapis.com";
// 定义 Google API 的版本号。
const API_VERSION = "v1beta";

// 定义 Google API 的客户端标识。
// https://github.com/google-gemini/generative-ai-js/blob/cf223ff4a1ee5a2d944c53cddb8976136382bee6/src/requests/request.ts#L71
const API_CLIENT = "genai-js/0.21.0"; // npm view @google/generative-ai version
// 定义一个 makeHeaders 函数，用于创建请求头。
const makeHeaders = (apiKey, more) => ({
  "x-goog-api-client": API_CLIENT,
  ...(apiKey && { "x-goog-api-key": apiKey }),
  ...more
});

// 定义一个 handleModels 函数，用于处理模型列表请求。
async function handleModels (apiKey) {
  // 向 Google API 发送请求，获取模型列表。
  const response = await fetch(`${BASE_URL}/${API_VERSION}/models`, {
    headers: makeHeaders(apiKey),
  });
  let { body } = response;
  // 如果请求成功，则解析响应体并返回模型列表。
  if (response.ok) {
    const { models } = JSON.parse(await response.text());
    body = JSON.stringify({
      object: "list",
      data: models.map(({ name }) => ({
        id: name.replace("models/", ""),
        object: "model",
        created: 0,
        owned_by: "",
      })),
    }, null, "  ");
  }
  // 返回响应。
  return new Response(body, fixCors(response));
}

// 定义默认的嵌入模型。
const DEFAULT_EMBEDDINGS_MODEL = "text-embedding-004";
// 定义一个 handleEmbeddings 函数，用于处理嵌入请求。
async function handleEmbeddings (req, apiKey) {
  // 如果请求中没有指定模型，则抛出错误。
  if (typeof req.model !== "string") {
    throw new HttpError("model is not specified", 400);
  }
  // 如果请求中的输入不是数组，则将其转换为数组。
  if (!Array.isArray(req.input)) {
    req.input = [ req.input ];
  }
  let model;
  // 如果请求中指定的模型以 "models/" 开头，则使用该模型，否则使用默认的嵌入模型。
  if (req.model.startsWith("models/")) {
    model = req.model;
  } else {
    req.model = DEFAULT_EMBEDDINGS_MODEL;
    model = "models/" + req.model;
  }
  // 向 Google API 发送请求，获取嵌入。
  const response = await fetch(`${BASE_URL}/${API_VERSION}/${model}:batchEmbedContents`, {
    method: "POST",
    headers: makeHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      "requests": req.input.map(text => ({
        model,
        content: { parts: { text } },
        outputDimensionality: req.dimensions,
      }))
    })
  });
  let { body } = response;
  // 如果请求成功，则解析响应体并返回嵌入。
  if (response.ok) {
    const { embeddings } = JSON.parse(await response.text());
    body = JSON.stringify({
      object: "list",
      data: embeddings.map(({ values }, index) => ({
        object: "embedding",
        index,
        embedding: values,
      })),
      model: req.model,
    }, null, "  ");
  }
  // 返回响应。
  return new Response(body, fixCors(response));
}

// 定义默认的模型。
const DEFAULT_MODEL = "gemini-1.5-pro-latest";
// 定义一个 handleCompletions 函数，用于处理聊天完成请求。
async function handleCompletions (req, apiKey) {
  let model = DEFAULT_MODEL;
  // 根据请求中指定的模型选择合适的模型。
  switch(true) {
    case typeof req.model !== "string":
      break;
    case req.model.startsWith("models/"):
      model = req.model.substring(7);
      break;
    case req.model.startsWith("gemini-"):
    case req.model.startsWith("learnlm-"):
      model = req.model;
  }
  console.log("current using model name:", model);
  // 根据请求是否为流式请求选择不同的任务类型。
  const TASK = req.stream ? "streamGenerateContent" : "generateContent";
  // 构建请求 URL。
  let url = `${BASE_URL}/${API_VERSION}/models/${model}:${TASK}`;
  // 如果是流式请求，则在 URL 中添加 alt=sse 参数。
  if (req.stream) { url += "?alt=sse"; }
  // 向 Google API 发送请求。
  const response = await fetch(url, {
    method: "POST",
    headers: makeHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(await transformRequest(req)), // try
  });

  let body = response.body;
  // 如果请求成功，则处理响应。
  if (response.ok) {
    // 生成一个唯一的聊天完成 ID。
    let id = generateChatcmplId(); //"chatcmpl-8pMMaqXMK68B3nyDBrapTDrhkHBQK";
    // 如果是流式请求，则处理流式响应。
    if (req.stream) {
      body = response.body
        // 将响应体解码为文本流。
        .pipeThrough(new TextDecoderStream())
        // 解析流式响应。
        .pipeThrough(new TransformStream({
          transform: parseStream,
          flush: parseStreamFlush,
          buffer: "",
        }))
        // 将解析后的流式响应转换为 OpenAI 格式的流式响应。
        .pipeThrough(new TransformStream({
          transform: toOpenAiStream,
          flush: toOpenAiStreamFlush,
          streamIncludeUsage: req.stream_options?.include_usage,
          model, id, last: [],
        }))
        // 将 OpenAI 格式的流式响应编码为字节流。
        .pipeThrough(new TextEncoderStream());
    } else {
      // 如果不是流式请求，则处理非流式响应。
      body = await response.text();
      body = processCompletionsResponse(JSON.parse(body), model, id);
    }
  }
  // 返回响应。
  return new Response(body, fixCors(response));
}

// 定义危害类别的列表。
const harmCategory = [
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_CIVIC_INTEGRITY",
];
// 定义安全设置，将所有危害类别的阈值设置为 BLOCK_NONE。
const safetySettings = harmCategory.map(category => ({
  category,
  threshold: "BLOCK_NONE",
}));
// 定义字段映射，将 OpenAI API 的字段名映射到 Google API 的字段名。
const fieldsMap = {
  stop: "stopSequences",
  n: "candidateCount", // not for streaming
  max_tokens: "maxOutputTokens",
  max_completion_tokens: "maxOutputTokens",
  temperature: "temperature",
  top_p: "topP",
  top_k: "topK", // non-standard
  frequency_penalty: "frequencyPenalty",
  presence_penalty: "presencePenalty",
};
// 定义一个 transformConfig 函数，用于将 OpenAI API 的请求配置转换为 Google API 的请求配置。
const transformConfig = (req) => {
  let cfg = {};
  //if (typeof req.stop === "string") { req.stop = [req.stop]; } // no need
  // 遍历请求配置中的每个字段。
  for (let key in req) {
    // 如果字段名在字段映射中，则将其映射到 Google API 的字段名。
    const matchedKey = fieldsMap[key];
    if (matchedKey) {
      cfg[matchedKey] = req[key];
    }
  }
  // 如果请求中指定了响应格式，则根据响应格式设置 responseMimeType 和 responseSchema。
  if (req.response_format) {
    switch(req.response_format.type) {
      case "json_schema":
        cfg.responseSchema = req.response_format.json_schema?.schema;
        if (cfg.responseSchema && "enum" in cfg.responseSchema) {
          cfg.responseMimeType = "text/x.enum";
          break;
        }
        // eslint-disable-next-line no-fallthrough
      case "json_object":
        cfg.responseMimeType = "application/json";
        break;
      case "text":
        cfg.responseMimeType = "text/plain";
        break;
      default:
        throw new HttpError("Unsupported response_format.type", 400);
    }
  }
  // 返回转换后的配置。
  return cfg;
};

// 定义一个 parseImg 函数，用于解析图片 URL。
const parseImg = async (url) => {
  let mimeType, data;
  // 如果图片 URL 是 HTTP 或 HTTPS URL，则发送请求获取图片数据。
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} (${url})`);
      }
      mimeType = response.headers.get("content-type");
      data = Buffer.from(await response.arrayBuffer()).toString("base64");
    } catch (err) {
      throw new Error("Error fetching image: " + err.toString());
    }
  } else {
    // 如果图片 URL 是 data URL，则解析 data URL。
    const match = url.match(/^data:(?<mimeType>.*?)(;base64)?,(?<data>.*)$/);
    if (!match) {
      throw new Error("Invalid image data: " + url);
    }
    ({ mimeType, data } = match.groups);
  }
  // 返回图片数据。
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
};

// 定义一个 transformMsg 函数，用于将 OpenAI API 的消息转换为 Google API 的消息。
const transformMsg = async ({ role, content }) => {
  const parts = [];
  // 如果消息内容不是数组，则将其转换为数组。
  if (!Array.isArray(content)) {
    // system, user: string
    // assistant: string or null (Required unless tool_calls is specified.)
    parts.push({ text: content });
    return { role, parts };
  }
  // user:
  // An array of content parts with a defined type.
  // Supported options differ based on the model being used to generate the response.
  // Can contain text, image, or audio inputs.
  // 遍历消息内容中的每个项目。
  for (const item of content) {
    // 根据项目类型将项目添加到 parts 数组中。
    switch (item.type) {
      case "text":
        parts.push({ text: item.text });
        break;
      case "image_url":
        parts.push(await parseImg(item.image_url.url));
        break;
      case "input_audio":
        parts.push({
          inlineData: {
            mimeType: "audio/" + item.input_audio.format,
            data: item.input_audio.data,
          }
        });
        break;
      default:
        throw new TypeError(`Unknown "content" item type: "${item.type}"`);
    }
  }
  // 如果所有项目都是图片，则添加一个空的文本部分，以避免 "Unable to submit request because it must have a text parameter" 错误。
  if (content.every(item => item.type === "image_url")) {
    parts.push({ text: "" }); // to avoid "Unable to submit request because it must have a text parameter"
  }
  // 返回转换后的消息。
  return { role, parts };
};

// 定义一个 transformMessages 函数，用于将 OpenAI API 的消息列表转换为 Google API 的消息列表。
const transformMessages = async (messages) => {
  if (!messages) { return; }
  const contents = [];
  let system_instruction;
  // 遍历消息列表中的每个消息。
  for (const item of messages) {
    // 如果消息的角色是 system，则将其作为系统指令。
    if (item.role === "system") {
      delete item.role;
      system_instruction = await transformMsg(item);
    } else {
      // 如果消息的角色不是 system，则将其角色转换为 user 或 model。
      item.role = item.role === "assistant" ? "model" : "user";
      contents.push(await transformMsg(item));
    }
  }
  // 如果有系统指令且没有其他消息，则添加一个空的消息。
  if (system_instruction && contents.length === 0) {
    contents.push({ role: "model", parts: { text: " " } });
  }
  //console.info(JSON.stringify(contents, 2));
  // 返回转换后的消息列表。
  return { system_instruction, contents };
};

// 定义一个 transformRequest 函数，用于将 OpenAI API 的请求转换为 Google API 的请求。
const transformRequest = async (req) => ({
  ...await transformMessages(req.messages),
  safetySettings,
  generationConfig: transformConfig(req),
});

// 定义一个 generateChatcmplId 函数，用于生成一个唯一的聊天完成 ID。
const generateChatcmplId = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomChar = () => characters[Math.floor(Math.random() * characters.length)];
  return "chatcmpl-" + Array.from({ length: 29 }, randomChar).join("");
};

// 定义一个 reasonsMap 对象，用于将 Google API 的结束原因映射到 OpenAI API 的结束原因。
const reasonsMap = { //https://ai.google.dev/api/rest/v1/GenerateContentResponse#finishreason
  //"FINISH_REASON_UNSPECIFIED": // Default value. This value is unused.
  "STOP": "stop",
  "MAX_TOKENS": "length",
  "SAFETY": "content_filter",
  "RECITATION": "content_filter",
  //"OTHER": "OTHER",
  // :"function_call",
};
// 定义分隔符。
const SEP = "\n\n|>";
// 定义一个 transformCandidates 函数，用于将 Google API 的候选项转换为 OpenAI API 的候选项。
const transformCandidates = (key, cand) => ({
  index: cand.index || 0, // 0-index is absent in new -002 models response
  [key]: {
    role: "assistant",
    content: cand.content?.parts.map(p => p.text).join(SEP) },
  logprobs: null,
  finish_reason: reasonsMap[cand.finishReason] || cand.finishReason,
});
// 定义一个 transformCandidatesMessage 函数，用于将 Google API 的候选项转换为 OpenAI API 的消息。
const transformCandidatesMessage = transformCandidates.bind(null, "message");
// 定义一个 transformCandidatesDelta 函数，用于将 Google API 的候选项转换为 OpenAI API 的增量。
const transformCandidatesDelta = transformCandidates.bind(null, "delta");

// 定义一个 transformUsage 函数，用于将 Google API 的使用情况转换为 OpenAI API 的使用情况。
const transformUsage = (data) => ({
  completion_tokens: data.candidatesTokenCount,
  prompt_tokens: data.promptTokenCount,
  total_tokens: data.totalTokenCount
});

// 定义一个 processCompletionsResponse 函数，用于处理非流式聊天完成响应。
const processCompletionsResponse = (data, model, id) => {
  return JSON.stringify({
    id,
    choices: data.candidates.map(transformCandidatesMessage),
    created: Math.floor(Date.now()/1000),
    model,
    //system_fingerprint: "fp_69829325d0",
    object: "chat.completion",
    usage: transformUsage(data.usageMetadata),
  });
};

// 定义一个正则表达式，用于匹配响应流中的每一行。
const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
// 定义一个 parseStream 函数，用于解析流式响应。
async function parseStream (chunk, controller) {
  chunk = await chunk;
  if (!chunk) { return; }
  this.buffer += chunk;
  do {
    const match = this.buffer.match(responseLineRE);
    if (!match) { break; }
    controller.enqueue(match[1]);
    this.buffer = this.buffer.substring(match[0].length);
  } while (true); // eslint-disable-line no-constant-condition
}
// 定义一个 parseStreamFlush 函数，用于处理流式响应结束后的剩余数据。
async function parseStreamFlush (controller) {
  if (this.buffer) {
    console.error("Invalid data:", this.buffer);
    controller.enqueue(this.buffer);
  }
}

// 定义一个 transformResponseStream 函数，用于将 Google API 的流式响应转换为 OpenAI API 的流式响应。
function transformResponseStream (data, stop, first) {
  const item = transformCandidatesDelta(data.candidates[0]);
  if (stop) { item.delta = {}; } else { item.finish_reason = null; }
  if (first) { item.delta.content = ""; } else { delete item.delta.role; }
  const output = {
    id: this.id,
    choices: [item],
    created: Math.floor(Date.now()/1000),
    model: this.model,
    //system_fingerprint: "fp_69829325d0",
    object: "chat.completion.chunk",
  };
  if (data.usageMetadata && this.streamIncludeUsage) {
    output.usage = stop ? transformUsage(data.usageMetadata) : null;
  }
  return "data: " + JSON.stringify(output) + delimiter;
}
// 定义分隔符。
const delimiter = "\n\n";
// 定义一个 toOpenAiStream 函数，用于将解析后的流式响应转换为 OpenAI 格式的流式响应。
async function toOpenAiStream (chunk, controller) {
  const transform = transformResponseStream.bind(this);
  const line = await chunk;
  if (!line) { return; }
  let data;
  try {
    data = JSON.parse(line);
  } catch (err) {
    console.error(line);
    console.error(err);
    const length = this.last.length || 1; // at least 1 error msg
    const candidates = Array.from({ length }, (_, index) => ({
      finishReason: "error",
      content: { parts: [{ text: err }] },
      index,
    }));
    data = { candidates };
  }
  const cand = data.candidates[0];
  console.assert(data.candidates.length === 1, "Unexpected candidates count: %d", data.candidates.length);
  cand.index = cand.index || 0; // absent in new -002 models response
  if (!this.last[cand.index]) {
    controller.enqueue(transform(data, false, "first"));
  }
  this.last[cand.index] = data;
  if (cand.content) { // prevent empty data (e.g. when MAX_TOKENS)
    controller.enqueue(transform(data));
  }
}
// 定义一个 toOpenAiStreamFlush 函数，用于处理流式响应结束后的剩余数据。
async function toOpenAiStreamFlush (controller) {
  const transform = transformResponseStream.bind(this);
  if (this.last.length > 0) {
    for (const data of this.last) {
      controller.enqueue(transform(data, "stop"));
    }
    controller.enqueue("data: [DONE]" + delimiter);
  }
}
