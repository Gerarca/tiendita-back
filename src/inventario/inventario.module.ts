import { Module } from '@nestjs/common';
import { InventarioController } from './inventario.controller.js';
import { InventarioService } from './inventario.service.js';

@Module({
  controllers: [InventarioController],
  providers: [InventarioService],
  exports: [InventarioService], // ingresos, ventas, regalos y traspasos lo usan
})
export class InventarioModule {}
