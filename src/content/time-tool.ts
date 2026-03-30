export type CurrentTimeResult = {
    iso: string;
    localDateTime: string;
    timeZone: string;
    utcOffset: string;
    today: string;
};

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function formatUtcOffset(date: Date): string {
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return `UTC${sign}${pad(hours)}:${pad(minutes)}`;
}

function formatLocalDateTimeParts(date: Date): { localDateTime: string; today: string } {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return {
        localDateTime: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`,
        today: `${year}-${month}-${day}`,
    };
}

export async function getCurrentTime(): Promise<CurrentTimeResult> {
    const now = new Date();
    const { localDateTime, today } = formatLocalDateTimeParts(now);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return {
        iso: now.toISOString(),
        localDateTime,
        timeZone,
        utcOffset: formatUtcOffset(now),
        today,
    };
}
