import { Module } from '@nestjs/common';
import { InventarioModule } from '../inventario/inventario.module.js';
import { TraspasosController } from './traspasos.controller.js';
import { TraspasosService } from './traspasos.service.js';

@Module({
  imports: [InventarioModule],
  controllers: [TraspasosController],
  providers: [TraspasosService],
})
export class TraspasosModule {}
