import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';

/**
 * Inject the authenticated customer's id. Throws if the principal is not a
 * customer — used to gate customer self-service routes (/me, /notifications, …).
 */
export const CurrentCustomerId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user || user.type !== 'customer') {
      throw new ForbiddenException('Customer access required');
    }
    return user.sub;
  },
);
