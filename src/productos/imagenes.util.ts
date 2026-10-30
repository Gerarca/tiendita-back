import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

export const URL_IMAGENES = '/uploads/productos/';
export const TAMANO_MAXIMO_IMAGEN = 5 * 1024 * 1024; // 5 MB

export function directorioImagenes(): string {
  return join(process.cwd(), 'uploads', 'productos');
}

/**
 * Detecta el tipo REAL del archivo por sus primeros bytes ("firma"),
 * sin confiar en la extensión ni en el tipo que declara el navegador.
 */
export function detectarTipoImagen(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

/** Borra la imagen anterior. basename() impide salir de la carpeta de imágenes. */
export async function borrarImagen(url: string | null | undefined): Promise<void> {
  if (!url?.startsWith(URL_IMAGENES)) return;
  await rm(join(directorioImagenes(), basename(url)), { force: true }).catch(() => undefined);
}
