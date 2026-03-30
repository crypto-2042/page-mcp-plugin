// ============================================================
// Page MCP Plugin — Styles (Dynamic CSS Variables + Static Base)
// ============================================================
// Static CSS rules are in styles-base.css (with full IDE support).
// This module generates only the dynamic CSS custom properties
// based on theme and accent color, then concatenates with the
// static CSS imported as a raw string.

import staticCss from './styles-base.css?raw';

type Theme = 'dark' | 'light' | 'auto';

function generateCssVariables(theme: Theme, accentColor: string): string {
    const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

    const themeVars = isDark ? `
        --pmcp-bg-primary: radial-gradient(circle at top left, rgba(22, 18, 36, 0.85), rgba(13, 10, 22, 0.85) 50%, rgba(6, 4, 11, 0.85) 100%);
        --pmcp-bg-secondary: rgba(255, 255, 255, 0.025);
        --pmcp-bg-glass: rgba(255, 255, 255, 0.035);
        --pmcp-bg-glass-hover: rgba(255, 255, 255, 0.07);
        --pmcp-bg-input: rgba(0, 0, 0, 0.25);
        --pmcp-bg-user: ${accentColor};
        --pmcp-bg-ai: rgba(255, 255, 255, 0.02);
        --pmcp-bg-tool: rgba(255, 255, 255, 0.04);
        --pmcp-bg-sidebar: rgba(13, 10, 22, 0.75);
        --pmcp-border: rgba(255, 255, 255, 0.08);
        --pmcp-border-light: rgba(255, 255, 255, 0.04);
        --pmcp-border-focus: ${accentColor};
        --pmcp-text: rgba(255, 255, 255, 0.95);
        --pmcp-text-secondary: rgba(255, 255, 255, 0.70);
        --pmcp-text-muted: rgba(255, 255, 255, 0.45);
        --pmcp-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.60);
        --pmcp-shadow-fab: 0 12px 28px rgba(0, 0, 0, 0.55), 0 0 45px ${accentColor}40;
        --pmcp-glow: 0 0 28px ${accentColor}30;
    ` : `
        --pmcp-bg-primary: radial-gradient(circle at top left, rgba(252, 252, 253, 0.85), rgba(242, 243, 247, 0.85) 50%, rgba(232, 234, 242, 0.85) 100%);
        --pmcp-bg-secondary: rgba(255, 255, 255, 0.55);
        --pmcp-bg-glass: rgba(255, 255, 255, 0.65);
        --pmcp-bg-glass-hover: rgba(255, 255, 255, 0.95);
        --pmcp-bg-input: rgba(255, 255, 255, 0.85);
        --pmcp-bg-user: ${accentColor};
        --pmcp-bg-ai: rgba(255, 255, 255, 0.6);
        --pmcp-bg-tool: rgba(255, 255, 255, 0.8);
        --pmcp-bg-sidebar: rgba(242, 243, 247, 0.85);
        --pmcp-border: rgba(0, 0, 0, 0.08);
        --pmcp-border-light: rgba(0, 0, 0, 0.04);
        --pmcp-border-focus: ${accentColor};
        --pmcp-text: rgba(15, 20, 25, 0.95);
        --pmcp-text-secondary: rgba(15, 20, 25, 0.65);
        --pmcp-text-muted: rgba(15, 20, 25, 0.45);
        --pmcp-shadow: 0 16px 32px -8px rgba(0, 0, 0, 0.08);
        --pmcp-shadow-fab: 0 8px 32px rgba(0, 0, 0, 0.15), 0 0 35px ${accentColor}25;
        --pmcp-glow: 0 0 24px ${accentColor}20;
    `;

    return `
        :host {
            --pmcp-accent: ${accentColor};
            --pmcp-accent-hover: ${accentColor}dd;
            --pmcp-accent-ring: ${accentColor}22;
            --pmcp-radius-sm: 12px;
            --pmcp-radius-md: 18px;
            --pmcp-radius-lg: 28px;
            --pmcp-radius-full: 50%;
            --pmcp-blur: 48px;
            --pmcp-blur-heavy: 80px;
            --pmcp-transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            --pmcp-transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            --pmcp-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            ${themeVars}

            all: initial;
            font-family: var(--pmcp-font);
            font-size: 14px;
            color: var(--pmcp-text);
            line-height: 1.5;
        }
    `;
}

export function generatePluginStyles(theme: Theme, accentColor: string): string {
    return generateCssVariables(theme, accentColor) + '\n' + staticCss;
}
