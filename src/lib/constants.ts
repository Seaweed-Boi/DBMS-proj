export const ROLES = ["ADMIN", "CENTRE_MANAGER", "COORDINATOR", "VOLUNTEER"] as const;
export type Role = (typeof ROLES)[number];

export const DISASTER_TYPES = ["FLOOD", "EARTHQUAKE", "CYCLONE", "FIRE", "LANDSLIDE"] as const;
export const SEVERITY_LEVELS = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export const DISASTER_STATUSES = ["ACTIVE", "CONTAINED", "RESOLVED"] as const;
export const ZONE_STATUSES = ["CRITICAL", "ACTIVE", "STABILISED", "CLEARED"] as const;
export const URGENCY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const REQUEST_STATUSES = ["PENDING", "APPROVED", "PARTIALLY_FULFILLED", "FULFILLED", "REJECTED"] as const;
export const DISPATCH_STATUSES = ["ALLOCATED", "IN_TRANSIT", "DELIVERED", "CANCELLED"] as const;
export const SKILLS = ["MEDICAL", "LOGISTICS", "RESCUE", "SHELTER", "GENERAL"] as const;
export const AVAILABILITY = ["AVAILABLE", "DEPLOYED", "ON_LEAVE"] as const;

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "System Admin",
  CENTRE_MANAGER: "Centre Manager",
  COORDINATOR: "Field Coordinator",
  VOLUNTEER: "Volunteer",
};

/** Which roles may perform each class of action (RBAC matrix, see README). */
export const PERMISSIONS = {
  manageDisasters: ["ADMIN"],
  manageZones: ["ADMIN", "COORDINATOR"],
  manageCentres: ["ADMIN"],
  updateCentre: ["ADMIN", "CENTRE_MANAGER"],
  manageCatalog: ["ADMIN"],
  manageInventory: ["ADMIN", "CENTRE_MANAGER"],
  submitRequests: ["ADMIN", "COORDINATOR", "CENTRE_MANAGER"],
  reviewRequests: ["ADMIN", "CENTRE_MANAGER"],
  allocate: ["ADMIN", "CENTRE_MANAGER"],
  updateDispatch: ["ADMIN", "CENTRE_MANAGER"],
  assignVolunteers: ["ADMIN", "CENTRE_MANAGER", "COORDINATOR"],
  manageUsers: ["ADMIN"],
  viewReports: ["ADMIN", "CENTRE_MANAGER", "COORDINATOR"],
} satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
