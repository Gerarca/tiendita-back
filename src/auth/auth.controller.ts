import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import type { UsuarioSesion } from './auth.types.js';
import { Public } from './decorators/public.decorator.js';
import { UsuarioActual } from './decorators/usuario-actual.decorator.js';
import { CambiarPasswordDto } from './dto/cambiar-password.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/login — máximo 5 intentos por minuto por IP */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** GET /api/auth/me — datos del usuario de la sesión */
  @Get('me')
  me(@UsuarioActual() usuario: UsuarioSesion) {
    return usuario;
  }

  /** PATCH /api/auth/password — el usuario cambia su propia contraseña */
  @Patch('password')
  @HttpCode(204)
  async cambiarPassword(@UsuarioActual() usuario: UsuarioSesion, @Body() dto: CambiarPasswordDto) {
    await this.auth.cambiarPassword(usuario.id, dto);
  }
}
