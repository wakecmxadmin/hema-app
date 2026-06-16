import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase';
import { isStaffEmail } from './staff-domains.util';

@Injectable()
export class StaffGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Token não enviado');
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.decode(token);
    } catch {
      throw new UnauthorizedException('Token inválido');
    }

    if (!decoded?.sub) {
      throw new UnauthorizedException('Token inválido');
    }

    request.user = decoded;

    // Defensive check: the JWT alone is not enough — Supabase issues JWTs
    // even before email confirmation, so we re-fetch the user from auth
    // and validate both the domain and the confirmation flag.
    const { data, error } = await supabase.auth.admin.getUserById(decoded.sub);

    if (error || !data?.user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const email = (data.user.email ?? '').toLowerCase();
    const confirmedAt = data.user.email_confirmed_at as
      | string
      | null
      | undefined;

    if (!isStaffEmail(email, confirmedAt)) {
      throw new ForbiddenException(
        'Acesso restrito a funcionários da Hema Cereais',
      );
    }

    request.user.email = email;
    request.user.isStaff = true;
    return true;
  }
}
