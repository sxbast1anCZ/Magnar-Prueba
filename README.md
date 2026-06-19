# SNIFA Sancionatorio Scraper

Scraper en TypeScript para la sección **Procedimientos Sancionatorios** del [SNIFA](https://snifa.sma.gob.cl/Sancionatorio/Resultado).

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
npm install
```

## Uso

```bash
npm start
```

El scraper:
1. Descarga el listado completo en bloques de 100 expedientes (34 requests en vez de 338)
2. Por cada expediente, obtiene la ficha y guarda `metadata.json` con toda la información estructurada
3. Descarga los PDFs disponibles con delay configurable entre requests
4. Registra los fallos en `failed.json` para reintentos posteriores

## Estructura de salida

```
downloads/
  D-096-2026/
    metadata.json              <- expediente, titular, documentos, hechos, fiscalizaciones
    01_Acta-de-Inspeccion_19-01-2026.pdf
    05_Formulacion-de-Cargos_11-06-2026.pdf
    ...
  F-021-2026/
    ...
failed.json                    <- descargas fallidas con detalle del error y timestamp
```

### metadata.json

Cada expediente incluye:

| Campo | Descripción |
|---|---|
| `rol` | Identificador del expediente (ej. D-096-2026) |
| `fechaInicio` / `fechaTermino` | Fechas del procedimiento |
| `estado` | En curso / Terminado / etc. |
| `unidadFiscalizable` | Nombre del sitio fiscalizado |
| `titular` | Empresa o persona detrás de la unidad |
| `categoria` | Rubro (Equipamiento, Pesca y Acuicultura, etc.) |
| `region` | Region de Chile |
| `documentos` | Lista con nombre, tipo, fecha y downloadId de cada documento |
| `hechosConsiderados` | Infracciones con instrumento, clasificacion LOSMA |
| `fiscalizacionesAsociadas` | Expedientes de fiscalizacion relacionados |
| `medidasProvisionales` | Medidas provisionales asociadas (puede estar vacio) |
| `sanciones` | Sanciones aplicadas (puede estar vacio) |

### failed.json

```json
[
  {
    "fichaId": 4522,
    "rol": "D-096-2026",
    "docId": "2061200095015",
    "nombre": "Acta de Inspeccion",
    "error": "Request failed with status code 429",
    "timestamp": "2026-06-18T15:00:00.000Z"
  }
]
```

Si el scraper se interrumpe y se reinicia, omite los PDFs ya descargados y acumula nuevas entradas en `failed.json`.

## Configuracion

Los parametros se ajustan en `src/index.ts` (objeto `CONFIG` al inicio del archivo):

| Parametro | Default | Descripcion |
|---|---|---|
| `requestDelayMs` | 800 | Delay entre requests de fichas (ms) |
| `batchSize` | 5 | PDFs a descargar antes de pausar |
| `batchPauseMs` | 45000 | Pausa entre lotes de descarga (ms) |
| `pageSize` | 100 | Expedientes por pagina del listado |
| `outputDir` | `downloads` | Carpeta de salida |
| `failedFile` | `failed.json` | Archivo de log de fallos |

## Manejo de rate limiting

El servidor permite aproximadamente 5 descargas por ventana deslizante de ~30 segundos.

**Estrategia principal (batch):** el scraper descarga `batchSize` PDFs y luego pausa `batchPauseMs` antes del siguiente lote, manteniendose dentro del limite de forma proactiva.

**Fallback (429):** si aun asi llega un `429 Too Many Requests`:

1. Espera `2^intento * 47000ms` (47s → 94s → 188s)
2. Reintenta hasta 3 veces
3. Si persiste, registra el documento en `failed.json` y continua con el siguiente

## Stack tecnico

| Libreria | Version | Uso |
|---|---|---|
| TypeScript | 6.x | Lenguaje |
| axios | 1.x | HTTP requests |
| cheerio | 1.x | Parsing HTML |
| ts-node | 10.x | Ejecucion directa de TS |
