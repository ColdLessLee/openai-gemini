// 导入位于 "../src/worker.mjs" 的 worker 模块。
// worker 模块应该包含处理请求的逻辑。
import worker from "../src/worker.mjs";

// 导出 worker 模块的 fetch 方法作为默认导出。
// 这使得其他模块可以使用 `import handler from './handler.mjs'` 导入并使用此 fetch 方法。
// fetch 方法通常用于处理 HTTP 请求。
export default worker.fetch;

// 导出一个名为 config 的配置对象。
export const config = {
  // 指定运行时环境为 "edge"。
  // "edge" 通常指的是边缘计算环境，例如 Vercel Edge Functions 或 Cloudflare Workers。
  runtime: "edge", 
  // 指定此函数可以部署的区域。
  // Available languages and regions for Google AI Studio and Gemini API
  // https://ai.google.dev/gemini-api/docs/available-regions#available_regions
  // Vercel Edge Network Regions
  // https://vercel.com/docs/edge-network/regions#region-list
  regions: [
    "arn1", // 斯德哥尔摩 (arn1)
    "bom1", // 孟买 (bom1)
    "cdg1", // 巴黎 (cdg1)
    "cle1", // 克利夫兰 (cle1)
    "cpt1", // 开普敦 (cpt1)
    "dub1", // 都柏林 (dub1)
    "fra1", // 法兰克福 (fra1)
    "gru1", // 圣保罗 (gru1)
    //"hkg1", // 香港 (hkg1) - 注释掉的区域
    "hnd1", // 东京 (hnd1)
    "iad1", // 华盛顿特区 (iad1)
    "icn1", // 首尔 (icn1)
    "kix1", // 大阪 (kix1)
    "pdx1", // 波特兰 (pdx1)
    "sfo1", // 旧金山 (sfo1)
    "sin1", // 新加坡 (sin1)
    "syd1", // 悉尼 (syd1)
  ],
};
