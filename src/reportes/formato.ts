import { zonaHoraria } from '../common/fecha.util.js';

/** Componentes de fecha y hora en la zona del negocio. */
export function partesNegocio(d: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return { anio: v('year'), mes: v('month'), dia: v('day'), hora: v('hour'), minuto: v('minute') };
}

const dos = (n: number) => String(n).padStart(2, '0');

export function fmtFecha(d: Date): string {
  const p = partesNegocio(d);
  return `${dos(p.dia)}/${dos(p.mes)}/${p.anio}`;
}

export function fmtFechaHora(d: Date): string {
  const p = partesNegocio(d);
  return `${fmtFecha(d)} ${dos(p.hora)}:${dos(p.minuto)}`;
}

/** AAAA-MM-DD → DD/MM/AAAA */
export function fmtDia(fecha: string): string {
  const [a, m, d] = fecha.split('-');
  return `${d}/${m}/${a}`;
}

/** Formato venezolano: 1.234,56 */
export function fmtNumero(n: number, minDecimales: number, maxDecimales = minDecimales): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: minDecimales,
    maximumFractionDigits: maxDecimales,
  }).format(n);
}

/**
 * Excel guarda fechas sin zona horaria: se pasa la hora LOCAL del negocio
 * como si fuera UTC para que la celda muestre la hora de Venezuela.
 */
export function fechaParaExcel(d: Date): Date {
  const p = partesNegocio(d);
  return new Date(Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto));
}
