type QrListener = (sessionId: string, qrBase64: string) => void;
type StatusListener = (sessionId: string, status: string) => void;
type LogListener = (sessionId: string, message: string, level: string) => void;

class EventBus {
  private qrListeners = new Set<QrListener>();
  private statusListeners = new Set<StatusListener>();
  private logListeners = new Set<LogListener>();

  onQr(listener: QrListener): () => void {
    this.qrListeners.add(listener);
    return () => this.qrListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onLog(listener: LogListener): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  emitQr(sessionId: string, qrBase64: string): void {
    for (const l of this.qrListeners) l(sessionId, qrBase64);
  }

  emitStatus(sessionId: string, status: string): void {
    for (const l of this.statusListeners) l(sessionId, status);
  }

  emitLog(sessionId: string, message: string, level = 'info'): void {
    for (const l of this.logListeners) l(sessionId, message, level);
  }
}

export const waEventBus = new EventBus();
