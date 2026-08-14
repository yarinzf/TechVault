import { useCallback, useEffect, useRef, useState } from 'react';

// Formats we'd LIKE to scan. Only the subset the browser's BarcodeDetector
// actually reports via getSupportedFormats() is ever requested — we never
// claim to support a format the platform doesn't really decode.
const DESIRED_FORMATS = ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'];

const SCAN_INTERVAL_MS = 300;

export const SCANNER_STATUS = {
  IDLE:        'idle',
  STARTING:    'starting',
  SCANNING:    'scanning',
  LOCKED:      'locked',       // a code was just detected; paused until resume()
  UNSUPPORTED: 'unsupported',
  DENIED:      'denied',
  NO_CAMERA:   'no-camera',
  ERROR:       'error',
};

export function isBarcodeDetectorSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

// A small, testable abstraction over BarcodeDetector + getUserMedia. All
// browser/camera APIs are only ever touched through refs/callbacks here so
// tests can mock them at the boundary (navigator.mediaDevices,
// window.BarcodeDetector) without needing a real camera or jsdom video
// decoding support.
//
// Detection lock: once a code is found, the scan loop is stopped immediately
// (not just flagged) so a camera producing many frames/second cannot fire a
// second lookup for the same code. Callers must call resume() explicitly
// (e.g. a "Scan Again" button) to look for another code.
export function useBarcodeScanner({ onDetect }) {
  const videoRef     = useRef(null);
  const streamRef    = useRef(null);
  const detectorRef  = useRef(null);
  const intervalRef  = useRef(null);
  const lockedRef    = useRef(false);
  const onDetectRef  = useRef(onDetect);
  onDetectRef.current = onDetect;

  // Checked synchronously at mount (not only after a click) so an
  // unsupported browser shows the honest fallback message immediately,
  // rather than only after the user tries and fails to start the camera.
  const [status, setStatus] = useState(() => (
    isBarcodeDetectorSupported() && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia
      ? SCANNER_STATUS.IDLE
      : SCANNER_STATUS.UNSUPPORTED
  ));
  const [supportedFormats, setSupportedFormats] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const stopInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Stops every MediaStreamTrack — this is the part that turns the browser's
  // camera indicator off. Must run on unmount, on leaving the page, and any
  // time scanning ends, not just on an explicit "stop" click.
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const stop = useCallback(() => {
    stopInterval();
    stopStream();
    lockedRef.current = false;
    setStatus((s) => (s === SCANNER_STATUS.UNSUPPORTED ? s : SCANNER_STATUS.IDLE));
  }, []);

  const tick = useCallback(async () => {
    if (lockedRef.current || !videoRef.current || !detectorRef.current) return;
    let codes = [];
    try {
      codes = await detectorRef.current.detect(videoRef.current);
    } catch {
      return; // a single undecodable frame is expected, not fatal
    }
    if (codes.length > 0 && !lockedRef.current) {
      lockedRef.current = true;
      stopInterval();
      setStatus(SCANNER_STATUS.LOCKED);
      onDetectRef.current(codes[0].rawValue);
    }
  }, []);

  const start = useCallback(async () => {
    if (!isBarcodeDetectorSupported() || !navigator.mediaDevices?.getUserMedia) {
      setStatus(SCANNER_STATUS.UNSUPPORTED);
      return;
    }

    setStatus(SCANNER_STATUS.STARTING);
    setErrorMessage('');

    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = DESIRED_FORMATS.filter((f) => supported.includes(f));
      setSupportedFormats(formats);
      if (formats.length === 0) {
        setStatus(SCANNER_STATUS.UNSUPPORTED);
        return;
      }
      detectorRef.current = new window.BarcodeDetector({ formats });

      // Rear/environment camera preferred on mobile — this is where a
      // warehouse worker actually points the phone at a product.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        if (videoRef.current.play) await videoRef.current.play();
      }

      lockedRef.current = false;
      setStatus(SCANNER_STATUS.SCANNING);
      intervalRef.current = setInterval(tick, SCAN_INTERVAL_MS);
    } catch (err) {
      stopStream();
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setStatus(SCANNER_STATUS.DENIED);
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setStatus(SCANNER_STATUS.NO_CAMERA);
      } else {
        setErrorMessage(err?.message || '');
        setStatus(SCANNER_STATUS.ERROR);
      }
    }
  }, [tick]);

  // Resumes scanning on the SAME already-open stream — no repeat permission
  // prompt for "Scan Again".
  const resume = useCallback(() => {
    if (!detectorRef.current || !streamRef.current) return;
    lockedRef.current = false;
    setStatus(SCANNER_STATUS.SCANNING);
    intervalRef.current = setInterval(tick, SCAN_INTERVAL_MS);
  }, [tick]);

  useEffect(() => stop, [stop]);

  return { videoRef, status, errorMessage, supportedFormats, start, stop, resume };
}
