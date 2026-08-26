import Foundation

/// IFFL keeper-cost ladder. Mirrors the Postgres `keeper_cost(original, kept)`
/// function exactly so the iOS app can preview cost without a round-trip.
///
/// Per the IFFL rules document:
///   1st year kept: original + $5
///   2nd year kept: previous + $10  (original + $15)
///   3rd year kept: previous + $15  (original + $30)
///   4th year kept: previous + $20  (original + $50)
///   5th year kept: previous + $25  (original + $75)
public enum KeeperCostCalculator {
    /// Cumulative escalation for years_kept = 0..5.
    public static let stepLadder: [Decimal] = [5, 10, 15, 20, 25]

    public enum Error: Swift.Error, Equatable {
        case originalCostNegative(Decimal)
        case yearsKeptOutOfRange(Int)
    }

    /// Returns the keeper cost for a contract entering its `yearsKept`-th renewal.
    /// `yearsKept == 0` returns the original cost.
    public static func cost(original: Decimal, yearsKept: Int) throws -> Decimal {
        guard original >= 0 else { throw Error.originalCostNegative(original) }
        guard (0...5).contains(yearsKept) else { throw Error.yearsKeptOutOfRange(yearsKept) }
        let cumulative = stepLadder.prefix(yearsKept).reduce(0, +)
        return original + cumulative
    }

    /// Renew a contract by one year, returning the new cost. Throws if the
    /// contract has reached its 5-year cap.
    public static func renew(original: Decimal, yearsKept: Int) throws -> Decimal {
        try cost(original: original, yearsKept: yearsKept + 1)
    }

    /// Forecast the cost for the next N seasons (inclusive of current).
    /// e.g. forecast(original: 10, yearsKept: 2, seasons: 3) -> [25, 40, 60].
    public static func forecast(
        original: Decimal,
        yearsKept: Int,
        seasons: Int
    ) throws -> [Decimal] {
        try (0..<seasons).map { offset in
            try cost(original: original, yearsKept: yearsKept + offset)
        }
    }
}
