import { useState, useEffect, useCallback } from "react";

export type UnifiedAlias = {
  platform: string;
  conversation: string;
};

export type UnifiedPerson = {
  id: string;
  displayName: string;
  aliases: UnifiedAlias[];
};

const STORAGE_KEY = "exodus_unified_identities";

export function useUnifiedIdentities() {
  const [identities, setIdentities] = useState<UnifiedPerson[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setIdentities(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load unified identities from localStorage", error);
    } finally {
      setLoaded(true);
    }
  }, []);

  const saveIdentities = useCallback((newIdentities: UnifiedPerson[]) => {
    setIdentities(newIdentities);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentities));
    } catch (error) {
      console.error("Failed to save unified identities to localStorage", error);
    }
  }, []);

  const addIdentity = useCallback(
    (identity: Omit<UnifiedPerson, "id">) => {
      const newIdentity: UnifiedPerson = {
        ...identity,
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      };
      saveIdentities([...identities, newIdentity]);
    },
    [identities, saveIdentities],
  );

  const removeIdentity = useCallback(
    (id: string) => {
      saveIdentities(identities.filter((identity) => identity.id !== id));
    },
    [identities, saveIdentities],
  );

  const updateIdentity = useCallback(
    (id: string, updates: Partial<Omit<UnifiedPerson, "id">>) => {
      saveIdentities(
        identities.map((identity) =>
          identity.id === id ? { ...identity, ...updates } : identity
        )
      );
    },
    [identities, saveIdentities],
  );

  return {
    identities,
    loaded,
    saveIdentities,
    addIdentity,
    removeIdentity,
    updateIdentity,
  };
}
