import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class RegisterTokenDto {
  @IsString()
  @Matches(/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/, {
    message: 'expo_push_token inválido',
  })
  expo_push_token!: string;

  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: 'ios' | 'android' | 'web';
}
