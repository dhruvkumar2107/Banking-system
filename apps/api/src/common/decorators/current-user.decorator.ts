import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';

/** Inject the authenticated principal (req.user) into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthUser | undefined;
  },
);
