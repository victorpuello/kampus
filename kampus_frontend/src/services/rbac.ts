import { api } from './api'

export type RbacRole = {
  role: string
  label: string
  group: string
}

export type RbacPermission = {
  id: number
  codename: string
  name: string
  app_label: string
  model: string
}

export type RbacRolePermissions = {
  role: string
  permission_ids: number[]
}

export type RbacUserPermissions = {
  user_id: number
  role: string
  role_permission_ids: number[]
  user_permission_ids: number[]
  effective_permission_ids: number[]
}

export const rbacApi = {
  listRoles: () => api.get<{ roles: RbacRole[] }>('/api/rbac/roles/'),
  listPermissions: () => api.get<{ permissions: RbacPermission[] }>('/api/rbac/permissions/'),

  getRolePermissions: (role: string) =>
    api.get<RbacRolePermissions>(`/api/rbac/roles/${encodeURIComponent(role)}/permissions/`),

  setRolePermissions: (role: string, permissionIds: number[]) =>
    api.put<RbacRolePermissions>(`/api/rbac/roles/${encodeURIComponent(role)}/permissions/`, {
      permission_ids: permissionIds,
    }),

  getUserPermissions: (userId: number) =>
    api.get<RbacUserPermissions>(`/api/rbac/users/${userId}/permissions/`),

  setUserPermissions: (userId: number, permissionIds: number[]) =>
    api.put<{ user_id: number; permission_ids: number[] }>(`/api/rbac/users/${userId}/permissions/`, {
      permission_ids: permissionIds,
    }),
}
