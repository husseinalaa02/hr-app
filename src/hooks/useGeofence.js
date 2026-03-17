import { useState, useEffect, useRef } from 'react';
import { getDistance } from '../utils/geofence';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const LAT     = parseFloat(import.meta.env.VITE_OFFICE_LAT  ?? '');
const LNG     = parseFloat(import.meta.env.VITE_OFFICE_LNG  ?? '');
const RADIUS  = parseFloat(import.meta.env.VITE_OFFICE_RADIUS_M ?? '100');
const GEO_OFF = import.meta.env.VITE_GEOFENCE_ENABLED === 'false';

const isConfigured = !GEO_OFF && !isNaN(LAT) && !isNaN(LNG);

export function useGeofence() {
  const [state, setState] = useState({
    configured: isConfigured,
    loading: isConfigured,
    allowed: !isConfigured,
    distance: null,
    accuracy: null,
    error: null,
  });

  const intervalRef = useRef(null);

  const updatePosition = async () => {
    try {
      // On native iOS/Android, request permission first
      if (Capacitor.isNativePlatform()) {
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== 'granted') {
          setState(s => ({ ...s, loading: false, allowed: false, error: 'Location permission denied. Please enable it in Settings.' }));
          return;
        }
      }

      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
      const dist = getDistance(pos.coords.latitude, pos.coords.longitude, LAT, LNG);
      setState({
        configured: true,
        loading: false,
        allowed: dist <= RADIUS,
        distance: Math.round(dist),
        accuracy: Math.round(pos.coords.accuracy),
        error: null,
      });
    } catch (err) {
      const msg =
        (err.message?.toLowerCase().includes('denied') || err.code === 1)
          ? 'Location permission denied. Please allow location access in Settings.'
        : (err.message?.toLowerCase().includes('unavailable') || err.code === 2)
          ? 'Unable to determine your location. Make sure GPS is enabled.'
          : 'Location request timed out. Please try again.';
      setState(s => ({ ...s, loading: false, allowed: false, error: msg }));
    }
  };

  useEffect(() => {
    if (!isConfigured) return;

    updatePosition();
    // Refresh every 30 seconds
    intervalRef.current = setInterval(updatePosition, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { ...state, radius: RADIUS };
}
