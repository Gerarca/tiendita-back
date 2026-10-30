import { Module } from '@nestjs/common';
import { InventarioModule } from '../inventario/inventario.module.js';
import { ProductosModule } from '../productos/productos.module.js';
import { IngresosController } from './ingresos.controller.js';
import { IngresosService } from './ingresos.service.js';

@Module({
  imports: [InventarioModule, ProductosModule],
  controllers: [IngresosController],
  providers: [IngresosService],
})
export class IngresosModule {}
