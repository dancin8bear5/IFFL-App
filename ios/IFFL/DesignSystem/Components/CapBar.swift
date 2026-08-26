import SwiftUI

/// Visual representation of a team's keeper-salary cap usage vs the $300 cap.
/// Three states: safe, warn (≥260), over (>300). Numbers in tabular figures.
struct CapBar: View {
    let used: Decimal
    let cap: Decimal
    var compact: Bool = false

    private var fraction: Double {
        let usedD = NSDecimalNumber(decimal: used).doubleValue
        let capD  = NSDecimalNumber(decimal: cap).doubleValue
        guard capD > 0 else { return 0 }
        return min(max(usedD / capD, 0), 1.5)   // allow visual overshoot up to 150%
    }

    private var statusColor: Color {
        let n = NSDecimalNumber(decimal: used).doubleValue
        if n > 300 { return Theme.Status.over }
        if n >= 260 { return Theme.Status.warn }
        return Theme.Status.safe
    }

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 6 : 10) {
            if !compact {
                HStack(alignment: .firstTextBaseline) {
                    Text.eyebrow("Keeper Cap")
                    Spacer()
                    HStack(spacing: 4) {
                        Text(MoneyFormatter.string(used))
                            .font(AppFont.titleM)
                            .tabularNumerals()
                            .foregroundStyle(statusColor)
                        Text("/")
                            .font(AppFont.titleM)
                            .foregroundStyle(Theme.Text.tertiary)
                        Text(MoneyFormatter.string(cap))
                            .font(AppFont.titleM)
                            .tabularNumerals()
                            .foregroundStyle(Theme.Text.secondary)
                    }
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(Theme.BG.divider)
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(statusColor)
                        .frame(width: geo.size.width * min(fraction, 1.0))
                    if fraction > 1.0 {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(Theme.Status.over)
                            .frame(width: geo.size.width * (fraction - 1.0).clamped(to: 0...0.5))
                            .blendMode(.screen)
                    }
                }
            }
            .frame(height: compact ? 4 : 6)
            if !compact {
                HStack {
                    Text(headline)
                        .font(AppFont.caption)
                        .foregroundStyle(statusColor)
                    Spacer()
                    if used > cap {
                        Text("+\(MoneyFormatter.string(used - cap)) over")
                            .font(AppFont.caption)
                            .tabularNumerals()
                            .foregroundStyle(Theme.Status.over)
                    } else {
                        Text("\(MoneyFormatter.string(cap - used)) headroom")
                            .font(AppFont.caption)
                            .tabularNumerals()
                            .foregroundStyle(Theme.Text.tertiary)
                    }
                }
            }
        }
    }

    private var headline: String {
        let n = NSDecimalNumber(decimal: used).doubleValue
        if n > 300 { return "OVER CAP — TAX DAT ASS" }
        if n >= 290 { return "Within $10 of cap" }
        if n >= 260 { return "Approaching cap" }
        return "Cap status: clear"
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
