export function buildProxyApiUrl(baseURL: string, endpoint: string): string {
    const base = (baseURL || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('Missing baseURL');
    if (/^https?:\/\//i.test(endpoint)) {
        throw new Error('Absolute endpoint is not allowed');
    }
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const needsV1Prefix = !/\/v1$/i.test(base) && /^\/(chat\/completions|responses|models)(\/|$)/i.test(path);
    return needsV1Prefix ? `${base}/v1${path}` : `${base}${path}`;
}
