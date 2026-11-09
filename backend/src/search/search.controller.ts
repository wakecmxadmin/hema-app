import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchProductsDto } from './dto/search-products.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('products')
  @HttpCode(HttpStatus.OK)
  async searchProducts(@Body() body: SearchProductsDto) {
    return this.searchService.searchProducts(
      body.search_query,
      body.limit,
      body.offset,
      body.sort,
    );
  }
}
