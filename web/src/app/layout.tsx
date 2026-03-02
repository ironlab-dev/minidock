import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import BackendStatus from "@/components/BackendStatus";
import RestartRequiredBanner from "@/components/RestartRequiredBanner";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { DevInfoProvider } from "@/contexts/DevInfoContext";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { LicenseProvider } from "@/contexts/LicenseContext";
import { GlobalProgressBar } from "@/components/GlobalProgressBar";
import { ToastContainer } from "@/components/ui/Toast";
import MainContent from "@/components/MainContent";
import DocumentTitle from "@/components/DocumentTitle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
// DEMO_INTEGRATION: banner + top padding in demo mode, see web/src/demo/
import DemoBanner from "@/demo/DemoBanner";
import { DEMO_MODE } from "@/demo/demoConfig";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MiniDock | Mac Mini NAS Console",
  description: "Unified management interface for your Mac Mini home server.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0a0a0c] text-white overflow-x-hidden ${DEMO_MODE ? 'pt-10' : ''}`}>
        <ErrorBoundary>
        <DevInfoProvider>
          <LoadingProvider>
            <ToastProvider>
              <DemoBanner />
              <AuthProvider>
                <LicenseProvider>
                  <GlobalProgressBar />
                  <DocumentTitle />
                  <ToastContainer />
                  <SidebarProvider>
                    <BackendStatus />
                    <RestartRequiredBanner />
                    <div className="flex min-h-screen">
                      <Sidebar />
                      <MainContent>
                        <main className="flex-1 pb-32 lg:pb-16 flex flex-col">
                          {children}
                        </main>
                        <Footer />
                      </MainContent>
                    </div>
                  </SidebarProvider>
                </LicenseProvider>
              </AuthProvider>
            </ToastProvider>
          </LoadingProvider>
        </DevInfoProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
