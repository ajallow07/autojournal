import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface TripMapProps {
  startLatitude?: number | null;
  startLongitude?: number | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
  routeCoordinates?: Array<[number, number]> | null;
  routeGeometry?: Array<[number, number]> | null;
  startLocation?: string;
  endLocation?: string;
}

export default function TripMap({
  startLatitude,
  startLongitude,
  endLatitude,
  endLongitude,
  routeCoordinates,
  routeGeometry,
  startLocation,
  endLocation,
}: TripMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  const hasStart = startLatitude != null && startLongitude != null;
  const hasEnd = endLatitude != null && endLongitude != null;
  const displayRoute = routeGeometry && routeGeometry.length >= 2 ? routeGeometry : routeCoordinates;
  const hasRoute = displayRoute && displayRoute.length >= 2;

  useEffect(() => {
    if (!mapRef.current) return;
    if (!hasStart && !hasEnd && !hasRoute) return;

    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    });
    mapInstance.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    const bounds = L.latLngBounds([]);

    const startIcon = L.divIcon({
      className: "trip-marker-start",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const endIcon = L.divIcon({
      className: "trip-marker-end",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    if (hasStart) {
      const latlng = L.latLng(startLatitude, startLongitude);
      L.marker(latlng, { icon: startIcon })
        .addTo(map)
        .bindPopup(`<strong>Start</strong><br/>${startLocation || "Start"}`);
      bounds.extend(latlng);
    }

    if (hasEnd) {
      const latlng = L.latLng(endLatitude, endLongitude);
      L.marker(latlng, { icon: endIcon })
        .addTo(map)
        .bindPopup(`<strong>End</strong><br/>${endLocation || "End"}`);
      bounds.extend(latlng);
    }

    if (hasRoute) {
      const latlngs: L.LatLngExpression[] = displayRoute!.map(
        ([lat, lon]) => [lat, lon] as L.LatLngTuple
      );

      L.polyline(latlngs, {
        color: "#3b82f6",
        weight: 4,
        opacity: 0.8,
        smoothFactor: 1,
      }).addTo(map);

      latlngs.forEach((ll) => bounds.extend(ll));
    } else if (hasStart && hasEnd) {
      L.polyline(
        [
          [startLatitude, startLongitude],
          [endLatitude, endLongitude],
        ],
        {
          color: "#3b82f6",
          weight: 3,
          opacity: 0.6,
          dashArray: "8 6",
          smoothFactor: 1,
        }
      ).addTo(map);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else if (hasStart) {
      map.setView([startLatitude!, startLongitude!], 14);
    } else if (hasEnd) {
      map.setView([endLatitude!, endLongitude!], 14);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [startLatitude, startLongitude, endLatitude, endLongitude, routeCoordinates, routeGeometry, startLocation, endLocation, hasStart, hasEnd, hasRoute]);

  if (!hasStart && !hasEnd && !hasRoute) {
    return null;
  }

  return (
    <div
      ref={mapRef}
      data-testid="trip-map"
      className="w-full rounded-md overflow-hidden"
      style={{ height: 280 }}
    />
  );
}
