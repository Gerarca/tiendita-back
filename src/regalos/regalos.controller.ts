import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { ListarRegalosDto } from './dto/listar-regalos.dto.js';
import { RegistrarRegaloDto } from './dto/registrar-regalo.dto.js';
import { RegalosService } from './regalos.service.js';

/** Solo administradores (registrar y consultar). */
@Roles('ADMIN')
@Controller('regalos')
export class RegalosController {
  constructor(private readonly regalos: RegalosService) {}

  /** GET /api/regalos?desde=2026-10-01&hasta=2026-10-31&buscar=parroquia */
  @Get()
  listar(@Query() query: ListarRegalosDto) {
    return this.regalos.listar(query);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.regalos.obtener(id);
  }

  /** Solo ADMIN: es una salida de mercancía sin cobro y, por ahora, no se puede anular. */
  @Post()
  registrar(@Body() dto: RegistrarRegaloDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.regalos.registrar(dto, usuario);
  }
}
