import XCTest
@testable import SettleUp

final class SettlementEngineTests: XCTestCase {

    // MARK: netBalances

    /// The Yahtzee example: 4 players, $50 buy-in, Person #3 wins.
    /// Winner collects $50 from each of the 3 losers (+$150); losers are -$50 each.
    func testYahtzeeExampleNets() {
        let lines = [
            (name: "P1", contribution: 50, payout: 0),
            (name: "P2", contribution: 50, payout: 0),
            (name: "P3", contribution: 50, payout: 200), // put in 50, took the 200 pot
            (name: "P4", contribution: 50, payout: 0),
        ]
        let nets = SettlementEngine.netBalances(from: lines)
        XCTAssertEqual(nets["P3"], 150)
        XCTAssertEqual(nets["P1"], -50)
        XCTAssertEqual(nets["P2"], -50)
        XCTAssertEqual(nets["P4"], -50)
        XCTAssertEqual(SettlementEngine.residual(of: nets), 0)
    }

    /// Balances across multiple games accumulate per player and sum to zero.
    func testMultiGameBalancesSumToZero() {
        let lines = [
            // Game A: P1 wins a $30 x3 pot
            (name: "P1", contribution: 30, payout: 90),
            (name: "P2", contribution: 30, payout: 0),
            (name: "P3", contribution: 30, payout: 0),
            // Game B: P2 wins a $20 x2 pot
            (name: "P2", contribution: 20, payout: 40),
            (name: "P3", contribution: 20, payout: 0),
        ]
        let nets = SettlementEngine.netBalances(from: lines)
        XCTAssertEqual(nets["P1"], 60)
        XCTAssertEqual(nets["P2"], -10)   // -30 in game A, +20 in game B
        XCTAssertEqual(nets["P3"], -50)   // -30 + -20
        XCTAssertEqual(SettlementEngine.residual(of: nets), 0)
    }

    // MARK: minimize

    /// The worked settlement example: +120/+30/-90/-60 collapses to exactly 3 payments.
    func testMinimizeProducesThreePayments() {
        let balances = ["Jared": 120, "Ryan": 30, "Bill": -90, "Dugan": -60]
        let payments = SettlementEngine.minimize(balances)

        XCTAssertEqual(payments.count, 3)

        // Every balance must be zeroed by the payments.
        assertSettles(balances, with: payments)

        // Deterministic greedy result: Bill→Jared 90, Dugan→Jared 30, Dugan→Ryan 30.
        XCTAssertEqual(payments, [
            SettlementEngine.Payment(from: "Bill", to: "Jared", amount: 90),
            SettlementEngine.Payment(from: "Dugan", to: "Jared", amount: 30),
            SettlementEngine.Payment(from: "Dugan", to: "Ryan", amount: 30),
        ])
    }

    /// A split-pot game (manual override, two winners) still settles cleanly.
    func testSplitPotSettles() {
        // 4 players ante $25 ($100 pot). P1 and P2 split it $50 each.
        let lines = [
            (name: "P1", contribution: 25, payout: 50),
            (name: "P2", contribution: 25, payout: 50),
            (name: "P3", contribution: 25, payout: 0),
            (name: "P4", contribution: 25, payout: 0),
        ]
        let nets = SettlementEngine.netBalances(from: lines)
        XCTAssertEqual(nets["P1"], 25)
        XCTAssertEqual(nets["P2"], 25)
        XCTAssertEqual(nets["P3"], -25)
        XCTAssertEqual(nets["P4"], -25)

        let payments = SettlementEngine.minimize(nets)
        XCTAssertEqual(payments.count, 2)
        assertSettles(nets, with: payments)
    }

    /// An already-settled trip (everyone net zero) yields no payments.
    func testAlreadySettledYieldsNoPayments() {
        let balances = ["P1": 0, "P2": 0, "P3": 0]
        XCTAssertTrue(SettlementEngine.minimize(balances).isEmpty)
    }

    /// Empty input is safe.
    func testEmptyInput() {
        XCTAssertTrue(SettlementEngine.minimize([:]).isEmpty)
        XCTAssertEqual(SettlementEngine.residual(of: [:]), 0)
    }

    /// Payment count never exceeds n - 1 for a balanced set.
    func testPaymentCountBounded() {
        let balances = ["A": 100, "B": 50, "C": 25, "D": -60, "E": -70, "F": -45]
        let payments = SettlementEngine.minimize(balances)
        assertSettles(balances, with: payments)
        XCTAssertLessThanOrEqual(payments.count, balances.count - 1)
    }

    // MARK: Helpers

    /// Applies each payment to a copy of the balances and asserts everyone lands at 0.
    private func assertSettles(_ balances: [String: Int],
                               with payments: [SettlementEngine.Payment],
                               file: StaticString = #filePath, line: UInt = #line) {
        var b = balances
        for p in payments {
            b[p.from, default: 0] += p.amount   // debtor pays: balance rises toward 0
            b[p.to, default: 0]   -= p.amount   // creditor receives: balance falls toward 0
        }
        for (name, value) in b {
            XCTAssertEqual(value, 0, "\(name) not settled (residual \(value))", file: file, line: line)
        }
    }
}
