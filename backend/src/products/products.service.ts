import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { supabase } from '../lib/supabase';

@Injectable()
export class ProductsService {
  async getHomeCatalog() {
    try {
      // Busca category_ids distintos de produtos ativos com imagem
      const { data: activeCategoryIds, error: idsError } = await supabase
        .from('products')
        .select('category_id')
        .eq('is_active', true)
        .not('image_url', 'is', null)
        .not('category_id', 'is', null)
        .limit(100);

      if (idsError) throw idsError;

      const uniqueCategoryIds = [
        ...new Set(activeCategoryIds.map((p) => p.category_id)),
      ].slice(0, 5);

      if (uniqueCategoryIds.length === 0) {
        return { success: true, message: 'Catálogo carregado com sucesso', data: [] };
      }

      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .in('id', uniqueCategoryIds);

      if (catError) throw catError;

      const catalog = await Promise.all(
        categories.map(async (category) => {
          const { data: products, error: prodError } = await supabase
            .from('products')
            .select('id, name, price, price_per_kg, image_url, type')
            .eq('category_id', category.id)
            .eq('is_active', true)
            .not('image_url', 'is', null)
            .limit(10);

          if (prodError) throw prodError;

          return {
            id: category.id,
            name: category.name,
            products: products || [],
          };
        }),
      );

      return {
        success: true,
        message: 'Catálogo carregado com sucesso',
        data: catalog,
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
        .select('id, name, price, price_per_kg, image_url, type')
        .eq('category_id', product.category_id)
        .eq('is_active', true)
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
        .select('id, name, price, price_per_kg, image_url, type')
        .eq('category_id', categoryId)
        .eq('is_active', true)
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
