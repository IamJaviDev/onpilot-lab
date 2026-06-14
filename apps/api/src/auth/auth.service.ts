import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import {
  BusinessMemberRole,
  GlobalRole,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterBusinessDto } from './dto/register-business.dto';

const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/;
const UNIT_TO_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Convierte una duración tipo "7d" a milisegundos.
 * Lanza Error si el formato es inválido en vez de devolver NaN silencioso
 * (que produciría un expiresAt corrupto).
 */
export function parseDurationMs(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid duration format: "${value}". Expected <number><s|m|h|d>, e.g. "7d".`,
    );
  }
  return Number(match[1]) * UNIT_TO_MS[match[2]];
}

interface TokenUser {
  id: string;
  email: string;
  globalRole: GlobalRole;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async registerBusiness(dto: RegisterBusinessDto) {
    const passwordHash = await argon2.hash(dto.password);

    let user: {
      id: string;
      name: string;
      email: string;
      globalRole: GlobalRole;
    };
    let business: { id: string; name: string };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            name: dto.ownerName,
          },
        });
        const createdBusiness = await tx.business.create({
          data: {
            name: dto.businessName,
            sector: dto.sector,
            city: dto.city ?? null,
          },
        });
        await tx.businessMember.create({
          data: {
            userId: createdUser.id,
            businessId: createdBusiness.id,
            role: BusinessMemberRole.BUSINESS_OWNER,
          },
        });
        return { createdUser, createdBusiness };
      });
      user = result.createdUser;
      business = result.createdBusiness;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }

    const tokens = await this.issueTokens(user);
    return {
      user: { id: user.id, name: user.name, email: user.email },
      business: { id: business.id, name: business.name },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Error genérico: no revelar si falla el email o la contraseña.
    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const memberships = await this.prisma.businessMember.findMany({
      where: { userId: user.id, isActive: true },
      include: { business: true },
    });
    const businesses = memberships
      .filter((m) => m.business.isActive && m.business.deletedAt === null)
      .map((m) => ({
        id: m.business.id,
        name: m.business.name,
        role: m.role,
      }));

    const tokens = await this.issueTokens(user);
    return {
      user: { id: user.id, name: user.name, email: user.email },
      businesses,
      ...tokens,
    };
  }

  private async issueTokens(user: TokenUser) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      globalRole: user.globalRole,
    });
    const refreshToken = await this.createRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const ttlMs = parseDurationMs(
      this.config.getOrThrow<string>('REFRESH_TOKEN_TTL'),
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return rawToken;
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
