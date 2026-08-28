import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { passkeyAutofillAvailable, signInWithPasskey, signInWithPassword } from "./auth-client.ts";
import { passkeyMessageKey, signInMessageKey } from "./auth-errors.ts";
import FormField from "./FormField.tsx";

type LoginViewProps = {
  /** The session cookie is set; the shell reloads its status and shows the application. */
  onSignedIn: () => void;
};

type Busy = "idle" | "password" | "passkey";

export default function LoginView({ onSignedIn }: LoginViewProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>("idle");
  const [autofill, setAutofill] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void passkeyAutofillAvailable().then((available) => {
      if (cancelled || !available) {
        return;
      }
      setAutofill(true);
      // Conditional UI: this settles only if the viewer picks a passkey from the browser's
      // own suggestions, so a failure here is not something to report.
      void signInWithPasskey(true).then((result) => {
        if (!cancelled && result.ok) {
          onSignedIn();
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [onSignedIn]);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorKey(null);
      setBusy("password");
      void signInWithPassword(email.trim(), password).then((result) => {
        setBusy("idle");
        if (result.ok) {
          onSignedIn();
        } else {
          setErrorKey(signInMessageKey(result.failure));
        }
      });
    },
    [email, onSignedIn, password],
  );

  const usePasskey = useCallback(() => {
    setErrorKey(null);
    setBusy("passkey");
    void signInWithPasskey().then((result) => {
      setBusy("idle");
      if (result.ok) {
        onSignedIn();
      } else {
        setErrorKey(passkeyMessageKey(result.failure, "errors.passkeyFailed"));
      }
    });
  }, [onSignedIn]);

  return (
    <section className="panel auth">
      <h2 className="panel__heading">{t("auth.loginHeading")}</h2>
      <p className="note">{t("auth.loginIntro")}</p>

      <form className="form" onSubmit={submit}>
        <FormField
          label={t("auth.emailLabel")}
          type="email"
          value={email}
          // The browser only offers passkeys from a field that says it accepts them.
          autoComplete={autofill ? "username webauthn" : "username"}
          disabled={busy !== "idle"}
          onChange={setEmail}
        />
        <FormField
          label={t("auth.passwordLabel")}
          type="password"
          value={password}
          autoComplete="current-password"
          disabled={busy !== "idle"}
          onChange={setPassword}
        />

        {errorKey === null ? null : (
          <p className="alert" role="alert">
            {t(errorKey)}
          </p>
        )}

        <button type="submit" className="button--primary" disabled={busy !== "idle"}>
          {t(busy === "password" ? "auth.signingIn" : "auth.signIn")}
        </button>
      </form>

      <p className="auth__separator">{t("auth.separator")}</p>

      <div className="auth__alternative">
        <button type="button" onClick={usePasskey} disabled={busy !== "idle"}>
          {t(busy === "passkey" ? "auth.passkeyWaiting" : "auth.passkeySignIn")}
        </button>
        <p className="note">{t("settings.passkeysNote")}</p>
      </div>
    </section>
  );
}
