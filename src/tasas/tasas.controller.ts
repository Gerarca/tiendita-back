import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { ListarTasasDto } from './dto/listar-tasas.dto.js';
import { RegistrarTasaDto } from './dto/registrar-tasa.dto.js';
import { TasasService } from './tasas.service.js';

@Controller('tasas')
export class TasasController {
  constructor(private readonly tasas: TasasService) {}

  /** GET /api/tasas/vigente — tasa a usar hoy (va antes de :fecha) */
  @Get('vigente')
  vigente() {
    return this.tasas.vigente();
  }

  /** GET /api/tasas?desde=2026-01-01&hasta=2026-01-31 */
  @Get()
  listar(@Query() query: ListarTasasDto) {
    return this.tasas.listar(query);
  }

  /** GET /api/tasas/2026-01-02 */
  @Get(':fecha')
  obtener(@Param('fecha') fecha: string) {
    return this.tasas.obtener(fecha);
  }

  /** POST /api/tasas — registrar (o corregir, si es ADMIN) */
  @Post()
  registrar(@Body() dto: RegistrarTasaDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.tasas.registrar(dto, usuario);
  }
}
