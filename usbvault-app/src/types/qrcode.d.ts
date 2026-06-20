declare module 'qrcode' {
  interface QRCodeModules {
    size: number;
    data: Uint8Array;
  }

  interface QRCodeResult {
    modules: QRCodeModules;
  }

  interface QRCodeOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }

  function create(text: string, options?: QRCodeOptions): QRCodeResult;

  export { create };
  export default { create };
}
