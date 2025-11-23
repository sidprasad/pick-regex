import * as vscode from 'vscode';

/**
 * Simple wrapper around VS Code's OutputChannel to provide a consistent
 * logging interface across the extension.
 */
class Logger {
        private channel: vscode.OutputChannel | undefined;
        private readonly logBuffer: string[] = [];
        private readonly maxLogLines = 500;

        initialize(context: vscode.ExtensionContext, name = 'PICK Regex Builder'): void {
                if (this.channel) {
                        return;
                }

                this.channel = vscode.window.createOutputChannel(name);
                context.subscriptions.push(this.channel);
        }

        info(message: string): void {
                this.append('INFO', message);
        }

        warn(message: string): void {
                this.append('WARN', message);
        }

        error(error: unknown, message?: string): void {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const fullMessage = message ? `${message}: ${errorMessage}` : errorMessage;
                this.append('ERROR', fullMessage);

                if (error instanceof Error && error.stack) {
                        this.append('ERROR', error.stack);
                }
        }

        dispose(): void {
                this.channel?.dispose();
                this.channel = undefined;
        }

        private append(level: string, message: string): void {
                const timestamp = new Date().toISOString();
                const formattedMessage = `[${timestamp}] [${level}] ${message}`;

                this.logBuffer.push(formattedMessage);
                if (this.logBuffer.length > this.maxLogLines) {
                        this.logBuffer.shift();
                }

                if (this.channel) {
                        this.channel.appendLine(formattedMessage);
                } else if (level === 'ERROR') {
                        console.error(formattedMessage);
                } else {
                        console.log(formattedMessage);
                }
        }

        getLogs(limit = this.maxLogLines): string {
                const start = Math.max(0, this.logBuffer.length - limit);
                return this.logBuffer.slice(start).join('\n');
        }
}

export const logger = new Logger();

export function initializeLogging(
        context: vscode.ExtensionContext,
        channelName?: string
): Logger {
        logger.initialize(context, channelName);
        return logger;
}
