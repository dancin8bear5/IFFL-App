import SwiftUI

struct SettleUpView: View {
    let trip: Trip

    private var balances: [String: Int] {
        SettlementEngine.netBalances(from: lineTuples(for: trip))
    }

    private var payments: [SettlementEngine.Payment] {
        SettlementEngine.minimize(balances)
    }

    private var residual: Int {
        SettlementEngine.residual(of: balances)
    }

    var body: some View {
        Group {
            if trip.games.isEmpty {
                hint("No games yet — nothing to settle.")
            } else if payments.isEmpty {
                allSquare
            } else {
                List {
                    if residual != 0 {
                        Section {
                            Label("Some game's pot is unbalanced (off by \(abs(residual).asDollars)). Fix it in the Games tab for an exact settlement.",
                                  systemImage: "exclamationmark.triangle.fill")
                                .font(.caption)
                                .foregroundStyle(Color.suAccent)
                                .listRowBackground(Color.suSurface)
                        }
                    }

                    Section {
                        ForEach(payments) { payment in
                            PaymentRow(payment: payment)
                                .listRowBackground(Color.suSurface)
                        }
                    } header: {
                        Text("\(payments.count) payment\(payments.count == 1 ? "" : "s") to settle everyone")
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }

    private var allSquare: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 48))
                .foregroundStyle(Color.suPositive)
            Text("All square")
                .font(.title2.bold())
                .foregroundStyle(Color.suText)
            Text("Everyone is even — no payments needed.")
                .font(.subheadline)
                .foregroundStyle(Color.suSubtext)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(Color.suSubtext)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct PaymentRow: View {
    let payment: SettlementEngine.Payment

    var body: some View {
        HStack(spacing: 10) {
            Text(payment.from)
                .fontWeight(.semibold)
                .foregroundStyle(Color.suText)
            Image(systemName: "arrow.right")
                .font(.caption)
                .foregroundStyle(Color.suSubtext)
            Text(payment.to)
                .fontWeight(.semibold)
                .foregroundStyle(Color.suText)
            Spacer()
            Text(payment.amount.asDollars)
                .font(.body.monospacedDigit().weight(.bold))
                .foregroundStyle(Color.suGold)
        }
        .padding(.vertical, 4)
    }
}
