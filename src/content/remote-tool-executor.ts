// ============================================================
// Page MCP Plugin — Remote Tool Executor (Content Script side)
//
// Sends remote tool execute strings to the MAIN world bridge
// for evaluation and returns the result.
// ============================================================

import { PM_CHANNEL } from '../shared/constants.js';

const BRIDGE_CHANNEL = PM_CHANNEL + '-ext-bridge';

let callIdCounter = 0;

/**
 * Execute a remote tool's function string in the page's MAIN world.
 */
export function executeRemoteToolInPage(
    executeStr: string,
    args: Record<string, unknown>,
    timeoutMs = 30000
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const id = `rtool_${Date.now()}_${++callIdCounter}`;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const onMessage = (event: MessageEvent) => {
            const data = event.data;
            if (
                !data ||
                data.channel !== BRIDGE_CHANNEL ||
                data.type !== 'tool:execute:result' ||
                data.payload?.id !== id
            ) {
                return;
            }
            window.removeEventListener('message', onMessage);
            if (timer) clearTimeout(timer);

            if (data.payload.error) {
                reject(new Error(data.payload.error));
            } else {
                resolve(data.payload.result);
            }
        };

        window.addEventListener('message', onMessage);

        timer = setTimeout(() => {
            window.removeEventListener('message', onMessage);
            reject(new Error(`Remote tool execution timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        window.postMessage(
            {
                channel: BRIDGE_CHANNEL,
                type: 'tool:execute',
                payload: { id, executeStr, args },
            },
            '*'
        );
    });
}
