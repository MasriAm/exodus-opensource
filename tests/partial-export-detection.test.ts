import { describe, expect, it } from "vitest";

import { detectParser } from "../parsers/registry";
import {
  hasFacebookMarker,
  hasInstagramMarker,
  hasSharedMetaMarker,
} from "../parsers/paths";

/**
 * Meta's export tool lets people tick individual categories, so archives
 * routinely arrive without the `your_*_activity` folder that detection used to
 * depend on. These lock the per-category shapes people actually request.
 */
describe("partial Meta exports", () => {
  const cases: Array<[string, string[], string | null]> = [
    [
      "everything",
      [
        "your_instagram_activity/messages/inbox/maya/message_1.json",
        "connections/followers_and_following/followers_1.json",
        "personal_information/personal_information.json",
      ],
      "instagram",
    ],
    [
      "messages only",
      ["your_instagram_activity/messages/inbox/maya/message_1.json"],
      "instagram",
    ],
    [
      "followers only — no your_instagram_activity folder at all",
      [
        "connections/followers_and_following/followers_1.json",
        "connections/followers_and_following/following.json",
      ],
      "instagram",
    ],
    ["comments only", ["your_instagram_activity/comments/post_comments_1.json"], "instagram"],
    ["close friends only", ["connections/close_friends.json"], "instagram"],
    [
      "account-level categories that name neither Meta product",
      [
        "personal_information/personal_information.json",
        "ads_information/ads_and_topics/ads_interests.json",
      ],
      "instagram",
    ],
    [
      "Facebook friends only",
      ["connections/friends/your_friends.json"],
      "facebook",
    ],
    [
      "Facebook posts only",
      ["your_facebook_activity/posts/your_posts_1.json"],
      "facebook",
    ],
  ];

  for (const [label, paths, expected] of cases) {
    it(`recognizes ${label}`, () => {
      expect(detectParser(paths)?.id ?? null).toBe(expected);
    });
  }

  it("keeps a nested wrapper folder from hiding the signature", () => {
    expect(
      detectParser([
        "instagram-yousef-2026-01-01/connections/followers_and_following/followers_1.json",
      ])?.id,
    ).toBe("instagram");
  });

  it("still refuses an archive that is not a data export", () => {
    expect(detectParser(["holiday/photo.jpg", "notes.txt"])).toBeNull();
  });
});

describe("marker precision", () => {
  it("does not let shared Meta folders decide the product", () => {
    const shared = ["personal_information/personal_information.json"];
    expect(hasInstagramMarker(shared)).toBe(false);
    expect(hasFacebookMarker(shared)).toBe(false);
    expect(hasSharedMetaMarker(shared)).toBe(true);
  });

  it("keeps Instagram and Facebook signatures apart", () => {
    expect(hasInstagramMarker(["connections/followers_and_following/followers_1.json"])).toBe(true);
    expect(hasFacebookMarker(["connections/followers_and_following/followers_1.json"])).toBe(false);
    expect(hasFacebookMarker(["connections/friends/your_friends.json"])).toBe(true);
    expect(hasInstagramMarker(["connections/friends/your_friends.json"])).toBe(false);
  });

  it("does not claim a Snapchat or WhatsApp archive as Meta", () => {
    const snapchat = ["mydata/json/chat_history.json", "mydata/json/account.json"];
    expect(hasInstagramMarker(snapchat)).toBe(false);
    expect(hasFacebookMarker(snapchat)).toBe(false);
    expect(hasSharedMetaMarker(snapchat)).toBe(false);
    expect(hasSharedMetaMarker(["_chat.txt"])).toBe(false);
  });
});
