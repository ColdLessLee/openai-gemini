import { BASE_URL, API_VERSION, DEFAULT_EMBEDDINGS_MODEL } from '../lib/constants.js';
import { makeHeaders, fixCors } from '../utils/helpers.js';
import { HttpError } from '../utils/errors.js';

// 处理嵌入请求
export async function handleEmbeddings(req, apiKey) {
  // 如果请求中没有指定模型，则抛出错误
  if (typeof req.model !== "string") {
    throw new HttpError("model is not specified", 400);
  }
  // 如果请求中的输入不是数组，则将其转换为数组
  if (!Array.isArray(req.input)) {
    req.input = [ req.input ];
  }
  let model;
  // 如果请求中指定的模型以 "models/" 开头，则使用该模型，否则使用默认的嵌入模型
  if (req.model.startsWith("models/")) {
    model = req.model;
  } else {
    req.model = DEFAULT_EMBEDDINGS_MODEL;
    model = "models/" + req.model;
  }
  // 向 Google API 发送请求，获取嵌入
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
  // 如果请求成功，则解析响应体并返回嵌入
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
  // 返回响应
  return new Response(body, fixCors(response));
}