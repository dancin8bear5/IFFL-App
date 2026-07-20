import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var locationManager: LocationManager
    @EnvironmentObject var routeManager: RouteManager
    @EnvironmentObject var placesStore: PlacesStore

    @State private var showDestinationSearch = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                destinationHeader
                Divider()

                if routeManager.isCalculatingRoute {
                    loadingView
                } else if routeManager.currentRoute == nil {
                    noRouteView
                } else if routeManager.waypoints.isEmpty {
                    noWaypointsView
                } else {
                    waypointList
                }

                Spacer(minLength: 0)

                if routeManager.currentRoute != nil {
                    footerBar
                }
            }
            .navigationTitle("MilesTo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showDestinationSearch = true
                    } label: {
                        Image(systemName: routeManager.currentRoute == nil
                              ? "location.fill"
                              : "location.fill.viewfinder")
                    }
                }
            }
            .sheet(isPresented: $showDestinationSearch) {
                DestinationSearchView()
            }
        }
    }

    // MARK: - Sub-views

    private var destinationHeader: some View {
        Group {
            if let route = routeManager.currentRoute {
                VStack(spacing: 4) {
                    HStack {
                        Image(systemName: "mappin.and.ellipse")
                            .foregroundStyle(.red)
                        Text(routeManager.destinationName)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        Spacer()
                        Button("Change") { showDestinationSearch = true }
                            .font(.caption)
                    }
                    HStack {
                        Text(formatDistance(route.distance))
                        Text("·")
                        Text(formatDuration(route.expectedTravelTime))
                        Spacer()
                        Text("\(routeManager.waypoints.count) places ahead")
                            .foregroundStyle(.secondary)
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
            } else {
                Button {
                    showDestinationSearch = true
                } label: {
                    Label("Set Destination", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .padding(.horizontal)
                        .padding(.vertical, 12)
                }
            }
        }
    }

    private var waypointList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(routeManager.waypoints.prefix(15)) { waypoint in
                    WaypointRowView(waypoint: waypoint)
                    Divider().padding(.leading, 64)
                }
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Calculating route…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var noRouteView: some View {
        VStack(spacing: 16) {
            Image(systemName: "car.fill")
                .font(.system(size: 52))
                .foregroundStyle(.secondary)
            Text("No active route")
                .font(.title3.weight(.semibold))
            Text("Set a destination to see your saved places along the way.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 48)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var noWaypointsView: some View {
        VStack(spacing: 16) {
            Image(systemName: "mappin.slash")
                .font(.system(size: 52))
                .foregroundStyle(.secondary)
            Text("No places on this route")
                .font(.title3.weight(.semibold))
            Text("None of your saved places are within 1 mile of this route. Go to My Places to add more.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 48)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var footerBar: some View {
        HStack {
            Image(systemName: "clock")
                .font(.caption)
            Text("Updated \(locationManager.lastRefresh, style: .time)")
                .font(.caption)
            Spacer()
            Button {
                guard let loc = locationManager.currentLocation else { return }
                routeManager.refreshWaypoints(from: loc, places: placesStore.places)
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
                    .font(.caption)
            }
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Helpers

    private func formatDistance(_ meters: Double) -> String {
        String(format: "%.0f mi", meters / 1609.34)
    }

    private func formatDuration(_ seconds: Double) -> String {
        let h = Int(seconds) / 3600
        let m = (Int(seconds) % 3600) / 60
        return h > 0 ? "\(h)h \(m)m" : "\(m) min"
    }
}
