import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type {
  CurrentBusinessContext,
  CurrentUserContext,
} from './auth-context.types';
import {
  buildRefreshCookieOptions,
  clearRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
} from './auth.cookies';
import { AuthService } from './auth.service';
import { CurrentBusiness } from './decorators/current-business.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterBusinessDto } from './dto/register-business.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register-business')
  async registerBusiness(
    @Body() dto: RegisterBusinessDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...body } =
      await this.authService.registerBusiness(dto);
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...body } = await this.authService.login(dto);
    this.setRefreshCookie(res, refreshToken);
    return body;
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
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as
      | string
      | undefined;
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const { refreshToken, accessToken } =
      await this.authService.refresh(rawRefreshToken);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as
      | string
      | undefined;
    await this.authService.logout(rawRefreshToken);
    res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(
      REFRESH_COOKIE_NAME,
      refreshToken,
      buildRefreshCookieOptions(this.config),
    );
  }
}
