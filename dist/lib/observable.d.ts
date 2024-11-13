export type EventListener = (...args: any[]) => void;
export default class Observable {
    private _listeners;
    on(eventType: string, listener: EventListener): void;
    off(eventType: string, listener: EventListener): void;
    once(eventType: string, listener: EventListener): void;
    fire(eventName: string, ...args: any[]): void;
}
