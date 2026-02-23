// Event system for cross-component communication

class EventEmitter extends EventTarget {
  emit(eventName: string, detail?: any) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  on(eventName: string, callback: EventListener) {
    this.addEventListener(eventName, callback);
  }

  off(eventName: string, callback: EventListener) {
    this.removeEventListener(eventName, callback);
  }
}

export const globalEvents = new EventEmitter();

// Event names
export const EVENTS = {
  NOTIFICATIONS_UPDATED: 'notifications-updated',
  ROLL_ADDED: 'roll-added',
  ROLL_UPDATED: 'roll-updated',
} as const;