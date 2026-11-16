import { MentionIcon, SendIcon } from "@dueproof/icons";
import { type FormEvent, type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { cx } from "../../utils/cx";
import { Avatar } from "../Avatar/Avatar";
import { Button } from "../Button/Button";
import { useIsApple } from "../Kbd/Kbd";
import styles from "./CommentComposer.module.css";

export interface MentionUser {
  id: string;
  name: string;
  /** "Partner", "Article assistant". */
  role?: string;
  avatarUrl?: string;
}

export interface CommentSubmission {
  /** The text, with mentions written as "@Name". */
  text: string;
  /** Ids of the people mentioned (they get notified). */
  mentionIds: string[];
}

export interface CommentComposerProps {
  /** People who can be mentioned with @. */
  users: MentionUser[];
  onSubmit: (comment: CommentSubmission) => void | Promise<void>;
  /** The person writing (avatar beside the box). */
  author?: MentionUser;
  placeholder?: string;
  label?: string;
  submitLabel?: string;
  disabled?: boolean;
  /** Start text, e.g. when editing. */
  defaultValue?: string;
  className?: string;
}

interface MentionQuery {
  start: number;
  query: string;
}

/** Find an @mention being typed just before the caret. */
function currentMention(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(before);
  if (!m) return null;
  return { start: caret - (m[2]?.length ?? 0) - 1, query: m[2] ?? "" };
}

/**
 * A comment box with @mentions: type @ and a name, pick with ↑/↓ and Enter
 * (or Tab). ⌘/Ctrl Enter posts.
 */
export function CommentComposer({
  users,
  onSubmit,
  author,
  placeholder = "Add a comment. Type @ to mention someone.",
  label = "Comment",
  submitLabel = "Comment",
  disabled = false,
  defaultValue = "",
  className,
}: CommentComposerProps) {
  const [text, setText] = useState(defaultValue);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [active, setActive] = useState(0);
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const hintId = useId();
  const isApple = useIsApple();

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return users
      .filter(
        (u) =>
          u.name
            .toLowerCase()
            .split(/\s+/)
            .some((w) => w.startsWith(q)) || u.name.toLowerCase().startsWith(q),
      )
      .slice(0, 6);
  }, [mention, users]);
  const open = mention !== null && matches.length > 0;
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));

  const refresh = (value: string, caret: number) => {
    const m = currentMention(value, caret);
    setMention(m);
    if (!m) setActive(0);
  };

  const pick = (user: MentionUser) => {
    if (!mention) return;
    const insert = `@${user.name} `;
    const caret = ref.current?.selectionStart ?? text.length;
    const next = text.slice(0, mention.start) + insert + text.slice(caret);
    setText(next);
    setMentioned((prev) => new Map(prev).set(user.id, user.name));
    setMention(null);
    setActive(0);
    const pos = mention.start + insert.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy || disabled) return;
    const mentionIds = [...mentioned.entries()]
      .filter(([, name]) => body.includes(`@${name}`))
      .map(([id]) => id);
    try {
      const result = onSubmit({ text: body, mentionIds });
      if (result instanceof Promise) {
        setBusy(true);
        await result;
      }
      setText("");
      setMentioned(new Map());
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((activeIndex + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((activeIndex - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const user = matches[activeIndex];
        if (user) {
          e.preventDefault();
          pick(user);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <form className={cx(styles.composer, className)} onSubmit={submit}>
      {author ? <Avatar name={author.name} src={author.avatarUrl} size="sm" /> : null}
      <div className={styles.box}>
        <label className={styles.srOnly} htmlFor={`${listId}-input`}>
          {label}
        </label>
        <textarea
          ref={ref}
          id={`${listId}-input`}
          className={styles.input}
          value={text}
          rows={2}
          placeholder={placeholder}
          disabled={disabled || busy}
          aria-describedby={hintId}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? optionId(activeIndex) : undefined}
          onChange={(e) => {
            setText(e.target.value);
            refresh(e.target.value, e.target.selectionStart);
          }}
          onSelect={(e) => refresh(e.currentTarget.value, e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setMention(null), 120)}
        />
        {open ? (
          <div id={listId} role="listbox" aria-label="People" className={styles.popup}>
            {matches.map((u, i) => (
              // biome-ignore lint/a11y/useFocusableInteractive: reached with aria-activedescendant from the textarea.
              <div
                key={u.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                className={cx(styles.option, i === activeIndex && styles.active)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(u);
                }}
                onMouseMove={() => setActive(i)}
              >
                <Avatar name={u.name} src={u.avatarUrl} size="xs" />
                <span className={styles.optionName}>{u.name}</span>
                {u.role ? <span className={styles.optionRole}>{u.role}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className={styles.bar}>
          <span id={hintId} className={styles.hint}>
            <MentionIcon size={14} /> to mention · {isApple ? "⌘" : "Ctrl"} Enter to post
          </span>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            icon={SendIcon}
            disabled={!text.trim() || disabled}
            loading={busy}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
      <p className={styles.srOnly} aria-live="polite">
        {open ? `${matches.length} ${matches.length === 1 ? "person" : "people"} found` : ""}
      </p>
    </form>
  );
}
