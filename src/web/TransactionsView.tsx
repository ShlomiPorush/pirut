import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MonthlySummary, StoredTransaction } from "../application/import-contracts.ts";
import {
  ERROR_MESSAGE_KEYS,
  fetchMonthlySummary,
  fetchTransactions,
  type ApiErrorCode,
} from "./api.ts";
import { formatDate, formatMoney, formatMonth, parseMonthKey } from "./format.ts";

/** How much history the month strip offers. */
const SUMMARY_MONTH_LIMIT = 12;

type TransactionsViewProps = {
  locale: string;
  onImportRequested: () => void;
};

export default function TransactionsView({ locale, onImportRequested }: TransactionsViewProps) {
  const { t } = useTranslation();
  const [months, setMonths] = useState<readonly MonthlySummary[] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly StoredTransaction[] | null>(null);
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void fetchMonthlySummary(SUMMARY_MONTH_LIMIT).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setMonths(result.value);
        setErrorCode(null);
      } else {
        setMonths([]);
        setErrorCode(result.code);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectMonth = useCallback((monthKey: string) => {
    setSelectedMonth(monthKey);
    setRows(null);
    const parts = parseMonthKey(monthKey);
    if (parts === null) {
      setRows([]);
      setErrorCode("invalid_filter");
      return;
    }
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    void fetchTransactions(parts.year, parts.month).then((result) => {
      // A slower answer for a month the viewer already left must not replace the current one.
      if (latestRequest.current !== requestId) {
        return;
      }
      if (result.ok) {
        setRows(result.value);
        setErrorCode(null);
      } else {
        setRows([]);
        setErrorCode(result.code);
      }
    });
  }, []);

  return (
    <section className="panel">
      <h2 className="panel__heading">{t("transactions.heading")}</h2>

      {errorCode !== null ? (
        <p className="alert" role="alert">
          {t(ERROR_MESSAGE_KEYS[errorCode])}
        </p>
      ) : null}

      {months === null ? <p className="note">{t("transactions.loading")}</p> : null}

      {months !== null && months.length === 0 && errorCode === null ? (
        <div className="empty-state">
          <p>{t("transactions.noDataYet")}</p>
          <button type="button" onClick={onImportRequested}>
            {t("transactions.goToImport")}
          </button>
        </div>
      ) : null}

      {months !== null && months.length > 0 ? (
        <>
          <h3 className="preview__heading">{t("transactions.monthsHeading")}</h3>
          <ul className="month-strip">
            {months.map((month) => (
              <li key={month.month}>
                <button
                  type="button"
                  className={`month-card${month.month === selectedMonth ? " month-card--active" : ""}`}
                  aria-pressed={month.month === selectedMonth}
                  onClick={() => {
                    selectMonth(month.month);
                  }}
                >
                  <span className="month-card__name">{formatMonth(locale, month.month)}</span>
                  <span className="month-card__total">
                    {formatMoney(locale, month.billedMinorUnits, month.currency)}
                  </span>
                  <span className="month-card__count">
                    {t("transactions.monthCount", { value: month.transactionCount })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {months !== null && months.length > 0 && selectedMonth === null ? (
        <p className="note">{t("transactions.selectMonth")}</p>
      ) : null}

      {selectedMonth !== null && rows === null ? (
        <p className="note">{t("transactions.loading")}</p>
      ) : null}

      {selectedMonth !== null && rows !== null && rows.length === 0 && errorCode === null ? (
        <p className="note">{t("transactions.emptyMonth")}</p>
      ) : null}

      {selectedMonth !== null && rows !== null && rows.length > 0 ? (
        <div className="table-scroll">
          <table className="table">
            <caption className="table__caption">
              {t("transactions.tableCaption", { month: formatMonth(locale, selectedMonth) })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("table.purchaseDate")}</th>
                <th scope="col">{t("table.merchant")}</th>
                <th scope="col">{t("table.originalAmount")}</th>
                <th scope="col">{t("table.billedAmount")}</th>
                <th scope="col">{t("table.installment")}</th>
                <th scope="col">{t("table.tags")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(locale, row.purchaseDate)}</td>
                  <td>{row.merchant}</td>
                  <td className="table__amount">
                    {formatMoney(locale, row.originalMinorUnits, row.originalCurrency)}
                  </td>
                  <td
                    className={`table__amount${
                      row.kind === "refund" || row.billedMinorUnits < 0
                        ? " table__amount--refund"
                        : ""
                    }`}
                  >
                    {formatMoney(locale, row.billedMinorUnits, row.billedCurrency)}
                  </td>
                  <td>
                    {row.installmentNumber === null || row.installmentTotal === null
                      ? ""
                      : t("table.installmentValue", {
                          number: row.installmentNumber,
                          total: row.installmentTotal,
                        })}
                  </td>
                  <td>
                    {/* Issuer markers, shown verbatim: they are statement data, not interface copy. */}
                    <span className="tags">
                      {row.tags.map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
