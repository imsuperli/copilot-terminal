/**
 * 统一的 IPC handler 响应格式
 */
export interface HandlerResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 创建成功响应
 */
export function successResponse<T>(data?: T): HandlerResponse<T> {
  return { success: true, data };
}

/**
 * 创建错误响应
 */
export function errorResponse(error: unknown): HandlerResponse {
  const message = error instanceof Error ? error.message : String(error);

  // 开发环境下记录错误
  if (process.env.NODE_ENV === 'development') {
    console.error('[IPC Handler Error]', error);
  }

  return { success: false, error: message };
}
