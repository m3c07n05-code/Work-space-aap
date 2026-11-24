import React, { createContext, useContext } from 'react';
import { ScopeItem } from '../services/backendGateway';

export type ChatRoleMode = 'general' | 'deep' | 'complex' | 'fast';

export interface CloudChatSession {
  id: string;
  title: string;
  roleId: ChatRoleMode;
  modelId?: string;
  roleMode?: ChatRoleMode;
  updatedAt?: string;
}

export interface CloudChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  createdAt?: string;
  timestamp?: string;
}

interface FirebaseContextValue {
  user: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    emailVerified?: boolean;
  } | null;
  authLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  chatSessions: CloudChatSession[];
  createCloudChatSession: (session: CloudChatSession) => Promise<string>;
  updateCloudChatSession: (sessionId: string, patch: Partial<CloudChatSession>) => Promise<void>;
  appendCloudChatMessage: (sessionId: string, msg: CloudChatMessage) => Promise<void>;
  subscribeChatMessages: (
    sessionId: string,
    cb: (msgs: CloudChatMessage[]) => void
  ) => () => void;
  syncScopeToCloud: (scope: ScopeItem) => Promise<void>;
}

const defaultCtx: FirebaseContextValue = {
  user: null,
  authLoading: false,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
  chatSessions: [],
  createCloudChatSession: async (s) => s.id,
  updateCloudChatSession: async () => {},
  appendCloudChatMessage: async () => {},
  subscribeChatMessages: () => () => {},
  syncScopeToCloud: async () => {},
};

const FirebaseContext = createContext<FirebaseContextValue>(defaultCtx);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <FirebaseContext.Provider value={defaultCtx}>{children}</FirebaseContext.Provider>
);

export const useFirebase = () => useContext(FirebaseContext);
