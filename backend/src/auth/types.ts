import { Request } from 'express';

export interface AuthRequest extends Request {
  user: {
    sub: string;
    email?: string;
    isStaff?: boolean;
    [key: string]: unknown;
  };
}
