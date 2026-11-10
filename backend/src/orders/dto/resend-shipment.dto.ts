import { IsOptional, IsString } from 'class-validator';

export class ResendShipmentDto {
  /**
   * Telefone do cliente, gravado no cadastro antes de tentar o envio de novo.
   * Existe porque a falha mais comum da transportadora é justamente o
   * `telefoneComprador` vazio — sem isso o admin teria que editar o perfil
   * por fora antes de reenviar.
   */
  @IsOptional()
  @IsString()
  phone?: string;
}
