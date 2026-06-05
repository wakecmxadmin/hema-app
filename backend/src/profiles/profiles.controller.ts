import {
  Controller,
  Patch,
  Delete,
  Post,
  Body,
  Req,
  Get,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProfileService } from './profiles.service';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AuthRequest } from '../auth/types';
import { UpdateProfileDto, SupportTicketDto } from './dto/update-profile.dto';

@Controller('profile')
@UseGuards(SupabaseAuthGuard)
export class ProfileController {
  constructor(private profileService: ProfileService) {}

  @Get()
  async getProfile(@Req() req: AuthRequest) {
    const userId = req.user.sub;
    return this.profileService.getProfile(userId);
  }

  @Patch()
  async updateProfile(@Req() req: AuthRequest, @Body() body: UpdateProfileDto) {
    const userId = req.user.sub;
    return this.profileService.updateProfile(userId, body);
  }

  @Delete()
  async deleteProfile(@Req() req: AuthRequest) {
    const userId = req.user.sub;
    return this.profileService.deleteProfile(userId);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = req.user.sub;
    return this.profileService.uploadAvatar(userId, file);
  }

  @Post('support')
  async sendSupport(@Req() req: AuthRequest, @Body() body: SupportTicketDto) {
    const userId = req.user.sub;
    return this.profileService.createSupportTicket(userId, body);
  }
}
