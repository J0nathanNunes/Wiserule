'use client';

import { createContext, useContext } from 'react';

export type AuthUser = { id: string; nome: string; email: string; papel: 'admin' | 'usuario'; status: 'ativo' };
export type AuthContextValue = {
  user: AuthUser | null;
  signOut: () => Promise<void>;
  openUserManagement: () => void;
};

export const AuthContext = createContext<AuthContextValue>({ user: null, signOut: async () => {}, openUserManagement: () => {} });
export const useAuth = () => useContext(AuthContext);
