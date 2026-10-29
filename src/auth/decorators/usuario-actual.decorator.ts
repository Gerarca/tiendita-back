import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UsuarioSesion } from '../auth.types.js';

/** Inyecta el usuario autenticado. Ej.: metodo(@UsuarioActual() u: UsuarioSesion) */
export const UsuarioActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioSesion =>
    ctx.switchToHttp().getRequest<{ usuario: UsuarioSesion }>().usuario,
);
