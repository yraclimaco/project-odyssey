// NOAA EMAG2v3 public map service configuration.
// Every value below was checked against the live service or NCEI product page on 2026-11-06:
//   - Service metadata: https://gis.ngdc.noaa.gov/arcgis/rest/services/EMAG2v3/MapServer?f=json
//       spatialReference wkid 4326, capabilities "Map,Query,Data", not tiled (dynamic export).
//   - Layer ids/names from the same response (see LAYERS below).
//   - Units from /legend?f=json: layers 3/4 "200 nT or more - -200 nT or less",
//       layer 8 "High : 240 nT - Low : 0 nT".
//   - Missing values: /identify returns the string "NoData" (observed for layer 4 at high latitudes).
//   - Resolution and reference altitudes from the NCEI product page:
//       "2-arc-minute resolution"; "Upward Continued" = 4 km above the WGS84 ellipsoid;
//       "Sea Level" = at sea level for oceanic and coastal regions; "The error estimate is in nT."
//   - Dataset DOI linked from the product page: 10.7289/V5H70CVX
//   - The service sends Access-Control-Allow-Origin: * so a browser can call it directly.

export const EMAG_SERVICE_URL =
  'https://gis.ngdc.noaa.gov/arcgis/rest/services/EMAG2v3/MapServer';
export const EMAG_PRODUCT_URL =
  'https://www.ncei.noaa.gov/products/earth-magnetic-model-anomaly-grid-2';
export const EMAG_DOI_URL = 'https://doi.org/10.7289/V5H70CVX';
export const EMAG_SOURCE_NAME = 'NOAA NCEI EMAG2v3 (Earth Magnetic Anomaly Grid, 2-arc-minute)';
export const EMAG_ATTRIBUTION = 'Magnetic anomaly: NOAA NCEI EMAG2v3 (doi:10.7289/V5H70CVX)';
export const EMAG_RESOLUTION = '2 arc-minutes (grid spacing, per NCEI)';

export type EmagLayerKey = 'upward' | 'sealevel' | 'error';

export interface EmagLayerInfo {
  key: EmagLayerKey;
  id: number;
  serviceName: string;
  displayName: string;
  unit: 'nT';
  referenceElevation: string;
  legendLabel: string;
  description: string;
}

export const EMAG_LAYERS: Record<EmagLayerKey, EmagLayerInfo> = {
  upward: {
    key: 'upward',
    id: 3,
    serviceName: 'EMAG2v3 (Upward Continued)',
    displayName: 'Magnetic anomaly — upward continued',
    unit: 'nT',
    referenceElevation: '4 km above the WGS84 ellipsoid',
    legendLabel: '≥ 200 nT (top) to ≤ −200 nT (bottom)',
    description: 'Magnetic anomaly reported at a continuous 4 km altitude.',
  },
  sealevel: {
    key: 'sealevel',
    id: 4,
    serviceName: 'EMAG2v3 (Sea Level)',
    displayName: 'Magnetic anomaly — sea level',
    unit: 'nT',
    referenceElevation: 'Sea level (oceanic and coastal regions only)',
    legendLabel: '≥ 200 nT (top) to ≤ −200 nT (bottom)',
    description:
      'Magnetic anomaly at sea level, published by NCEI for oceanic and coastal regions. Cells outside coverage are NoData.',
  },
  error: {
    key: 'error',
    id: 8,
    serviceName: 'Error Estimate',
    displayName: 'Map error estimate',
    unit: 'nT',
    referenceElevation: 'Not applicable',
    legendLabel: '240 nT (high, top) to 0 nT (low, bottom)',
    description:
      'Published error estimate of the magnetic grid itself (nT). This is not vehicle position error.',
  },
};

/** Layer 7 returns an integer code per cell. Names come from the NCEI format file (EMAG_SOURCE_CODES below). */
export const EMAG_DATA_SOURCE_CODE_LAYER_ID = 7;

/** The literal value /identify returns for missing cells. */
export const EMAG_NODATA = 'NoData';

// ---- Additional facts from the official NCEI format file (checked 2026-11-06) ----
// https://www.ngdc.noaa.gov/geomag/data/EMAG2/EMAG2_readme.txt
export const EMAG_README_URL = 'https://www.ngdc.noaa.gov/geomag/data/EMAG2/EMAG2_readme.txt';
export const EMAG_VERSION = 'EMAG2v3';
/** The format file says grid files carry their publication date in the name. The newest grid file in
 * the NCEI directory is EMAG2_V3_20170530. The map service does not state which file it serves. */
export const EMAG_LATEST_GRID_FILE = 'EMAG2_V3_20170530 (publication date 2017-05-30)';
export const EMAG_GRID_SPACING = '2 arc-minutes';
/** 1 arc-minute of latitude ≈ 1.852 km, so 2' ≈ 3.7 km north–south. East–west spacing shrinks with latitude. */
export const EMAG_GRID_SPACING_NOTE =
  'About 3.7 km north–south; east–west spacing is smaller away from the equator (multiply by the cosine of latitude). This is grid spacing, not positional accuracy.';
export const EMAG_ERROR_MEANING =
  'Error associated with each grid cell, in nT, as published by NCEI. It describes the magnetic map, not vehicle position.';

/** Documented sentinel values (format file): code 888 → error −888 nT; code 999 → anomaly 99999 nT, error −999 nT. */
export const EMAG_SENTINELS = { anomalyNoData: 99999, errorAmbiguous: -888, errorNoData: -999, codeAmbiguous: 888, codeNoData: 999 };

/** Source code table, verbatim from the format file. */
export const EMAG_SOURCE_CODES: Record<number, string> = {
  1: 'West Asia', 2: 'Antarctica', 3: 'Afghanistan', 4: 'Alaska', 5: 'Algeria', 6: 'Arctic', 7: 'Argentina onshore',
  8: 'Argentina offshore', 9: 'Australia', 10: 'Austria', 11: 'Bolivia', 13: 'East Asia', 14: 'Europe', 15: 'Eurasia',
  16: 'Fennoscandia', 17: 'France', 18: 'Western Europe', 19: 'Getech', 20: 'India', 21: 'East India', 22: 'Iraq',
  23: 'Italy', 24: 'Ivory Coast', 25: 'Japan', 26: 'Hawaii', 27: 'Middle East', 29: 'New Zealand', 30: 'Pakistan',
  31: 'Papua', 32: 'Russia', 33: 'Saudi Arabia', 34: 'South Africa', 35: 'Spain', 36: 'Tanzania', 37: 'NAMAG',
  38: 'Former Soviet Union', 101: 'Arabian', 102: 'Arabian aeromag', 103: 'Baja', 104: 'Central Atlantic',
  105: 'Caribbean', 106: 'Fuego', 107: 'Hope', 108: 'Indian', 109: 'Mediterranean', 110: 'North Atlantic 1',
  111: 'North Atlantic 2', 112: 'North Atlantic 3', 113: 'North Atlantic 4', 114: 'North Atlantic 5',
  115: 'North Pacific', 116: 'Northwest Pacific', 117: 'South Ocean', 118: 'South Pacific', 119: 'Southeast Pacific',
  120: 'Southwest Atlantic', 121: 'Tasman', 888: 'Ambiguous', 999: 'No data',
};
