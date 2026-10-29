import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import { RestablecerPasswordDto } from './dto/restablecer-password.dto.js';
import { UsuariosService } from './usuarios.service.js';

/** Gestión de usuarios: solo administradores. */
@Roles('ADMIN')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.usuarios.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearUsuarioDto) {
    return this.usuarios.crear(dto);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarUsuarioDto,
    @UsuarioActual() actor: UsuarioSesion,
  ) {
    return this.usuarios.actualizar(id, dto, actor.id);
  }

  @Patch(':id/password')
  @HttpCode(204)
  async restablecerPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RestablecerPasswordDto,
  ) {
    await this.usuarios.restablecerPassword(id, dto);
  }
}
