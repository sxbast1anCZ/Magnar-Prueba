// Parses SNIFA HTML into typed data: listing rows from the DataTables API and full ficha metadata.

import { load, CheerioAPI } from 'cheerio';
import type {
  ListingRow,
  Documento,
  HechoConsiderado,
  FiscalizacionAsociada,
  ExpedienteMetadata,
} from './types';

// Extracts trimmed inner text from the first element matching selector in an HTML fragment.
function extractText(html: string, selector: string): string {
  const $ = load(html);
  return $(selector).first().text().replace(/\s+/g, ' ').trim();
}

// Maps raw DataTables rows (string[][]) to typed ListingRow objects.
export function parseListingRows(rows: string[][]): ListingRow[] {
  return rows
    .map(row => {
      const detailMatch = row[7].match(/\/Sancionatorio\/Ficha\/(\d+)/);
      const fichaId = detailMatch ? parseInt(detailMatch[1], 10) : 0;

      return {
        rowNumber: row[0].trim(),
        rol: row[1].trim(),
        fichaId,
        unidadFiscalizable: extractText(row[2], 'a'),
        titular: extractText(row[3], 'li'),
        categoria: extractText(row[4], 'li'),
        region: extractText(row[5], 'li'),
        estado: row[6].trim(),
      };
    })
    .filter(r => r.fichaId > 0);
}

// Extracts full metadata from a Ficha page (header fields + all 5 tabs).
export function parseFicha(html: string, row: ListingRow): ExpedienteMetadata {
  const $ = load(html);

  const rol = $('h3').first().text().replace('Expediente:', '').trim() || row.rol;

  // Each h4 has a unique fa-* icon — more reliable than matching accented text
  const iconValue = (iconSelector: string): string => {
    let value = '';
    $('h4').each((_, el) => {
      if ($(el).find(iconSelector).length > 0) {
        value = $(el).find('i').last().text().trim();
        return false; // break
      }
    });
    return value;
  };

  return {
    fichaId: row.fichaId,
    rol,
    fechaInicio: iconValue('i.fa-calendar:not(.fa-calendar-check-o)'),
    fechaTermino: iconValue('i.fa-calendar-check-o'),
    estado: iconValue('i.fa-signal'),
    unidadFiscalizable: row.unidadFiscalizable,
    titular: row.titular,
    categoria: row.categoria,
    region: row.region,
    documentos: parseDocumentos($),
    hechosConsiderados: parseHechos($),
    fiscalizacionesAsociadas: parseFiscalizaciones($),
    medidasProvisionales: parseGenericTab($, '#medidas-provisionales-asociadas'),
    sanciones: parseGenericTab($, '#sanciones'),
  };
}

// Parses the #documentos tab: document list with download links.
function parseDocumentos($: CheerioAPI): Documento[] {
  const docs: Documento[] = [];

  $('#documentos tbody tr').each((_, tr) => {
    const cells = $('td', tr);
    const href = cells.eq(4).find('a').attr('href') ?? null;
    const idMatch = href?.match(/\/General\/Descargar\/(\d+)/);

    docs.push({
      numero: parseInt(cells.eq(0).text().trim(), 10) || 0,
      nombre: cells.eq(1).text().replace(/\s+/g, ' ').trim(),
      tipo: cells.eq(2).text().replace(/\s+/g, ' ').trim(),
      fecha: cells.eq(3).text().trim(),
      downloadId: idMatch?.[1] ?? null,
    });
  });

  return docs;
}

// Parses the #instrumentos-considerados tab: infractions and their LOSMA classification.
function parseHechos($: CheerioAPI): HechoConsiderado[] {
  const result: HechoConsiderado[] = [];

  $('#instrumentos-considerados tbody tr').each((_, tr) => {
    const cells = $('td', tr);
    result.push({
      numero: parseInt(cells.eq(0).text().trim(), 10) || 0,
      hecho: cells.eq(1).text().replace(/\s+/g, ' ').trim(),
      instrumentoInfringido: cells.eq(2).text().replace(/\s+/g, ' ').trim(),
      infraccion: cells.eq(3).text().replace(/\s+/g, ' ').trim(),
      clasificacion: cells.eq(4).text().replace(/\s+/g, ' ').trim(),
    });
  });

  return result;
}

// Parses the #fiscalizaciones-asociadas tab: linked inspection expedientes.
function parseFiscalizaciones($: CheerioAPI): FiscalizacionAsociada[] {
  const result: FiscalizacionAsociada[] = [];

  $('#fiscalizaciones-asociadas tbody tr').each((_, tr) => {
    const cells = $('td', tr);
    const href = cells.eq(3).find('a').attr('href') ?? null;

    result.push({
      numero: parseInt(cells.eq(0).text().trim(), 10) || 0,
      expediente: cells.eq(1).text().replace(/\s+/g, ' ').trim(),
      anioActividad: cells.eq(2).text().trim(),
      detalleUrl: href ? `https://snifa.sma.gob.cl${href}` : null,
    });
  });

  return result;
}

// Generic tab parser: returns [] if the tab shows an empty alert, otherwise maps rows using data-label as keys.
function parseGenericTab($: CheerioAPI, selector: string): Record<string, string>[] {
  if ($(selector).find('.alert-info').length > 0) return [];

  const rows: Record<string, string>[] = [];

  $(`${selector} tbody tr`).each((_, tr) => {
    const row: Record<string, string> = {};
    $('td', tr).each((idx, td) => {
      const label = $(td).attr('data-label') ?? `col${idx}`;
      row[label] = $(td).text().replace(/\s+/g, ' ').trim();
    });
    rows.push(row);
  });

  return rows;
}
