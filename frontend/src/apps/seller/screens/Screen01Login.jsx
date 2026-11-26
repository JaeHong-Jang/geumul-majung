import { Login } from "../../../shared/screens/Login";
import { useNav } from "../lib/nav";
export default function Screen01Login() { const nav = useNav(); return <Login appRole="seller" initialFragment={nav.authFragment} onLogin={() => nav.go("home")} />; }
