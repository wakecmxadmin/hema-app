import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AuthRequest } from '../auth/types';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@Controller('coupons')
@UseGuards(SupabaseAuthGuard)
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  validate(@Req() req: AuthRequest, @Body() dto: ValidateCouponDto) {
    return this.couponsService.validateForUser(req.user.sub, dto.code);
  }
}
