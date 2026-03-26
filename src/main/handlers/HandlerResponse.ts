/**
 * 统一的 IPC handler 响应格式
 */
export interface HandlerResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

/**
 * 创建成功响应
 */
export function successResponse<T>(data?: T): HandlerResponse<T> {
  return { success: true, data };
}

interface IPCErrorWithCode extends Error {
  ipcErrorCode?: string;
}

/**
 * 创建错误响应
 */
export function errorResponse(error: unknown): HandlerResponse {
  const message = error instanceof Error ? error.message : String(error);
  const errorCode = error instanceof Error && typeof (error as IPCErrorWithCode).ipcErrorCode === 'string'
    ? (error as IPCErrorWithCode).ipcErrorCode
    : undefined;

  // 开发环境下记录错误
  if (process.env.NODE_ENV === 'development') {
    console.error('[IPC Handler Error]', error);
  }

  return errorCode
    ? { success: false, error: message, errorCode }
    : { success: false, error: message };
}
