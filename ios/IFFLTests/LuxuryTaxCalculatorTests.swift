import XCTest
@testable import IFFLCore

final class LuxuryTaxCalculatorTests: XCTestCase {
    private let calc = LuxuryTaxCalculator()

    private func contract(_ cost: Decimal, waiver: Bool = false) -> LuxuryTaxCalculator.Contract {
        LuxuryTaxCalculator.Contract(currentKeeperCost: cost, isWaiverBaseline: waiver)
    }

    func test_emptyRoster_underCap() {
        let r = calc.evaluate(contracts: [])
        XCTAssertEqual(r.capUsage, 0)
        XCTAssertFalse(r.isOverCap)
        XCTAssertNil(r.paymentDeadline)
    }

    func test_atCap_isNotOver() {
        // Exactly $300 = at the cap, not over per "exceeds the $300 threshold ($301)".
        let roster = [contract(100), contract(100), contract(100)]
        let r = calc.evaluate(contracts: roster)
        XCTAssertEqual(r.capUsage, 300)
        XCTAssertFalse(r.isOverCap)
    }

    func test_overCapTriggersPenalty() {
        let roster = [contract(150), contract(151)]
        let now = Date(timeIntervalSinceReferenceDate: 0)
        let r = calc.evaluate(contracts: roster, now: now)
        XCTAssertEqual(r.capUsage, 301)
        XCTAssertTrue(r.isOverCap)
        XCTAssertEqual(r.totalPenalty, 275)
        XCTAssertEqual(r.perOtherOwnerPayment, 25)
        XCTAssertEqual(r.paymentDeadline,
                       now.addingTimeInterval(24 * 60 * 60))
    }

    func test_waiverBaselineContractsDoNotCount() {
        // $290 in drafted contracts + a $200-of-waivers stack should still be UNDER cap.
        let drafted = [contract(290)]
        let waivers = (0..<10).map { _ in contract(20, waiver: true) }
        let r = calc.evaluate(contracts: drafted + waivers)
        XCTAssertEqual(r.capUsage, 290)
        XCTAssertFalse(r.isOverCap)
    }

    func test_evaluateAfterTrade_pushesOverCap() {
        // Team has $280 of drafted contracts. Trade in a $40 keeper, out a $20 one
        // -> new cap usage = 280 - 20 + 40 = $300 (still under by 1 cent — at cap).
        let removing = contract(20)
        let adding = contract(40)
        let current = [contract(140), contract(120), removing]
        let r = calc.evaluateAfterTrade(currentContracts: current,
                                         adding: [adding],
                                         removing: [removing])
        XCTAssertEqual(r.capUsage, 300)
        XCTAssertFalse(r.isOverCap)
    }

    func test_evaluateAfterTrade_clearlyOver() {
        // Team has $290 drafted + adds a $20 keeper -> $310, OVER.
        let current = [contract(290)]
        let r = calc.evaluateAfterTrade(currentContracts: current,
                                         adding: [contract(20)],
                                         removing: [])
        XCTAssertEqual(r.capUsage, 310)
        XCTAssertTrue(r.isOverCap)
        XCTAssertEqual(r.totalPenalty + r.perOtherOwnerPayment * 0, 275)
    }

    func test_evaluateAfterTrade_droppingClearsCap() {
        // $315 currently (over). Dropping the $20 contract clears it.
        let dropped = contract(20)
        let current = [contract(150), contract(145), dropped]
        XCTAssertTrue(calc.evaluate(contracts: current).isOverCap)
        let r = calc.evaluateAfterTrade(currentContracts: current,
                                         adding: [],
                                         removing: [dropped])
        XCTAssertEqual(r.capUsage, 295)
        XCTAssertFalse(r.isOverCap)
    }
}
