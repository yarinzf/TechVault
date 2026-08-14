import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '../../context/LanguageContext';
import BarcodeScannerPage from './BarcodeScannerPage';

vi.mock('../../features/warehouse/api/warehouse.service', () => ({
  warehouseService: { lookupProduct: vi.fn() },
}));
// eslint-disable-next-line import/first
import { warehouseService } from '../../features/warehouse/api/warehouse.service';

function renderPage() {
  return render(
    <LanguageProvider>
      <BarcodeScannerPage />
    </LanguageProvider>
  );
}

function makeProduct(overrides = {}) {
  return {
    _id: 'prod-1',
    name: 'Test Product',
    sku: 'TV-ABC',
    brand: 'TestBrand',
    price: 199,
    stock: 10,
    minStock: 5,
    images: [],
    category: { name: 'Keyboards' },
    ...overrides,
  };
}

let mockDetect;
let currentTrack;

function setSupportedBarcodeDetector() {
  window.BarcodeDetector = vi.fn().mockImplementation(() => ({ detect: mockDetect }));
  window.BarcodeDetector.getSupportedFormats = vi.fn().mockResolvedValue([
    'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code',
  ]);
}

function setWorkingCamera() {
  currentTrack = { stop: vi.fn() };
  const stream = { getTracks: () => [currentTrack] };
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    configurable: true,
    writable: true,
  });
}

function rejectCamera(errorName) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error(errorName), { name: errorName })) },
    configurable: true,
    writable: true,
  });
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

beforeEach(() => {
  vi.clearAllMocks();
  mockDetect = vi.fn().mockResolvedValue([]);
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  setSupportedBarcodeDetector();
  setWorkingCamera();
});

describe('BarcodeScannerPage — manual lookup', () => {
  it('finds a product by exact code and renders it', async () => {
    warehouseService.lookupProduct.mockResolvedValue(makeProduct());
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('הזן ברקוד או מק״ט...'), { target: { value: 'TV-ABC' } });
    fireEvent.click(screen.getByText('חפש'));

    expect(await screen.findByText('Test Product')).toBeInTheDocument();
    expect(warehouseService.lookupProduct).toHaveBeenCalledWith('TV-ABC');
  });

  it('pressing Enter submits the manual lookup', async () => {
    warehouseService.lookupProduct.mockResolvedValue(makeProduct());
    renderPage();

    const input = screen.getByPlaceholderText('הזן ברקוד או מק״ט...');
    fireEvent.change(input, { target: { value: 'TV-ABC' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('Test Product')).toBeInTheDocument();
  });

  it('an unknown code shows the honest not-found state, not an empty result', async () => {
    warehouseService.lookupProduct.mockResolvedValue(null);
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('הזן ברקוד או מק״ט...'), { target: { value: 'TV-XXX' } });
    fireEvent.click(screen.getByText('חפש'));

    expect(await screen.findByText('לא נמצא מוצר התואם לקוד שנסרק')).toBeInTheDocument();
  });

  it('prevents a duplicate submission while a lookup is already pending', async () => {
    let resolveLookup;
    warehouseService.lookupProduct.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    renderPage();

    const input = screen.getByPlaceholderText('הזן ברקוד או מק״ט...');
    fireEvent.change(input, { target: { value: 'TV-ABC' } });
    fireEvent.click(screen.getByText('חפש'));
    fireEvent.keyDown(input, { key: 'Enter' });

    resolveLookup(makeProduct());
    await screen.findByText('Test Product');

    expect(warehouseService.lookupProduct).toHaveBeenCalledTimes(1);
  });

  it('remains fully usable even when camera scanning is unsupported', async () => {
    delete window.BarcodeDetector;
    warehouseService.lookupProduct.mockResolvedValue(makeProduct());
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('הזן ברקוד או מק״ט...'), { target: { value: 'TV-ABC' } });
    fireEvent.click(screen.getByText('חפש'));

    expect(await screen.findByText('Test Product')).toBeInTheDocument();
  });
});

