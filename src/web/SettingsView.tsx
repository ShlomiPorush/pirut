import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { HouseholdMember } from "../application/auth-contracts.ts";
import { MIN_PASSWORD_LENGTH } from "../application/auth-contracts.ts";
import {
  ERROR_MESSAGE_KEYS,
  createMember,
  deleteMember,
  fetchMembers,
  type ApiErrorCode,
  type ApiResult,
} from "./api.ts";
import { addPasskey, listPasskeys, removePasskey, type RegisteredPasskey } from "./auth-client.ts";
import { passkeyMessageKey, type AuthResult } from "./auth-errors.ts";
import FormField from "./FormField.tsx";
import { formatTimestamp } from "./format.ts";

/**
 * The outcome of an action the member just took, as a localized message plus whatever its
 * sentence interpolates. A failed list is kept apart from this: one is what the screen could
 * not load, the other is what the member's own click did.
 */
type Feedback = { key: string; tone: "alert" | "outcome"; values?: Record<string, string> };

type SettingsViewProps = { locale: string };

export default function SettingsView({ locale }: SettingsViewProps) {
  const { t } = useTranslation();

  return (
    <section className="panel">
      <h2 className="panel__heading">{t("settings.heading")}</h2>
      <PasskeysPanel locale={locale} />
      <HouseholdPanel />
    </section>
  );
}

function FeedbackLine({ feedback }: { feedback: Feedback | null }) {
  const { t } = useTranslation();
  if (feedback === null) {
    return null;
  }
  return (
    <p className={feedback.tone} role={feedback.tone === "alert" ? "alert" : "status"}>
      {t(feedback.key, { min: MIN_PASSWORD_LENGTH, ...feedback.values })}
    </p>
  );
}

type PasskeyList = { entries: readonly RegisteredPasskey[] | null; errorKey: string | null };

function toPasskeyList(result: AuthResult<readonly RegisteredPasskey[]>): PasskeyList {
  return result.ok
    ? { entries: result.value, errorKey: null }
    : { entries: [], errorKey: passkeyMessageKey(result.failure, "errors.passkeysUnavailable") };
}

