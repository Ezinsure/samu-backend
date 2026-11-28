/**
 * @deprecated Import from `./rwanda-locations.js` instead.
 * Kept as a thin re-export so existing imports keep working during migration.
 */
export {
  listProvinces,
  listDistricts,
  provincesDistrictsMap,
  rwandaGeoPayload,
  RWANDA_LOCATIONS,
} from "./rwanda-locations.js";

import { provincesDistrictsMap } from "./rwanda-locations.js";

/** @deprecated Use provincesDistrictsMap() / listProvinces(). */
export const RWANDA_PROVINCES = provincesDistrictsMap();
