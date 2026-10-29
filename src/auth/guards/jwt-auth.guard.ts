import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JwtPayload, UsuarioSesion } from '../auth.types.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (esPublica) return true;

    const req = ctx.switchToHttp().getRequest<Request & { usuario?: UsuarioSesion }>();
    const token = this.extraerToken(req);
    if (!token) throw new UnauthorizedException('Debes iniciar sesión');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }

    // Se consulta la BD en cada request: si un admin desactiva a un usuario
    // o le cambia el rol, surte efecto de inmediato (no al vencer el token).
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { id: true, nombre: true, usuario: true, rol: true, activo: true },
    });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    req.usuario = {
      id: usuario.id,
      nombre: usuario.nombre,
      usuario: usuario.usuario,
      rol: usuario.rol,
    };
    return true;
  }

  private extraerToken(req: Request): string | undefined {
    const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
    return tipo === 'Bearer' ? token : undefined;
  }
}
