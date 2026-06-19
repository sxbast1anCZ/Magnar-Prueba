// HTTP client: wraps axios with automatic retry/backoff on 429 errors.

import axios from 'axios';

const BASE_URL = 'https://snifa.sma.gob.cl';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 47000; // first retry waits 47s — just over the ~30s sliding window; batch approach is primary defense

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; snifa-scraper/1.0)',
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retries fn on 429 with exponential backoff; throws on other errors or exhausted retries.
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 429 && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * RETRY_BASE_MS;
        console.warn(`  [429] ${label} — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Max retries exceeded: ${label}`);
}

// Fetches a SNIFA page and returns the raw HTML string.
export async function getHtml(path: string): Promise<string> {
  return withRetry(
    () => axios.get<string>(BASE_URL + path, { headers: HEADERS }).then(r => r.data),
    `GET ${path}`
  );
}

// Calls the DataTables server-side API with form-encoded params.
export interface DataTablesResponse {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: string[][];
}

export async function postForm(path: string, params: URLSearchParams): Promise<DataTablesResponse> {
  return withRetry(
    () =>
      axios
        .post<DataTablesResponse>(BASE_URL + path, params.toString(), {
          headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        .then(r => r.data),
    `POST ${path}`
  );
}

// Downloads a binary file (PDF) and returns it as a Buffer.
export async function getBuffer(path: string): Promise<Buffer> {
  return withRetry(
    () =>
      axios
        .get<ArrayBuffer>(BASE_URL + path, { responseType: 'arraybuffer', headers: HEADERS })
        .then(r => Buffer.from(r.data)),
    `DOWNLOAD ${path}`
  );
}
