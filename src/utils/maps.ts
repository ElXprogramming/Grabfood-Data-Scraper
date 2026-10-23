/**
 * Google Maps Link Utilities
 * Generates official Google Maps web/app URLs for coordinates, addresses, and venues.
 */

export interface MapLocationParams {
  lat?: number | null;
  lon?: number | null;
  address?: string | null;
  name?: string | null;
  area?: string | null;
}

/**
 * Returns a universal Google Maps search URL for any establishment.
 * Prioritizes exact GPS coordinates, falling back to street address, then venue name & area.
 */
export function getGoogleMapsUrl(params: MapLocationParams): string {
  const { lat, lon, address, name, area } = params;

  // 1. Precise GPS Coordinates (e.g. 6.036082, 116.130047)
  if (lat != null && lon != null && !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  }

  // 2. Physical Street Address
  if (address && address.trim()) {
    const cleanAddress = address.trim();
    // Append city if not already specified to avoid disambiguation errors
    const fullQuery = cleanAddress.toLowerCase().includes('kinabalu') || cleanAddress.toLowerCase().includes('sabah')
      ? cleanAddress
      : `${cleanAddress}, Kota Kinabalu, Sabah`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullQuery)}`;
  }

  // 3. Fallback by Venue Name and Area
  const areaLabel =
    area?.toLowerCase() === '1borneo'
      ? '1Borneo Hypermall, Kota Kinabalu'
      : area?.toLowerCase() === 'alamesra'
      ? 'Alamesra, Kota Kinabalu'
      : area || 'Kota Kinabalu';

  const query = [name, areaLabel].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || 'Kota Kinabalu Sabah')}`;
}
