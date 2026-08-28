import { useCallback, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { MIN_PASSWORD_LENGTH } from "../application/auth-contracts.ts";
import { ERROR_MESSAGE_KEYS, createFirstUser } from "./api.ts";
import FormField from "./FormField.tsx";

type SetupViewProps = {
  /** The account exists and the session cookie is set; the shell reloads its status. */
  onCompleted: () => void;
};

/** First run: nobody can sign in yet, so this screen creates the household's first account. */
export default function SetupView({ onCompleted }: SetupViewProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // Checked here as well as on the server, so a rejected password costs no round trip.
      if (password.length < MIN_PASSWORD_LENGTH) {
        setErrorKey(ERROR_MESSAGE_KEYS.weak_password);
        return;
      }
      if (password !== confirmation) {
        setErrorKey("errors.passwordMismatch");
        return;
      }
      setErrorKey(null);
      setBusy(true);
      void createFirstUser({ name: name.trim(), email: email.trim(), password }).then((result) => {
        setBusy(false);
        if (result.ok) {
          onCompleted();
        } else {
          setErrorKey(ERROR_MESSAGE_KEYS[result.code]);
        }
      });
    },
    [confirmation, email, name, onCompleted, password],
  );

  return (
    <section className="panel auth">
      <h2 className="panel__heading">{t("auth.setupHeading")}</h2>
      <p className="note">{t("auth.setupIntro")}</p>

      <form className="form" onSubmit={submit}>
        <FormField
          label={t("auth.nameLabel")}
          type="text"
          value={name}
          autoComplete="name"
          disabled={busy}
          onChange={setName}
        />
        <FormField
          label={t("auth.emailLabel")}
          type="email"
          value={email}
          autoComplete="username"
          disabled={busy}
          onChange={setEmail}
        />
        <FormField
          label={t("auth.passwordLabel")}
          type="password"
          value={password}
          hint={t("auth.passwordHint", { min: MIN_PASSWORD_LENGTH })}
          autoComplete="new-password"
          disabled={busy}
          onChange={setPassword}
        />
        <FormField
          label={t("auth.confirmLabel")}
          type="password"
          value={confirmation}
          autoComplete="new-password"
          disabled={busy}
          onChange={setConfirmation}
        />

        {errorKey === null ? null : (
          <p className="alert" role="alert">
            {t(errorKey, { min: MIN_PASSWORD_LENGTH })}
          </p>
        )}

        <button type="submit" className="button--primary" disabled={busy}>
          {t(busy ? "auth.creatingAccount" : "auth.createAccount")}
        </button>
      </form>
    </section>
  );
}
