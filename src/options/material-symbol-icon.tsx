import React from 'react';
import {
    ArrowLeftRight,
    BadgeInfo,
    Bot,
    BrainCircuit,
    ChevronRight,
    CloudDownload,
    CloudSync,
    Contrast,
    Database,
    Ellipsis,
    Eye,
    EyeOff,
    Gauge,
    Info,
    KeyRound,
    Languages,
    Link2,
    MessageSquare,
    MessageSquareText,
    MoonStar,
    Package,
    Palette,
    PanelsTopLeft,
    Pipette,
    Plus,
    Puzzle,
    Radar,
    RefreshCw,
    RotateCcw,
    Search,
    SearchCode,
    Settings2,
    ShieldCheck,
    Sun,
    Terminal,
    Trash,
    Trash2,
    Wrench,
    Zap,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<any>> = {
    add: Plus,
    badge: BadgeInfo,
    bolt: Zap,
    build: Wrench,
    chat: MessageSquare,
    chevron_right: ChevronRight,
    cloud_download: CloudDownload,
    cloud_sync: CloudSync,
    colorize: Pipette,
    contrast: Contrast,
    dark_mode: MoonStar,
    database: Database,
    delete: Trash,
    delete_forever: Trash2,
    deployed_code: SearchCode,
    extension: Puzzle,
    info: Info,
    key: KeyRound,
    link: Link2,
    more_horiz: Ellipsis,
    palette: Palette,
    pip: PanelsTopLeft,
    psychology: BrainCircuit,
    radar: Radar,
    refresh: RefreshCw,
    restart_alt: RotateCcw,
    search: Search,
    shield_lock: ShieldCheck,
    smart_toy: Bot,
    speed: Gauge,
    summarize: MessageSquareText,
    swap_horiz: ArrowLeftRight,
    terminal: Terminal,
    translate: Languages,
    tune: Settings2,
    verified_user: ShieldCheck,
    visibility: Eye,
    visibility_off: EyeOff,
    inventory_2: Package,
    light_mode: Sun,
};

type MaterialSymbolIconProps = {
    name: string;
    className?: string;
    style?: React.CSSProperties;
};

export function MaterialSymbolIcon({ name, className, style }: MaterialSymbolIconProps) {
    const Icon = iconMap[name] ?? BadgeInfo;
    return (
        <span className={['material-symbols-outlined', className].filter(Boolean).join(' ')} style={style} aria-hidden="true">
            <Icon size="1em" strokeWidth={1.8} />
        </span>
    );
}
