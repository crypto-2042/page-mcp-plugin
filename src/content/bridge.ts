// ============================================================
// Page MCP Plugin — Bridge Script (MAIN WORLD)
// 
// This script runs in the page's main JavaScript context.
// It bridges communication between the extension's content script
// (isolated world) and the page's PageMcpHost instances.
// ============================================================

import Sval from 'sval';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface BridgeWindow extends Window {
    __pageMcpHosts?: Array<{
        getTransport(): {
            request(method: string, params?: Record<string, unknown>): Promise<{ id: string; result?: unknown; error?: { code: number; message: string } }>;
        };
    }>;
}

(function () {
    const w = window as BridgeWindow;
    const BRIDGE_CHANNEL = 'page-mcp-ext-bridge';
    let bridgeReady = false;

    function setupBridge(hostTransport: ReturnType<NonNullable<BridgeWindow['__pageMcpHosts']>[0]['getTransport']>) {
        if (bridgeReady) return;
        bridgeReady = true;

        console.log('[Page MCP Bridge] Bridge connected to host transport');

        // Listen for RPC requests from the extension content script
        window.addEventListener('message', function (event: MessageEvent) {
            const data = event.data;
            if (!data || data.channel !== BRIDGE_CHANNEL) return;
            if (data.type === 'bridge:ping') {
                if (bridgeReady) {
                    window.postMessage({
                        channel: BRIDGE_CHANNEL,
                        type: 'bridge:ready',
                        payload: {}
                    }, '*');
                }
                return;
            }
            if (data.type !== 'rpc:request') return;

            const request = data.payload;
            // Forward request through the host's internal transport
            hostTransport.request(request.method, request.params)
                .then(function (response: any) {
                    window.postMessage({
                        channel: BRIDGE_CHANNEL,
                        type: 'rpc:response',
                        payload: { id: request.id, result: response.result, error: response.error }
                    }, '*');
                })
                .catch(function (err: any) {
                    window.postMessage({
                        channel: BRIDGE_CHANNEL,
                        type: 'rpc:response',
                        payload: { id: request.id, error: { code: -32603, message: err.message || 'Bridge error' } }
                    }, '*');
                });
        });

        // Notify content script that bridge is ready
        window.postMessage({
            channel: BRIDGE_CHANNEL,
            type: 'bridge:ready',
            payload: {}
        }, '*');
    }

    function tryConnectHost(): boolean {
        if (bridgeReady) return true;
        if (w.__pageMcpHosts && w.__pageMcpHosts.length > 0) {
            const host = w.__pageMcpHosts[0];
            console.log('[Page MCP Bridge] Found host in __pageMcpHosts, connecting...');
            setupBridge(host.getTransport());
            return true;
        }
        return false;
    }

    // Check if hosts are already registered
    tryConnectHost();

    // Also listen for future host registrations via custom event
    window.addEventListener('page-mcp:host-ready', function (e: Event) {
        const detail = (e as CustomEvent).detail || {};
        if (detail.transport) {
            console.log('[Page MCP Bridge] Received host-ready event with transport');
            setupBridge(detail.transport);
        } else {
            console.log('[Page MCP Bridge] Received host-ready event, checking __pageMcpHosts...');
            tryConnectHost();
        }
    });

    // Fallback: poll for host registration in case the event was missed
    // This handles the race condition where host.start() fires the event
    // before the bridge script's event listener is registered.
    if (!bridgeReady) {
        let pollCount = 0;
        const maxPolls = 20; // 20 × 500ms = 10 seconds max
        const pollInterval = setInterval(function () {
            pollCount++;
            if (tryConnectHost() || pollCount >= maxPolls) {
                clearInterval(pollInterval);
                if (!bridgeReady) {
                    console.log('[Page MCP Bridge] No host found after polling, giving up');
                }
            }
        }, 500);
    }

    // ----------------------------------------------------------------
    // Remote Tool Execution (independent of native Host)
    //
    // Listens for `tool:execute` messages from the content script,
    // evaluates the tool's execute string in the MAIN world, and
    // returns the result. This allows remote-installed tools to run
    // JavaScript in the page context (e.g. DOM operations).
    //
    // Execute string format: `(args) => { ... return result; }`
    // ----------------------------------------------------------------
    window.addEventListener('message', function (event: MessageEvent) {
        const data = event.data;
        if (!data || data.channel !== BRIDGE_CHANNEL || data.type !== 'tool:execute') return;

        const { id, executeStr, args } = data.payload || {};
        if (!id || typeof executeStr !== 'string') return;

        (async function () {
            try {
                // Compile the execute string into a callable function.
                // Expected format: `(args) => { ... }` or `async (args) => { ... }`
                
                // Use sval AST interpreter to evaluate the string safely bypassing CSP
                const interpreter = new Sval({ sandBox: false, ecmaVer: 2019 });
                interpreter.import('args', args || {});
                interpreter.run(`
                    const __fn = (${executeStr});
                    exports.res = __fn(args);
                `);
                
                const result = await interpreter.exports.res;
                window.postMessage({
                    channel: BRIDGE_CHANNEL,
                    type: 'tool:execute:result',
                    payload: { id, result }
                }, '*');
            } catch (err: any) {
                window.postMessage({
                    channel: BRIDGE_CHANNEL,
                    type: 'tool:execute:result',
                    payload: { id, error: err.message || String(err) }
                }, '*');
            }
        })();
    });

    console.log('[Page MCP Bridge] Bridge script loaded, waiting for host...');
})();
