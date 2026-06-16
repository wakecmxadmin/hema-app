import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { supabase } from '../lib/supabase';

@Injectable()
export class SearchService {
  async searchProducts(
    searchQuery: string,
    limitCount: number = 20,
    offsetCount: number = 0,
  ) {
    try {
      const { data, error } = await supabase.rpc('search_products', {
        search_query: searchQuery,
        limit_count: limitCount,
        offset_count: offsetCount,
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
