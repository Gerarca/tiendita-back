// =============================================================
// Obtiene el certificado intermedio que el servidor del BCV no envía,
// lo valida y lo guarda en certs/bcv-intermedio.pem
//
// Uso (desde la carpeta backend):
//   node scripts/obtener-cert-bcv.mjs
// =============================================================

import { X509Certificate } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import tls from 'node:tls';

const HOST = 'www.bcv.org.ve';
const SALIDA = 'certs/bcv-intermedio.pem';
const MAX_NIVELES = 3; // por si la cadena tiene más de un intermedio

function certificadosPorDefecto() {
  return tls.getCACertificates?.('default') ?? [...tls.rootCertificates];
}

/** Conecta SIN validar, solo para leer el certificado que presenta el BCV. */
function leerCertificadoServidor() {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: HOST, port: 443, servername: HOST, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert?.raw) return reject(new Error('El servidor no presentó certificado'));
        resolve(new X509Certificate(cert.raw));
      },
    );
    socket.setTimeout(15_000, () => socket.destroy(new Error('Tiempo agotado conectando al BCV')));
    socket.on('error', reject);
  });
}

/** Conecta CON validación completa usando los certificados extra. */
function probarConexion(pemsExtra) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: HOST,
        port: 443,
        servername: HOST,
        ca: [...certificadosPorDefecto(), ...pemsExtra],
        rejectUnauthorized: true,
      },
      () => {
        socket.end();
        resolve({ ok: true });
      },
    );
    socket.setTimeout(15_000, () => {
      socket.destroy();
      resolve({ ok: false, error: 'Tiempo agotado' });
    });
    socket.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

/** URL "CA Issuers" del campo AIA del certificado. */
function urlEmisor(cert) {
  return /CA Issuers - URI:(\S+)/.exec(cert.infoAccess ?? '')?.[1];
}

async function descargarCertificado(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} al descargar ${url}`);
  const datos = Buffer.from(await resp.arrayBuffer());
  try {
    return new X509Certificate(datos); // acepta DER o PEM
  } catch {
    throw new Error(`Formato no reconocido en ${url} (posiblemente PKCS#7). Usa el método de Chrome.`);
  }
}

async function main() {
  console.log(`Conectando a ${HOST}...`);
  const hoja = await leerCertificadoServidor();
  console.log(`  Certificado: ${hoja.subject.replace(/\n/g, ', ')}`);
  console.log(`  Emitido por: ${hoja.issuer.replace(/\n/g, ', ')}`);

  // Antes de nada: ¿ya funciona sin certificados extra?
  const sinExtra = await probarConexion([]);
  if (sinExtra.ok) {
    console.log('\nLa conexión ya valida sin certificados extra. No hace falta BCV_CA_CERT.');
    return;
  }
  console.log(`  Validación actual: ${sinExtra.error}\n`);

  const pems = [];
  let actual = hoja;

  for (let nivel = 1; nivel <= MAX_NIVELES; nivel++) {
    const url = urlEmisor(actual);
    if (!url) {
      throw new Error('El certificado no indica de dónde descargar su emisor. Usa el método de Chrome.');
    }

    console.log(`Descargando intermedio (nivel ${nivel}) desde ${url}`);
    const intermedio = await descargarCertificado(url);

    // Verificación criptográfica: el intermedio debe haber firmado al actual
    if (!actual.checkIssued(intermedio) || !actual.verify(intermedio.publicKey)) {
      throw new Error('El certificado descargado no corresponde al emisor esperado. Se aborta.');
    }
    console.log(`  OK: ${intermedio.subject.replace(/\n/g, ', ')} (vence ${intermedio.validTo})`);
    pems.push(intermedio.toString());

    const prueba = await probarConexion(pems);
    if (prueba.ok) {
      mkdirSync('certs', { recursive: true });
      writeFileSync(SALIDA, pems.join('\n'));
      console.log(`\nConexión validada correctamente. Guardado en: ${SALIDA}`);
      console.log(`Agrega al .env:  BCV_CA_CERT="${SALIDA}"`);
      return;
    }
    console.log(`  Aún no valida (${prueba.error}), subiendo un nivel...`);
    actual = intermedio;
  }

  throw new Error(`No se logró validar la conexión tras ${MAX_NIVELES} niveles.`);
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
