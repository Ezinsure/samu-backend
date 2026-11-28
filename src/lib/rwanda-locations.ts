import locationsData from "../data/rwanda-locations.json";

export type GeoDepth = "district" | "sector" | "cell" | "village";

export interface RwandaVillage {
  code: string;
  name: string;
}

export interface RwandaCell {
  code: string;
  name: string;
  villages: RwandaVillage[];
}

export interface RwandaSector {
  code: string;
  name: string;
  cells: RwandaCell[];
}

export interface RwandaDistrict {
  code: string;
  name: string;
  sectors: RwandaSector[];
}

export interface RwandaProvince {
  code: string;
  name: string;
  districts: RwandaDistrict[];
}

export interface RwandaLocationsDataset {
  version: number;
  country: string;
  countryCode: string;
  updatedAt: string;
  notes?: string;
  counts: {
    provinces: number;
    districts: number;
    sectors: number;
    cells: number;
    villages: number;
  };
  provinces: RwandaProvince[];
}

/** Canonical dataset (Province → District → Sector → Cell → Village). */
export const RWANDA_LOCATIONS = locationsData as RwandaLocationsDataset;

const PROVINCE_ALIASES: Record<string, string> = {
  eastern: "Eastern Province",
  "eastern province": "Eastern Province",
  "kigali city": "Kigali City",
  kigali: "Kigali City",
  northern: "Northern Province",
  "northern province": "Northern Province",
  southern: "Southern Province",
  "southern province": "Southern Province",
  western: "Western Province",
  "western province": "Western Province",
};

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function byName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeProvinceName(name: string): string {
  const alias = PROVINCE_ALIASES[norm(name)];
  if (alias) return alias;
  const match = RWANDA_LOCATIONS.provinces.find(
    (p) => norm(p.name) === norm(name),
  );
  return match?.name ?? name.trim();
}

export function listProvinces(): RwandaProvince[] {
  return byName(RWANDA_LOCATIONS.provinces);
}

export function getProvince(nameOrCode: string): RwandaProvince | undefined {
  const needle = norm(nameOrCode);
  const canonical = norm(normalizeProvinceName(nameOrCode));
  return RWANDA_LOCATIONS.provinces.find(
    (p) =>
      norm(p.name) === needle ||
      norm(p.name) === canonical ||
      p.code === nameOrCode.trim(),
  );
}

export function listDistricts(provinceName?: string): RwandaDistrict[] {
  if (!provinceName?.trim()) {
    return byName(RWANDA_LOCATIONS.provinces.flatMap((p) => p.districts));
  }
  const province = getProvince(provinceName);
  return province ? byName(province.districts) : [];
}

export function getDistrict(
  districtName: string,
  provinceName?: string,
): RwandaDistrict | undefined {
  const needle = norm(districtName);
  const pool = provinceName?.trim()
    ? (getProvince(provinceName)?.districts ?? [])
    : RWANDA_LOCATIONS.provinces.flatMap((p) => p.districts);
  return pool.find(
    (d) => norm(d.name) === needle || d.code === districtName.trim(),
  );
}

export function listSectors(
  districtName: string,
  provinceName?: string,
): RwandaSector[] {
  const district = getDistrict(districtName, provinceName);
  return district ? byName(district.sectors) : [];
}

export function getSector(
  sectorName: string,
  districtName: string,
  provinceName?: string,
): RwandaSector | undefined {
  const needle = norm(sectorName);
  return listSectors(districtName, provinceName).find(
    (s) => norm(s.name) === needle || s.code === sectorName.trim(),
  );
}

export function listCells(
  sectorName: string,
  districtName: string,
  provinceName?: string,
): RwandaCell[] {
  const sector = getSector(sectorName, districtName, provinceName);
  return sector ? byName(sector.cells) : [];
}

export function getCell(
  cellName: string,
  sectorName: string,
  districtName: string,
  provinceName?: string,
): RwandaCell | undefined {
  const needle = norm(cellName);
  return listCells(sectorName, districtName, provinceName).find(
    (c) => norm(c.name) === needle || c.code === cellName.trim(),
  );
}

export function listVillages(
  cellName: string,
  sectorName: string,
  districtName: string,
  provinceName?: string,
): RwandaVillage[] {
  const cell = getCell(cellName, sectorName, districtName, provinceName);
  return cell ? byName(cell.villages) : [];
}

export function provincesDistrictsMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const province of listProvinces()) {
    map[province.name] = listDistricts(province.name).map((d) => d.name);
  }
  return map;
}

/**
 * Public/API payload for cascading selects.
 * Default is province→district (small). Pass `full: true` for sector/cell/village.
 */
export function rwandaGeoPayload(options: { full?: boolean } = {}) {
  const base = {
    version: RWANDA_LOCATIONS.version,
    updatedAt: RWANDA_LOCATIONS.updatedAt,
    counts: RWANDA_LOCATIONS.counts,
    provinces: listProvinces().map((p) => p.name),
    districtsByProvince: provincesDistrictsMap(),
  };

  if (!options.full) return base;

  return {
    ...base,
    tree: listProvinces().map((province) => ({
      code: province.code,
      name: province.name,
      districts: province.districts.map((district) => ({
        code: district.code,
        name: district.name,
        sectors: district.sectors.map((sector) => ({
          code: sector.code,
          name: sector.name,
          cells: sector.cells.map((cell) => ({
            code: cell.code,
            name: cell.name,
            villages: cell.villages.map((village) => ({
              code: village.code,
              name: village.name,
            })),
          })),
        })),
      })),
    })),
  };
}