describe('BarcodeScannerPage — camera scanning', () => {
  it('Start Camera requests media access, preferring the rear/environment camera', async () => {
    renderPage();
    fireEvent.click(screen.getByText('הפעל מצלמה'));

    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) })
    ));
  });

  it('an unsupported BarcodeDetector shows the honest fallback state immediately (no Start Camera button)', async () => {
    delete window.BarcodeDetector;
    renderPage();

    expect(screen.getByText('הדפדפן אינו תומך בסריקת ברקוד באמצעות מצלמה. ניתן להשתמש בחיפוש הידני למטה.')).toBeInTheDocument();
    expect(screen.queryByText('הפעל מצלמה')).not.toBeInTheDocument();
  });

  it('a camera permission rejection shows the honest denied fallback', async () => {
    rejectCamera('NotAllowedError');
    renderPage();
    fireEvent.click(screen.getByText('הפעל מצלמה'));

    expect(await screen.findByText('גישה למצלמה נדחתה. ניתן להמשיך ולהשתמש בחיפוש הידני למטה.')).toBeInTheDocument();
  });

  it('a detected barcode triggers exactly one product lookup', async () => {
    mockDetect.mockResolvedValue([{ rawValue: 'TV-ABC' }]);
    warehouseService.lookupProduct.mockResolvedValue(makeProduct());
    renderPage();

    fireEvent.click(screen.getByText('הפעל מצלמה'));

    await waitFor(() => expect(warehouseService.lookupProduct).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(warehouseService.lookupProduct).toHaveBeenCalledWith('TV-ABC');
    expect(await screen.findByText('Test Product')).toBeInTheDocument();
  });

  it('duplicate detections of the same code do not spam the backend', async () => {
    // The mock camera "sees" a code on every frame, exactly like a real
    // camera holding steady on a barcode — the hook's lock must still only
    // resolve one lookup.
    mockDetect.mockResolvedValue([{ rawValue: 'TV-ABC' }]);
    let resolveLookup;
    warehouseService.lookupProduct.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    renderPage();

    fireEvent.click(screen.getByText('הפעל מצלמה'));
    await waitFor(() => expect(warehouseService.lookupProduct).toHaveBeenCalledTimes(1), { timeout: 3000 });

    // Give the (paused) scan loop plenty of extra ticks worth of time.
    await sleep(900);
    expect(warehouseService.lookupProduct).toHaveBeenCalledTimes(1);

    resolveLookup(makeProduct());
    await screen.findByText('Test Product');
  });

  it('an unknown scanned code shows the not-found state, keeping the decoded value visible', async () => {
    mockDetect.mockResolvedValue([{ rawValue: 'TV-UNKNOWN' }]);
    warehouseService.lookupProduct.mockResolvedValue(null);
    renderPage();

    fireEvent.click(screen.getByText('הפעל מצלמה'));

    expect(await screen.findByText('לא נמצא מוצר התואם לקוד שנסרק')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('הזן ברקוד או מק״ט...')).toHaveValue('TV-UNKNOWN');
  });

  it('Scan Again resumes scanning on the same stream, without requesting camera permission again', async () => {
    mockDetect.mockResolvedValueOnce([{ rawValue: 'TV-FIRST' }]);
    warehouseService.lookupProduct.mockResolvedValueOnce(null);
    renderPage();

    fireEvent.click(screen.getByText('הפעל מצלמה'));
    await screen.findByText('לא נמצא מוצר התואם לקוד שנסרק');

    const getUserMediaCallsBefore = navigator.mediaDevices.getUserMedia.mock.calls.length;

    mockDetect.mockResolvedValue([{ rawValue: 'TV-SECOND' }]);
    warehouseService.lookupProduct.mockResolvedValue(makeProduct());
    fireEvent.click(screen.getByText('סרוק שוב'));

    await waitFor(() => expect(warehouseService.lookupProduct).toHaveBeenCalledWith('TV-SECOND'), { timeout: 3000 });
    expect(navigator.mediaDevices.getUserMedia.mock.calls.length).toBe(getUserMediaCallsBefore);
  });

  it('Stop Camera stops every MediaStream track', async () => {
    renderPage();
    fireEvent.click(screen.getByText('הפעל מצלמה'));
    await screen.findByText('עצור מצלמה');

    fireEvent.click(screen.getByText('עצור מצלמה'));

    expect(currentTrack.stop).toHaveBeenCalled();
  });

  it('unmounting the page stops every MediaStream track (camera indicator does not stay on)', async () => {
    const { unmount } = renderPage();
    fireEvent.click(screen.getByText('הפעל מצלמה'));
    await screen.findByText('עצור מצלמה');

    unmount();

    expect(currentTrack.stop).toHaveBeenCalled();
  });
});
