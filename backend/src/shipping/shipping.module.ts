import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { LogManagerService } from './logmanager.service';

@Module({
  controllers: [ShippingController],
  providers: [ShippingService, LogManagerService],
  exports: [ShippingService],
})
export class ShippingModule {}
