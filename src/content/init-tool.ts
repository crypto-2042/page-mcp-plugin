import { executeRemoteToolInPage } from './remote-tool-executor.js';

export type InitTool = {
    name: string;
    path?: string;
    [key: string]: unknown;
};

type InitRunState = {
    executedPageKeys: Set<string>;
};

type RankedInitTool = {
    tool: InitTool;
    explicitPath: boolean;
    pathLength: number;
    literalCount: number;
    order: number;
};

const LITERAL_METACHAR_ESCAPES = new Set([
    '.',
    '^',
    '$',
    '*',
    '+',
    '?',
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    '|',
    '/',
    '-',
    '\\',
]);

const SEMANTIC_ESCAPES = new Set([
    'd',
    'D',
    'w',
    'W',
    's',
    'S',
    'b',
    'B',
    'n',
    'r',
    't',
    'f',
    'v',
    '0',
    'c',
    'p',
    'P',
    'k',
]);

const IDENTIFYING_ESCAPES = new Set([
    'a',
    'e',
    'g',
    'h',
    'i',
    'j',
    'l',
    'm',
    'o',
    'q',
    'u',
    'x',
    'y',
    'z',
    'A',
    'E',
    'G',
    'H',
    'I',
    'J',
    'L',
    'M',
    'O',
    'Q',
    'U',
    'X',
    'Y',
    'Z',
]);

function isHexDigit(char: string | undefined): boolean {
    return typeof char === 'string' && /^[0-9a-fA-F]$/.test(char);
}

function countUnicodeCodePointEscape(pattern: string, index: number): { count: number; nextIndex: number } {
    if (
        isHexDigit(pattern[index + 2]) &&
        isHexDigit(pattern[index + 3]) &&
        isHexDigit(pattern[index + 4]) &&
        isHexDigit(pattern[index + 5])
    ) {
        return { count: 1, nextIndex: index + 5 };
    }

    return { count: 1, nextIndex: index + 1 };
}

function findClosingDelimiter(pattern: string, startIndex: number, closingDelimiter: string): number | null {
    const closeIndex = pattern.indexOf(closingDelimiter, startIndex);
    return closeIndex === -1 ? null : closeIndex;
}

function countEscapedLiteral(pattern: string, index: number): { count: number; nextIndex: number } {
    const next = pattern[index + 1];

    if (next == null) {
        return { count: 0, nextIndex: index };
    }

    if (LITERAL_METACHAR_ESCAPES.has(next)) {
        return { count: 1, nextIndex: index + 1 };
    }

    if (next === 'x') {
        if (isHexDigit(pattern[index + 2]) && isHexDigit(pattern[index + 3])) {
            return { count: 1, nextIndex: index + 3 };
        }
        return { count: 1, nextIndex: index + 1 };
    }

    if (next === 'u') {
        if (pattern[index + 2] === '{') {
            return { count: 1, nextIndex: index + 1 };
        }
        return countUnicodeCodePointEscape(pattern, index);
    }

    if (next === 'p' || next === 'P') {
        if (pattern[index + 2] === '{') {
            const closeIndex = findClosingDelimiter(pattern, index + 3, '}');
            if (closeIndex != null) {
                return { count: 0, nextIndex: closeIndex };
            }
        }
    }

    if (next === 'k' && pattern[index + 2] === '<') {
        const closeIndex = findClosingDelimiter(pattern, index + 3, '>');
        if (closeIndex != null) {
            return { count: 0, nextIndex: closeIndex };
        }
    }

    if (SEMANTIC_ESCAPES.has(next)) {
        return { count: 0, nextIndex: index + 1 };
    }

    if (IDENTIFYING_ESCAPES.has(next)) {
        return { count: 1, nextIndex: index + 1 };
    }

    return { count: 0, nextIndex: index + 1 };
}

function findClosingParenIndex(pattern: string, startIndex: number): number | null {
    let depth = 0;
    let inCharacterClass = false;

    for (let i = startIndex; i < pattern.length; i += 1) {
        const char = pattern[i];

        if (char === '\\') {
            i += 1;
            continue;
        }

        if (inCharacterClass) {
            if (char === ']') {
                inCharacterClass = false;
            }
            continue;
        }

        if (char === '[') {
            inCharacterClass = true;
            continue;
        }

        if (char === '(') {
            depth += 1;
            continue;
        }

        if (char === ')') {
            if (depth === 0) {
                return i;
            }
            depth -= 1;
        }
    }

    return null;
}

