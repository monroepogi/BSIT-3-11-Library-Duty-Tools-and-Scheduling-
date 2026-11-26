import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

export interface QrScannerPort {
  readonly nativeCameraAvailable: boolean;
  scanRawText(): Promise<string | null>;
}

/**
 * Abstracts ML Kit native barcode scanning on Android devices with a clean
 * non-blocking fallback on desktop browsers.
 */
@Injectable({ providedIn: 'root' })
export class QrScannerService implements QrScannerPort {
  get nativeCameraAvailable(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BarcodeScanner');
  }

  async scanRawText(): Promise<string | null> {
    if (!this.nativeCameraAvailable) {
      return null;
    }
    const win = window as unknown as {
      Capacitor?: {
        Plugins?: {
          BarcodeScanner?: {
            scan(): Promise<{ barcodes?: Array<{ rawValue?: string }> }>;
          };
        };
      };
    };
    const plugin = win.Capacitor?.Plugins?.BarcodeScanner;
    if (!plugin) return null;
    const res = await plugin.scan();
    return res.barcodes?.[0]?.rawValue ?? null;
  }
}
