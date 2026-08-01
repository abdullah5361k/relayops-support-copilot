import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true
  });
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`RelayOps API listening on http://localhost:${port}/api`);
}

void bootstrap();
