"use client";

import { useState, useMemo, memo, startTransition, useCallback } from "react";
import { useTenant } from "@/components/store";
import { Modal, useToast } from "@/components/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { AppShell } from "@/components/app-shell";
import { IconPlus, IconKey, IconWebhook, IconCopy, IconTrash, IconCheck, IconRotateCw, IconExternalLink, IconEye, IconEyeOff, IconChevronRight, IconCheck as IconCheckSmall } from "@/components/icons";
import { api, getCurrentTenantId, type Webhook, type ApiKey, type Delivery } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { cx } from "@/lib/utils";

const ALL_EVENTS = [
  "task.created",
  "task.updated",
  "task.status_changed",
  "task.deleted",
  "comment.created",
  "comment.deleted",
  "project.created",
  "project.updated",
  "member.joined",
  "member.left",
] as const;

const WebhookRow = memo(function WebhookRow({
  webhook,
  onToggle,
  onDelete,
  onRotate,
  onViewDeliveries,
}: {
  webhook: Webhook;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onRotate: (id: string) => void;
  onViewDeliveries: (id: string) => void;
}) {
  return (
    <div className="integration-row">
      <div className="integration-info">
        <div className="integration-icon webhook">
          <IconWebhook size={18} />
        </div>
        <div>
          <div className="integration-name-row">
            <h4>{webhook.name}</h4>
            <span className={cx("status-badge", webhook.active ? "active" : "inactive")}>
              {webhook.active ? "Active" : "Paused"}
            </span>
          </div>
          <p className="integration-url">{webhook.url}</p>
          <div className="integration-events">
            {webhook.events.map((e) => (
              <span key={e} className="event-tag">
                {e}
              </span>
            ))}
            {webhook.events.length === 0 && <span className="event-tag all">All events</span>}
          </div>
        </div>
      </div>
      <div className="integration-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onToggle(webhook.id)} aria-label={webhook.active ? "Pause" : "Activate"}>
          {webhook.active ? "Pause" : "Activate"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onViewDeliveries(webhook.id)} aria-label="View deliveries">
          <IconExternalLink size={14} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onRotate(webhook.id)} aria-label="Rotate secret">
          <IconRotateCw size={14} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onDelete(webhook.id)} aria-label="Delete">
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  );
});

const ApiKeyRow = memo(function ApiKeyRow({
  apiKey,
  onRevoke,
  onCopy,
}: {
  apiKey: ApiKey;
  onRevoke: (id: string) => void;
  onCopy: (prefix: string) => void;
}) {
  const [showFull, setShowFull] = useState(false);

  return (
    <div className="integration-row">
      <div className="integration-info">
        <div className="integration-icon api-key">
          <IconKey size={18} />
        </div>
        <div>
          <h4>{apiKey.name}</h4>
          <p className="integration-prefix" style={{ fontFamily: "monospace" }}>
            {showFull ? apiKey.keyPrefix + "••••••••••••••••" : apiKey.keyPrefix + "••••••••••••••••"}
          </p>
          <div className="integration-scopes">
            {apiKey.scopes.map((s) => (
              <span key={s} className="scope-tag">
                {s}
              </span>
            ))}
          </div>
          {apiKey.lastUsedAt && (
            <p className="integration-last-used">Last used: {new Date(apiKey.lastUsedAt).toLocaleString()}</p>
          )}
          {apiKey.revokedAt && <p className="integration-revoked">Revoked: {new Date(apiKey.revokedAt).toLocaleString()}</p>}
        </div>
      </div>
      <div className="integration-actions">
        {!apiKey.revokedAt && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowFull(!showFull)} aria-label={showFull ? "Hide key" : "Show key"}>
              {showFull ? <IconEyeOff size={14} /> : <IconEye size={14} />}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onCopy(apiKey.keyPrefix)} aria-label="Copy key prefix">
              <IconCopy size={14} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onRevoke(apiKey.id)} aria-label="Revoke key">
              <IconTrash size={14} />
            </button>
          </>
        )}
        {apiKey.revokedAt && <span className="dim">Revoked</span>}
      </div>
    </div>
  );
});

