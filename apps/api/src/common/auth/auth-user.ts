export type AdminRole = 'superadmin' | 'admin' | 'agent';

export interface CustomerPrincipal {
  sub: string;
  type: 'customer';
}

export interface AdminPrincipal {
  sub: string;
  type: 'admin';
  role: AdminRole;
  /**
   * Village ids this admin is scoped to. Only superadmins see all villages;
   * a non-superadmin with an empty list is scoped to nothing (fail-closed).
   */
  villages: string[];
}

export type AuthUser = CustomerPrincipal | AdminPrincipal;

export function isAdmin(u: AuthUser | undefined): u is AdminPrincipal {
  return !!u && u.type === 'admin';
}

export function isCustomer(u: AuthUser | undefined): u is CustomerPrincipal {
  return !!u && u.type === 'customer';
}

/**
 * Only superadmins see every village. A non-superadmin is always confined to
 * its explicit `villages` list — an empty list means "no access" (fail-closed),
 * never "all access", so a misconfigured admin/agent can't silently see everything.
 */
export function hasAllVillages(u: AdminPrincipal): boolean {
  return u.role === 'superadmin';
}

/** JWT access-token payload shape. */
export interface AccessTokenPayload {
  sub: string;
  type: 'customer' | 'admin';
  role?: AdminRole;
  villages?: string[];
}
