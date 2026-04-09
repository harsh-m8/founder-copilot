/**
 * Role → permission mapping for Founder Copilot.
 *
 * Roles (highest → lowest):  owner > admin > analyst > viewer
 *
 * Permission catalogue
 * ─────────────────────────────────────────────────────────────────
 * org:manage          Delete org, transfer ownership, edit name/logo
 * team:manage         Invite/remove members, change roles
 * integrations:manage Connect / disconnect accounting providers
 * integrations:sync   Trigger a data sync
 * data:read           View any financial data in the dashboard
 * data:export         Export reports (future)
 */

export const ROLES = ['owner', 'admin', 'analyst', 'viewer'];

export const ROLE_LABELS = {
  owner:   'Owner',
  admin:   'Admin',
  analyst: 'Analyst',
  viewer:  'Viewer',
};

export const ROLE_DESCRIPTIONS = {
  owner:   'Full access. Can manage billing, delete the organisation, and promote admins.',
  admin:   'Can manage team members and accounting integrations.',
  analyst: 'Can sync and view financial data but cannot manage the team.',
  viewer:  'Read-only access to financial dashboards.',
};

/** Permissions granted to each role (cumulative — higher roles include lower ones). */
const ROLE_PERMISSIONS = {
  owner:   ['org:manage', 'team:manage', 'integrations:manage', 'integrations:sync', 'data:read', 'data:export'],
  admin:   [               'team:manage', 'integrations:manage', 'integrations:sync', 'data:read', 'data:export'],
  analyst: [                                                      'integrations:sync', 'data:read', 'data:export'],
  viewer:  [                                                                           'data:read'],
};

/**
 * Returns the permission set for a given role.
 * @param {string|null} role
 * @returns {string[]}
 */
export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Returns true if `role` satisfies the required minimum role.
 * owner > admin > analyst > viewer
 */
export function roleAtLeast(role, minRole) {
  const idx = ROLES.indexOf(role);
  const minIdx = ROLES.indexOf(minRole);
  if (idx === -1 || minIdx === -1) return false;
  return idx <= minIdx; // lower index = higher privilege
}

/**
 * Returns true if the given permission set includes `permission`.
 * @param {string[]} permissions
 * @param {string} permission
 */
export function can(permissions, permission) {
  return permissions.includes(permission);
}

/**
 * Roles that an admin is allowed to assign (cannot assign owner or equal roles).
 */
export function assignableRoles(myRole) {
  if (myRole === 'owner') return ['admin', 'analyst', 'viewer'];
  if (myRole === 'admin') return ['analyst', 'viewer'];
  return [];
}
