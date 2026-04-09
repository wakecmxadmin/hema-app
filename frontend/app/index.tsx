import { Redirect } from "expo-router";

export default function Index() {
  // No futuro, você pode colocar uma lógica aqui:
  // const isUserLoggedIn = checkAuth();
  // if (isUserLoggedIn) return <Redirect href="/home" />;

  // Guest mode: a home é pública. O AuthGuard protege rotas que exigem conta.
  return <Redirect href="/(tabs)/home" />;
}
