import { BASE_URL, API_VERSION } from '../lib/constants.js';
import { makeHeaders, fixCors } from '../utils/helpers.js';

// 处理模型列表请求
export async function handleModels(apiKey) {
  // 向 Google API 发送请求，获取模型列表
  const response = await fetch(`${BASE_URL}/${API_VERSION}/models`, {
    headers: makeHeaders(apiKey),
  });
  let { body } = response;
  // 如果请求成功，则解析响应体并返回模型列表
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
  // 返回响应
  return new Response(body, fixCors(response));
}