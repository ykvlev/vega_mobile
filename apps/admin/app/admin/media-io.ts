import 'server-only';

export class MediaBodyError extends Error {
  constructor(readonly kind: 'size' | 'timeout' | 'invalid') {
    super('Media body unavailable');
  }
}

export async function boundedMediaBody(
  stream: ReadableStream<Uint8Array> | null,
  maximum: number,
  timeoutMs = 10000,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!stream) throw new MediaBodyError('invalid');
  const reader = stream.getReader();
  const deadline = AbortSignal.timeout(timeoutMs);
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  deadline.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (deadline.aborted) throw new MediaBodyError('timeout');
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new MediaBodyError('size');
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let position = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, position);
      position += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    if (error instanceof MediaBodyError) throw error;
    throw new MediaBodyError('invalid');
  } finally {
    deadline.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
