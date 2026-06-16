import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { PaymentTimeoutCron } from './payment-timeout.cron';
import { CartModule } from '../cart/cart.module';
import { PaymentsModule } from '../payments/payment.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShippingModule } from '../shipping/shipping.module';

@Module({
  imports: [
    CartModule,
    forwardRef(() => PaymentsModule),
    NotificationsModule,
    ShippingModule,
  ],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, AdminOrdersService, PaymentTimeoutCron],
  exports: [OrdersService],
})
export class OrdersModule {}
