import type { VisitValidation } from "@prisma/client";

/**
 * Haversine distance in meters between two WGS84 points.
 */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earth = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

/**
 * Server-side GPS validation against the configured threshold.
 * Client-reported distance is never trusted.
 */
export function evaluateGpsValidation(
  distanceFromRegisteredMeters: number,
  thresholdMeters: number,
): { validation: VisitValidation; flaggedReason?: string } {
  if (distanceFromRegisteredMeters <= thresholdMeters) {
    return { validation: "accepted" };
  }
  return {
    validation: "flagged",
    flaggedReason: `GPS distance ${Math.round(distanceFromRegisteredMeters)}m above threshold (${thresholdMeters}m)`,
  };
}
