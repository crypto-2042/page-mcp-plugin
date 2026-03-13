import { useEffect, useState } from 'react';
import type { PluginSettings } from '../../shared/types.js';
import type {
    AnthropicMcpPrompt as PromptInfo,
    AnthropicMcpResource as ResourceInfo,
    AnthropicMcpTool as ToolInfo,
} from '@page-mcp/protocol';
import { isDomainInList } from '../../shared/domain-match.js';

const currentDomain = window.location.hostname;

export function useWidgetVisibility(
    settings: PluginSettings,
    hasNativeChat: boolean,
    tools: ToolInfo[],
    prompts: PromptInfo[],
    resources: ResourceInfo[],
) {
    const [widgetVisible, setWidgetVisible] = useState(false);

    // Compute widget visibility
    useEffect(() => {
        const isDomainOverridden = settings.overridePageChat && isDomainInList(currentDomain, settings.overrideSites);

        if (hasNativeChat && !isDomainOverridden) {
            setWidgetVisible(false);
            return;
        }

        if (settings.alwaysInjectChat) {
            setWidgetVisible(true);
            return;
        }

        const hasResources = tools.length > 0 || prompts.length > 0 || resources.length > 0;
        if (settings.injectChatOnResources && hasResources) {
            setWidgetVisible(true);
            return;
        }

        setWidgetVisible(false);
    }, [settings, hasNativeChat, tools, prompts, resources]);

    // Handle native chat element hiding
    useEffect(() => {
        const nativeEl = document.getElementById('page-mcp-chat-widget');
        const isDomainOverridden = settings.overridePageChat && isDomainInList(currentDomain, settings.overrideSites);

        if (nativeEl) {
            nativeEl.style.display = isDomainOverridden ? 'none' : '';
        }
    }, [hasNativeChat, settings.overridePageChat, settings.overrideSites]);

    return widgetVisible;
}
