import { Module } from '@nestjs/common';
import { BcvController } from './bcv/bcv.controller.js';
import { BcvService } from './bcv/bcv.service.js';
import { TasasController } from './tasas.controller.js';
import { TasasService } from './tasas.service.js';

@Module({
  controllers: [BcvController, TasasController],
  providers: [TasasService, BcvService],
  exports: [TasasService], // lo usará el módulo de ventas
})
export class TasasModule {}
