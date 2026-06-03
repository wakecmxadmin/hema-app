import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';

@Controller('orders')
@UseGuards(SupabaseAuthGuard) // Protege o controller todo
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  createOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
    const userId = req.user.sub;
    return this.ordersService.createOrder(userId, dto);
  }

  @Post(':id/pay')
  payOrder(
    @Req() req: any,
    @Param('id') order_id: string,
    @Body() paymentData: any,
  ) {
    const userId = req.user.sub;
    return this.ordersService.confirmAndPayOrder(userId, order_id, paymentData);
  }

  @Get('my-orders')
  getUserOrders(@Req() req: any) {
    const userId = req.user.sub;
    return this.ordersService.findAllByUser(userId);
  }

  @Get(':id')
  getOrderDetails(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub;
    return this.ordersService.findOne(userId, id);
  }

  @Patch(':id/cancel')
  cancelOrder(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub;
    return this.ordersService.cancelOrder(userId, id);
  }

  @Post(':id/reorder')
  reorder(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.sub;
    return this.ordersService.reorder(userId, id);
  }
}
