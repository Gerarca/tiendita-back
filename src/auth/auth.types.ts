import { Rol } from '@prisma/client';

/** Contenido firmado dentro del JWT. */
export interface JwtPayload {
  sub: number;
  usuario: string;
  rol: Rol;
}

/** Usuario autenticado disponible en cada request (req.usuario). */
export interface UsuarioSesion {
  id: number;
  nombre: string;
  usuario: string;
  rol: Rol;
}
