type PropagationEventLike = {
    stopPropagation: () => void;
    nativeEvent?: {
        stopImmediatePropagation?: () => void;
    };
};

type EnterSendEventLike = {
    key: string;
    shiftKey?: boolean;
    preventDefault?: () => void;
    stopPropagation?: () => void;
    nativeEvent?: {
        isComposing?: boolean;
        keyCode?: number;
        stopImmediatePropagation?: () => void;
    };
};

export function shouldSendChatOnEnter(event: EnterSendEventLike): boolean {
    if (event.key !== 'Enter' || event.shiftKey) return false;
    const isImeComposing = event.nativeEvent?.isComposing === true || event.nativeEvent?.keyCode === 229;
    return !isImeComposing;
}

export function handleChatInputKeyDownCapture(event: EnterSendEventLike, send: () => void) {
    if (shouldSendChatOnEnter(event)) {
        event.preventDefault?.();
        send();
    }
    if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    if (typeof event.nativeEvent?.stopImmediatePropagation === 'function') {
        event.nativeEvent.stopImmediatePropagation();
    }
}

export function stopChatInputEventPropagation(event: PropagationEventLike) {
    event.stopPropagation();
    if (typeof event.nativeEvent?.stopImmediatePropagation === 'function') {
        event.nativeEvent.stopImmediatePropagation();
    }
}
