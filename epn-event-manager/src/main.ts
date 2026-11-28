import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// Permite aplicar las reglas de validación del DTO globalmente.
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Aplica las validaciones de los DTO antes de procesar las peticiones.
  app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();


