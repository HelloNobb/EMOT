import { PROXY_URL } from './config.js';

// One POST to the Worker. Throws with the Worker's message so the UI can show why it failed.
export async function post(path, body) {
  const response = await fetch(PROXY_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? `HTTP ${response.status}`);
  return data;
}
