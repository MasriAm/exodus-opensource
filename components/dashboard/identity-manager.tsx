"use client";

import { useState } from "react";
import { UserText } from "@/components/user-text";
import { ArchivePanel } from "@/components/dashboard/archive-panel";
import type { UnifiedPerson, UnifiedAlias } from "@/lib/use-unified-identities";

type IdentityManagerProps = {
  identities: UnifiedPerson[];
  conversations: Array<{ platform: string; conversation: string }>;
  onAddIdentity: (identity: Omit<UnifiedPerson, "id">) => void;
  onRemoveIdentity: (id: string) => void;
};

export function IdentityManager({
  identities,
  conversations,
  onAddIdentity,
  onRemoveIdentity,
}: IdentityManagerProps) {
  const [displayName, setDisplayName] = useState("");
  const [aliases, setAliases] = useState<UnifiedAlias[]>([]);

  const handleAddAlias = () => {
    if (conversations.length > 0) {
      setAliases([
        ...aliases,
        { platform: conversations[0].platform, conversation: conversations[0].conversation },
      ]);
    }
  };

  const handleAliasChange = (index: number, val: string) => {
    const [platform, conversation] = val.split(":");
    const newAliases = [...aliases];
    newAliases[index] = { platform, conversation };
    setAliases(newAliases);
  };

  const handleRemoveAlias = (index: number) => {
    setAliases(aliases.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!displayName.trim() || aliases.length === 0) return;
    onAddIdentity({ displayName: displayName.trim(), aliases });
    setDisplayName("");
    setAliases([]);
  };

  return (
    <div className="space-y-5">
      <p className="font-body text-[15px] font-medium leading-7 text-ink/85">
        Link people across different platforms. When you select a unified person in the global filter, their messages will be merged chronologically.
      </p>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ArchivePanel title="Create Unified Identity" subtitle="Merge multiple chats into one person">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block font-display text-xs font-bold uppercase tracking-[0.06em] text-ink/75">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full border-2 border-ink bg-paper px-3 py-2 text-sm font-medium outline-none placeholder:text-ink/40 focus:border-teal focus:ring-1 focus:ring-teal"
              />
            </div>

            <div>
              <label className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.06em] text-ink/75">
                Linked Chats
              </label>
              <div className="space-y-2">
                {aliases.map((alias, index) => (
                  <div key={index} className="flex gap-2">
                    <select
                      value={`${alias.platform}:${alias.conversation}`}
                      onChange={(e) => handleAliasChange(index, e.target.value)}
                      className="min-w-0 flex-1 border-2 border-ink bg-paper px-2 py-1.5 text-sm font-medium outline-none"
                    >
                      {conversations.map((c) => (
                        <option key={`${c.platform}:${c.conversation}`} value={`${c.platform}:${c.conversation}`}>
                          {c.platform}: {c.conversation}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveAlias(index)}
                      className="border-2 border-ink px-3 font-display text-xs font-bold uppercase tracking-widest text-ink hover:bg-ink hover:text-cream"
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAddAlias}
                className="mt-3 border-2 border-dashed border-ink/40 px-4 py-2 font-display text-xs font-bold uppercase tracking-widest text-ink/70 hover:border-ink hover:text-ink"
              >
                + Add Chat Link
              </button>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={!displayName.trim() || aliases.length === 0}
              className="mt-4 w-full border-2 border-ink bg-ink px-4 py-3 font-display text-xs font-bold uppercase tracking-widest text-cream disabled:opacity-50"
            >
              Save Unified Person
            </button>
          </div>
        </ArchivePanel>

        <ArchivePanel title="Saved Identities" subtitle="Manage your merged contacts">
          {identities.length === 0 ? (
            <p className="text-sm font-medium text-ink/60">No unified identities created yet.</p>
          ) : (
            <div className="space-y-3">
              {identities.map((identity) => (
                <div key={identity.id} className="border-2 border-ink bg-paper p-3 shadow-panel">
                  <div className="flex items-start justify-between">
                    <div>
                      <UserText className="font-display text-sm font-bold uppercase tracking-wider text-teal">
                        {identity.displayName}
                      </UserText>
                      <ul className="mt-2 space-y-1">
                        {identity.aliases.map((alias, i) => (
                          <li key={i} className="font-body text-xs text-ink/80">
                            <span className="font-semibold">{alias.platform}:</span> {alias.conversation}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button
                      onClick={() => onRemoveIdentity(identity.id)}
                      className="text-xs font-bold uppercase tracking-widest text-red-700 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ArchivePanel>
      </div>
    </div>
  );
}
