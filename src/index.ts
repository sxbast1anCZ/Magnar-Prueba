// Entry point: interactive menu → fetch listings → scrape fichas → download PDFs in rate-limited batches.

import * as readline from 'readline';
import { postForm, getHtml } from './http';
import { parseListingRows, parseFicha } from './parser';
import { downloadPdf, saveMetadata, saveFailedLog } from './downloader';
import type { ListingRow } from './types';

const CONFIG = {
  requestDelayMs: 800,    // delay between ficha page fetches
  batchSize: 5,           // PDFs to download before pausing
  batchPauseMs: 45000,    // pause between batches — rate limit window is ~30s sliding
  pageSize: 100,          // expedientes per listing call (reduces total API calls from 338 to 34)
  outputDir: 'downloads',
  failedFile: 'failed.json',
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Prompts the user to choose between scraping all expedientes or a custom number.
async function promptLimit(): Promise<number> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve));

  console.log('Cuantos expedientes deseas scrapear?');
  console.log('  1) Todos (3379)');
  console.log('  2) Numero personalizado');

  let option: string;
  do {
    option = (await ask('Opcion [1/2]: ')).trim();
    if (option !== '1' && option !== '2') console.log('  Ingresa 1 o 2.');
  } while (option !== '1' && option !== '2');

  if (option === '1') {
    rl.close();
    return Infinity;
  }

  let limit = NaN;
  do {
    const input = (await ask('Cuantos expedientes (minimo 1): ')).trim();
    limit = parseInt(input, 10);
    if (isNaN(limit) || limit < 1) console.log('  Numero invalido, intenta de nuevo.');
  } while (isNaN(limit) || limit < 1);

  rl.close();
  return limit;
}

// Paginates the DataTables API to collect up to limit listing rows.
async function fetchAllListings(limit: number): Promise<ListingRow[]> {
  const all: ListingRow[] = [];
  let start = 0;
  let total = Infinity;

  while (start < total && all.length < limit) {
    const pageSize = Math.min(CONFIG.pageSize, limit - all.length);
    const params = new URLSearchParams({
      draw: String(Math.floor(start / CONFIG.pageSize) + 1),
      start: String(start),
      length: String(pageSize),
      'search[value]': '',
      'search[regex]': 'false',
      'order[0][column]': '0',
      'order[0][dir]': 'asc',
      nombre: '',
      expediente: '',
      categoria: '',
      ddlRegion: '',
      ddlComuna: '',
    });

    const res = await postForm('/Sancionatorio/ObtenerResultadosGrid', params);

    if (total === Infinity) {
      total = res.recordsTotal;
      console.log(`Total disponibles en SNIFA: ${total}`);
    }

    const rows = parseListingRows(res.data);
    all.push(...rows);

    const end = Math.min(start + pageSize, total);
    console.log(`  Listing ${start + 1}–${end} (cargados: ${all.length})`);

    start += CONFIG.pageSize;
    if (start < total && all.length < limit) await sleep(CONFIG.requestDelayMs);
  }

  return all.slice(0, limit);
}

// Orchestrates the full scrape: for each expediente, fetches the ficha, saves metadata, and downloads PDFs.
async function main(): Promise<void> {
  console.log('SNIFA Sancionatorio Scraper');
  console.log('===========================\n');

  const limit = await promptLimit();
  console.log('');

  const listings = await fetchAllListings(limit);
  console.log(`\nProcessing ${listings.length} expedientes...\n`);

  let downloadCount = 0;

  for (let i = 0; i < listings.length; i++) {
    const row = listings[i];
    console.log(`[${i + 1}/${listings.length}] ${row.rol} (ficha ${row.fichaId})`);

    try {
      await sleep(CONFIG.requestDelayMs);
      const html = await getHtml(`/Sancionatorio/Ficha/${row.fichaId}`);
      const metadata = parseFicha(html, row);

      saveMetadata(CONFIG.outputDir, metadata);

      const downloadable = metadata.documentos.filter(d => d.downloadId !== null);
      console.log(
        `  ${metadata.documentos.length} docs (${downloadable.length} downloadable, ${metadata.documentos.length - downloadable.length} without link)`
      );

      for (const doc of downloadable) {
        if (downloadCount > 0 && downloadCount % CONFIG.batchSize === 0) {
          console.log(`  [batch pause] ${CONFIG.batchPauseMs / 1000}s...`);
          await sleep(CONFIG.batchPauseMs);
        }
        await downloadPdf(CONFIG.outputDir, metadata, doc);
        downloadCount++;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [error] ${row.rol}: ${message}`);
    }
  }

  saveFailedLog(CONFIG.failedFile);
  console.log('\nDone.');
}

main().catch(console.error);
