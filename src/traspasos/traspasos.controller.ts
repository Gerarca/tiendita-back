import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { ListarTraspasosDto } from './dto/listar-traspasos.dto.js';
import { RegistrarTraspasoDto } from './dto/registrar-traspaso.dto.js';
import { TraspasosService } from './traspasos.service.js';

/** Solo administradores (registrar y consultar). */
@Roles('ADMIN')
@Controller('traspasos')
export class TraspasosController {
  constructor(private readonly traspasos: TraspasosService) {}

  /** GET /api/traspasos?desde=2026-10-01&hasta=2026-10-31&buscar=feria */
  @Get()
  listar(@Query() query: ListarTraspasosDto) {
    return this.traspasos.listar(query);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.traspasos.obtener(id);
  }

  /** Solo ADMIN: es una salida de mercancía sin cobro y, por ahora, no se puede anular (igual que regalos). */
  @Post()
  registrar(@Body() dto: RegistrarTraspasoDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.traspasos.registrar(dto, usuario);
  }
}
