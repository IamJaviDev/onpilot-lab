import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  CurrentBusinessContext,
  CurrentUserContext,
} from './auth-context.types';
import { AuthService } from './auth.service';
import { CurrentBusiness } from './decorators/current-business.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterBusinessDto } from './dto/register-business.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-business')
  registerBusiness(@Body() dto: RegisterBusinessDto) {
    return this.authService.registerBusiness(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(
    @CurrentUser() user: CurrentUserContext,
    @CurrentBusiness() business: CurrentBusinessContext | null,
  ) {
    return this.authService.me(user.id, business);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }
}
