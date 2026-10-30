import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { CategoriasModule } from './categorias/categorias.module.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { CuentasModule } from './cuentas/cuentas.module.js';
import { IngresosModule } from './ingresos/ingresos.module.js';
import { InventarioModule } from './inventario/inventario.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductosModule } from './productos/productos.module.js';
import { RegalosModule } from './regalos/regalos.module.js';
import { TasasModule } from './tasas/tasas.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { VentasModule } from './ventas/ventas.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Límite general; el login tiene uno más estricto (ver AuthController)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsuariosModule,
    TasasModule,
    CategoriasModule,
    ProductosModule,
    InventarioModule,
    IngresosModule,
    ClientesModule,
    CuentasModule,
    VentasModule,
    RegalosModule,
  ],
  providers: [
    // Orden importante: primero autentica, luego verifica rol.
    // Todas las rutas quedan protegidas salvo las marcadas con @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
