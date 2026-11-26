import { Signup } from "../../../shared/screens/Signup";
import { useNav } from "../lib/nav";
export default function Screen02Signup() { const nav = useNav(); return <Signup appRole="seller" back={() => nav.go("login")} />; }
