import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured, handleFirestoreError, OperationType } from '../lib/firebase';
import { backendGateway, ScopeItem } from '../services/backendGateway';

export type ChatRoleMode = 'deep' | 'complex' | 'general' | 'fast';

export interface CloudChatSession {
  id: string;
  ownerId: string;
  title: string;
  roleId: ChatRoleMode;
  modelId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CloudChatMessage {
  id: string;
  ownerId: string;
  sessionId: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  createdAt?: unknown;
}

interface FirebaseContextValue {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  cloudScopesCount: number;
  chatSessions: CloudChatSession[];
  syncScopeToCloud: (scope: ScopeItem) => Promise<void>;
  deleteScopeFromCloud: (scopeId: string) => Promise<void>;
  createCloudChatSession: (session: Omit<CloudChatSession, 'ownerId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateCloudChatSession: (chatId: string, patch: { title?: string; roleId?: ChatRoleMode; modelId?: string }) => Promise<void>;
  appendCloudChatMessage: (
    sessionId: string,
    msg: Omit<CloudChatMessage, 'ownerId' | 'sessionId' | 'createdAt'>
  ) => Promise<void>;
  subscribeChatMessages: (
    sessionId: string,
    onData: (messages: CloudChatMessage[]) => void
  ) => () => void;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `id_${Date.now()}`;
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [cloudScopesCount, setCloudScopesCount] = useState(0);
  const [chatSessions, setChatSessions] = useState<CloudChatSession[]>([]);

  // Upsert public & private split user documents when signed in
  const syncUserProfileDocs = useCallback(async (u: User) => {
    if (!db || !u.emailVerified) return;
    const publicPath = `users/${u.uid}/public/profile`;
    const privatePath = `users/${u.uid}/private/info`;

    try {
      const pubRef = doc(db, 'users', u.uid, 'public', 'profile');
      const pubSnap = await getDoc(pubRef);
      if (!pubSnap.exists()) {
        await setDoc(pubRef, {
          uid: u.uid,
          displayName: (u.displayName || 'CRD User').slice(0, 120),
          photoUrl: (u.photoURL || '').slice(0, 512),
          createdAt: serverTimestamp(),
        });
      } else {
        await setDoc(
          pubRef,
          {
            uid: u.uid,
            displayName: (u.displayName || 'CRD User').slice(0, 120),
            photoUrl: (u.photoURL || '').slice(0, 512),
            createdAt: pubSnap.data().createdAt,
          },
          { merge: true }
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, publicPath);
    }

    if (u.email) {
      try {
        const privRef = doc(db, 'users', u.uid, 'private', 'info');
        await setDoc(privRef, {
          uid: u.uid,
          email: u.email.slice(0, 254),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, privatePath);
      }
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        syncUserProfileDocs(firebaseUser).catch((err) => {
          console.error('Profile sync warning:', err);
        });
      } else {
        setCloudScopesCount(0);
        setChatSessions([]);
      }
    });
    return unsub;
  }, [syncUserProfileDocs]);

  // Real-time Firestore listeners once authenticated
  useEffect(() => {
    if (!db || !user || !user.emailVerified) return;

    const scopesColPath = `users/${user.uid}/scopes`;
    const scopesQuery = query(
      collection(db, 'users', user.uid, 'scopes'),
      where('ownerId', '==', user.uid),
      limit(50)
    );

    const unsubScopes = onSnapshot(
      scopesQuery,
      (snapshot) => {
        setCloudScopesCount(snapshot.size);
        if (!snapshot.empty) {
          const existingLocal = backendGateway.getScopes();
          const map = new Map<string, ScopeItem>();
          existingLocal.forEach((s) => map.set(s.id, s));
          snapshot.docs.forEach((d) => {
            const data = d.data();
            map.set(d.id, {
              id: String(data.id || d.id),
              title: String(data.title || ''),
              gate: String(data.gate || 'V003_FORMAT_ONLY'),
              rule: String(data.rule || ''),
              status: (data.status as ScopeItem['status']) || 'ACTIVE_SYNCED',
              updatedAt: String(data.updatedAtLabel || new Date().toISOString().slice(0, 16).replace('T', ' ')),
            });
          });
          backendGateway.replaceScopes(Array.from(map.values()));
        }
        backendGateway.setSyncStatus('synced');
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, scopesColPath);
      }
    );

    const chatsColPath = `users/${user.uid}/chats`;
    const chatsQuery = query(
      collection(db, 'users', user.uid, 'chats'),
      where('ownerId', '==', user.uid),
      limit(20)
    );

    const unsubChats = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const list: CloudChatSession[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            ownerId: String(data.ownerId || user.uid),
            title: String(data.title || 'การสนทนาใหม่'),
            roleId: (data.roleId as ChatRoleMode) || 'general',
            modelId: String(data.modelId || 'gemini-4-hydrogen'),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        list.sort((a, b) => {
          const ta = (a.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          const tb = (b.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setChatSessions(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, chatsColPath);
      }
    );

    return () => {
      unsubScopes();
      unsubChats();
    };
  }, [user]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    if (!auth || !googleProvider) {
      setAuthError('ยังไม่ได้ตั้งค่า VITE_FIREBASE_API_KEY ในระบบ');
      return;
    }
    backendGateway.setSyncStatus('syncing');
    try {
      await signInWithPopup(auth, googleProvider);
      backendGateway.setSyncStatus('synced');
    } catch (err: unknown) {
      backendGateway.setSyncStatus('synced');
      const msg = err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบ Google ได้';
      setAuthError(msg);
      console.error('Google sign-in error:', err);
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const syncScopeToCloud = async (scope: ScopeItem) => {
    if (!db || !user || !user.emailVerified) return;
    backendGateway.setSyncStatus('syncing');
    const safeId = sanitizeId(scope.id);
    const path = `users/${user.uid}/scopes/${safeId}`;
    try {
      const ref = doc(db, 'users', user.uid, 'scopes', safeId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await setDoc(ref, {
          id: safeId,
          ownerId: user.uid,
          title: scope.title.slice(0, 240),
          gate: scope.gate.slice(0, 64),
          rule: scope.rule.slice(0, 2000),
          status: scope.status,
          updatedAtLabel: (scope.updatedAt || '').slice(0, 64),
          createdAt: snap.data().createdAt,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          id: safeId,
          ownerId: user.uid,
          title: scope.title.slice(0, 240),
          gate: scope.gate.slice(0, 64),
          rule: scope.rule.slice(0, 2000),
          status: scope.status,
          updatedAtLabel: (scope.updatedAt || '').slice(0, 64),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      backendGateway.setSyncStatus('synced');
    } catch (error) {
      backendGateway.setSyncStatus('synced');
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteScopeFromCloud = async (scopeId: string) => {
    if (!db || !user || !user.emailVerified) return;
    backendGateway.setSyncStatus('syncing');
    const safeId = sanitizeId(scopeId);
    const path = `users/${user.uid}/scopes/${safeId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'scopes', safeId));
      backendGateway.setSyncStatus('synced');
    } catch (error) {
      backendGateway.setSyncStatus('synced');
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const createCloudChatSession = async (
    session: Omit<CloudChatSession, 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!db || !user || !user.emailVerified) return;
    backendGateway.setSyncStatus('syncing');
    const safeId = sanitizeId(session.id);
    const path = `users/${user.uid}/chats/${safeId}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'chats', safeId), {
        id: safeId,
        ownerId: user.uid,
        title: session.title.slice(0, 200),
        roleId: session.roleId,
        modelId: session.modelId.slice(0, 64),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      backendGateway.setSyncStatus('synced');
    } catch (error) {
      backendGateway.setSyncStatus('synced');
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateCloudChatSession = async (
    chatId: string,
    patch: { title?: string; roleId?: ChatRoleMode; modelId?: string }
  ) => {
    if (!db || !user || !user.emailVerified) return;
    const safeId = sanitizeId(chatId);
    const path = `users/${user.uid}/chats/${safeId}`;
    try {
      const ref = doc(db, 'users', user.uid, 'chats', safeId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const prev = snap.data();
      await setDoc(ref, {
        id: safeId,
        ownerId: user.uid,
        title: (patch.title ?? prev.title).slice(0, 200),
        roleId: patch.roleId ?? prev.roleId,
        modelId: (patch.modelId ?? prev.modelId).slice(0, 64),
        createdAt: prev.createdAt,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const appendCloudChatMessage = async (
    sessionId: string,
    msg: Omit<CloudChatMessage, 'ownerId' | 'sessionId' | 'createdAt'>
  ) => {
    if (!db || !user || !user.emailVerified) return;
    backendGateway.setSyncStatus('syncing');
    const safeChatId = sanitizeId(sessionId);
    const safeMsgId = sanitizeId(msg.id);
    const path = `users/${user.uid}/chats/${safeChatId}/messages/${safeMsgId}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'chats', safeChatId, 'messages', safeMsgId), {
        id: safeMsgId,
        ownerId: user.uid,
        sessionId: safeChatId,
        role: msg.role,
        text: msg.text.slice(0, 12000),
        ...(msg.modelUsed ? { modelUsed: msg.modelUsed.slice(0, 64) } : {}),
        createdAt: serverTimestamp(),
      });
      backendGateway.setSyncStatus('synced');
    } catch (error) {
      backendGateway.setSyncStatus('synced');
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const subscribeChatMessages = useCallback(
    (sessionId: string, onData: (messages: CloudChatMessage[]) => void) => {
      if (!db || !user || !user.emailVerified || !sessionId) {
        return () => {};
      }
      const safeChatId = sanitizeId(sessionId);
      const path = `users/${user.uid}/chats/${safeChatId}/messages`;
      const q = query(
        collection(db, 'users', user.uid, 'chats', safeChatId, 'messages'),
        where('ownerId', '==', user.uid),
        limit(100)
      );
      return onSnapshot(
        q,
        (snap) => {
          const items: CloudChatMessage[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              ownerId: String(data.ownerId || user.uid),
              sessionId: String(data.sessionId || safeChatId),
              role: data.role === 'model' ? 'model' : 'user',
              text: String(data.text || ''),
              modelUsed: data.modelUsed ? String(data.modelUsed) : undefined,
              createdAt: data.createdAt,
            };
          });
          items.sort((a, b) => {
            const ta = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            const tb = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            return ta - tb;
          });
          onData(items);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, path);
        }
      );
    },
    [user]
  );

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authLoading,
        authError,
        signInWithGoogle,
        signOutUser,
        cloudScopesCount,
        chatSessions,
        syncScopeToCloud,
        deleteScopeFromCloud,
        createCloudChatSession,
        updateCloudChatSession,
        appendCloudChatMessage,
        subscribeChatMessages,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside FirebaseProvider');
  }
  return ctx;
}
