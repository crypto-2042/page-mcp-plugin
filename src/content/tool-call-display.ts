import type { ToolCallInfo } from '../shared/types.js';

export function getToolCallResultPayload(call: ToolCallInfo): unknown {
    if (call.status === 'error') {
        if (call.result !== undefined) {
            return call.result;
        }
        return { error: call.error ?? 'Unknown tool error' };
    }

    return call.result ?? null;
}
