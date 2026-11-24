import QRCode from 'qrcode';

/** QR en PNG para la ficha PDF (react-pdf no dibuja SVG de datos). */
export function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
}
