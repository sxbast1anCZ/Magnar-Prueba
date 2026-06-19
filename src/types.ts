// Shared TypeScript interfaces for all data extracted from SNIFA.

export interface ListingRow {
  rowNumber: string;
  rol: string;
  fichaId: number;
  unidadFiscalizable: string;
  titular: string;
  categoria: string;
  region: string;
  estado: string;
}

export interface Documento {
  numero: number;
  nombre: string;
  tipo: string;
  fecha: string;
  downloadId: string | null;
}

export interface HechoConsiderado {
  numero: number;
  hecho: string;
  instrumentoInfringido: string;
  infraccion: string;
  clasificacion: string;
}

export interface FiscalizacionAsociada {
  numero: number;
  expediente: string;
  anioActividad: string;
  detalleUrl: string | null;
}

export interface ExpedienteMetadata {
  fichaId: number;
  rol: string;
  fechaInicio: string;
  fechaTermino: string;
  estado: string;
  unidadFiscalizable: string;
  titular: string;
  categoria: string;
  region: string;
  documentos: Documento[];
  hechosConsiderados: HechoConsiderado[];
  fiscalizacionesAsociadas: FiscalizacionAsociada[];
  medidasProvisionales: Record<string, string>[];
  sanciones: Record<string, string>[];
}

export interface FailedDownload {
  fichaId: number;
  rol: string;
  docId: string;
  nombre: string;
  error: string;
  timestamp: string;
}
