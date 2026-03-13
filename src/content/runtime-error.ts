export function isExtensionContextInvalidatedError(error: unknown): boolean {
    if (!error) return false;
    const message = String((error as any)?.message ?? error).toLowerCase();
    return message.includes('extension context invalidated');
}