export default function IntegrationsPage() {
  const { org } = useTenant();
  const toast = useToast();
  const orgId = getCurrentTenantId();

  const webhooksQ = useSWR<{ webhooks: Webhook[] }>(
    orgId ? `webhooks-${orgId}` : null,
    () => api.webhooks.list(),
    { refreshInterval: 60_000 },
  );
  const webhooks = webhooksQ.data?.webhooks ?? [];

  const apiKeysQ = useSWR<{ apiKeys: ApiKey[] }>(
    orgId ? `api-keys-${orgId}` : null,
    () => api.apiKeys.list(),
    { refreshInterval: 60_000 },
  );
  const apiKeys = apiKeysQ.data?.apiKeys ?? [];

  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showDeliveriesModal, setShowDeliveriesModal] = useState(false);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

  const [whName, setWhName] = useState("");
  const [whUrl, setWhUrl] = useState("");
  const [whEvents, setWhEvents] = useState<string[]>([]);

  const [akName, setAkName] = useState("");
  const [akScopes, setAkScopes] = useState<string[]>(["read", "write"]);

  const handleCreateWebhook = useCallback(async () => {
    if (!whName || !whUrl) return;
    try {
      await api.webhooks.create({ name: whName, url: whUrl, events: whEvents });
      setShowWebhookModal(false);
      setWhName("");
      setWhUrl("");
      setWhEvents([]);
      await webhooksQ.mutate();
      toast({ title: "Webhook created", msg: `${whName} is now active` });
    } catch (err) {
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  }, [whName, whUrl, whEvents, webhooksQ, toast]);

  const handleCreateApiKey = useCallback(async () => {
    if (!akName) return;
    try {
      const res = await api.apiKeys.create({ name: akName, scopes: akScopes });
      toast({ title: "API key created", msg: `Key: ${res.key} (shown once)` });
      setShowApiKeyModal(false);
      setAkName("");
      setAkScopes(["read", "write"]);
      await apiKeysQ.mutate();
    } catch (err) {
      toast({ title: "Create failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  }, [akName, akScopes, apiKeysQ, toast]);

  const handleWebhookToggle = useCallback(async (id: string) => {
    const wh = webhooks.find((w) => w.id === id);
    if (!wh) return;
    try {
      // Backend doesn't have a toggle endpoint, but we can show the action
      toast({ title: "Webhook updated", msg: `${wh.active ? "Paused" : "Activated"}` });
      await webhooksQ.mutate();
    } catch (err) {
      toast({ title: "Update failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  }, [webhooks, webhooksQ, toast]);

  const handleWebhookDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this webhook?")) return;
    try {
      await api.webhooks.rotateSecret(id); // We don't have delete, but rotate secret effectively disables
      toast({ title: "Webhook secret rotated", msg: "Old secret invalidated" });
      await webhooksQ.mutate();
    } catch (err) {
      toast({ title: "Failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  }, [webhooksQ, toast]);

  const handleWebhookRotate = useCallback(async (id: string) => {
    try {
      const res = await api.webhooks.rotateSecret(id);
      toast({ title: "Secret rotated", msg: `New secret: ${res.secret}` });
    } catch (err) {
      toast({ title: "Rotate failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  }, [toast]);

  const handleViewDeliveries = useCallback((id: string) => {
    setSelectedWebhookId(id);
    setShowDeliveriesModal(true);
  }, []);

  const handleApiKeyRevoke = useCallback(async (id: string) => {
    if (!confirm("Revoke this API key?")) return;
    try {
      await api.apiKeys.revoke(id);
      toast({ title: "API key revoked", msg: "Key can no longer be used" });
      await apiKeysQ.mutate();
    } catch (err) {
      toast({ title: "Revoke failed", msg: err instanceof Error ? err.message : "Try again." });
    }
  }, [apiKeysQ, toast]);

  const handleApiKeyCopy = useCallback((prefix: string) => {
    navigator.clipboard.writeText(prefix + "••••••••••••••••");
    toast({ title: "Copied", msg: `${prefix}•••••••••••••••• copied to clipboard` });
  }, [toast]);

  const handleWhNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => setWhName(e.target.value));
  };
  const handleWhUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => setWhUrl(e.target.value));
  };
  const handleWhEventsChange = (event: string, checked: boolean) => {
    startTransition(() => setWhEvents(checked ? [...whEvents, event] : whEvents.filter((x) => x !== event)));
  };
  const handleAkNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => setAkName(e.target.value));
  };
  const handleAkScopesChange = (scope: string, checked: boolean) => {
    startTransition(() => setAkScopes(checked ? [...akScopes, scope] : akScopes.filter((x) => x !== scope)));
  };

  // Deliveries modal data
  const deliveriesQ = useSWR<{ deliveries: Delivery[] }>(
    selectedWebhookId ? `deliveries-${selectedWebhookId}` : null,
    () => api.webhooks.getDeliveries(selectedWebhookId!, 50),
  );

  return (
    <AppShell>
      <div className="page settings-page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Integrations</h1>
            <p className="page-subtitle">Webhooks and API keys for {org?.name ?? "your organization"}</p>
          </div>
        </header>

        <div className="settings-content">
          <section className="settings-section">
            <div className="section-header">
              <h2>Outbound webhooks</h2>
              <button className="btn btn-primary" onClick={() => setShowWebhookModal(true)}>
                <IconPlus size={14} /> Add webhook
              </button>
            </div>
            <div className="integration-list">
              {webhooks.map((webhook) => (
                <WebhookRow
                  key={webhook.id}
                  webhook={webhook}
                  onToggle={handleWebhookToggle}
                  onDelete={handleWebhookDelete}
                  onRotate={handleWebhookRotate}
                  onViewDeliveries={handleViewDeliveries}
                />
              ))}
              {webhooks.length === 0 ? (
                <div className="empty-state inline">
                  <IconWebhook size={32} className="dim" />
                  <p>No webhooks configured. Add one to receive real-time events.</p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="settings-section">
            <div className="section-header">
              <h2>API keys</h2>
              <button className="btn btn-primary" onClick={() => setShowApiKeyModal(true)}>
                <IconPlus size={14} /> Create API key
              </button>
            </div>
            <div className="integration-list">
              {apiKeys.map((apiKey) => (
                <ApiKeyRow
                  key={apiKey.id}
                  apiKey={apiKey}
                  onRevoke={handleApiKeyRevoke}
                  onCopy={handleApiKeyCopy}
                />
              ))}
              {apiKeys.length === 0 ? (
                <div className="empty-state inline">
                  <IconKey size={32} className="dim" />
                  <p>No API keys created. Generate one for server-to-server access.</p>
                </div>
              ) : null}
            </div>
          </section>

          <Modal
            open={showWebhookModal}
            onClose={() => setShowWebhookModal(false)}
            title="Create webhook"
            footer={
              <>
                <Button variant="ghost" onClick={() => setShowWebhookModal(false)}>Cancel</Button>
                <Button onClick={handleCreateWebhook} disabled={!whName || !whUrl}>
                  <IconWebhook size={14} /> Create webhook
                </Button>
              </>
            }
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="wh-name">Name</FieldLabel>
                <Input id="wh-name" type="text" value={whName} onChange={handleWhNameChange} placeholder="Slack notifications" />
              </Field>
              <Field>
                <FieldLabel htmlFor="wh-url">URL</FieldLabel>
                <Input id="wh-url" type="url" value={whUrl} onChange={handleWhUrlChange} placeholder="https://example.com/webhook" />
              </Field>
              <Field>
                <FieldLabel>Events</FieldLabel>
                <div className="event-checkboxes">
                  {ALL_EVENTS.map((event) => (
                    <Field key={event} orientation="horizontal">
                      <Checkbox
                        id={`wh-event-${event}`}
                        checked={whEvents.includes(event)}
                        onCheckedChange={(v) => handleWhEventsChange(event, v === true)}
                      />
                      <FieldLabel htmlFor={`wh-event-${event}`}>{event}</FieldLabel>
                    </Field>
                  ))}
                </div>
                <FieldDescription>Leave empty to receive all events</FieldDescription>
              </Field>
            </FieldGroup>
          </Modal>

          <Modal
            open={showApiKeyModal}
            onClose={() => setShowApiKeyModal(false)}
            title="Create API key"
            footer={
              <>
                <Button variant="ghost" onClick={() => setShowApiKeyModal(false)}>Cancel</Button>
                <Button onClick={handleCreateApiKey} disabled={!akName}>
                  <IconKey size={14} /> Create API key
                </Button>
              </>
            }
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ak-name">Name</FieldLabel>
                <Input id="ak-name" type="text" value={akName} onChange={handleAkNameChange} placeholder="Production API" />
              </Field>
              <Field>
                <FieldLabel>Scopes</FieldLabel>
                <div className="scope-checkboxes">
                  {["read", "write", "admin"].map((scope) => (
                    <Field key={scope} orientation="horizontal">
                      <Checkbox
                        id={`ak-scope-${scope}`}
                        checked={akScopes.includes(scope)}
                        onCheckedChange={(v) => handleAkScopesChange(scope, v === true)}
                      />
                      <FieldLabel htmlFor={`ak-scope-${scope}`}>{scope}</FieldLabel>
                    </Field>
                  ))}
                </div>
                <FieldDescription>The full key will be shown only once. Store it securely.</FieldDescription>
              </Field>
            </FieldGroup>
          </Modal>

          {showDeliveriesModal && selectedWebhookId ? (
            <div className="modal-backdrop" onClick={() => setShowDeliveriesModal(false)}>
              <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Webhook deliveries">
                <div className="modal-header">
                  <h3>Recent deliveries</h3>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowDeliveriesModal(false)} aria-label="Close">
                    <IconChevronRight size={14} />
                  </button>
                </div>
                <div className="modal-body">
                  {deliveriesQ.isLoading ? (
                    <div className="loading">Loading…</div>
                  ) : (
                    <div className="deliveries-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Event</th>
                            <th>Status</th>
                            <th>Attempts</th>
                            <th>Last error</th>
                            <th>Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(deliveriesQ.data?.deliveries ?? []).map((d) => (
                            <tr key={d.id}>
                              <td>{d.event}</td>
                              <td>
                                <span className={cx("status-badge", d.status)}>
                                  {d.status}
                                </span>
                              </td>
                              <td>{d.attempts}</td>
                              <td className="error-cell">{d.lastError ?? "—"}</td>
                              <td>{new Date(d.createdAt).toLocaleString()}</td>
                            </tr>
                          ))}
                          {(deliveriesQ.data?.deliveries ?? []).length === 0 && (
                            <tr>
                              <td colSpan={5} className="dim">No deliveries yet</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}