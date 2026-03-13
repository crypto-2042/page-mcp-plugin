import type { ToolCallInfo } from '../shared/types.js';

export function getToolCallResultPayload(call: ToolCallInfo): unknown {
    if (call.status === 'error') {
        return { error: call.error ?? 'Unknown tool error' };
    }

    return call.result ?? null;
}
