import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { supabase } from '../lib/supabase';

@Injectable()
export class ProductsService {
  async getHomeCatalog() {
    try {
      // Uma única chamada de RPC substitui 6 queries sequenciais.
      // A função `get_home_catalog` retorna jsonb com até 5 categorias e
      // seus 10 primeiros produtos ativos em estoque.
      const { data, error } = await supabase.rpc('get_home_catalog');

      if (error) throw error;

      return {
        success: true,
        message: 'Catálogo carregado com sucesso',
        data: data || [],
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao carregar o catálogo',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        throw new HttpException(
          { success: false, message: 'Produto não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        message: 'Produto encontrado',
        data: {
          id: data.id,
          name: data.name,
          description: data.description,
          type: data.type,
          price: data.price,
          price_per_kg: data.price_per_kg,
          image_url: data.image_url,
          stock: data.stock,
        },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao buscar detalhes do produto',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findSimilar(productId: string) {
    try {
      // 1. Pega a categoria do produto atual
      const { data: product, error } = await supabase
        .from('products')
        .select('id, category_id')
        .eq('id', productId)
        .eq('is_active', true)
        .single();

      if (error || !product) {
        throw new HttpException(
          { success: false, message: 'Produto base não encontrado.' },
          HttpStatus.NOT_FOUND,
        );
      }

      // 2. Busca produtos da mesma categoria, excluindo o próprio produto
      const { data, error: error2 } = await supabase
        .from('products')
        .select('id, name, price, price_per_kg, image_url, type, stock')
        .eq('category_id', product.category_id)
        .eq('is_active', true)
        .gt('stock', 0)
        .neq('id', productId)
        .limit(10);

      if (error2) throw error2;

      return {
        success: true,
        message: 'Produtos similares encontrados',
        data: data || [],
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao buscar produtos similares',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findCategoryProducts(
    categoryId: string,
    limit: number,
    offset: number,
  ) {
    try {
      const to = offset + limit - 1;

      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, price_per_kg, image_url, type, stock')
        .eq('category_id', categoryId)
        .eq('is_active', true)
        .gt('stock', 0)
        .range(offset, to);

      if (error) throw error;

      return {
        success: true,
        message: 'Produtos da categoria carregados',
        data: data || [],
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao buscar produtos desta categoria',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
