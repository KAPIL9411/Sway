/**
 * Structured logging utility for production-ready observability
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
  userId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

/**
 * Create a structured log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context && { context })
  };
}

/**
 * Log a message with structured context
 */
export function log(
  level: LogLevel,
  message: string,
  context?: LogContext
): void {
  const entry = createLogEntry(level, message, context);
  
  // Use appropriate console method
  const consoleFn = console[level] || console.log;
  consoleFn(JSON.stringify(entry));
}

/**
 * Convenience methods for each log level
 */
export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};

/**
 * Log API request/response
 */
export function logRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: string,
  requestId?: string
): void {
  logger.info('API Request', {
    method,
    path,
    statusCode,
    duration,
    userId,
    requestId
  });
}

/**
 * Log error with full context
 */
export function logError(
  message: string,
  error: Error,
  context?: Omit<LogContext, 'error'>
): void {
  logger.error(message, {
    ...context,
    error: {
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    }
  });
}

/**
 * Create a scoped logger with default context
 */
export function createLogger(defaultContext: LogContext) {
  return {
    debug: (message: string, context?: LogContext) =>
      log('debug', message, { ...defaultContext, ...context }),
    info: (message: string, context?: LogContext) =>
      log('info', message, { ...defaultContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      log('warn', message, { ...defaultContext, ...context }),
    error: (message: string, context?: LogContext) =>
      log('error', message, { ...defaultContext, ...context })
  };
}
