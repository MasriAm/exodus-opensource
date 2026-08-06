import { describe, expect, it } from "vitest";

import {
  conversationStorageKey,
  displayConversationLabel,
  isInstagramSystemMessage,
  stripInstagramFolderId,
} from "../lib/instagram-labels";

describe("instagram labels", () => {
  it("strips trailing folder ids from handles", () => {
    expect(stripInstagramFolderId("albwaqyn_23924831897158008")).toBe(
      "albwaqyn",
    );
    expect(stripInstagramFolderId("friend.name_123456")).toBe("friend.name");
    expect(stripInstagramFolderId("plain_user")).toBe("plain_user");
  });

  it("labels deleted Instagram User threads", () => {
    expect(displayConversationLabel("Instagram User")).toBe("Deleted account");
    expect(displayConversationLabel("instagram_user_123456789")).toBe(
      "Deleted account",
    );
  });

  it("keeps folder ids for deleted Instagram User storage keys", () => {
    expect(conversationStorageKey("friend.name_123456789012")).toBe(
      "friend.name",
    );
    expect(conversationStorageKey("Instagram User_987654321012")).toBe(
      "Instagram User_987654321012",
    );
  });

  it("detects Instagram system / log placeholders", () => {
    expect(isInstagramSystemMessage("Sent an attachment.")).toBe(true);
    expect(isInstagramSystemMessage("You sent a photo.")).toBe(true);
    expect(isInstagramSystemMessage("Reacted to your message")).toBe(true);
    expect(isInstagramSystemMessage("see you tomorrow")).toBe(false);
  });
});
