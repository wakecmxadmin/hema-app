import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import { AdminCouponsController } from './admin-coupons.controller';

@Module({
  imports: [CartModule],
  controllers: [CouponsController, AdminCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
