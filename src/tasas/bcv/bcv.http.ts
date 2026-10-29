import { request } from 'node:https';
import * as tls from 'node:tls';

/**
 * Certificados de confianza que Node usa por defecto: los incluidos en Node
 * más los agregados por NODE_EXTRA_CA_CERTS o --use-system-ca.
 * (Pasar `ca` en una petición REEMPLAZA esta lista, por eso hay que partir de ella.)
 */
function certificadosPorDefecto(): string[] {
  const conTipos = tls as typeof tls & { getCACertificates?: (tipo: 'default') => string[] };
  return conTipos.getCACertificates?.('default') ?? [...tls.rootCertificates];
}

/**
 * Descarga una página por HTTPS con tiempo límite y sin dependencias extra.
 * - `caExtra`: certificado(s) PEM adicionales de confianza, sumados a los
 *   de Node. Sirve para completar la cadena SSL incompleta del BCV.
 * - `tlsInseguro`: desactiva la verificación SOLO para esta petición.
 */
export function descargarHtml(
  url: string,
  opciones: { tlsInseguro: boolean; caExtra?: string; timeoutMs?: number },
  redirecciones = 3,
): Promise<string> {
  const timeoutMs = opciones.timeoutMs ?? 15_000;

  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        rejectUnauthorized: !opciones.tlsInseguro,
        ca: opciones.caExtra ? [...certificadosPorDefecto(), opciones.caExtra] : undefined,
        timeout: timeoutMs,
        headers: { 'User-Agent': 'Mozilla/5.0 (TiendaMonasterio)', Accept: 'text/html' },
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirecciones <= 0) return reject(new Error('Demasiadas redirecciones'));
          const destino = new URL(res.headers.location, url).toString();
          return resolve(descargarHtml(destino, opciones, redirecciones - 1));
        }
        if (status !== 200) {
          res.resume();
          return reject(new Error(`El BCV respondió HTTP ${status}`));
        }

        res.setEncoding('utf8');
        let cuerpo = '';
        res.on('data', (trozo: string) => {
          cuerpo += trozo;
          if (cuerpo.length > 5_000_000) req.destroy(new Error('Respuesta demasiado grande'));
        });
        res.on('end', () => resolve(cuerpo));
        res.on('error', reject);
      },
    );

    req.on('timeout', () => req.destroy(new Error(`Sin respuesta del BCV en ${timeoutMs / 1000} s`)));
    req.on('error', reject);
    req.end();
  });
}
