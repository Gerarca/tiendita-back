import { BadRequestException } from '@nestjs/common';

/** Formato de fecha usado en toda la API: AAAA-MM-DD */
export const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Zona horaria del negocio. Se lee en cada llamada (no al importar el módulo)
 * porque ConfigModule carga el .env después de que se evalúan los imports.
 */
function zonaHoraria(): string {
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
