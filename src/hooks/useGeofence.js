import { useState, useEffect, useRef } from 'react';
import { getDistance } from '../utils/geofence';

const LAT       = parseFloat(import.meta.env.VITE_OFFICE_LAT  ?? '');
const LNG       = parseFloat(import.meta.env.VITE_OFFICE_LNG  ?? '');
const RADIUS    = parseFloat(import.meta.env.VITE_OFFICE_RADIUS_M ?? '100');
const GEO_OFF   = import.meta.env.VITE_GEOFENCE_ENABLED === 'false';

// Geofencing is active when coordinates are set and not explicitly disabled.
// Works in both demo and production mode.
const isConfigured = !GEO_OFF && !isNaN(LAT) && !isNaN(LNG);

/**
 * Returned shape:
 * {
 *   configured: bool,   // true = geofencing is active
 *   loading:    bool,   // waiting for first GPS fix
 *   allowed:    bool,   // within the allowed radius
 *   distance:   number, // metres from office centre (null if unknown)
 *   accuracy:   number, // GPS accuracy in metres
 *   error:      string, // human-readable error or null
 *   radius:     number, // configured radius in metres
 * }
 */
export function useGeofence() {
  const [state, setState] = useState({
    configured: isConfigured,
    loading: isConfigured,
    allowed: !isConfigured, // if not configured, never block
    distance: null,
    accuracy: null,
    error: null,
  });

  const watchRef = useRef(null);

  useEffect(() => {
    if (!isConfigured) return;

    if (!navigator?.geolocation) {
      setState(s => ({ ...s, loading: false, allowed: false, error: 'GPS is not supported on this device.' }));
      return;
    }

    const opts = { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 };

    const onSuccess = (pos) => {
      const dist = getDistance(pos.coords.latitude, pos.coords.longitude, LAT, LNG);
      setState({
        configured: true,
        loading: false,
        allowed: dist <= RADIUS,
        distance: Math.round(dist),
        accuracy: Math.round(pos.coords.accuracy),
        error: null,
      });
    };

    const onError = (err) => {
      const msg =
        err.code === 1 ? 'Location permission denied. Please allow location access in your settings.' :
        err.code === 2 ? 'Unable to determine your location. Make sure GPS is enabled.' :
                         'Location request timed out. Please try again.';
      setState(s => ({ ...s, loading: false, allowed: false, error: msg }));
    };

    // Immediate fix + continuous watch
    navigator.geolocation.getCurrentPosition(onSuccess, onError, opts);
    watchRef.current = navigator.geolocation.watchPosition(onSuccess, onError, opts);

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, []);

  return { ...state, radius: RADIUS };
}
