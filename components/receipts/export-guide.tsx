"use client";

import { useState } from "react";

type PlatformId = "snapchat" | "instagram" | "whatsapp" | "facebook";

interface GuideEntry {
  id: PlatformId;
  label: string;
  steps: string[];
  /** The thing people are surprised by, said before they waste a day on it. */
  caveat: string;
}

const GUIDES: readonly GuideEntry[] = [
  {
    id: "snapchat",
    label: "Snapchat",
    steps: [
      "Profile → the gear icon → My Data.",
      "Submit a request for all date ranges. Leave Memories out unless you want a much bigger file.",
      "Snapchat emails a download link, usually the same day. Drop that .zip here.",
    ],
    caveat:
      "Snapchat only exports messages that someone saved in the chat. Everything unsaved was deleted when it was opened — that is the entire point of the app, and no export can bring it back.",
  },
  {
    id: "instagram",
    label: "Instagram",
    steps: [
      "Settings → Accounts Centre → Your information and permissions → Download your information.",
      "Request a download, pick JSON rather than HTML, and set the range to All time.",
      "Instagram emails a link within a few hours. Drop that .zip here.",
    ],
    caveat:
      "JSON is the one that matters. An HTML download looks the same in your inbox and cannot be read by this or any other tool.",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    steps: [
      "Open a chat → the contact name → Export chat.",
      "Choose Without media unless you specifically want the photos.",
      "Save the .zip and drop it here. Repeat for any chat you want included.",
    ],
    caveat:
      "WhatsApp exports one conversation at a time, so add several files if you want the full picture.",
  },
  {
    id: "facebook",
    label: "Facebook",
    steps: [
      "Settings & privacy → Settings → Download your information.",
      "Request a download in JSON, range All time.",
      "Drop the .zip here once the email arrives.",
    ],
    caveat:
      "Messenger history lives in the Facebook export, not the Instagram one, even when the accounts are linked.",
  },
];

export function ExportGuide() {
  const [selected, setSelected] = useState<PlatformId>("snapchat");
  const guide = GUIDES.find((entry) => entry.id === selected) ?? GUIDES[0];

  return (
    <div>
      <div className="rc-tabs" role="tablist" aria-label="Choose an app">
        {GUIDES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            className="rc-tab"
            data-selected={entry.id === selected}
            aria-selected={entry.id === selected}
            onClick={() => setSelected(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={`${guide.label} export steps`}>
        <ol className="rc-steps">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="rc-body" style={{ marginTop: "1.35rem", fontSize: "0.92rem" }}>
          {guide.caveat}
        </p>
      </div>
    </div>
  );
}
