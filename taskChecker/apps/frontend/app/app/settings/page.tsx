"use client";

import Link from "next/link";
import { useTenant } from "@/components/store";
import { AppShell } from "@/components/app-shell";
import { IconUsers, IconCreditCard, IconWebhook, IconFileText, IconShield, IconSettings, IconChevronRight } from "@/components/icons";
import { cx } from "@/lib/utils";
import { memo } from "react";

// Hoist static JSX outside component (rendering-hoist-jsx)
interface SettingsSection {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly icon: React.ComponentType<{ size?: number }>;
}

const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { href: "/app/settings/members", title: "Members", description: "Manage team members and roles", icon: IconUsers },
  // { href: "/app/settings/usage", title: "Usage & plan", description: "View usage meters and subscription tier", icon: IconCreditCard }, // usage commented out
  { href: "/app/settings/integrations", title: "Integrations", description: "Webhooks and API keys", icon: IconWebhook },
  { href: "/app/settings/audit", title: "Audit log", description: "Security and admin activity trail", icon: IconFileText },
] as const;

/**
 * rerender-memo: Memoize SectionCard to prevent unnecessary re-renders
 */
const SectionCard = memo(function SectionCard({ section }: { section: typeof SETTINGS_SECTIONS[0] }) {
  return (
    <Link href={section.href} className="settings-card">
      <div className="settings-card-icon">
        <section.icon size={20} />
      </div>
      <div className="settings-card-content">
        <h3>{section.title}</h3>
        <p>{section.description}</p>
      </div>
      <IconChevronRight size={16} className="dim" />
    </Link>
  );
});

export default function SettingsPage() {
  const { org } = useTenant();

  return (
    <AppShell>
      <div className="page settings-page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Manage {org?.name ?? "your"} organization settings</p>
          </div>
        </header>

        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings navigation">
            <ul>
              {SETTINGS_SECTIONS.map(section => (
                <li key={section.href}>
                  <Link href={section.href} className="settings-nav-item">
                    <section.icon size={16} />
                    <span>{section.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="settings-content">
            <div className="settings-grid">
              {SETTINGS_SECTIONS.map(section => (
                <SectionCard key={section.href} section={section} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}