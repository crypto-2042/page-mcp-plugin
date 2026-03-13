export function getSourceBadgeKind(item: { sourceType?: 'native' | 'remote'; sourceLabel?: string }): 'native' | 'remote' {
    if (item.sourceType === 'remote') return 'remote';
    if (item.sourceType === 'native') return 'native';
    if (typeof item.sourceLabel === 'string' && item.sourceLabel.startsWith('remote')) return 'remote';
    return 'native';
}

export function getSourceBadgeText(item: { sourceType?: 'native' | 'remote'; sourceLabel?: string }): string {
    return getSourceBadgeKind(item) === 'remote' ? 'Remote' : 'Native';
}
