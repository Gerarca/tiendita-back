import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes/clientes.module.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { TasasModule } from '../tasas/tasas.module.js';
import { VentasController } from './ventas.controller.js';
import { VentasService } from './ventas.service.js';

@Module({
  imports: [TasasModule, InventarioModule, ClientesModule],
  controllers: [VentasController],
  providers: [VentasService],
})
export class VentasModule {}
