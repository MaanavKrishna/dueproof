"use client";
/**
 * Settings → Team & access: members with their role, "approves replies" and
 * client-level access; invitations (emailed, with a link to copy); a
 * password reset link sent to a member's inbox; removal. Everyone can see the team;
 * owners and admins can change it.
 */
import { AddIcon, CopyIcon, LockIcon, MoreIcon, TrashIcon, UsersIcon } from "@dueproof/icons";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Radio,
  RadioGroup,
  SearchField,
  Select,
  SettingsSection,
  Switch,
  TextArea,
  useToast,
  VisuallyHidden,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  cancelInvitation,
  changeMemberRole,
  inviteMembers,
  removeMember,
  sendMemberPasswordReset,
  setMemberApprover,
  setMemberClientAccess,
} from "@/app/actions/team";
import { ROLE_LABELS, ROLE_OPTIONS } from "@/lib/form-options";
import { type SettingsChrome, SettingsFrame } from "./SettingsFrame";
import { type SsoData, SsoSection } from "./SsoSection";
import styles from "./settings.module.css";

export interface TeamMemberData {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  mayApproveReplies: boolean;
  twoFactorEnabled: boolean;
  clientIds: string[] | null;
  isYou: boolean;
}

export interface TeamData {
  members: TeamMemberData[];
  /** `link` is the tokenised sign-up link, made on the server. */
  invitations: Array<{ id: string; email: string; role: string; expiresAt: string; link: string }>;
  clients: Array<{ id: string; name: string }>;
  canManage: boolean;
  viewerRole: string;
  appUrl: string;
  /** Single sign-on (Business); present only while the licence includes it. */
  sso?: SsoData;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

export function TeamSettings({ chrome, data }: { chrome: SettingsChrome; data: TeamData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const report = (res: { ok: boolean; message?: string }, success?: string) => {
    if (!res.ok) {
      toast({ title: "That didn't work", description: res.message, tone: "danger" });
      return false;
    }
    if (success) toast({ title: success, tone: "success" });
    router.refresh();
    return true;
  };

  const ownerOnly = (m: TeamMemberData) => m.role === "owner" && data.viewerRole !== "owner";
  const roleOptions =
    data.viewerRole === "owner"
      ? [{ value: "owner", label: "Owner — everything, including billing" }, ...ROLE_OPTIONS]
      : ROLE_OPTIONS;

  return (
    <SettingsFrame chrome={chrome} section="team">
      <SettingsSection
        title="Members"
        description={
          data.canManage
            ? "Roles decide what each person can do. Approving replies is a separate permission."
            : "The people in your organisation. An owner or admin can change roles and access."
        }
        actions={data.canManage ? <InviteDialog viewerRole={data.viewerRole} /> : null}
      >
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>
              <VisuallyHidden>Members</VisuallyHidden>
            </caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Role</th>
                <th scope="col">Approves replies</th>
                <th scope="col" className={styles.hideNarrow}>
                  Clients
                </th>
                <th scope="col" className={styles.hideNarrow}>
                  Two-step
                </th>
                {data.canManage ? (
                  <th scope="col" className={styles.end}>
                    <VisuallyHidden>Actions</VisuallyHidden>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => {
                const locked = !data.canManage || m.isYou || ownerOnly(m);
                const allClients = m.role === "owner" || m.role === "admin";
                return (
                  <tr key={m.memberId} aria-busy={pending === m.memberId || undefined}>
                    <td>
                      <span className={styles.person}>
                        <Avatar name={m.name || m.email} size="sm" />
                        <span className={styles.personText}>
                          <span className={styles.personName}>
                            {m.name}
                            {m.isYou ? (
                              <>
                                {" "}
                                <Badge size="sm">You</Badge>
                              </>
                            ) : null}
                          </span>
                          <span className={styles.personEmail}>{m.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      {locked ? (
                        <Badge>{ROLE_LABELS[m.role] ?? m.role}</Badge>
                      ) : (
                        <Select
                          label={`Role for ${m.name}`}
                          hideLabel
                          size="sm"
                          value={m.role}
                          options={roleOptions}
                          onValueChange={async (role) => {
                            setPending(m.memberId);
                            report(
                              await changeMemberRole(m.memberId, role),
                              `${m.name} is now ${ROLE_LABELS[role]?.toLowerCase() ?? role}`,
                            );
                            setPending(null);
                          }}
                        />
                      )}
                    </td>
                    <td>
                      <Switch
                        aria-label={`${m.name} approves replies`}
                        checked={m.mayApproveReplies && m.role !== "viewer"}
                        disabled={locked || m.role === "viewer"}
                        onCheckedChange={async (v) => {
                          setPending(m.memberId);
                          report(await setMemberApprover(m.memberId, v));
                          setPending(null);
                        }}
                      />
                    </td>
                    <td className={styles.hideNarrow}>
                      {allClients ? (
                        <span className={styles.muted}>All clients</span>
                      ) : data.canManage && !m.isYou ? (
                        <ClientAccessDialog member={m} clients={data.clients} onSaved={report} />
                      ) : (
                        <span className={styles.muted}>
                          {m.clientIds === null ? "All clients" : `${m.clientIds.length} clients`}
                        </span>
                      )}
                    </td>
                    <td className={styles.hideNarrow}>
                      {m.twoFactorEnabled ? (
                        <Badge tone="success" size="sm">
                          On
                        </Badge>
                      ) : (
                        <Badge size="sm">Off</Badge>
                      )}
                    </td>
                    {data.canManage ? (
                      <td className={styles.end}>
                        {locked ? null : (
                          <MemberMenu
                            member={m}
                            onSendReset={async () => {
                              report(
                                await sendMemberPasswordReset(m.memberId),
                                `Reset link sent to ${m.email}`,
                              );
                            }}
                            onRemove={async () => {
                              report(await removeMember(m.memberId), `${m.name} removed`);
                            }}
                          />
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SettingsSection>

      {data.canManage ? (
        <SettingsSection
          title="Invitations"
          description="Each person gets an email with a sign-up link and joins with that role. You can also copy the link and send it yourself. Invitations last 14 days."
        >
          {data.invitations.length === 0 ? (
            <EmptyState
              size="compact"
              headingLevel={3}
              icon={UsersIcon}
              title="No pending invitations"
              description="Invite people with the button above."
            />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption>
                  <VisuallyHidden>Pending invitations</VisuallyHidden>
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col" className={styles.hideNarrow}>
                      Expires
                    </th>
                    <th scope="col" className={styles.end}>
                      <VisuallyHidden>Actions</VisuallyHidden>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.invitations.map((inv) => {
                    const link = inv.link;
                    return (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td>
                          <Badge>{ROLE_LABELS[inv.role] ?? inv.role}</Badge>
                        </td>
                        <td className={styles.hideNarrow}>
                          <span className={styles.muted}>
                            {dateFmt.format(new Date(inv.expiresAt))}
                          </span>
                        </td>
                        <td className={styles.end}>
                          <span className={styles.actions}>
                            <IconButton
                              icon={CopyIcon}
                              size="sm"
                              label={`Copy sign-up link for ${inv.email}`}
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(link);
                                  toast({
                                    title: "Sign-up link copied",
                                    description: "Send it to them.",
                                  });
                                } catch {
                                  toast({ title: "Couldn't copy", description: link });
                                }
                              }}
                            />
                            <IconButton
                              icon={TrashIcon}
                              size="sm"
                              label={`Cancel invitation for ${inv.email}`}
                              onClick={async () =>
                                report(await cancelInvitation(inv.id), "Invitation cancelled")
                              }
                            />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SettingsSection>
      ) : null}
      {data.sso ? <SsoSection data={data.sso} /> : null}
    </SettingsFrame>
  );
}

function MemberMenu({
  member,
  onSendReset,
  onRemove,
}: {
  member: TeamMemberData;
  onSendReset: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger>
          <IconButton icon={MoreIcon} size="sm" label={`More for ${member.name}`} />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={LockIcon} onSelect={() => void onSendReset()}>
            Email a password reset link
          </MenuItem>
          <MenuItem icon={TrashIcon} destructive onSelect={() => setOpen(true)}>
            Remove from organisation
          </MenuItem>
        </MenuContent>
      </Menu>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${member.name}?`}
        description="They lose access straight away. Their work, comments and audit entries stay. You can invite them again later."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={onRemove}
      />
    </>
  );
}

function InviteDialog({ viewerRole }: { viewerRole: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const bad = list.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const submit = async () => {
    if (list.length === 0 || bad) return;
    setBusy(true);
    setError(null);
    const res = await inviteMembers({ emails: list, role });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    const { invited, skipped } = res.data;
    const emailed = invited.filter((i) => i.emailed).length;
    const notEmailed = invited.length - emailed;
    const parts: string[] = [];
    if (emailed > 0)
      parts.push(
        emailed === 1
          ? "We've emailed them a sign-up link."
          : `We've emailed ${emailed} sign-up links.`,
      );
    if (notEmailed > 0)
      parts.push(
        `${notEmailed === 1 ? "One email" : `${notEmailed} emails`} couldn't be sent. Copy the link under Invitations and send it yourself.`,
      );
    if (skipped.length > 0)
      parts.push(
        `${skipped.join(", ")} already ${skipped.length === 1 ? "is a member" : "are members"}.`,
      );
    toast({
      title: invited.length === 1 ? "1 person invited" : `${invited.length} people invited`,
      description: parts.join(" "),
      tone: notEmailed > 0 ? "warning" : "success",
    });
    setOpen(false);
    setEmails("");
    router.refresh();
  };

  const options =
    viewerRole === "owner"
      ? [{ value: "owner", label: "Owner — everything, including billing" }, ...ROLE_OPTIONS]
      : ROLE_OPTIONS;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
      trigger={
        <Button size="sm" icon={AddIcon}>
          Invite people
        </Button>
      }
      title="Invite people"
      description="We'll email each person a link to sign up with the address you enter here."
      dismissible={!emails}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={busy}
            disabled={list.length === 0 || Boolean(bad)}
          >
            {list.length > 1 ? `Invite ${list.length} people` : "Invite"}
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}
        <TextArea
          label="Email addresses"
          description="One per line, or separated by commas."
          value={emails}
          rows={4}
          onChange={(e) => setEmails(e.target.value)}
          error={bad ? `“${bad}” isn't an email address.` : undefined}
        />
        <Select label="Role" value={role} onValueChange={setRole} options={options} />
      </div>
    </Dialog>
  );
}

function ClientAccessDialog({
  member,
  clients,
  onSaved,
}: {
  member: TeamMemberData;
  clients: Array<{ id: string; name: string }>;
  onSaved: (res: { ok: boolean; message?: string }, success?: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "some">(member.clientIds === null ? "all" : "some");
  const [selected, setSelected] = useState<string[]>(member.clientIds ?? []);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, query]);

  const save = async () => {
    setBusy(true);
    const ok = onSaved(
      await setMemberClientAccess(member.memberId, mode === "all" ? null : selected),
      "Client access saved",
    );
    setBusy(false);
    if (ok) setOpen(false);
  };

  const label =
    member.clientIds === null
      ? "All clients"
      : member.clientIds.length === 1
        ? "1 client"
        : `${member.clientIds.length} clients`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setMode(member.clientIds === null ? "all" : "some");
          setSelected(member.clientIds ?? []);
          setQuery("");
        }
      }}
      trigger={
        <Button size="sm" variant="plain" aria-label={`Client access for ${member.name}: ${label}`}>
          {label}
        </Button>
      }
      title={`Client access for ${member.name}`}
      description="Limit which clients' notices and deadlines this person can see and work on."
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Save access
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        <RadioGroup label="Access" value={mode} onValueChange={(v) => setMode(v as "all" | "some")}>
          <Radio value="all" label="Every client" description="Including clients added later." />
          <Radio value="some" label="Only these clients" />
        </RadioGroup>
        {mode === "some" ? (
          clients.length === 0 ? (
            <EmptyState
              size="compact"
              headingLevel={3}
              title="No clients yet"
              description="Once you add clients, you can choose them here."
            />
          ) : (
            <>
              <SearchField
                label="Find a client"
                placeholder="Find a client"
                value={query}
                onValueChange={setQuery}
              />
              <div className={styles.checkList}>
                {shown.map((c) => (
                  <Checkbox
                    key={c.id}
                    label={c.name}
                    checked={selected.includes(c.id)}
                    onCheckedChange={(v) =>
                      setSelected((s) => (v === true ? [...s, c.id] : s.filter((x) => x !== c.id)))
                    }
                  />
                ))}
              </div>
              <span className={styles.muted}>{selected.length} chosen</span>
            </>
          )
        ) : null}
      </div>
    </Dialog>
  );
}
