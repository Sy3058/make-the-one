import type {GenerationOptions} from '../../src/generation-input';
export class DisplayError extends Error {}

export async function requestGeneration(story: string, timeoutMs = 60_000, options:GenerationOptions={}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mode: 'me', story,...options}),
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(error => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    if (!response.ok) {
      const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error : '지금은 결과를 만들 수 없습니다. 다시 시도해 주세요.';
      throw new DisplayError(message);
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new DisplayError('응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
