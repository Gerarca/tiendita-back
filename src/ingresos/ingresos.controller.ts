import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { IngresoProductoNuevoDto } from './dto/ingreso-producto-nuevo.dto.js';
import { ListarIngresosDto } from './dto/listar-ingresos.dto.js';
import { RegistrarIngresoDto } from './dto/registrar-ingreso.dto.js';
import { IngresosService } from './ingresos.service.js';

/** Ingreso de material: solo administradores. */
@Roles('ADMIN')
@Controller('ingresos')
export class IngresosController {
  constructor(private readonly ingresos: IngresosService) {}

  /** GET /api/ingresos?desde=2026-10-01&hasta=2026-10-31 */
  @Get()
  listar(@Query() query: ListarIngresosDto) {
    return this.ingresos.listar(query);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.ingresos.obtener(id);
  }

  /** POST /api/ingresos — productos existentes (uno o varios) */
  @Post()
  registrar(@Body() dto: RegistrarIngresoDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.ingresos.registrar(dto, usuario);
  }

  /** POST /api/ingresos/producto-nuevo — crea el producto y su primer ingreso */
  @Post('producto-nuevo')
  registrarProductoNuevo(@Body() dto: IngresoProductoNuevoDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.ingresos.registrarProductoNuevo(dto, usuario);
  }
}
