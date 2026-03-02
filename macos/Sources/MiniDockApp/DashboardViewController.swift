import Cocoa
import WebKit

class DashboardViewController: NSViewController {
    var webView: WKWebView!
    
    override func loadView() {
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        self.view = webView
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        // Define size
        self.preferredContentSize = NSSize(width: 450, height: 600)
        
        loadDashboard()
    }
    
    func loadDashboard() {
        if let url = URL(string: "http://127.0.0.1:23000") {
            let request = URLRequest(url: url)
            webView.load(request)
        }
    }
    
    override func viewDidAppear() {
        super.viewDidAppear()
        // Reload on appear to ensure fresh content or connection retry if server wasn't ready
        // But maybe not every time to preserve state? 
        // Let's just reload if it failed? For now, standard load.
    }
}
