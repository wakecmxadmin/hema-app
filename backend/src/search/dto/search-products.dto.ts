import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class SearchProductsDto {
  @IsString()
  @IsNotEmpty({ message: 'O termo de busca não pode estar vazio' })
  search_query: string;

  @IsNumber()
  @IsOptional()
  limit?: number;

  @IsNumber()
  @IsOptional()
  offset?: number;

  // Validado no service contra a lista fixa de `ProductSort`, e não aqui com
  // @IsIn: um valor desconhecido deve cair no padrão em vez de devolver 400
  // para um app que ainda não conhece a opção.
  @IsString()
  @IsOptional()
  sort?: string;
}
