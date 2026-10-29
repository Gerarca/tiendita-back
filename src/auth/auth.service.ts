import { BadRequestException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from './auth.types.js';
import { CambiarPasswordDto } from './dto/cambiar-password.dto.js';
import { LoginDto } from './dto/login.dto.js';

export const BCRYPT_COSTO = 12;

@Injectable()
export class AuthService implements OnModuleInit {
  /**
   * Hash de relleno: si el usuario no existe, igual se ejecuta un compare()
   * para que la respuesta tarde lo mismo y no se pueda adivinar qué
   * usuarios existen midiendo el tiempo.
   */
  private hashRelleno = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    this.hashRelleno = await hash('usuario-inexistente', BCRYPT_COSTO);
  }

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { usuario: dto.usuario } });

    const claveCorrecta = await compare(dto.password, usuario?.passwordHash ?? this.hashRelleno);

    // Mismo mensaje en todos los casos: no revelar si el usuario existe
    if (!usuario || !usuario.activo || !claveCorrecta) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const payload: JwtPayload = { sub: usuario.id, usuario: usuario.usuario, rol: usuario.rol };

    return {
      accessToken: await this.jwt.signAsync(payload),
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        usuario: usuario.usuario,
        rol: usuario.rol,
      },
    };
  }

  async cambiarPassword(usuarioId: number, dto: CambiarPasswordDto) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });

    if (!(await compare(dto.passwordActual, usuario.passwordHash))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (dto.passwordActual === dto.passwordNueva) {
      throw new BadRequestException('La nueva contraseña debe ser distinta a la actual');
    }

    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { passwordHash: await hash(dto.passwordNueva, BCRYPT_COSTO) },
    });
  }
}
