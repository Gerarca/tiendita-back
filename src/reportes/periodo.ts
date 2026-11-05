import { BadRequestException } from '@nestjs/common';
import { fechaHoyNegocio, rangoDiasNegocio, sumarDias } from '../common/fecha.util.js';
import { PeriodoReporteDto } from './dto/reporte.dto.js';
import { fmtDia } from './formato.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface Periodo {
  desde: string;
  hasta: string;
  /** Texto para el encabezado: "Enero 2026", "1er trimestre 2026"... */
  etiqueta: string;
  /** Para el nombre del archivo: "2026-01", "2026-T1"... */
  sufijo: string;
  /** Filtro para columnas timestamptz (hasta es inclusivo). */
  rango: { gte: Date; lt: Date };
}

const dos = (n: number) => String(n).padStart(2, '0');

function ultimoDiaDelMes(anio: number, mes: number): string {
  const siguiente = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${dos(mes + 1)}-01`;
  return sumarDias(siguiente, -1);
}

export function resolverPeriodo(q: PeriodoReporteDto): Periodo {
  let desde: string;
  let hasta: string;
  let etiqueta: string;
  let sufijo: string;

  if (q.desde || q.hasta) {
    if (!q.desde || !q.hasta) throw new BadRequestException('Indica "desde" y "hasta"');
    if (q.anio || q.mes || q.trimestre) {
      throw new BadRequestException('Usa año/mes/trimestre o desde/hasta, no ambos');
    }
    desde = q.desde;
    hasta = q.hasta;
    etiqueta = desde === hasta ? fmtDia(desde) : `Del ${fmtDia(desde)} al ${fmtDia(hasta)}`;
    sufijo = desde === hasta ? desde : `${desde}_${hasta}`;
  } else {
    if (q.mes && q.trimestre) throw new BadRequestException('Indica mes o trimestre, no ambos');
    const hoy = fechaHoyNegocio();
    const anio = q.anio ?? Number(hoy.slice(0, 4));

    if (q.trimestre) {
      const mesInicio = (q.trimestre - 1) * 3 + 1;
      desde = `${anio}-${dos(mesInicio)}-01`;
      hasta = ultimoDiaDelMes(anio, mesInicio + 2);
      etiqueta = `${['1er', '2do', '3er', '4to'][q.trimestre - 1]} trimestre ${anio} (${MESES[mesInicio - 1]} a ${MESES[mesInicio + 1]})`;
      sufijo = `${anio}-T${q.trimestre}`;
    } else if (q.mes || !q.anio) {
      const mes = q.mes ?? Number(hoy.slice(5, 7)); // sin nada: mes en curso
      desde = `${anio}-${dos(mes)}-01`;
      hasta = ultimoDiaDelMes(anio, mes);
      etiqueta = `${MESES[mes - 1]} ${anio}`;
      sufijo = `${anio}-${dos(mes)}`;
    } else {
      desde = `${anio}-01-01`;
      hasta = `${anio}-12-31`;
      etiqueta = `Año ${anio}`;
      sufijo = `${anio}`;
    }
  }

  const rango = rangoDiasNegocio(desde, hasta)!;
  return { desde, hasta, etiqueta, sufijo, rango: { gte: rango.gte!, lt: rango.lt! } };
}
