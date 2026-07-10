import { prepareZXingModule } from "barcode-detector";
import zxingReaderWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

let isConfigured = false;

/**
 * Keep QR decoding self-contained instead of relying on the decoder's default
 * third-party CDN. This must run before the first Scanner instance is mounted.
 */
export const configureQrScannerRuntime = () => {
  if (isConfigured) return;

  prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) => (
        path.endsWith(".wasm") ? zxingReaderWasmUrl : `${prefix}${path}`
      ),
    },
  });

  isConfigured = true;
};
