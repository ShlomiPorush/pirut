import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  InsightAmount,
  InsightsReport,
  RecurringAmountChangeInsight,
} from "../application/insight-contracts.ts";
import { ERROR_MESSAGE_KEYS, fetchInsights, type ApiErrorCode } from "./api.ts";
import { formatDate, formatMoney, formatMonth } from "./format.ts";

type InsightsViewProps = {
  locale: string;
  onImportRequested: () => void;
};

function money(locale: string, amount: InsightAmount): string {
  return formatMoney(locale, amount.minorUnits, amount.currency);
}

function cardDigits(t: (key: string, values?: Record<string, unknown>) => string, digits: string) {
  return t("insights.cardEnding", { digits });
}

function changeDescription(
  locale: string,
  t: (key: string, values?: Record<string, unknown>) => string,
  change: RecurringAmountChangeInsight,
): string {
  if (change.previousAmount.currency !== change.currentAmount.currency) {
    return t("insights.comparisonCurrencyChanged", {
      previous: money(locale, change.previousAmount),
      current: money(locale, change.currentAmount),
    });
  }
  const difference = change.currentAmount.minorUnits - change.previousAmount.minorUnits;
  if (change.previousAmount.minorUnits === 0) {
    return t("insights.amountChangedBy", {
      difference: money(locale, {
        minorUnits: Math.abs(difference),
        currency: change.currentAmount.currency,
      }),
    });
  }
  const percentage = Math.abs(difference / change.previousAmount.minorUnits);
  const formattedPercentage = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(percentage);
  return t(difference > 0 ? "insights.amountIncreased" : "insights.amountDecreased", {
    difference: money(locale, {
      minorUnits: Math.abs(difference),
      currency: change.currentAmount.currency,
    }),
    percentage: formattedPercentage,
  });
}

