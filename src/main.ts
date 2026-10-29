import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // whitelist: descarta campos que no estén en el DTO
  // forbidNonWhitelisted: y además responde 400 si los envían
  // transform: convierte el body a la clase del DTO (necesario para @Transform)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Solo para desarrollo con Next en otro puerto.
  // En producción Next se servirá desde Nest y CORS no hará falta.
  app.enableCors({ origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000') });

  const port = Number(config.get('PORT', 3001));
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}/api`);
}
void bootstrap();
