import { BadGatewayException, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { BcvService } from './bcv.service.js';

/** Herramientas de administración para la tasa automática. */
@Roles('ADMIN')
@Controller('tasas/bcv')
export class BcvController {
  constructor(private readonly bcv: BcvService) {}

  /** GET /api/tasas/bcv/consultar — lee la página del BCV SIN guardar (para verificar) */
  @Get('consultar')
  async consultar() {
    try {
      return await this.bcv.consultar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      throw new BadGatewayException(`No se pudo obtener la tasa del BCV: ${mensaje}`);
    }
  }

  /** POST /api/tasas/bcv/sincronizar — ejecuta la sincronización ahora */
  @Post('sincronizar')
  @HttpCode(200)
  sincronizar() {
    return this.bcv.sincronizar();
  }
}
