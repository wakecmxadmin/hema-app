import { Stack } from "expo-router";
import { AuthRegistrationProvider } from "@/context/AuthContext";

export default function AuthLayout() {
  return (
    <AuthRegistrationProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthRegistrationProvider>
  );
}
