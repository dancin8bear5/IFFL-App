import Foundation

/// IFFL "TAX DAT ASS" luxury-tax engine.
///
/// Per the rules document:
///   - Cap is $300 of current-season keeper salary per team (Starting+Bench+IR).
///   - Only drafted/kept/traded contracts count. Players acquired via FAAB whose
///     keeper value has reset to the $2 baseline (see waiver-wire reset rule)
///     do **not** count toward the cap.
///   - Exceeding the cap (>=$301) at trade time triggers a $275 penalty: $25
///     paid to each of the other 11 owners, due within 24 hours.
///   - If unpaid in 24h: trade is voided AND the team can make no more trades
///     this season AND each future matchup gets a 100-point penalty until paid.
public struct LuxuryTaxCalculator {
    public struct Contract: Sendable, Equatable {
        public let currentKeeperCost: Decimal
        /// True if this contract was acquired via FAAB at the waiver-wire $2 baseline
        /// (and therefore exempt from the cap per the rules).
        public let isWaiverBaseline: Bool

        public init(currentKeeperCost: Decimal, isWaiverBaseline: Bool) {
            self.currentKeeperCost = currentKeeperCost
            self.isWaiverBaseline = isWaiverBaseline
        }
    }

    public struct Result: Sendable, Equatable {
        public let capUsage: Decimal           // sum of non-waiver contracts
        public let cap: Decimal                // 300 by rule
        public let isOverCap: Bool             // capUsage > cap (i.e., >= 301 at integer prices)
        public let totalPenalty: Decimal       // 275 by rule
        public let perOtherOwnerPayment: Decimal  // 25 by rule
        public let paymentDeadline: Date?      // 24h from trigger if over cap
    }

    public let cap: Decimal
    public let totalPenalty: Decimal
    public let perOtherOwnerPayment: Decimal
    public let paymentWindow: TimeInterval

    public init(
        cap: Decimal = 300,
        totalPenalty: Decimal = 275,
        perOtherOwnerPayment: Decimal = 25,
        paymentWindow: TimeInterval = 24 * 60 * 60
    ) {
        self.cap = cap
        self.totalPenalty = totalPenalty
        self.perOtherOwnerPayment = perOtherOwnerPayment
        self.paymentWindow = paymentWindow
    }

    /// Evaluate cap usage for a roster's contracts at a given moment.
    public func evaluate(contracts: [Contract], now: Date = Date()) -> Result {
        let cap = self.cap
        let usage = contracts
            .filter { !$0.isWaiverBaseline }
            .reduce(Decimal(0)) { $0 + $1.currentKeeperCost }
        let over = usage > cap
        return Result(
            capUsage: usage,
            cap: cap,
            isOverCap: over,
            totalPenalty: totalPenalty,
            perOtherOwnerPayment: perOtherOwnerPayment,
            paymentDeadline: over ? now.addingTimeInterval(paymentWindow) : nil
        )
    }

    /// Forecast the cap impact of a hypothetical trade: a set of contracts
    /// being added and a set being removed from this team's roster.
    public func evaluateAfterTrade(
        currentContracts: [Contract],
        adding: [Contract],
        removing: [Contract],
        now: Date = Date()
    ) -> Result {
        // Remove by reference equality to avoid pulling out the wrong copy when
        // costs are equal but roster entries are distinct.
        var roster = currentContracts
        for r in removing {
            if let idx = roster.firstIndex(of: r) {
                roster.remove(at: idx)
            }
        }
        roster.append(contentsOf: adding)
        return evaluate(contracts: roster, now: now)
    }
}
