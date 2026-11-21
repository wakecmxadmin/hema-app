import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { LogManagerService } from './logmanager.service';
import { MelhorEnvioService } from './melhor-envio.service';
import { MelhorEnvioShipmentService } from './melhor-envio-shipment.service';
import { MelhorEnvioController } from './melhor-envio.controller';

@Module({
  controllers: [ShippingController, MelhorEnvioController],
  providers: [
    ShippingService,
    LogManagerService,
    MelhorEnvioService,
    MelhorEnvioShipmentService,
  ],
  exports: [ShippingService],
})
export class ShippingModule {}
