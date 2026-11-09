import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { supabase } from '../lib/supabase';
import { parseProductSort } from '../products/product-sort';

@Injectable()
export class SearchService {
  async searchProducts(
    searchQuery: string,
    limitCount: number = 20,
    offsetCount: number = 0,
    sort?: string,
  ) {
    try {
      // Padrão 'relevance': ordenar a busca por preço logo de cara jogaria
      // fora o score que faz o termo digitado encontrar o produto certo.
      // Quando o cliente escolhe preço, a própria RPC corta os resultados de
      // score baixo — senão a lista viraria o catálogo inteiro em ordem de
      // preço, sem relação com o que ele digitou.
      const { data, error } = await supabase.rpc('search_products', {
        search_query: searchQuery,
        limit_count: limitCount,
        offset_count: offsetCount,
        sort_by: parseProductSort(sort, 'relevance'),
      });

      if (error) throw error;

      return {
        success: true,
        message: 'Busca realizada com sucesso',
        data: data || [],
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao buscar produtos',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
