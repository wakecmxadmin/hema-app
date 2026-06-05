import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CreateAddressDTO } from './dto/create-address.dto';
import { UpdateAddressDTO } from './dto/update-address.dto';
import { supabase } from '../lib/supabase'; 

@Injectable()
export class AddressesService {
  async createAddress(userId: string, data: CreateAddressDTO) {
    try {
      // Se for o endereço padrão, remove o default dos outros
      if (data.is_default) {
        await supabase
          .from('addresses')
          .update({ is_default: false })
          .eq('user_id', userId);
      }

      const { data: address, error } = (await supabase
        .from('addresses')
        .insert({ ...data, user_id: userId })
        .select()
        .single()) as { data: Record<string, unknown> | null; error: { message: string } | null };

      if (error) throw error;

      return {
        success: true,
        message: 'Endereço salvo com sucesso!',
        data: address,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao criar endereço',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getMyAddresses(userId: string) {
    try {
      const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        message: 'Endereços carregados',
        data,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao buscar seus endereços',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateAddress(
    userId: string,
    addressId: string,
    data: UpdateAddressDTO,
  ) {
    try {
      if (data.is_default) {
        await supabase
          .from('addresses')
          .update({ is_default: false })
          .eq('user_id', userId);
      }

      const { data: address, error } = await supabase
        .from('addresses')
        .update(data)
        .eq('id', addressId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        message: 'Endereço atualizado com sucesso!',
        data: address,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Erro ao atualizar endereço',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAddressByCep(cep: string) {
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      throw new HttpException(
        { success: false, message: 'O formato do CEP é inválido.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();

      if (data.erro) {
        throw new Error('CEP não encontrado na base dos Correios.');
      }

      return {
        success: true,
        message: 'CEP encontrado',
        data: {
          street: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state: data.uf,
        },
      };
    } catch (error: any) {
      throw new HttpException(
        { success: false, message: error.message || 'Erro ao consultar o CEP' },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async deleteAddress(userId: string, addressId: string) {
    try {
      const { error } = await supabase
        .from('addresses')
        .delete()
        .eq('id', addressId)
        .eq('user_id', userId);

      if (error) throw error;

      return {
        success: true,
        message: 'Endereço excluído.',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Não foi possível excluir o endereço',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
