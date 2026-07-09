// Helpers para streams SSE robustos a desconexão do cliente.
// Sem isso, controller.enqueue lança "Invalid state: Controller is already closed"
// quando o cliente fecha a aba/recarrega no meio do stream.

export interface SSEHandle {
  send: (data: object) => boolean;
  close: () => void;
  isCanceled: () => boolean;
}

export function createSSEHandle(controller: ReadableStreamDefaultController, signal?: AbortSignal): SSEHandle {
  const encoder = new TextEncoder();
  let canceled = false;

  if (signal) {
    if (signal.aborted) canceled = true;
    else signal.addEventListener('abort', () => { canceled = true; }, { once: true });
  }

  return {
    send(data) {
      if (canceled) return false;
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        return true;
      } catch {
        canceled = true;
        return false;
      }
    },
    close() {
      try { controller.close(); } catch { /* já fechado */ }
    },
    isCanceled() { return canceled; },
  };
}
