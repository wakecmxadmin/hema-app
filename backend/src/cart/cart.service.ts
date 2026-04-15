import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { AddCartItemDto } from './dto/create-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart.dto';
import { supabase } from '../lib/supabase';

@Injectable()
export class CartService {
  async addItem(userId: string, dto: AddCartItemDto) {
    try {
      const { product_id, quantity, weight } = dto;

      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', product_id)
        .eq('is_active', true)
        .maybeSingle();

      if (productError || !product) {
        throw new HttpException(
          { success: false, message: 'Produto não encontrado no catálogo' },
          HttpStatus.NOT_FOUND,
        );
      }

      if (product.type === 'unit' && !quantity) {
        throw new HttpException(
          {
            success: false,
            message: 'Quantidade é obrigatória para este produto',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (product.type === 'weight' && !weight) {
        throw new HttpException(
          { success: false, message: 'O peso é obrigatório para este produto' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validação de estoque
      if (product.type === 'unit') {
        if (!Number.isInteger(quantity)) {
          throw new HttpException(
            {
              success: false,
              message: 'A quantidade deve ser um número inteiro para este produto',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        if ((quantity || 0) > product.stock) {
          throw new HttpException(
            {
              success: false,
              message: `Apenas ${product.stock} unidades disponíveis`,
              error: 'INSUFFICIENT_STOCK',
              available_stock: product.stock,
              requested: quantity,
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
      }

      if (product.type === 'weight') {
        const weightInKg = (weight || 0) / 1000;
        if (weightInKg < 0.1) {
          throw new HttpException(
            {
              success: false,
              message: 'O peso mínimo é de 100g (0.1 kg)',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        if (weightInKg > product.stock) {
          throw new HttpException(
            {
              success: false,
              message: `Disponível apenas ${product.stock} kg deste produto`,
              error: 'INSUFFICIENT_STOCK',
              available_stock: product.stock,
              requested: weightInKg,
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
      }

      // Buscar ou criar carrinho
      let { data: cart } = await supabase
        .from('carts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!cart) {
        const { data: newCart, error: cartError } = await supabase
          .from('carts')
          .insert({ user_id: userId, total_price: 0 })
          .select()
          .maybeSingle();

        if (cartError) throw cartError;
        cart = newCart;
      }

      // Verificar se item já existe no carrinho
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('cart_id', cart.id)
        .eq('product_id', product_id)
        .maybeSingle();

      if (existingItem) {
        const newQuantity =
          product.type === 'unit'
            ? existingItem.quantity + (quantity || 0)
            : null;
        const newWeight =
          product.type === 'weight'
            ? existingItem.weight + (weight || 0)
            : null;

        // Validar estoque com quantidade acumulada
        if (product.type === 'unit' && (newQuantity || 0) > product.stock) {
          throw new HttpException(
            {
              success: false,
              message: `Apenas ${product.stock} unidades disponíveis (você já tem ${existingItem.quantity} no carrinho)`,
              error: 'INSUFFICIENT_STOCK',
              available_stock: product.stock,
              requested: newQuantity,
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        if (product.type === 'weight' && ((newWeight || 0) / 1000) > product.stock) {
          throw new HttpException(
            {
              success: false,
              message: `Disponível apenas ${product.stock} kg deste produto (você já tem ${existingItem.weight}g no carrinho)`,
              error: 'INSUFFICIENT_STOCK',
              available_stock: product.stock,
              requested: (newWeight || 0) / 1000,
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }

        let updatedPrice = 0;
        if (product.type === 'unit') {
          updatedPrice = product.price; // Preço unitário base
        } else {
          updatedPrice = (product.price_per_kg / 1000) * (newWeight || 0); // Preço total por peso
        }

        await supabase
          .from('cart_items')
          .update({
            quantity: newQuantity,
            weight: newWeight,
            price: updatedPrice,
          })
          .eq('id', existingItem.id);
      } else {
        let initialPrice = 0;
        if (product.type === 'unit') {
          initialPrice = product.price;
        } else {
          initialPrice = (product.price_per_kg / 1000) * (weight || 0);
        }

        await supabase.from('cart_items').insert({
          cart_id: cart.id,
          product_id,
          quantity: quantity || null,
          weight: weight || null,
          price: initialPrice,
        });
      }

      await this.recalculateCart(cart.id);

      return {
        success: true,
        message: 'Produto adicionado ao carrinho',
        data: { cart_id: cart.id },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao adicionar item ao carrinho',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getCart(userId: string) {
    try {
      const { data: cart, error: cartError } = await supabase
        .from('carts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (cartError) throw cartError;

      // Retorno padronizado caso o usuário não tenha um carrinho ainda
      if (!cart) {
        return {
          success: true,
          message: 'Carrinho vazio',
          data: { cart: null, items: [], total_price: 0 },
        };
      }

      const { data: items, error: itemsError } = await supabase
        .from('cart_items')
        .select(
          `
          id, quantity, weight, price,
          product:products (id, name, type, image_url, price, price_per_kg, stock)
        `,
        )
        .eq('cart_id', cart.id)
        .order('id', { ascending: true }); // Boa prática para não mudar a ordem na tela

      if (itemsError) throw itemsError;

      return {
        success: true,
        message: 'Carrinho recuperado',
        data: {
          cart,
          items: items ?? [],
          total_price: cart.total_price,
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao buscar o carrinho',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    try {
      const { data: item } = await supabase
        .from('cart_items')
        .select('*, product:products(*)')
        .eq('id', itemId)
        .maybeSingle();

      if (!item) {
        throw new HttpException(
          { success: false, message: 'Item não encontrado no carrinho' },
          HttpStatus.NOT_FOUND,
        );
      }

      const { data: cart } = await supabase
        .from('carts')
        .select('user_id')
        .eq('id', item.cart_id)
        .maybeSingle();

      if (!cart || cart.user_id !== userId) {
        throw new HttpException(
          { success: false, message: 'Acesso negado' },
          HttpStatus.FORBIDDEN,
        );
      }

      let newPrice = item.price;
      const product = item.product;

      // Validar estoque na atualização
      if (dto.quantity !== undefined && product.type === 'unit') {
        if (!Number.isInteger(dto.quantity)) {
          throw new HttpException(
            { success: false, message: 'A quantidade deve ser um número inteiro' },
            HttpStatus.BAD_REQUEST,
          );
        }
        if (dto.quantity > product.stock) {
          throw new HttpException(
            {
              success: false,
              message: `Apenas ${product.stock} unidades disponíveis`,
              error: 'INSUFFICIENT_STOCK',
              available_stock: product.stock,
              requested: dto.quantity,
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        newPrice = product.price;
      } else if (dto.weight !== undefined && product.type === 'weight') {
        const weightInKg = (dto.weight || 0) / 1000;
        if (weightInKg > product.stock) {
          throw new HttpException(
            {
              success: false,
              message: `Disponível apenas ${product.stock} kg deste produto`,
              error: 'INSUFFICIENT_STOCK',
              available_stock: product.stock,
              requested: weightInKg,
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        newPrice = (product.price_per_kg / 1000) * (dto.weight || 0);
      }

      await supabase
        .from('cart_items')
        .update({
          quantity: dto.quantity,
          weight: dto.weight,
          price: newPrice,
        })
        .eq('id', itemId);

      await this.recalculateCart(item.cart_id);

      return { success: true, message: 'Quantidade atualizada' };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao atualizar item',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async removeItem(userId: string, itemId: string) {
    try {
      const { data: item } = await supabase
        .from('cart_items')
        .select('id, cart_id')
        .eq('id', itemId)
        .maybeSingle();

      if (!item) {
        throw new HttpException(
          { success: false, message: 'Item não encontrado' },
          HttpStatus.NOT_FOUND,
        );
      }

      const { data: cart } = await supabase
        .from('carts')
        .select('user_id')
        .eq('id', item.cart_id)
        .maybeSingle();

      if (!cart || cart.user_id !== userId) {
        throw new HttpException(
          { success: false, message: 'Acesso negado' },
          HttpStatus.FORBIDDEN,
        );
      }

      await supabase.from('cart_items').delete().eq('id', itemId);
      await this.recalculateCart(item.cart_id);

      return { success: true, message: 'Produto removido do carrinho' };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao remover item',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async validateStock(userId: string) {
    try {
      const cartResponse = await this.getCart(userId);
      if (!cartResponse.data.cart || cartResponse.data.items.length === 0) {
        return { success: true, message: 'Carrinho vazio', data: { valid: true, adjustments: [] } };
      }

      const adjustments: any[] = [];

      for (const item of cartResponse.data.items) {
        const product = item.product as any;
        if (!product) continue;

        if (product.type === 'unit') {
          if (product.stock <= 0) {
            adjustments.push({
              item_id: item.id,
              product_name: product.name,
              type: 'removed',
              reason: 'Produto sem estoque',
            });
            await supabase.from('cart_items').delete().eq('id', item.id);
          } else if ((item.quantity || 0) > product.stock) {
            adjustments.push({
              item_id: item.id,
              product_name: product.name,
              type: 'reduced',
              reason: `Quantidade reduzida de ${item.quantity} para ${product.stock}`,
              new_quantity: product.stock,
            });
            await supabase
              .from('cart_items')
              .update({ quantity: product.stock, price: product.price })
              .eq('id', item.id);
          }
        } else if (product.type === 'weight') {
          const weightInKg = (item.weight || 0) / 1000;
          if (product.stock <= 0) {
            adjustments.push({
              item_id: item.id,
              product_name: product.name,
              type: 'removed',
              reason: 'Produto sem estoque',
            });
            await supabase.from('cart_items').delete().eq('id', item.id);
          } else if (weightInKg > product.stock) {
            const newWeightGrams = Math.floor(product.stock * 1000);
            const newPrice = (product.price_per_kg / 1000) * newWeightGrams;
            adjustments.push({
              item_id: item.id,
              product_name: product.name,
              type: 'reduced',
              reason: `Peso reduzido de ${item.weight}g para ${newWeightGrams}g`,
              new_weight: newWeightGrams,
            });
            await supabase
              .from('cart_items')
              .update({ weight: newWeightGrams, price: newPrice })
              .eq('id', item.id);
          }
        }
      }

      if (adjustments.length > 0) {
        const cart = cartResponse.data.cart;
        await this.recalculateCart(cart.id);
      }

      return {
        success: true,
        message: adjustments.length > 0
          ? 'Alguns itens foram ajustados por falta de estoque'
          : 'Todos os itens estão disponíveis',
        data: {
          valid: adjustments.length === 0,
          adjustments,
        },
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao validar estoque do carrinho',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Método interno, não precisa de retorno HTTP pois é chamado pelas outras funções
  private async recalculateCart(cartId: string) {
    const { data: items } = await supabase
      .from('cart_items')
      .select('*, product:products(type)')
      .eq('cart_id', cartId);

    const total = (items ?? []).reduce((acc, item) => {
      if (item.product.type === 'unit' && item.quantity) {
        return acc + item.price * item.quantity;
      }
      if (item.product.type === 'weight' && item.weight) {
        return acc + item.price;
      }
      return acc;
    }, 0);

    await supabase
      .from('carts')
      .update({ total_price: total })
      .eq('id', cartId);
  }
}