export function countInitToolLiteralChars(pattern: string): number {
    let count = 0;
    let inCharacterClass = false;
    let characterClassPosition = 0;

    for (let i = 0; i < pattern.length; i += 1) {
        const char = pattern[i];

        if (char === '\\') {
            const escaped = countEscapedLiteral(pattern, i);
            count += escaped.count;
            i = escaped.nextIndex;
            if (inCharacterClass) {
                characterClassPosition += 1;
            }
            continue;
        }

        if (inCharacterClass) {
            if (char === ']') {
                inCharacterClass = false;
                characterClassPosition = 0;
                continue;
            }

            if (char === '^' && characterClassPosition === 0) {
                characterClassPosition += 1;
                continue;
            }

            if (char === '-') {
                if (characterClassPosition === 0 || pattern[i + 1] === ']') {
                    count += 1;
                }
                characterClassPosition += 1;
                continue;
            }

            count += 1;
            characterClassPosition += 1;
            continue;
        }

        if (char === '[') {
            inCharacterClass = true;
            characterClassPosition = 0;
            continue;
        }

        if (char === '(') {
            if (pattern[i + 1] === '?') {
                const marker = pattern[i + 2];

                if (marker === '=' || marker === '!') {
                    const closeIndex = findClosingParenIndex(pattern, i + 3);
                    if (closeIndex != null) {
                        i = closeIndex;
                        continue;
                    }
                }

                if (marker === ':') {
                    i += 2;
                    continue;
                }

                if (marker === '<') {
                    const lookbehindMarker = pattern[i + 3];
                    if (lookbehindMarker === '=' || lookbehindMarker === '!') {
                        const closeIndex = findClosingParenIndex(pattern, i + 4);
                        if (closeIndex != null) {
                            i = closeIndex;
                            continue;
                        }
                    }

                    const groupNameCloseIndex = pattern.indexOf('>', i + 3);
                    if (groupNameCloseIndex !== -1) {
                        i = groupNameCloseIndex;
                        continue;
                    }
                }
            }

            continue;
        }

        if (char === '{') {
            let j = i + 1;
            let hasDigitsBeforeComma = false;
            let hasDigitsAfterComma = false;

            while (j < pattern.length && /[0-9]/.test(pattern[j])) {
                hasDigitsBeforeComma = true;
                j += 1;
            }

            if (pattern[j] === ',') {
                j += 1;
                while (j < pattern.length && /[0-9]/.test(pattern[j])) {
                    hasDigitsAfterComma = true;
                    j += 1;
                }
            }

            if (
                pattern[j] === '}' &&
                (hasDigitsBeforeComma || hasDigitsAfterComma) &&
                (hasDigitsBeforeComma || pattern[i + 1] !== ',') &&
                (hasDigitsBeforeComma || hasDigitsAfterComma)
            ) {
                i = j;
                continue;
            }
        }

        if (!'^$.*+?()[]|'.includes(char)) {
            count += 1;
        }
    }

    return count;
}

function rankInitTool(tool: InitTool, order: number, pathname: string): RankedInitTool | null {
    if (tool.name !== 'init') {
        return null;
    }

    if (typeof tool.path !== 'string' || tool.path.length === 0) {
        return {
            tool,
            explicitPath: false,
            pathLength: 0,
            literalCount: 0,
            order,
        };
    }

    try {
        const pattern = new RegExp(tool.path);
        if (!pattern.test(pathname)) {
            return null;
        }
        return {
            tool,
            explicitPath: true,
            pathLength: tool.path.length,
            literalCount: countInitToolLiteralChars(tool.path),
            order,
        };
    } catch (error) {
        console.warn(`[init-tool] Invalid path regex for init tool "${tool.name}": ${tool.path}`);
        return null;
    }
}

export function pickBestInitTool(params: {
    pathname: string;
    tools: InitTool[];
}): InitTool | undefined {
    let best: RankedInitTool | null = null;

    for (const [order, tool] of params.tools.entries()) {
        const ranked = rankInitTool(tool, order, params.pathname);
        if (!ranked) {
            continue;
        }

        if (!best) {
            best = ranked;
            continue;
        }

        if (best.explicitPath !== ranked.explicitPath) {
            if (ranked.explicitPath) {
                best = ranked;
            }
            continue;
        }

        if (ranked.explicitPath) {
            if (ranked.pathLength > best.pathLength) {
                best = ranked;
                continue;
            }

            if (ranked.pathLength < best.pathLength) {
                continue;
            }

            if (ranked.literalCount > best.literalCount) {
                best = ranked;
            }
        }
    }

    return best?.tool;
}

export async function runInitTool(params: {
    tool: InitTool | null;
    timeoutMs: number;
}): Promise<void> {
    const tool = params.tool;
    if (!tool || (tool as { sourceType?: unknown }).sourceType !== 'remote') {
        return;
    }

    const executeStr = (tool as { execute?: unknown }).execute;
    if (typeof executeStr !== 'string' || !executeStr.trim()) {
        return;
    }

    try {
        await executeRemoteToolInPage(executeStr, {}, params.timeoutMs);
    } catch (error) {
        console.warn('[init-tool]', error);
    }
}

export function createInitRunState(): InitRunState {
    return {
        executedPageKeys: new Set<string>(),
    };
}

export async function maybeRunInitForPage(params: {
    state: InitRunState;
    pageKey: string;
    pathname: string;
    tools: InitTool[];
    timeoutMs: number;
    runTool?: typeof runInitTool;
}): Promise<void> {
    if (params.state.executedPageKeys.has(params.pageKey)) {
        return;
    }

    const selectedTool = pickBestInitTool({
        pathname: params.pathname,
        tools: params.tools,
    });

    if (!selectedTool) {
        return;
    }

    params.state.executedPageKeys.add(params.pageKey);
    const runTool = params.runTool ?? runInitTool;
    await runTool({
        tool: selectedTool,
        timeoutMs: params.timeoutMs,
    });
}
