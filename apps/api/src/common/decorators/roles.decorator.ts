import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '../auth/auth-user';

export const ROLES_KEY = 'roles';
/**
 * Restrict a route to admins with one of the given roles.
 * Presence of this decorator also implies the caller must be an admin.
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
