"use client";

import React from "react";

export type TabKey = "stake" | "dashboard" | "links";

const items: { key: TabKey; label: string }[] = [
  { key: "stake", label: "Stake" },
  { key: "dashboard", label: "Dashboard" },
  { key: "links", label: "Links" }
];

export function Tabs({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div className="flex gap-2">
      {items.map((it) => {
        const isActive = active === it.key;
        return (
          <button
            key={it.key}
            className={[
              "btn",
              "px-4 py-2",
              isActive ? "bg-black text-white border-black" : "bg-white"
            ].join(" ")}
            onClick={() => onChange(it.key)}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
