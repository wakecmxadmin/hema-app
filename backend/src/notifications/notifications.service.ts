import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { supabase } from '../lib/supabase';
import { RegisterTokenDto } from './dto/register-token.dto';
import { isStaffEmail } from '../auth/staff-domains.util';

@Injectable()
export class NotificationsService {
  async registerToken(userId: string, dto: RegisterTokenDto) {
    try {
      // Re-check staff status server-side so the flag stored on the row is
      // always trustworthy regardless of what the client sends.
      const { data: userData, error: userErr } =
        await supabase.auth.admin.getUserById(userId);

      if (userErr || !userData?.user) {
        throw new HttpException(
          { success: false, message: 'Usuário não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      const isStaff = isStaffEmail(
        userData.user.email,
        userData.user.email_confirmed_at,
      );

      const { error } = await supabase
        .from('device_tokens')
        .upsert(
          {
            user_id: userId,
            expo_push_token: dto.expo_push_token,
            platform: dto.platform ?? null,
            is_staff: isStaff,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,expo_push_token' },
        );

      if (error) throw error;

      return {
        success: true,
        message: 'Token registrado.',
        data: { is_staff: isStaff },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao registrar token de notificação.',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async unregisterToken(userId: string, expoPushToken: string) {
    try {
      const { error } = await supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('expo_push_token', expoPushToken);

      if (error) throw error;

      return { success: true, message: 'Token removido.' };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao remover token.',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
