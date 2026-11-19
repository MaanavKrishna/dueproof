/**
 * After a submit finds errors, move focus to the first field marked invalid,
 * so the error is announced where it is (M9). Runs after React has painted
 * the errors.
 */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => {
    form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}
