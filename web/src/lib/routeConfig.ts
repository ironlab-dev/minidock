/**
 * Route configuration for application layout decisions.
 *
 * Auth routes are pages that render without the main application chrome
 * (sidebar, etc.). They are standalone, full-screen pages.
 *
 * When adding a new auth/public route that should not show the sidebar,
 * add it here — this is the single source of truth consumed by both
 * Sidebar and MainContent.
 */
const AUTH_ROUTES = new Set(["/login", "/register"]);

/**
 * Returns true if the given pathname is an auth-only route that should
 * render without the main application sidebar.
 */
export function isAuthRoute(pathname: string): boolean {
    return AUTH_ROUTES.has(pathname);
}
