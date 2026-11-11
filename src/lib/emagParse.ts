// Pure parsing of EMAG2v3 identify responses. Kept separate from network code so it can be tested.
import { EMAG_NODATA, EMAG_SENTINELS, EMAG_SOURCE_CODES } from '../data/emag2v3.ts';

/** Parses one pixel value. Returns null for "NoData" or non-numeric input. Zero is a real value. */
export function parsePixel(v: unknown): number | null {
  if (v === undefined || v === null || v === '' || v === EMAG_NODATA) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface ParsedCell {
  upwardContinuedNT: number | null;
  seaLevelNT: number | null;
  errorEstimateNT: number | null;
  dataSourceCode: number | null;
  dataSourceName: string | null;
  notes: string[];
}

/** Applies the documented sentinel rules from the NCEI format file. */
export function parseCell(raw: { upward: unknown; sealevel: unknown; error: unknown; code: unknown }): ParsedCell {
  const notes: string[] = [];
  let upward = parsePixel(raw.upward);
  let sea = parsePixel(raw.sealevel);
  let err = parsePixel(raw.error);
  const code = parsePixel(raw.code);

  if (upward === EMAG_SENTINELS.anomalyNoData) { upward = null; notes.push('Anomaly at 4 km: documented no-data value (99999).'); }
  if (sea === EMAG_SENTINELS.anomalyNoData) { sea = null; notes.push('Anomaly at sea level: documented no-data value (99999).'); }
  if (err === EMAG_SENTINELS.errorAmbiguous) { err = null; notes.push('Error estimate: source ambiguous at this cell (−888, per NCEI).'); }
  else if (err === EMAG_SENTINELS.errorNoData) { err = null; notes.push('Error estimate: no data at this cell (−999, per NCEI).'); }

  const name = code !== null ? EMAG_SOURCE_CODES[code] ?? null : null;
  if (code !== null && name === null) notes.push(`Source code ${code} is not listed in the NCEI format file.`);
  return { upwardContinuedNT: upward, seaLevelNT: sea, errorEstimateNT: err, dataSourceCode: code, dataSourceName: name, notes };
}
