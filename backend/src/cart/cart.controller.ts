import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/create-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart.dto';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AuthRequest } from '../auth/types';

@Controller('cart')
@UseGuards(SupabaseAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('items')
  addItem(@Req() req: AuthRequest, @Body() dto: AddCartItemDto) {
    const userId = req.user.sub;
    return this.cartService.addItem(userId, dto);
  }

  @Get()
  getCart(@Req() req: AuthRequest) {
    const userId = req.user.sub;
    return this.cartService.getCart(userId);
  }

  @Patch('items/:id')
  updateItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const userId = req.user.sub;
    return this.cartService.updateItem(userId, id, dto);
  }

  @Delete('items/:id')
  removeItem(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user.sub;
    return this.cartService.removeItem(userId, id);
  }

  @Get('validate-stock')
  validateStock(@Req() req: AuthRequest) {
    const userId = req.user.sub;
    return this.cartService.validateStock(userId);
  }
}
