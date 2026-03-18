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

  const intervalRef     = useRef(null);
  const permGranted     = useRef(false); // cache permission so we don't prompt every 30 s

  const fetchPosition = async () => {
    try {
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

  const updatePosition = async () => {
    // On native, request permission once; on web the browser handles its own prompt
    if (Capacitor.isNativePlatform() && !permGranted.current) {
      try {
        // Check first so we don't show the system dialog on every refresh
        const status = await Geolocation.checkPermissions();
        if (status.location === 'granted') {
          permGranted.current = true;
        } else if (status.location === 'prompt' || status.location === 'prompt-with-rationale') {
          const result = await Geolocation.requestPermissions();
          if (result.location !== 'granted') {
            setState(s => ({ ...s, loading: false, allowed: false, error: 'Location permission denied. Please enable it in Settings.' }));
            return;
          }
          permGranted.current = true;
        } else {
          // denied
          setState(s => ({ ...s, loading: false, allowed: false, error: 'Location permission denied. Please enable it in Settings.' }));
          return;
        }
      } catch {
        // checkPermissions not available on older plugin versions — fall through to fetchPosition
        permGranted.current = true;
      }
    }
    await fetchPosition();
  };

  useEffect(() => {
    if (!isConfigured) return;

    // Use a sequential setTimeout loop instead of setInterval so that a slow
    // GPS response never causes two concurrent location requests.
    let cancelled = false;

    const poll = async () => {
      await updatePosition();
      if (!cancelled) {
        intervalRef.current = setTimeout(poll, 30_000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, []);

  return { ...state, radius: RADIUS };
}