function PasskeysPanel({ locale }: { locale: string }) {
  const { t } = useTranslation();
  const [list, setList] = useState<PasskeyList>({ entries: null, errorKey: null });
  const [name, setName] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listPasskeys().then((result) => {
      if (!cancelled) {
        setList(toPasskeyList(result));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setList(toPasskeyList(await listPasskeys()));
  }, []);

  const add = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFeedback(null);
      setBusy(true);
      void addPasskey(name.trim()).then(async (result) => {
        if (result.ok) {
          setName("");
          setFeedback({ key: "settings.passkeyAdded", tone: "outcome" });
          await refresh();
        } else {
          setFeedback({
            key: passkeyMessageKey(result.failure, "errors.passkeyAddFailed"),
            tone: "alert",
          });
        }
        setBusy(false);
      });
    },
    [name, refresh],
  );

  const remove = useCallback(
    (id: string) => {
      setFeedback(null);
      setBusy(true);
      void removePasskey(id).then(async (result) => {
        if (result.ok) {
          setFeedback({ key: "settings.passkeyRemoved", tone: "outcome" });
          await refresh();
        } else {
          setFeedback({
            key: passkeyMessageKey(result.failure, "errors.passkeyRemoveFailed"),
            tone: "alert",
          });
        }
        setBusy(false);
      });
    },
    [refresh],
  );

  const { entries, errorKey } = list;

  return (
    <div className="subsection">
      <h3 className="subsection__heading">{t("settings.passkeysHeading")}</h3>
      <p className="note">{t("settings.passkeysIntro")}</p>
      <p className="note">{t("settings.passkeysNote")}</p>

      {errorKey === null ? null : (
        <p className="alert" role="alert">
          {t(errorKey)}
        </p>
      )}
      <FeedbackLine feedback={feedback} />

      {entries === null ? <p className="note">{t("settings.passkeysLoading")}</p> : null}

      {entries !== null && entries.length === 0 && errorKey === null ? (
        <p className="note">{t("settings.passkeysEmpty")}</p>
      ) : null}

      {entries !== null && entries.length > 0 ? (
        <ul className="entity-list">
          {entries.map((entry) => {
            const label = entry.name ?? t("settings.passkeyUnnamed");
            return (
              <li className="entity" key={entry.id}>
                <span className="entity__text">
                  <span className="entity__name">{label}</span>
                  <span className="entity__detail">
                    {entry.createdAt === null
                      ? t("settings.passkeyCreatedUnknown")
                      : t("settings.passkeyCreated", {
                          date: formatTimestamp(locale, entry.createdAt),
                        })}
                  </span>
                </span>
                <span className="entity__actions">
                  <button
                    type="button"
                    className="button--danger"
                    aria-label={t("settings.removePasskeyLabel", { name: label })}
                    disabled={busy}
                    onClick={() => {
                      remove(entry.id);
                    }}
                  >
                    {t("settings.removePasskey")}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <form className="form form--inline" onSubmit={add}>
        <FormField
          label={t("settings.passkeyNameLabel")}
          type="text"
          value={name}
          hint={t("settings.passkeyNameHint")}
          disabled={busy}
          onChange={setName}
        />
        <button type="submit" disabled={busy}>
          {t(busy ? "settings.addingPasskey" : "settings.addPasskey")}
        </button>
      </form>
    </div>
  );
}

type MemberList = { entries: readonly HouseholdMember[] | null; errorKey: string | null };

/** A failed list is a loading problem, not a member problem, unless the API named a cause. */
function listErrorKey(code: ApiErrorCode): string {
  return code === "internal" || code === "network"
    ? "errors.membersUnavailable"
    : ERROR_MESSAGE_KEYS[code];
}

function toMemberList(result: ApiResult<readonly HouseholdMember[]>): MemberList {
  return result.ok
    ? { entries: result.value, errorKey: null }
    : { entries: [], errorKey: listErrorKey(result.code) };
}

function HouseholdPanel() {
  const { t } = useTranslation();
  const [list, setList] = useState<MemberList>({ entries: null, errorKey: null });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchMembers().then((result) => {
      if (!cancelled) {
        setList(toMemberList(result));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setList(toMemberList(await fetchMembers()));
  }, []);

  const add = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // Checked here as well as on the server, so a rejected password costs no round trip.
      if (password.length < MIN_PASSWORD_LENGTH) {
        setFeedback({ key: ERROR_MESSAGE_KEYS.weak_password, tone: "alert" });
        return;
      }
      setFeedback(null);
      setBusy(true);
      const added = name.trim();
      void createMember({ name: added, email: email.trim(), password }).then(async (result) => {
        if (result.ok) {
          setName("");
          setEmail("");
          setPassword("");
          setFeedback({ key: "settings.memberAdded", tone: "outcome", values: { name: added } });
          await refresh();
        } else {
          setFeedback({ key: ERROR_MESSAGE_KEYS[result.code], tone: "alert" });
        }
        setBusy(false);
      });
    },
    [email, name, password, refresh],
  );

  const remove = useCallback(
    (member: HouseholdMember) => {
      setFeedback(null);
      setBusy(true);
      void deleteMember(member.id).then(async (result) => {
        setPendingRemoval(null);
        if (result.ok) {
          setFeedback({
            key: "settings.memberRemoved",
            tone: "outcome",
            values: { name: member.name },
          });
          await refresh();
        } else {
          setFeedback({ key: ERROR_MESSAGE_KEYS[result.code], tone: "alert" });
        }
        setBusy(false);
      });
    },
    [refresh],
  );

  const { entries, errorKey } = list;

  return (
    <div className="subsection">
      <h3 className="subsection__heading">{t("settings.householdHeading")}</h3>
      <p className="note">{t("settings.householdIntro")}</p>

      {errorKey === null ? null : (
        <p className="alert" role="alert">
          {t(errorKey)}
        </p>
      )}
      <FeedbackLine feedback={feedback} />

      {entries === null ? <p className="note">{t("settings.membersLoading")}</p> : null}

      {entries !== null && entries.length > 0 ? (
        <ul className="entity-list">
          {entries.map((member) => (
            <li className="entity" key={member.id}>
              <span className="entity__text">
                <span className="entity__name">{member.name}</span>
                <span className="entity__detail">{member.email}</span>
                <span className="entity__detail">
                  {t("settings.memberPasskeys", { value: member.passkeyCount })}
                </span>
              </span>
              {pendingRemoval === member.id ? (
                <span className="confirm">
                  <span className="entity__detail">
                    {t("settings.removeMemberConfirm", { name: member.name })}
                  </span>
                  <span className="confirm__actions">
                    <button
                      type="button"
                      className="button--danger"
                      disabled={busy}
                      onClick={() => {
                        remove(member);
                      }}
                    >
                      {t("settings.confirmRemove")}
                    </button>
                    <button
                      type="button"
                      className="button--quiet"
                      onClick={() => {
                        setPendingRemoval(null);
                      }}
                    >
                      {t("settings.cancel")}
                    </button>
                  </span>
                </span>
              ) : (
                <span className="entity__actions">
                  <button
                    type="button"
                    className="button--danger"
                    aria-label={t("settings.removeMemberLabel", { name: member.name })}
                    disabled={busy}
                    onClick={() => {
                      setPendingRemoval(member.id);
                    }}
                  >
                    {t("settings.removeMember")}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <form className="form form--inline" onSubmit={add}>
        <h4 className="subsection__heading">{t("settings.addMemberHeading")}</h4>
        <FormField
          label={t("auth.nameLabel")}
          type="text"
          value={name}
          autoComplete="off"
          disabled={busy}
          onChange={setName}
        />
        <FormField
          label={t("auth.emailLabel")}
          type="email"
          value={email}
          autoComplete="off"
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
        <button type="submit" disabled={busy}>
          {t(busy ? "settings.addingMember" : "settings.addMember")}
        </button>
      </form>
    </div>
  );
}
