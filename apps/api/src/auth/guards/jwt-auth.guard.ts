import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { GlobalRole } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface AccessTokenPayload {
  sub: string;
  email: string;
  globalRole: GlobalRole;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    const token = authHeader.slice('Bearer '.length);

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException();
    }

    const membership = await this.prisma.businessMember.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        business: { isActive: true, deletedAt: null },
      },
      include: { business: true },
    });

    request.currentUser = {
      id: user.id,
      email: user.email,
      globalRole: user.globalRole,
    };
    request.currentBusiness = membership
      ? {
          id: membership.business.id,
          name: membership.business.name,
          role: membership.role,
          timezone: membership.business.timezone,
        }
      : null;

    return true;
  }
}
