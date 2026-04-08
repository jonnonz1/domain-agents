export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, meta?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: "info", context: this.context, message, ...meta }));
  }

  error(message: string, error?: Error) {
    console.error(JSON.stringify({ level: "error", context: this.context, message, stack: error?.stack }));
  }

  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: "warn", context: this.context, message, ...meta }));
  }
}
