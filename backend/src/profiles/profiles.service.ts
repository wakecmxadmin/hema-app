import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { UpdateProfileDto, SupportTicketDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  private supabaseUrl = process.env.SUPABASE_URL as string;
  private supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

  private async supabaseFetch(
    path: string,
    method: string,
    body?: any,
    isRawBody = false,
  ) {
    const url = `${this.supabaseUrl}${path}`;

    try {
      const headers: Record<string, string> = {
        apikey: this.supabaseKey,
        Authorization: `Bearer ${this.supabaseKey}`,
        // Obriga o Supabase a retornar os dados alterados nos PATCHs
        Prefer: 'return=representation',
      };

      if (!isRawBody) {
        headers['Content-Type'] = 'application/json';
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (body) {
        if (isRawBody && body.buffer) {
          // A MÁGICA FINAL: Converte o Buffer cru do Node para um Blob da Web!
          // Isso garante que o Supabase receba os bytes reais da imagem, e não um arquivo vazio.
          fetchOptions.body = new Blob([body.buffer], { type: body.mimetype });

          if (body.mimetype) {
            headers['Content-Type'] = body.mimetype;
          }
        } else if (!isRawBody) {
          fetchOptions.body = JSON.stringify(body);
        } else {
          fetchOptions.body = body;
        }
      }

      const response = await fetch(url, fetchOptions);
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new HttpException(
          {
            success: false,
            message: this.mapErrorMessage(result || {}),
            error: result?.details || result?.error || 'Supabase Error',
          },
          response.status,
        );
      }

      // Validação extra para PATCH (se retornou array vazio, o registro não existia)
      if (method === 'PATCH' && Array.isArray(result) && result.length === 0) {
        throw new HttpException(
          {
            success: false,
            message: 'Perfil não encontrado na base de dados.',
          },
          404,
        );
      }

      return result || {};
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Falha na comunicação com o banco de dados',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Tradutor de erros
  private mapErrorMessage(errorData: any): string {
    if (errorData.code === '23505')
      return 'Este CPF ou e-mail já está cadastrado.';
    if (errorData.message?.includes('password'))
      return 'A senha não atende aos requisitos de segurança.';
    return errorData.message || 'Erro ao processar solicitação.';
  }

  // Busca os dados do perfil (Nome, CPF, Telefone, Avatar)
  async getProfile(userId: string) {
    const result = await this.supabaseFetch(
      `/rest/v1/profiles?id=eq.${userId}&select=*`,
      'GET',
    );

    if (Array.isArray(result) && result.length > 0) {
      return { success: true, message: 'Perfil carregado', data: result[0] };
    }

    throw new HttpException(
      { success: false, message: 'Perfil não encontrado' },
      404,
    );
  }

  async updateProfile(userId: string, data: UpdateProfileDto) {
    const { password, ...profileData } = data;

    if (password) {
      await this.supabaseFetch(`/auth/v1/user`, 'PUT', { password });
    }

    if (Object.keys(profileData).length > 0) {
      await this.supabaseFetch(
        `/rest/v1/profiles?id=eq.${userId}`,
        'PATCH',
        profileData,
      );
    }

    return { success: true, message: 'Dados atualizados com sucesso!' };
  }

  async createSupportTicket(userId: string, data: SupportTicketDto) {
    await this.supabaseFetch(`/rest/v1/support_tickets`, 'POST', {
      user_id: userId,
      ...data,
      status: 'open',
    });

    return {
      success: true,
      message: 'Sua mensagem foi enviada! Entraremos em contato em breve.',
    };
  }

  async deleteProfile(userId: string) {
    // Remove o usuário do auth.users via Admin API (também cascateia para public.profiles se houver FK)
    await this.supabaseFetch(`/auth/v1/admin/users/${userId}`, 'DELETE');
    return { success: true, message: 'Sua conta foi excluída com sucesso.' };
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const currentProfile = await this.getProfile(userId).catch(() => null);
    const oldAvatarUrl = currentProfile?.data?.avatar_url;

    if (oldAvatarUrl) {
      const oldFileName = oldAvatarUrl.split('/').pop();

      if (oldFileName) {
        const deletePath = `/storage/v1/object/avatars/${oldFileName}`;
        try {
          await this.supabaseFetch(deletePath, 'DELETE');
        } catch {
          console.warn(`Aviso: Falha ao deletar foto antiga (${oldFileName})`);
        }
      }
    }

    const fileName = `${userId}-${Date.now()}.jpg`;
    const path = `/storage/v1/object/avatars/${fileName}`;

    await this.supabaseFetch(path, 'POST', file, true);

    const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/avatars/${fileName}`;

    await this.updateProfile(userId, { avatar_url: publicUrl } as any);

    return {
      success: true,
      message: 'Foto atualizada com sucesso!',
      data: publicUrl,
    };
  }
}
