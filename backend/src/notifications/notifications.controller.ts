import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AuthRequest } from '../auth/types';
import { NotificationsService } from './notifications.service';
import { RegisterTokenDto } from './dto/register-token.dto';

@Controller('notifications')
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('register-token')
  registerToken(@Req() req: AuthRequest, @Body() dto: RegisterTokenDto) {
    return this.notificationsService.registerToken(req.user.sub, dto);
  }

  @Delete('token/:expoPushToken')
  unregisterToken(@Req() req: AuthRequest, @Param('expoPushToken') token: string) {
    return this.notificationsService.unregisterToken(req.user.sub, token);
  }
}
