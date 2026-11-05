// =============================================================
// Seed inicial — Tienda del Monasterio
// Ejecutar con: npx prisma db seed
//
// Es idempotente: se puede correr varias veces sin duplicar datos
// ni sobrescribir lo que ya se haya editado desde el sistema.
// =============================================================

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

type CategoriaSeed = {
  nombre: string;
  prefijo?: string;
  hijas?: CategoriaSeed[];
};

// Tomadas de las capturas (menú lateral y secciones de Alimentos)
const CATEGORIAS: CategoriaSeed[] = [
  {
    nombre: 'Alimentos',
    hijas: [
      { nombre: 'Pasta', prefijo: 'PST' },
      { nombre: 'Salsas', prefijo: 'SLS' },
      { nombre: 'Café', prefijo: 'CAF' },
      { nombre: 'Galletas', prefijo: 'GLL' },
      // SUPUESTO: por "CROST-01 Crostata de mermelada de guayaba" del Excel
      { nombre: 'Repostería', prefijo: 'CROST' },
    ],
  },
  { nombre: 'Rosarios' },
  { nombre: 'Medallas' },
  { nombre: 'Pulseras Denarios' },
  { nombre: 'Decenas' },
  { nombre: 'Cruces' },
  { nombre: 'Libros' },
  { nombre: 'Otros artículos' },
];

/** Crea la categoría si no existe (Prisma no permite upsert con padreId null). */
async function asegurarCategoria(
  nombre: string,
  padreId: number | null,
  prefijo: string | undefined,
  orden: number,
) {
  const existente = await prisma.categoria.findFirst({ where: { nombre, padreId } });
  if (existente) return existente;

  return prisma.categoria.create({
    data: { nombre, padreId, prefijoCodigo: prefijo ?? null, orden },
  });
}

async function sembrarCategorias() {
  let total = 0;
  for (const [i, cat] of CATEGORIAS.entries()) {
    const padre = await asegurarCategoria(cat.nombre, null, cat.prefijo, i);
    total++;
    for (const [j, hija] of (cat.hijas ?? []).entries()) {
      await asegurarCategoria(hija.nombre, padre.id, hija.prefijo, j);
      total++;
    }
  }
  return total;
}

/**
 * Voces de la máquina fiscal tomadas del modelo de factura de la tienda.
 * Agrega aquí las demás voces que tenga programadas la máquina.
 */
const VOCES_FISCALES = [
  { nombre: 'ALIM CASEROS', exentoIva: false },
  { nombre: 'PULSERAS', exentoIva: false },
  { nombre: 'PASTA', exentoIva: true },
];

/** Categoría → voz, solo las que el modelo de factura deja claras. */
const VOZ_POR_CATEGORIA: Record<string, string> = {
  Pasta: 'PASTA',
  'Pulseras Denarios': 'PULSERAS',
  Galletas: 'ALIM CASEROS',
};

async function sembrarVoces() {
  for (const v of VOCES_FISCALES) {
    await prisma.vozFiscal.upsert({ where: { nombre: v.nombre }, update: {}, create: v });
  }
  // Solo asigna si la categoría aún no tiene voz: no pisa lo que se haya cambiado después
  for (const [categoria, voz] of Object.entries(VOZ_POR_CATEGORIA)) {
    const vozFiscal = await prisma.vozFiscal.findUnique({ where: { nombre: voz } });
    if (!vozFiscal) continue;
    await prisma.categoria.updateMany({
      where: { nombre: categoria, vozFiscalId: null },
      data: { vozFiscalId: vozFiscal.id },
    });
  }
}

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Define SEED_ADMIN_PASSWORD (mínimo 8 caracteres) en el archivo .env');
  }

  // 1. Ubicación única por ahora (traspasos pendientes de definir)
  await prisma.ubicacion.upsert({
    where: { nombre: 'Tienda' },
    update: {},
    create: { nombre: 'Tienda' },
  });

  // 2. Usuario administrador. update: {} → no cambia la clave si ya existe.
  await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {},
    create: {
      nombre: 'Administrador',
      usuario: 'admin',
      passwordHash: await hash(password, 12),
      rol: 'ADMIN',
    },
  });

  // 3. Cliente genérico para ventas rápidas (sin documento)
  const consumidorFinal = await prisma.cliente.findFirst({
    where: { nombre: 'CONSUMIDOR FINAL', numeroDocumento: null },
  });
  if (!consumidorFinal) {
    await prisma.cliente.create({ data: { nombre: 'CONSUMIDOR FINAL' } });
  }

  // 4. Cuenta bancaria de la hoja "Provincial Jurídico"
  await prisma.cuentaBancaria.upsert({
    where: { nombre: 'Provincial Jurídico' },
    update: {},
    create: {
      banco: 'BBVA Provincial',
      nombre: 'Provincial Jurídico',
      titular: 'POR COMPLETAR', // completar con el titular real
      tipo: 'JURIDICA',
    },
  });

  // 5. Correlativo del año en curso.
  //    Si se continúa la numeración del Excel, ajustar ultimoNumero
  //    al último N° de control usado este año.
  const anio = new Date().getFullYear();
  await prisma.correlativo.upsert({
    where: { anio },
    update: {},
    create: { anio, ultimoNumero: 0 },
  });

  // 6. Categorías y subcategorías
  const totalCategorias = await sembrarCategorias();

  // 7. Voces de la máquina fiscal (recuadro "MÁQUINA Bs." de la factura)
  await sembrarVoces();

  console.log('Seed completado:');
  console.log('  - Ubicación: Tienda');
  console.log('  - Usuario: admin');
  console.log('  - Cliente: CONSUMIDOR FINAL');
  console.log('  - Cuenta: Provincial Jurídico');
  console.log(`  - Correlativo: ${anio}`);
  console.log(`  - Categorías: ${totalCategorias}`);
  console.log(`  - Voces fiscales: ${VOCES_FISCALES.map((v) => v.nombre).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
