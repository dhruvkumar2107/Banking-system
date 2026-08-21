import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../../config/app-config.service';
import type { AccessTokenPayload, AuthUser } from '../../common/auth/auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: AppConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.config.jwt.accessSecret,
    });
  }

  validate(payload: AccessTokenPayload): AuthUser {
    if (payload.type === 'customer') {
      return { sub: payload.sub, type: 'customer' };
    }
    if (payload.type === 'admin') {
      if (!payload.role) throw new UnauthorizedException('Malformed admin token');
      return {
        sub: payload.sub,
        type: 'admin',
        role: payload.role,
        villages: payload.villages ?? [],
      };
    }
    throw new UnauthorizedException('Unknown principal type');
  }
}
