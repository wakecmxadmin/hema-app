import {
  Controller,
  Get,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { parseProductSort } from './product-sort';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('home')
  getHomeCatalog() {
    return this.productsService.getHomeCatalog();
  }

  // Deixei essa rota antes do ':id' genérico por boa prática de roteamento
  @Get('category/:id')
  findCategoryProducts(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    // Sem pipe de validação de propósito: `parseProductSort` cai no padrão
    // em vez de responder 400 para um app em versão antiga.
    @Query('sort') sort?: string,
  ) {
    return this.productsService.findCategoryProducts(
      id,
      limit,
      offset,
      parseProductSort(sort, 'name_asc'),
    );
  }

  // Idem aqui. Rotas com sufixos fixos (como /similar) devem vir antes
  @Get(':id/similar')
  getSimilar(@Param('id') id: string) {
    return this.productsService.findSimilar(id);
  }

  // O ':id' genérico deve ser sempre a última rota GET, para não "engolir" as outras
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}
