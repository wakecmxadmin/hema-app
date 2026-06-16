import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StaffGuard } from '../auth/staff.guard';
import { AdminOrdersService } from './admin-orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { ConfirmOrderDto, RejectOrderDto } from './dto/confirm-order.dto';

@Controller('admin/orders')
@UseGuards(StaffGuard)
export class AdminOrdersController {
  constructor(private readonly adminOrdersService: AdminOrdersService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminOrdersService.findAll({
      status,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.adminOrdersService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.adminOrdersService.updateStatus(id, dto);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Body() dto: ConfirmOrderDto) {
    return this.adminOrdersService.confirmOrder(id, dto);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectOrderDto) {
    return this.adminOrdersService.rejectOrder(id, dto);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.adminOrdersService.cancelOrder(id);
  }
}
