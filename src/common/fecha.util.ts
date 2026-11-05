import { BadRequestException } from '@nestjs/common';

/** Formato de fecha usado en toda la API: AAAA-MM-DD */
export const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Zona horaria del negocio. Se lee en cada llamada (no al importar el módulo)
 * porque ConfigModule carga el .env después de que se evalúan los imports.
 */
export function zonaHoraria(): string {
  return process.env.TZ_NEGOCIO ?? 'America/Caracas';
}

/** Fecha de "hoy" en la zona del negocio, sin importar la zona del servidor. */
export function fechaHoyNegocio(ahora: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** Verifica formato y que la fecha exista (rechaza 2026-02-30). */
export function esFechaValida(fecha: string): boolean {
  if (!FECHA_REGEX.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

/** AAAA-MM-DD → Date para columnas @db.Date (medianoche UTC). */
export function aFechaDb(fecha: string): Date {
  if (!esFechaValida(fecha)) {
    throw new BadRequestException(`Fecha inválida: ${fecha}. Usa el formato AAAA-MM-DD`);
  }
  return new Date(`${fecha}T00:00:00.000Z`);
}

/** Date de una columna @db.Date → AAAA-MM-DD */
export function deFechaDb(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Días completos desde `desde` hasta `hasta` (ambas AAAA-MM-DD). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aFechaDb(hasta).getTime() - aFechaDb(desde).getTime()) / 86_400_000);
}

/** Suma (o resta) días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const d = aFechaDb(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return deFechaDb(d);
}

/** Minutos de diferencia con UTC de una zona en un instante (Caracas = -240). */
function desfaseMinutos(zona: string, instante: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(
    instante,
  );
  const nombre = partes.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(nombre);
  if (!m) return 0; // "GMT" a secas = UTC
  const signo = m[1] === '-' ? -1 : 1;
  return signo * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Instante en que empieza el día AAAA-MM-DD en la zona del negocio. */
export function inicioDiaNegocio(fecha: string): Date {
  const medianocheUtc = aFechaDb(fecha).getTime();
  return new Date(medianocheUtc - desfaseMinutos(zonaHoraria(), new Date(medianocheUtc)) * 60_000);
}

/**
 * Filtro para columnas timestamptz a partir de días del negocio.
 * "hasta" es inclusivo: hasta=2026-01-31 incluye todo el 31 de enero.
 */
export function rangoDiasNegocio(desde?: string, hasta?: string): { gte?: Date; lt?: Date } | undefined {
  if (desde && hasta && desde > hasta) {
    throw new BadRequestException('"desde" no puede ser posterior a "hasta"');
  }
  if (!desde && !hasta) return undefined;
  return {
    ...(desde ? { gte: inicioDiaNegocio(desde) } : {}),
    ...(hasta ? { lt: inicioDiaNegocio(sumarDias(hasta, 1)) } : {}),
  };
}
