import { handleOPTIONS } from './utils/helpers.js';
import { handleModels } from './handlers/models.js';
import { handleEmbeddings } from './handlers/embeddings.js';
import { handleCompletions } from './handlers/completions.js';
import { HttpError } from './utils/errors.js';

// 导出一个默认对象，该对象包含一个名为 fetch 的异步方法
export default {
  async fetch(request) {
    // 如果请求方法是 OPTIONS，则处理预检请求
    if (request.method === "OPTIONS") {
      return handleOPTIONS();
    }
    // 定义一个错误处理函数
    const errHandler = (err) => {
      console.error(err);
      return new Response(err.message, { status: err.status ?? 500 });
    };
    try {
      // 从请求头中获取 Authorization 字段
      const auth = request.headers.get("Authorization");
      // 从 Authorization 字段中提取 API 密钥
      const apiKey = auth?.split(" ")[1];
      // 定义一个断言函数，用于检查条件是否为真，如果不为真则抛出异常
      const assert = (success) => {
        if (!success) {
          throw new HttpError("The specified HTTP method is not allowed for the requested resource", 400);
        }
      };
      // 从请求 URL 中获取路径名
      const { pathname } = new URL(request.url);
      console.log("request pathname:", pathname);
      // 根据路径名选择不同的处理函数
      switch (true) {
        case pathname.endsWith("/chat/completions"):
          // 如果路径名以 /chat/completions 结尾，则处理聊天完成请求
          assert(request.method === "POST");
          return handleCompletions(await request.json(), apiKey)
            .catch(errHandler);
        case pathname.endsWith("/embeddings"):
          // 如果路径名以 /embeddings 结尾，则处理嵌入请求
          assert(request.method === "POST");
          return handleEmbeddings(await request.json(), apiKey)
            .catch(errHandler);
        case pathname.endsWith("/models"):
          // 如果路径名以 /models 结尾，则处理模型列表请求
          assert(request.method === "GET");
          return handleModels(apiKey)
            .catch(errHandler);
        default:
          // 如果路径名不匹配任何已知的路径，则抛出 404 错误
          throw new HttpError("404 Not Found", 404);
      }
    } catch (err) {
      // 捕获并处理错误
      return errHandler(err);
    }
  }
};
