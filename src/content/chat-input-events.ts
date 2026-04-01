type PropagationEventLike = {
    stopPropagation: () => void;
    nativeEvent?: {
        stopImmediatePropagation?: () => void;
    };
};

export function stopChatInputEventPropagation(event: PropagationEventLike) {
    event.stopPropagation();
    if (typeof event.nativeEvent?.stopImmediatePropagation === 'function') {
        event.nativeEvent.stopImmediatePropagation();
    }
}
