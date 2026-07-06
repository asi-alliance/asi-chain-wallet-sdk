import { type ReactElement, useEffect } from "react";
import {
    matchPath,
    NavLink,
    useLocation,
    useNavigate,
} from "react-router-dom";
import { PAGE_ROUTES } from "./routes";
import { PATHS } from "./paths";

const useActivePagePath = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const activePagePath = PAGE_ROUTES.find(({ path }) =>
        matchPath({ path, end: true }, location.pathname),
    )?.path;

    useEffect(() => {
        if (!activePagePath) {
            navigate(PATHS.DEFAULT_PAGE_PATH, { replace: true });
        }
    }, [activePagePath, navigate]);

    return activePagePath;
};

const ApplicationNavigation = (): ReactElement => {
    return (
        <nav className="app-navigation" aria-label="Playground pages">
            {PAGE_ROUTES.map(({ path, label }) => (
                <NavLink
                    key={path}
                    className={({ isActive }) =>
                        `nav-button ${isActive ? "active" : ""}`
                    }
                    to={path}
                >
                    {label}
                </NavLink>
            ))}
        </nav>
    );
};

const PersistentPageRoutes = (): ReactElement => {
    const activePagePath = useActivePagePath();

    return (
        <>
            {PAGE_ROUTES.map(({ path, Page }) => (
                <section key={path} hidden={activePagePath !== path}>
                    <Page />
                </section>
            ))}
        </>
    );
};

export { ApplicationNavigation, PersistentPageRoutes };
