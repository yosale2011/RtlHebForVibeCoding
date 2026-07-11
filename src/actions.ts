// Local-only diagnostics. This project deliberately sends no telemetry.
export type InitOptions = {
    clientVersion?: string;
    extensionVersion?: string;
    channel?: string;
};

export function init(_opts?: InitOptions): void {}

export function action(name: string, props?: Record<string, string>): void {
    console.log('[RTL Hebrew]', name, props ?? '');
}

export function error(err: unknown, props?: Record<string, string>): void {
    const exception = err instanceof Error ? err : new Error(String(err));
    console.error('[RTL Hebrew]', exception.message, props ?? '');
}

export async function dispose(): Promise<void> {}
