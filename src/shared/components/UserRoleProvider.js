"use client";

import { createContext, useContext, useState, useEffect } from "react";

export const UserRoleContext = createContext({
  role: null,
  userId: null,
  displayName: null,
});

export function UserRoleProvider({ role, userId, displayName, children }) {
  const [auth, setAuth] = useState({ role, userId, displayName });

  // Re-read from cookie on mount (handles client navigation)
  useEffect(() => {
    // role is already set from server — no need to re-read
  }, []);

  return (
    <UserRoleContext.Provider value={auth}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  return useContext(UserRoleContext);
}

export function useIsSuperAdmin() {
  const { role } = useContext(UserRoleContext);
  return role === "super_admin";
}