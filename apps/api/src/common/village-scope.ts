import { ForbiddenException } from '@nestjs/common';
import { inArray, type SQL } from 'drizzle-orm';
import { hasAllVillages, type AdminPrincipal } from './auth/auth-user';

/**
 * Village isolation: every admin query is scoped to the admin's assigned
 * villages. Only a superadmin sees all villages; a non-superadmin with an empty
 * assignment is scoped to nothing (fail-closed).
 */

/** Returns the list of village ids the admin may see, or null for "all". */
export function allowedVillageIds(user: AdminPrincipal): string[] | null {
  return hasAllVillages(user) ? null : user.villages;
}

/** Build a Drizzle `WHERE village_id IN (...)` filter, or undefined for "all". */
export function villageScopeFilter(
  user: AdminPrincipal,
  column: Parameters<typeof inArray>[0],
): SQL | undefined {
  const ids = allowedVillageIds(user);
  if (ids === null) return undefined;
  // A non-superadmin scoped to zero villages sees nothing (fail-closed).
  return inArray(column, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
}

/** Throw unless the admin may act on the given village. */
export function assertVillageAccess(user: AdminPrincipal, villageId: string): void {
  const ids = allowedVillageIds(user);
  if (ids === null) return;
  if (!ids.includes(villageId)) {
    throw new ForbiddenException('You do not have access to this village');
  }
}
