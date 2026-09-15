import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StaffGuard } from '../auth/staff.guard';
import { AuthRequest } from '../auth/types';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Controller('admin/coupons')
@UseGuards(StaffGuard)
export class AdminCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  list() {
    return this.couponsService.adminList();
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateCouponDto) {
    return this.couponsService.adminCreate(dto, req.user.email ?? req.user.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.couponsService.adminUpdate(id, dto);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @Body('is_active') isActive: boolean) {
    return this.couponsService.adminToggle(id, isActive);
  }
}
