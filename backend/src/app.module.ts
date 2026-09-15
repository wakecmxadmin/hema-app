import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { SearchModule } from './search/search.module';
import { AddressesModule } from './addresses/addresses.module';
import { ProfilesModule } from './profiles/profiles.module';
import { CategoriesModule } from './categories/categories.module';
import { PaymentsModule } from './payments/payment.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ShippingModule } from './shipping/shipping.module';
import { IfoodModule } from './ifood/ifood.module';
import { CouponsModule } from './coupons/coupons.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ProductsModule,
    CartModule,
    OrdersModule,
    SearchModule,
    AddressesModule,
    ProfilesModule,
    CategoriesModule,
    PaymentsModule,
    NotificationsModule,
    ShippingModule,
    IfoodModule,
    CouponsModule,
  ],
})
export class AppModule {}
