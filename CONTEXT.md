# Pirut Domain Language

Pirut turns issuer statement rows into a trustworthy household transaction history and derives cautious, evidence-backed insights from that history.

## Statement history

**Stored transaction**:
A canonical financial row committed from an issuer statement, with its purchase date, charge date, stated amounts, card identity, and issuer reference preserved.
_Avoid_: Charge when referring to every transaction, imported row

**Duplicate import**:
A statement file or issuer row that is already stored, identified by the source hash or by the same card and issuer reference. It is rejected or skipped rather than committed again.
_Avoid_: Duplicate charge

**Suspected duplicate charge**:
Two or more distinct stored transactions on the same card with the same purchase date, normalized merchant, and comparison amount. It is evidence worth reviewing, not proof that the merchant charged incorrectly.
_Avoid_: Duplicate import, confirmed duplicate

## Recurrence

**Recurring charge**:
One positive non-installment charge from the same normalized merchant in each of at least three consecutive, imported statement months for the same card. Recurrence describes cadence, not whether the amount is stable.
_Avoid_: Fixed charge, subscription

**Stable recurring amount**:
A recurring charge whose comparison amount has remained equal across the current three-month recurrence window.
_Avoid_: Recurring charge

**Recurring amount change**:
The latest comparison amount differs after the preceding two consecutive recurring charges had the same amount and currency.
_Avoid_: Price increase, because the amount may also decrease or reflect usage

**Possibly stopped recurring charge**:
A charge with at least three consecutive monthly occurrences that has no later occurrence even though the next statement month for the same card was imported.
_Avoid_: Cancelled charge, confirmed cancellation

## Amounts and installments

**Original amount**:
The amount and currency stated for the purchase itself. For an installment row it is the full purchase amount, and for a foreign-currency purchase it is the amount before conversion.
_Avoid_: Billed amount, monthly payment

**Billed amount**:
The amount and currency charged for one stored statement row. For an installment it is the current payment rather than the full purchase amount.
_Avoid_: Original amount, purchase total

**Comparison amount**:
The original amount for a non-ILS purchase and the billed amount for an ILS purchase. Insights compare this value so exchange-rate movement is not mistaken for a merchant price change.
_Avoid_: Converted amount

**Installment commitment**:
An installment purchase with payments remaining after the latest imported payment for its card. Its future billed total is an estimate based on the current payment, not an issuer-stated balance.
_Avoid_: Debt, exact balance
