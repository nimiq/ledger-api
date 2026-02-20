export type EventListener = (...args: any[]) => void;

export default class Observable {
    private _listeners: Map<string, EventListener[]> = new Map();

    public on(eventType: string, listener: EventListener): void {
        if (!this._listeners.has(eventType)) {
            this._listeners.set(eventType, [listener]);
        } else {
            this._listeners.get(eventType)!.push(listener);
        }
    }

    public off(eventType: string, listener: EventListener): void {
        const listenersForEvent = this._listeners.get(eventType);
        if (!listenersForEvent) return;
        const index = listenersForEvent.indexOf(listener);
        if (index === -1) return;
        listenersForEvent.splice(index, 1);
    }

    public once(eventType: string, listener: EventListener): void {
        const onceListener: EventListener = ((...args: any[]) => {
            this.off(eventType, onceListener);
            listener(...args);
        });
        this.on(eventType, onceListener);
    }

    public fire(eventName: string, ...args: any[]): void {
        // Let current micro task finish before invoking listeners
        setTimeout(() => {
            const listenersForEvent = this._listeners.get(eventName);
            if (!listenersForEvent) return;
            for (const listener of listenersForEvent) {
                listener(...args);
            }
        }, 0);
    }
}
