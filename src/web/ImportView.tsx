import { useCallback, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommitResult, StatementPreview } from "../application/import-contracts.ts";
import { ERROR_MESSAGE_KEYS, commitStatement, previewStatement, type ApiErrorCode } from "./api.ts";
import { formatDate, formatMoney } from "./format.ts";

type ImportViewProps = { locale: string };

type Busy = "idle" | "previewing" | "committing";

export default function ImportView({ locale }: ImportViewProps) {
  const { t } = useTranslation();
  const warningsId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [outcome, setOutcome] = useState<CommitResult | null>(null);
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);
  const [busy, setBusy] = useState<Busy>("idle");

  const handleFile = useCallback((selected: File | null) => {
    setFile(selected);
    setPreview(null);
    setOutcome(null);
    setErrorCode(null);
    if (selected === null) {
      return;
    }
    setBusy("previewing");
    void previewStatement(selected).then((result) => {
      setBusy("idle");
      if (result.ok) {
        setPreview(result.value);
      } else {
        setErrorCode(result.code);
      }
    });
  }, []);

  const handleCommit = useCallback(() => {
    if (file === null) {
      return;
    }
    setOutcome(null);
    setErrorCode(null);
    setBusy("committing");
    void commitStatement(file).then((result) => {
      setBusy("idle");
      if (result.ok) {
        setOutcome(result.value);
      } else {
        setErrorCode(result.code);
      }
    });
  }, [file]);

  return (
    <section className="panel">
      <h2 className="panel__heading">{t("import.heading")}</h2>

      <label className="field">
        <span className="field__label">{t("import.fileLabel")}</span>
        <input
          className="field__file"
          type="file"
          accept=".xlsx"
          onChange={(event) => {
            handleFile(event.target.files?.[0] ?? null);
          }}
        />
      </label>
      <p className="note">{t("import.fileHint")}</p>
      <p className="note">{t("import.privacyNote")}</p>

      {busy !== "idle" ? (
        <p className="status status--checking" aria-live="polite">
          {t(busy === "previewing" ? "import.previewing" : "import.committing")}
        </p>
      ) : null}

      {errorCode !== null ? (
        <p className="alert" role="alert">
          {t(ERROR_MESSAGE_KEYS[errorCode])}
        </p>
      ) : null}

      {outcome !== null ? (
        <p className="outcome" role="status">
          {outcome.status === "imported"
            ? t("import.importedResult", {
                inserted: outcome.inserted,
                skipped: outcome.skippedDuplicates,
              })
            : t("import.alreadyImportedResult")}
        </p>
      ) : null}

      {preview !== null ? (
        <PreviewPanel
          locale={locale}
          preview={preview}
          warningsId={warningsId}
          busy={busy}
          onCommit={handleCommit}
        />
      ) : null}
    </section>
  );
}

type PreviewPanelProps = {
  locale: string;
  preview: StatementPreview;
  warningsId: string;
  busy: Busy;
  onCommit: () => void;
};

function PreviewPanel({ locale, preview, warningsId, busy, onCommit }: PreviewPanelProps) {
  const { t } = useTranslation();
  const { metadata, counts, warnings, transactions } = preview;
  const nothingToImport = counts.new === 0;

  return (
    <div className="preview">
      <h3 className="preview__heading">{t("import.previewHeading")}</h3>

      <dl className="summary-list">
        <div className="summary-list__item">
          <dt>{t("import.card")}</dt>
          <dd>
            {t("import.cardValue", {
              label: metadata.cardLabel,
              digits: metadata.cardLastDigits,
            })}
          </dd>
        </div>
        <div className="summary-list__item">
          <dt>{t("import.chargeDate")}</dt>
          <dd>{formatDate(locale, metadata.chargeDate)}</dd>
        </div>
        <div className="summary-list__item">
          <dt>{t("import.statedTotal")}</dt>
          <dd>
            {formatMoney(locale, metadata.statedTotal.minorUnits, metadata.statedTotal.currency)}
          </dd>
        </div>
        <div className="summary-list__item">
          <dt>{t("import.newCount")}</dt>
          <dd>{counts.new}</dd>
        </div>
        <div className="summary-list__item">
          <dt>{t("import.duplicateCount")}</dt>
          <dd>{counts.duplicates}</dd>
        </div>
        <div className="summary-list__item">
          <dt>{t("import.totalCount")}</dt>
          <dd>{counts.total}</dd>
        </div>
      </dl>

      {warnings.length > 0 ? (
        <div className="warnings">
          <h4 className="warnings__heading" id={warningsId}>
            {t("import.warningsHeading")}
          </h4>
          {/* Issuer wording, preserved verbatim: it is evidence from the statement, not interface copy. */}
          <ul className="warnings__list" aria-labelledby={warningsId}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="table">
          <caption className="table__caption">{t("import.tableCaption")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("table.purchaseDate")}</th>
              <th scope="col">{t("table.merchant")}</th>
              <th scope="col">{t("table.originalAmount")}</th>
              <th scope="col">{t("table.billedAmount")}</th>
              <th scope="col">{t("table.installment")}</th>
              <th scope="col">{t("table.status")}</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((row, index) => (
              <tr
                key={`${row.reference}-${String(index)}`}
                className={row.status === "duplicate" ? "table__row--muted" : undefined}
              >
                <td>{formatDate(locale, row.purchaseDate)}</td>
                <td>{row.merchant}</td>
                <td className="table__amount">
                  {formatMoney(locale, row.originalAmount.minorUnits, row.originalAmount.currency)}
                </td>
                <td className="table__amount">
                  {formatMoney(locale, row.billedAmount.minorUnits, row.billedAmount.currency)}
                </td>
                <td>
                  {row.installment === undefined
                    ? ""
                    : t("table.installmentValue", {
                        number: row.installment.number,
                        total: row.installment.total,
                      })}
                </td>
                <td>
                  <span className={`badge badge--${row.status}`}>
                    {t(row.status === "new" ? "import.statusNew" : "import.statusDuplicate")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nothingToImport ? <p className="note">{t("import.nothingToImport")}</p> : null}

      <button type="button" onClick={onCommit} disabled={nothingToImport || busy !== "idle"}>
        {t("import.commit")}
      </button>
    </div>
  );
}
