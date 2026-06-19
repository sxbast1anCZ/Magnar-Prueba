// Handles all file I/O: PDF downloads, metadata.json per expediente, and the failed.json log.

import * as fs from 'fs';
import * as path from 'path';
import { getBuffer } from './http';
import type { ExpedienteMetadata, Documento, FailedDownload } from './types';

const failures: FailedDownload[] = [];

// Strips diacritics and non-alphanumeric characters for safe cross-platform filenames.
export function sanitize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics (á→a, ñ→n, etc.)
    .replace(/[^a-zA-Z0-9\-.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Downloads one PDF to downloads/{rol}/{num}_{nombre}_{fecha}.pdf; skips if the file already exists.
export async function downloadPdf(
  outputDir: string,
  metadata: ExpedienteMetadata,
  doc: Documento
): Promise<void> {
  if (!doc.downloadId) return;

  const folder = path.join(outputDir, sanitize(metadata.rol));
  const num = String(doc.numero).padStart(2, '0');
  const filename = `${num}_${sanitize(doc.nombre)}_${doc.fecha.replace(/\//g, '-')}.pdf`;
  const destPath = path.join(folder, filename);

  if (fs.existsSync(destPath)) {
    console.log(`    [skip] ${filename}`);
    return;
  }

  fs.mkdirSync(folder, { recursive: true });

  try {
    const buffer = await getBuffer(`/General/Descargar/${doc.downloadId}`);
    fs.writeFileSync(destPath, buffer);
    console.log(`    [ok]   ${filename}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`    [fail] ${filename} — ${message}`);
    failures.push({
      fichaId: metadata.fichaId,
      rol: metadata.rol,
      docId: doc.downloadId,
      nombre: doc.nombre,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
}

// Writes metadata.json for one expediente inside its output folder.
export function saveMetadata(outputDir: string, metadata: ExpedienteMetadata): void {
  const folder = path.join(outputDir, sanitize(metadata.rol));
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
}

// Merges in-memory failures with any existing failed.json and writes the result to disk.
export function saveFailedLog(failedFile: string): void {
  if (failures.length === 0) {
    console.log('\nNo failed downloads.');
    return;
  }

  let existing: FailedDownload[] = [];
  if (fs.existsSync(failedFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(failedFile, 'utf-8')) as FailedDownload[];
    } catch {
      existing = [];
    }
  }

  fs.writeFileSync(
    failedFile,
    JSON.stringify([...existing, ...failures], null, 2),
    'utf-8'
  );
  console.log(`\n${failures.length} failed download(s) logged to ${failedFile}`);
}
