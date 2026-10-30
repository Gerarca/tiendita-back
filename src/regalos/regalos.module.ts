import { Module } from '@nestjs/common';
import { InventarioModule } from '../inventario/inventario.module.js';
import { RegalosController } from './regalos.controller.js';
import { RegalosService } from './regalos.service.js';

@Module({
  imports: [InventarioModule],
  controllers: [RegalosController],
  providers: [RegalosService],
})
export class RegalosModule {}
