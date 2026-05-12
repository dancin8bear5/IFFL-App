import SwiftUI
import WebKit

// MARK: - WebViewContainer

struct WebViewContainer: UIViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool
    @Binding var loadFailed: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(isLoading: $isLoading, loadFailed: $loadFailed)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.backgroundColor = UIColor(red: 0.039, green: 0.051, blue: 0.102, alpha: 1)
        webView.backgroundColor = UIColor(red: 0.039, green: 0.051, blue: 0.102, alpha: 1)
        webView.isOpaque = false

        let refresh = UIRefreshControl()
        refresh.tintColor = UIColor(red: 0.902, green: 0.224, blue: 0.275, alpha: 1)
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.handleRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        context.coordinator.webView = webView
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    // MARK: Coordinator

    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var isLoading: Bool
        @Binding var loadFailed: Bool
        weak var webView: WKWebView?

        init(isLoading: Binding<Bool>, loadFailed: Binding<Bool>) {
            _isLoading = isLoading
            _loadFailed = loadFailed
        }

        @objc func handleRefresh(_ control: UIRefreshControl) {
            webView?.reload()
            control.endRefreshing()
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation _: WKNavigation!) {
            isLoading = true
            loadFailed = false
        }

        func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {
            isLoading = false
        }

        func webView(_ webView: WKWebView, didFail _: WKNavigation!, withError _: Error) {
            isLoading = false
            loadFailed = true
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError _: Error) {
            isLoading = false
            loadFailed = true
        }

        func reload() {
            webView?.reload()
        }
    }
}
