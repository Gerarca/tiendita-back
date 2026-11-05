import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { PeriodoReporteDto, ReportePagosDto, type FormatoReporte } from './dto/reporte.dto.js';
import { generarExcel } from './generadores/excel.js';
import { generarPdf } from './generadores/pdf.js';
import type { Reporte } from './reporte.types.js';
import { ReportesService } from './reportes.service.js';

const TIPOS = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

/**
 * Reportes descargables. Todos aceptan:
 *   ?anio=2026&mes=1 | ?anio=2026&trimestre=1 | ?anio=2026 | ?desde=...&hasta=...
 *   &formato=json (vista previa) | pdf | xlsx
 */
@Roles('ADMIN')
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('ventas')
  async ventas(@Query() q: PeriodoReporteDto, @UsuarioActual() u: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    return this.entregar(await this.reportes.ventas(q, u), q.formato, res);
  }

  /** ?cuentaId=1 → equivalente a la hoja "Provincial Jurídico" */
  @Get('pagos')
  async pagos(@Query() q: ReportePagosDto, @UsuarioActual() u: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    return this.entregar(await this.reportes.pagos(q, u), q.formato, res);
  }

  @Get('regalos')
  async regalos(@Query() q: PeriodoReporteDto, @UsuarioActual() u: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    return this.entregar(await this.reportes.regalos(q, u), q.formato, res);
  }

  @Get('traspasos')
  async traspasos(@Query() q: PeriodoReporteDto, @UsuarioActual() u: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    return this.entregar(await this.reportes.traspasos(q, u), q.formato, res);
  }

  @Get('inventario')
  async inventario(@Query() q: PeriodoReporteDto, @UsuarioActual() u: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    return this.entregar(await this.reportes.inventario(q, u), q.formato, res);
  }

  private async entregar(reporte: Reporte, formato: FormatoReporte, res: Response) {
    if (formato === 'json') return reporte;

    const contenido = formato === 'pdf' ? await generarPdf(reporte) : await generarExcel(reporte);
    res.set({
      'Content-Type': TIPOS[formato],
      'Content-Disposition': `attachment; filename="${reporte.archivo}.${formato}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(contenido);
  }
}
