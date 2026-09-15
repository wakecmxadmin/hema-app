import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { createServer } from 'net';

const MAX_PORT_ATTEMPTS = 10;

/** Testa se a porta está livre tentando um bind rápido nela. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer();
    tester
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

/**
 * Acha a primeira porta livre a partir de `startPort`, incrementando de 1 em
 * 1. Evita o app quebrar quando outro projeto já está rodando na porta
 * padrão (ex.: dois backends locais, um na 3000 e outro precisando da 3001).
 */
async function findAvailablePort(startPort: number): Promise<number> {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const candidate = startPort + i;
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error(
    `Nenhuma porta livre entre ${startPort} e ${startPort + MAX_PORT_ATTEMPTS - 1}.`,
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.useGlobalPipes(new ValidationPipe());

  const logger = new Logger('Bootstrap');
  const desiredPort = Number(process.env.PORT) || 3000;
  const port = await findAvailablePort(desiredPort);

  if (port !== desiredPort) {
    logger.warn(
      `Porta ${desiredPort} já estava em uso. Subindo na ${port} em vez disso.`,
    );
  }

  await app.listen(port, '0.0.0.0');

  logger.log(`✅ Server iniciado e escutando na porta ${port}`);
}
bootstrap();
