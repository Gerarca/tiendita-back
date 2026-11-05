import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { AjusteInventarioDto } from './dto/ajuste-inventario.dto.js';
import { KardexDto } from './dto/kardex.dto.js';
import { InventarioService } from './inventario.service.js';

/** Kardex y ajustes: solo administradores (el kardex muestra ventas de todos). */
@Roles('ADMIN')
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  /** GET /api/inventario/kardex/:productoId?desde=2026-01-01&hasta=2026-01-31 */
  @Get('kardex/:productoId')
  kardex(@Param('productoId', ParseIntPipe) productoId: number, @Query() query: KardexDto) {
    return this.inventario.kardex(productoId, query);
  }

  /** POST /api/inventario/ajustes — corrección por conteo físico */
  @Post('ajustes')
  ajustar(@Body() dto: AjusteInventarioDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.inventario.ajustarPorConteo(dto, usuario.id);
  }
}
