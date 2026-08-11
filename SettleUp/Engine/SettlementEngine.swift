import Foundation

// MARK: - SettlementEngine
//
// Pure computation — zero framework dependencies (no SwiftData, no SwiftUI).
// Mirrors the IFFL `MarketEngine` pattern: a namespace of `static` functions
// operating on plain inputs and returning nested result structs. This makes
// the who-owes-whom math trivially unit-testable.

struct SettlementEngine {

    /// One suggested payment in the final true-up: `from` pays `to` `amount` dollars.
    struct Payment: Identifiable, Equatable {
        let from: String   // debtor (player name)
        let to: String     // creditor (player name)
        let amount: Int
        var id: String { "\(from)→\(to):\(amount)" }
    }

    // MARK: Net balances

    /// Net balance per player across a set of game lines.
    /// Positive = the player is owed money (won overall); negative = the player owes.
    /// Input is `(playerName, contribution, payout)` tuples so the engine never
    /// touches the persistence layer.
    static func netBalances(from lines: [(name: String, contribution: Int, payout: Int)]) -> [String: Int] {
        var balances: [String: Int] = [:]
        for line in lines {
            balances[line.name, default: 0] += line.payout - line.contribution
        }
        return balances
    }

    // MARK: Minimize transactions

    /// Reduce a set of net balances to the fewest payments that settle everyone.
    ///
    /// Greedy max-creditor / max-debtor: repeatedly match the person owed the most
    /// with the person who owes the most, settling the smaller of the two each time.
    /// Produces at most (n − 1) payments. This is the standard "minimize cash flow"
    /// heuristic — optimal for essentially all real trip data.
    ///
    /// Zero balances are ignored. If balances don't sum to zero (an unbalanced game
    /// was entered), the algorithm still settles as far as it can; the remainder is
    /// surfaced by the caller via `residual(of:)`.
    static func minimize(_ balances: [String: Int]) -> [Payment] {
        // Creditors (owed money) and debtors (owe money), each as (name, amount>0).
        var creditors = balances.filter { $0.value > 0 }.map { (name: $0.key, amount: $0.value) }
        var debtors   = balances.filter { $0.value < 0 }.map { (name: $0.key, amount: -$0.value) }

        // Deterministic order: largest first, then by name to break ties.
        let byAmountThenName: ((name: String, amount: Int), (name: String, amount: Int)) -> Bool = {
            $0.amount != $1.amount ? $0.amount > $1.amount : $0.name < $1.name
        }
        creditors.sort(by: byAmountThenName)
        debtors.sort(by: byAmountThenName)

        var payments: [Payment] = []
        var ci = 0
        var di = 0

        while ci < creditors.count && di < debtors.count {
            let pay = min(creditors[ci].amount, debtors[di].amount)
            if pay > 0 {
                payments.append(Payment(from: debtors[di].name, to: creditors[ci].name, amount: pay))
            }
            creditors[ci].amount -= pay
            debtors[di].amount   -= pay
            if creditors[ci].amount == 0 { ci += 1 }
            if debtors[di].amount == 0 { di += 1 }
        }

        return payments
    }

    /// Convenience: net balances → minimized payments in one call.
    static func settle(_ balances: [String: Int]) -> [Payment] {
        minimize(balances)
    }

    // MARK: Diagnostics

    /// Sum of all balances. Should be 0 for a well-formed trip; any nonzero value
    /// means at least one game's pot was entered unbalanced.
    static func residual(of balances: [String: Int]) -> Int {
        balances.values.reduce(0, +)
    }
}
