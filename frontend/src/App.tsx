import "./shared/ui/review.css";
import { BuyerMy } from "./apps/buyer/my";
import { takeAuthFragment } from "./shared/api/auth";
import { Inquiries, Messages } from "./shared/screens/Messages";
import { useCallback, useEffect, useRef, useState } from "react";
import { session } from "./shared/api/client";
import { BottomTabs, PageBody } from "./shared/ui/index";
import {
  serverRole,
  type Go,
  type Role,
  type Route,
} from "./types";
import {
  BuyerHome,
  BundleDetail,
  Cart,
  Explore,
  ListingDetail,
  Purchase,
  RequestDone,
  WantForm,
  Wants,
  AddressBook,
  SellerProfile,
} from "./apps/buyer/index";

import { HandoverScreen, OrderDetail, Orders, Review, TradeDone } from "./shared/screens/orders";
import {
  Addresses,
  Frequent,
  Interests,
  Notifications,
  NotificationSettings,
  Profile,
  Support,
} from "./shared/screens/account";
import { MarketScreen } from "./shared/screens/market";
import "./styles.css";
import "./carrier.css";
import { LoadingScreen } from "./shared/screens/Loading";
import { Assistant } from "./shared/ui/shell";
export { Login } from "./shared/screens/Login";
import { Login } from "./shared/screens/Login";
function Screen({
  appRole: role,
  route,
  go,
  back,
  logout,
}: {
  appRole: Role;
  route: Route;
  go: Go;
  back: () => void;
  logout: () => void;
}) {
  const { name, id } = route;
  const common = { appRole: role, go, back };
  if (name === "my") return <BuyerMy go={go} logout={logout}/>;
  if (role === "buyer" && name === "home") return <BuyerHome go={go} />;
  if (name === "assistant") return <Assistant appRole={role} go={(n) => go({ name: n })} back={back} />;
  return (
    <PageBody>
      {name === "inquiries" ? <Inquiries {...common} /> : name === "inquiry" ? <Messages {...common} {...(id ? {id} : {})} inquiry /> : name === "inquiry-new" && id ? <Messages {...common} listingId={id} /> : name === "chat" && id ? <Messages {...common} id={id} /> : name === "home" ? (
        <BuyerHome go={go} />
      ) : name === "explore" ? (
        <Explore go={go} />
      ) : name === "favorites" ? (
        <Explore go={go} favorites />
      ) : name === "listing" && id ? (
        <ListingDetail id={id} go={go} back={back} />
      ) : name === "bundle" && route.bundle ? (
        <BundleDetail bundle={route.bundle} go={go} back={back} />
      ) : name === "purchase" ? (
        <Purchase id={id} ids={route.ids} go={go} back={back} />
      ) : name === "done" ? (
        <RequestDone orders={route.orders ?? []} go={go} />
      ) : name === "wants" ? (
        <Wants go={go} back={back} />
      ) : name === "want-new" ? (
        <WantForm id={id} go={go} back={back} />
      ) : name === "cart" ? (
        <Cart go={go} />
      ) : name === "orders" ? (
        <Orders appRole={role} go={go} />
      ) : name === "order" && id ? (
        <OrderDetail {...common} id={id} />
      ) : name === "review" && id ? (
        <Review {...common} id={id} />
      ) : name === "trade-done" && id ? (
        <TradeDone appRole={role} id={id} go={go} />
      ) : name === "handover" && id ? (
        <HandoverScreen {...common} id={id} home={() => go({ name: "home" })} />
      ) : name === "addresses" ? (
        role === "buyer" ? <AddressBook back={back} /> : <Addresses {...common} />
      ) : name === "seller" && id ? (
        <SellerProfile id={id} go={go} back={back} />
      ) : name === "interests" ? (
        <Interests {...common} />
      ) : name === "frequent" ? (
        <Frequent {...common} />
      ) : name === "notifications" ? (
        <Notifications {...common} />
      ) : name === "settings" ? (
        <NotificationSettings {...common} />
      ) : name === "support" ? (
        <Support {...common} {...(id ? {id} : {})} />
      ) : ["profile", "depot", "verification"].includes(name) ? (
        <Profile {...common} kind={name} />
      ) : name === "market" ? (
        <MarketScreen {...common} />
      ) : (
        <p>화면을 찾을 수 없음</p>
      )}
    </PageBody>
  );
}
export default function App({ appRole: role }: { appRole: Role }) {
  const [authFragment, setAuthFragment] = useState(takeAuthFragment);
  const [loading, setLoading] = useState(true);
  const [logged, setLogged] = useState(
    () => authFragment.reset === null && !authFragment.token && !authFragment.signup && session(role)?.company.role === serverRole[role],
  );
  const [stack, setStack] = useState<Route[]>([{ name: "home" }]);
  const [index, setIndex] = useState(0);
  const routes = useRef(stack);
  const position = useRef(0);
  const finishLoading = useCallback(() => setLoading(false), []);
  useEffect(() => {
    history.replaceState({ janjaemi: role, index: 0 }, "");
    const onPop = (e: PopStateEvent) => {
      const n = e.state?.janjaemi === role ? e.state.index : 0;
      if (typeof n === "number" && routes.current[n]) {
        position.current = n;
        setIndex(n);
      }
    };
    const expired = (e: Event) => {
      if ((e as CustomEvent).detail !== role) return;
      setLogged(false);
      setStack([{ name: "home" }]);
      routes.current = [{ name: "home" }];
      position.current = 0;
      setIndex(0);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("session-expired", expired);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("session-expired", expired);
    };
  }, [role]);
  const go: Go = (route) => {
    const next = [...routes.current.slice(0, position.current + 1), route];
    position.current = next.length - 1;
    routes.current = next;
    setStack(next);
    setIndex(position.current);
    history.pushState({ janjaemi: role, index: position.current }, "");
  };
  const logout = () => {
    sessionStorage.removeItem(`janjaemi:${role}`);
    setLogged(false);
    routes.current = [{ name: "home" }];
    position.current = 0;
    setStack(routes.current);
    setIndex(0);
    history.replaceState({ janjaemi: role, index: 0 }, "");
  };
  const active = stack[index]?.name ?? "home";
  const showTabs =
    [
      "home",
      "explore",
      "cart",
      "orders",
      "my",
      "listings",
      "bags",
      "wants",
    ].includes(active);
  return (
    <div className={`app ${role}`}>
      <div className="route-view" inert={loading} aria-hidden={loading}>
      {!logged ? (
        <Login initialFragment={authFragment} appRole={role} onLogin={() => { setAuthFragment({reset:null,token:null,signup:null}); setLogged(true); }} />
      ) : (
        <>
          {stack.map((route, i) => (
            <div key={i} className="route-view" hidden={i !== index}>
              <Screen
                appRole={role}
                route={route}
                go={go}
                back={() => {
                  if (position.current > 0) history.back();
                  else go({ name: "home" });
                }}
                logout={logout}
              />
            </div>
          ))}
          {showTabs && (
            <BottomTabs
              appRole={role}
              active={active}
              go={go}
            />
          )}
        </>
      )}
      </div>
      {loading && <LoadingScreen onComplete={finishLoading} />}
    </div>
  );
}
