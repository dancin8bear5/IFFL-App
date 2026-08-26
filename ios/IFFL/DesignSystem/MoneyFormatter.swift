import Foundation
import SwiftUI

/// Format Decimal currency consistently. Whole dollars show as "$25"; cents
/// show as "$25.50". Always uses dollar sign + tabular figures for column alignment.
enum MoneyFormatter {
    static func string(_ amount: Decimal, showsZeroAsDash: Bool = false) -> String {
        if showsZeroAsDash, amount == 0 { return "—" }
        let isWhole = (amount as NSDecimalNumber).decimalValue.isWhole
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.locale = Locale(identifier: "en_US")
        f.maximumFractionDigits = isWhole ? 0 : 2
        f.minimumFractionDigits = isWhole ? 0 : 2
        return f.string(from: amount as NSDecimalNumber) ?? "$0"
    }

    /// Compact form used in tight columns: drops the leading '$' if requested.
    static func compactString(_ amount: Decimal, withDollarSign: Bool = true) -> String {
        let s = string(amount)
        return withDollarSign ? s : String(s.dropFirst())
    }
}

private extension Decimal {
    var isWhole: Bool {
        var rounded = Decimal()
        var copy = self
        NSDecimalRound(&rounded, &copy, 0, .plain)
        return rounded == self
    }
}

/// Reusable money label with tabular digits. Use as `MoneyText(amount: 25)`.
struct MoneyText: View {
    let amount: Decimal
    var emphasis: Emphasis = .primary

    enum Emphasis {
        case primary, secondary, status(Color)
    }

    var body: some View {
        Text(MoneyFormatter.string(amount))
            .tabularNumerals()
            .foregroundStyle(color)
    }

    private var color: Color {
        switch emphasis {
        case .primary:        return Theme.Text.primary
        case .secondary:      return Theme.Text.secondary
        case .status(let c):  return c
        }
    }
}
