import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloseIcon } from "@dueproof/icons";
import { type FormEvent, type ReactNode, useEffect, useRef } from "react";
import { Button } from "../components/Button/Button";
import { IconButton } from "../components/IconButton/IconButton";
import { ProgressBar, type Step, Stepper } from "../components/Progress/Progress";
import { cx } from "../utils/cx";
import styles from "./templates.module.css";

export interface WizardStep {
  id: string;
  /** Short, for the stepper: "Organisation". */
  label: string;
  /** The step's heading: "Name your organisation". Defaults to the label. */
  title?: string;
  /** A sentence under the heading. */
  description?: ReactNode;
  /** Mark a step as failed (e.g. couldn't reach the AI provider). */
  error?: boolean;
}

export interface WizardTemplateProps {
  /** "Set up Dueproof". */
  title: ReactNode;
  /** A brand mark or logo at the top left. */
  brand?: ReactNode;
  steps: WizardStep[];
  /** 0-based index of the current step. */
  current: number;
  /** The current step's form. */
  children: ReactNode;
  onBack?: () => void;
  /** Next or finish. Runs on submit, so Enter in a field moves on. */
  onNext: () => void;
  /** Leave the wizard (shows a close button). */
  onCancel?: () => void;
  /** False disables Next (required fields missing). */
  canProceed?: boolean;
  busy?: boolean;
  nextLabel?: string;
  finishLabel?: string;
  /** Offer "Skip for now" on optional steps. */
  onSkip?: () => void;
  /** Help beside the form (wide screens). */
  aside?: ReactNode;
  className?: string;
}

/**
 * A guided flow (first-run setup, connecting WhatsApp, importing clients):
 * steps, progress, the step's form, and Back / Next. Focus moves to the
 * step's heading when the step changes.
 */
export function WizardTemplate({
  title,
  brand,
  steps,
  current,
  children,
  onBack,
  onNext,
  onCancel,
  canProceed = true,
  busy = false,
  nextLabel = "Continue",
  finishLabel = "Finish",
  onSkip,
  aside,
  className,
}: WizardTemplateProps) {
  const step = steps[current];
  const last = current === steps.length - 1;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the step changes.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [current]);

  const stepperSteps: Step[] = steps.map((s, i) => ({
    label: s.label,
    status: s.error ? "error" : i < current ? "complete" : i === current ? "current" : "upcoming",
  }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canProceed && !busy) onNext();
  };

  return (
    <div className={cx(styles.wizard, className)}>
      <header className={styles.wizardBar}>
        {brand ? <div className={styles.brand}>{brand}</div> : null}
        <p className={styles.wizardTitle}>{title}</p>
        <span className={styles.stepCount}>
          Step {current + 1} of {steps.length}
        </span>
        {onCancel ? <IconButton icon={CloseIcon} label="Leave setup" onClick={onCancel} /> : null}
      </header>
      <ProgressBar
        value={current + 1}
        max={steps.length}
        label={`Step ${current + 1} of ${steps.length}`}
        hideLabel
        size="sm"
        className={styles.wizardProgress}
      />
      <div className={styles.wizardMain}>
        <nav className={styles.wizardSteps} aria-label="Steps">
          <Stepper steps={stepperSteps} label="Setup steps" orientation="vertical" />
        </nav>
        <form className={styles.wizardForm} onSubmit={submit} noValidate>
          <div className={styles.wizardHead}>
            <h1 ref={headingRef} tabIndex={-1} className={styles.wizardHeading}>
              {step?.title ?? step?.label}
            </h1>
            {step?.description ? (
              <p className={styles.wizardDescription}>{step.description}</p>
            ) : null}
          </div>
          <div className={styles.wizardContent}>{children}</div>
          <footer className={styles.wizardFooter}>
            {onBack && current > 0 ? (
              <Button icon={ArrowLeftIcon} variant="ghost" onClick={onBack} disabled={busy}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <div className={styles.wizardFooterEnd}>
              {onSkip && !last ? (
                <Button variant="plain" onClick={onSkip} disabled={busy}>
                  Skip for now
                </Button>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                iconEnd={last ? CheckIcon : ArrowRightIcon}
                disabled={!canProceed}
                loading={busy}
              >
                {last ? finishLabel : nextLabel}
              </Button>
            </div>
          </footer>
        </form>
        {aside ? <aside className={styles.wizardAside}>{aside}</aside> : null}
      </div>
    </div>
  );
}
