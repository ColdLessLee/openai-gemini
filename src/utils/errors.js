// 定义一个 HttpError 类，用于表示 HTTP 错误
export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}