export default function InsightsView({ locale, onImportRequested }: InsightsViewProps) {
  const { t } = useTranslation();
  const [report, setReport] = useState<InsightsReport | null>(null);
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchInsights().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setReport(result.value);
        setErrorCode(null);
      } else {
        setReport(null);
        setErrorCode(result.code);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reviewCount =
    report === null
      ? 0
      : report.recurringAmountChanges.length +
        report.suspectedDuplicateCharges.length +
        report.stoppedRecurringCharges.length;

  return (
    <section className="panel insights">
      <div className="insights__header">
        <div>
          <h2 className="panel__heading">{t("insights.heading")}</h2>
          {report?.latestChargeMonth ? (
            <p className="note">
              {t("insights.asOf", { month: formatMonth(locale, report.latestChargeMonth) })}
            </p>
          ) : null}
        </div>
      </div>

      {errorCode !== null ? (
        <p className="alert" role="alert">
          {t(errorCode === "internal" ? "insights.loadError" : ERROR_MESSAGE_KEYS[errorCode])}
        </p>
      ) : null}

      {report === null && errorCode === null ? (
        <p className="note">{t("insights.loading")}</p>
      ) : null}

      {report?.latestChargeMonth === null ? (
        <div className="empty-state">
          <p>{t("insights.noDataYet")}</p>
          <button type="button" onClick={onImportRequested}>
            {t("insights.goToImport")}
          </button>
        </div>
      ) : null}

      {report !== null && report.latestChargeMonth !== null ? (
        <>
          <dl className="insight-summary">
            <div className="insight-summary__item">
              <dt>{t("insights.needsReview")}</dt>
              <dd>{reviewCount}</dd>
            </div>
            <div className="insight-summary__item">
              <dt>{t("insights.recurringCount")}</dt>
              <dd>{report.recurringCharges.length}</dd>
            </div>
            <div className="insight-summary__item">
              <dt>{t("insights.commitmentCount")}</dt>
              <dd>{report.installmentCommitments.length}</dd>
            </div>
          </dl>

          {report.importedMonthCount < 3 ? (
            <p className="insight-notice">{t("insights.moreHistoryNeeded")}</p>
          ) : null}

          <section className="insight-section" aria-labelledby="review-heading">
            <div className="insight-section__heading-row">
              <h3 id="review-heading">{t("insights.reviewHeading")}</h3>
              <span className="insight-section__count">{reviewCount}</span>
            </div>
            {reviewCount === 0 ? <p className="note">{t("insights.nothingToReview")}</p> : null}
            <div className="insight-list">
              {report.recurringAmountChanges.map((change) => (
                <article
                  className="insight-card insight-card--warning"
                  key={`change-${change.cardLastDigits}-${change.merchant}`}
                >
                  <div className="insight-card__title-row">
                    <h4>{change.merchant}</h4>
                    <span className="badge badge--warning">{t("insights.amountChanged")}</span>
                  </div>
                  <p className="insight-card__meta">{cardDigits(t, change.cardLastDigits)}</p>
                  <dl className="insight-facts">
                    <div>
                      <dt>{t("insights.previousAmount")}</dt>
                      <dd>{money(locale, change.previousAmount)}</dd>
                    </div>
                    <div>
                      <dt>{t("insights.currentAmount")}</dt>
                      <dd>{money(locale, change.currentAmount)}</dd>
                    </div>
                  </dl>
                  <p className="insight-card__emphasis">{changeDescription(locale, t, change)}</p>
                  {change.currentAmount.currency !== change.currentBilledAmount.currency ? (
                    <p className="note">
                      {t("insights.billedAs", {
                        amount: money(locale, change.currentBilledAmount),
                      })}
                    </p>
                  ) : null}
                </article>
              ))}

              {report.suspectedDuplicateCharges.map((duplicate) => (
                <article
                  className="insight-card insight-card--danger"
                  key={`duplicate-${duplicate.transactionIds.join("-")}`}
                >
                  <div className="insight-card__title-row">
                    <h4>{duplicate.merchant}</h4>
                    <span className="badge badge--danger">{t("insights.suspectedDuplicate")}</span>
                  </div>
                  <p className="insight-card__meta">{cardDigits(t, duplicate.cardLastDigits)}</p>
                  <p>
                    {t("insights.duplicateDetail", {
                      count: duplicate.transactionIds.length,
                      date: formatDate(locale, duplicate.purchaseDate),
                      amount: money(locale, duplicate.comparisonAmount),
                    })}
                  </p>
                  <p className="note">{t("insights.duplicateCaution")}</p>
                </article>
              ))}

              {report.stoppedRecurringCharges.map((stopped) => (
                <article
                  className="insight-card insight-card--neutral"
                  key={`stopped-${stopped.cardLastDigits}-${stopped.merchant}`}
                >
                  <div className="insight-card__title-row">
                    <h4>{stopped.merchant}</h4>
                    <span className="badge">{t("insights.possiblyStopped")}</span>
                  </div>
                  <p className="insight-card__meta">{cardDigits(t, stopped.cardLastDigits)}</p>
                  <p>
                    {t("insights.stoppedDetail", {
                      amount: money(locale, stopped.lastComparisonAmount),
                      date: formatDate(locale, stopped.lastChargeDate),
                      month: formatMonth(locale, stopped.expectedMonth),
                    })}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="insight-section" aria-labelledby="recurring-heading">
            <div className="insight-section__heading-row">
              <h3 id="recurring-heading">{t("insights.recurringHeading")}</h3>
              <span className="insight-section__count">{report.recurringCharges.length}</span>
            </div>
            {report.recurringCharges.length === 0 ? (
              <p className="note">
                {t(
                  report.importedMonthCount < 3
                    ? "insights.recurringNeedsHistory"
                    : "insights.noRecurring",
                )}
              </p>
            ) : (
              <div className="insight-list insight-list--compact">
                {report.recurringCharges.map((recurring) => (
                  <article
                    className="insight-card"
                    key={`recurring-${recurring.cardLastDigits}-${recurring.merchant}`}
                  >
                    <div className="insight-card__title-row">
                      <h4>{recurring.merchant}</h4>
                      <span className="badge badge--recurring">
                        {t(
                          recurring.amountPattern === "stable"
                            ? "insights.stableAmount"
                            : "insights.variableAmount",
                        )}
                      </span>
                    </div>
                    <p className="insight-card__meta">{cardDigits(t, recurring.cardLastDigits)}</p>
                    <p className="insight-card__amount">
                      {money(locale, recurring.comparisonAmount)}
                    </p>
                    {recurring.comparisonAmount.currency !==
                    recurring.latestBilledAmount.currency ? (
                      <p className="note">
                        {t("insights.billedAs", {
                          amount: money(locale, recurring.latestBilledAmount),
                        })}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="insight-section" aria-labelledby="commitments-heading">
            <div className="insight-section__heading-row">
              <h3 id="commitments-heading">{t("insights.commitmentsHeading")}</h3>
              <span className="insight-section__count">{report.installmentCommitments.length}</span>
            </div>
            {report.installmentCommitments.length === 0 ? (
              <p className="note">{t("insights.noCommitments")}</p>
            ) : (
              <div className="insight-list">
                {report.installmentCommitments.map((commitment) => (
                  <article className="insight-card" key={commitment.transactionId}>
                    <div className="insight-card__title-row">
                      <h4>{commitment.merchant}</h4>
                      <span className="badge badge--recurring">
                        {t("insights.installmentProgress", {
                          number: commitment.installmentNumber,
                          total: commitment.installmentTotal,
                        })}
                      </span>
                    </div>
                    <p className="insight-card__meta">{cardDigits(t, commitment.cardLastDigits)}</p>
                    <dl className="insight-facts insight-facts--wide">
                      <div>
                        <dt>{t("insights.originalPurchaseAmount")}</dt>
                        <dd>{money(locale, commitment.originalAmount)}</dd>
                      </div>
                      <div>
                        <dt>{t("insights.currentPayment")}</dt>
                        <dd>{money(locale, commitment.currentBilledAmount)}</dd>
                      </div>
                      <div>
                        <dt>{t("insights.remainingPayments")}</dt>
                        <dd>{commitment.remainingPayments}</dd>
                      </div>
                      <div>
                        <dt>{t("insights.estimatedRemaining")}</dt>
                        <dd>{money(locale, commitment.estimatedRemainingAmount)}</dd>
                      </div>
                    </dl>
                    <p className="note">{t("insights.estimateCaution")}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
