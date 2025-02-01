import { BASE_URL, API_VERSION, DEFAULT_MODEL, safetySettings, fieldsMap, SEP, responseLineRE, reasonsMap } from '../lib/constants.js';
import { makeHeaders, fixCors, generateChatcmplId, parseImg } from '../utils/helpers.js';
import { HttpError } from '../utils/errors.js';

// 处理聊天完成请求
export async function handleCompletions(req, apiKey) {
  let model = DEFAULT_MODEL;
  // 根据请求中指定的模型选择合适的模型
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
  // 根据请求是否为流式请求选择不同的任务类型
  const TASK = req.stream ? "streamGenerateContent" : "generateContent";
  // 构建请求 URL
  let url = `${BASE_URL}/${API_VERSION}/models/${model}:${TASK}`;
  // 如果是流式请求，则在 URL 中添加 alt=sse 参数
  if (req.stream) { url += "?alt=sse"; }
  // 向 Google API 发送请求
  const response = await fetch(url, {
    method: "POST",
    headers: makeHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(await transformRequest(req)),
  });

  let body = response.body;
  // 如果请求成功，则处理响应
  if (response.ok) {
    // 生成一个唯一的聊天完成 ID
    let id = generateChatcmplId();
    // 如果是流式请求，则处理流式响应
    if (req.stream) {
      body = response.body
        // 将响应体解码为文本流
        .pipeThrough(new TextDecoderStream())
        // 解析流式响应
        .pipeThrough(new TransformStream({
          transform: parseStream,
          flush: parseStreamFlush,
          buffer: "",
        }))
        // 将解析后的流式响应转换为 OpenAI 格式的流式响应
        .pipeThrough(new TransformStream({
          transform: toOpenAiStream,
          flush: toOpenAiStreamFlush,
          streamIncludeUsage: req.stream_options?.include_usage,
          model, id, last: [],
        }))
        // 将 OpenAI 格式的流式响应编码为字节流
        .pipeThrough(new TextEncoderStream());
    } else {
      // 如果不是流式请求，则处理非流式响应
      body = await response.text();
      body = processCompletionsResponse(JSON.parse(body), model, id);
    }
  }
  // 返回响应
  return new Response(body, fixCors(response));
}

// 转换配置
function transformConfig(req) {
  let cfg = {};
  // 遍历请求配置中的每个字段
  for (let key in req) {
    // 如果字段名在字段映射中，则将其映射到 Google API 的字段名
    const matchedKey = fieldsMap[key];
    if (matchedKey) {
      cfg[matchedKey] = req[key];
    }
  }
  // 如果请求中指定了响应格式，则根据响应格式设置 responseMimeType 和 responseSchema
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
  // 返回转换后的配置
  return cfg;
}

// 转换消息
async function transformMsg({ role, content }) {
  const parts = [];
  // 如果消息内容不是数组，则将其转换为数组
  if (!Array.isArray(content)) {
    // system, user: string
    // assistant: string or null (Required unless tool_calls is specified.)
    parts.push({ text: content });
    return { role, parts };
  }
  // 遍历消息内容中的每个项目
  for (const item of content) {
    // 根据项目类型将项目添加到 parts 数组中
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
  // 如果所有项目都是图片，则添加一个空的文本部分
  if (content.every(item => item.type === "image_url")) {
    parts.push({ text: "" }); // 避免 "Unable to submit request because it must have a text parameter" 错误
  }
  // 返回转换后的消息
  return { role, parts };
}

// 转换消息列表
async function transformMessages(messages) {
  if (!messages) { return; }
  const contents = [];
  let system_instruction;
  // 遍历消息列表中的每个消息
  for (const item of messages) {
    // 如果消息的角色是 system，则将其作为系统指令
    if (item.role === "system") {
      delete item.role;
      system_instruction = await transformMsg(item);
    } else {
      // 如果消息的角色不是 system，则将其角色转换为 user 或 model
      item.role = item.role === "assistant" ? "model" : "user";
      contents.push(await transformMsg(item));
    }
  }
  // 如果有系统指令且没有其他消息，则添加一个空的消息
  if (system_instruction && contents.length === 0) {
    contents.push({ role: "model", parts: { text: " " } });
  }
  // 返回转换后的消息列表
  return { system_instruction, contents };
}

// 转换请求
async function transformRequest(req) {
  return {
    ...await transformMessages(req.messages),
    safetySettings,
    generationConfig: transformConfig(req),
  };
}

// 转换候选项
function transformCandidates(key, cand) {
  return {
    index: cand.index || 0,
    [key]: {
      role: "assistant",
      content: cand.content?.parts.map(p => p.text).join(SEP) },
    logprobs: null,
    finish_reason: reasonsMap[cand.finishReason] || cand.finishReason,
  };
}

// 转换候选项消息
const transformCandidatesMessage = transformCandidates.bind(null, "message");
// 转换候选项增量
const transformCandidatesDelta = transformCandidates.bind(null, "delta");

// 转换使用情况
function transformUsage(data) {
  return {
    completion_tokens: data.candidatesTokenCount,
    prompt_tokens: data.promptTokenCount,
    total_tokens: data.totalTokenCount
  };
}

// 处理非流式聊天完成响应
function processCompletionsResponse(data, model, id) {
  return JSON.stringify({
    id,
    choices: data.candidates.map(transformCandidatesMessage),
    created: Math.floor(Date.now()/1000),
    model,
    object: "chat.completion",
    usage: transformUsage(data.usageMetadata),
  });
}

// 解析流式响应
async function parseStream(chunk, controller) {
  chunk = await chunk;
  if (!chunk) { return; }
  this.buffer += chunk;
  do {
    const match = this.buffer.match(responseLineRE);
    if (!match) { break; }
    controller.enqueue(match[1]);
    this.buffer = this.buffer.substring(match[0].length);
  } while (true);
}

// 处理流式响应结束后的剩余数据
async function parseStreamFlush(controller) {
  if (this.buffer) {
    console.error("Invalid data:", this.buffer);
    controller.enqueue(this.buffer);
  }
}

// 转换响应流
function transformResponseStream(data, stop, first) {
  const item = transformCandidatesDelta(data.candidates[0]);
  if (stop) { item.delta = {}; } else { item.finish_reason = null; }
  if (first) { item.delta.content = ""; } else { delete item.delta.role; }
  const output = {
    id: this.id,
    choices: [item],
    created: Math.floor(Date.now()/1000),
    model: this.model,
    object: "chat.completion.chunk",
  };
  if (data.usageMetadata && this.streamIncludeUsage) {
    output.usage = stop ? transformUsage(data.usageMetadata) : null;
  }
  return "data: " + JSON.stringify(output) + "\n\n";
}

// 处理流式响应
async function toOpenAiStream(chunk, controller) {
  chunk = await chunk;
  if (!chunk) { return; }
  try {
    const data = JSON.parse(chunk);
    if (!data.candidates?.length) { return; }
    const first = this.last.length === 0;
    const stop = data.candidates[0].finishReason;
    const text = data.candidates[0].content?.parts[0]?.text;
    if (text) { this.last.push(text); }
    controller.enqueue(transformResponseStream.call(this, data, stop, first));
  } catch (err) {
    console.error("Error parsing stream:", err);
    controller.error(err);
  }
}

// 处理流式响应结束
async function toOpenAiStreamFlush(controller) {
  controller.enqueue("data: [DONE]\n\n");
}