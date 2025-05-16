export function haversineDistance(
  point1: { lat: number; lon: number },
  point2: { lat: number; lon: number },
  radius: number = 1737400
): number {
  const toRadians = (deg: number) => (deg * Math.PI) / 180;

  const lat1 = toRadians(point1.lat);
  const lat2 = toRadians(point2.lat);
  const deltaLat = toRadians(point2.lat - point1.lat);
  const deltaLon = toRadians(point2.lon - point1.lon);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  const c = 2 * Math.asin(Math.sqrt(a));
  return radius * c;
}
