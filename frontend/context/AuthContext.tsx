import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import { supabase } from "@/services/supabase";
import { Toast } from "@/util/toast";

const SUPABASE_ERROR_MAP: Record<string, string> = {
  "User already registered": "Este e-mail já está cadastrado.",
  "Email rate limit exceeded": "Muitas tentativas. Tente novamente mais tarde.",
  "Invalid email": "E-mail inválido.",
  "Password should be at least 6 characters":
    "A senha deve ter pelo menos 6 caracteres.",
  "Email not confirmed":
    "E-mail não confirmado. Verifique sua caixa de entrada.",
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "User not found": "Usuário não encontrado.",
};

function translateSupabaseError(message: string): string {
  return SUPABASE_ERROR_MAP[message] ?? message;
}

type RegistrationData = {
  email?: string;
  phone?: string;
  password?: string;
  full_name?: string;
  cpf?: string;
};

type AuthRegistrationContextType = {
  data: RegistrationData;
  loading: boolean;
  setStepData: (newData: Partial<RegistrationData>) => void;
  signUp: () => Promise<boolean>;
  completeProfile: () => Promise<boolean>;
};

const AuthRegistrationContext =
  createContext<AuthRegistrationContextType | null>(null);

export function AuthRegistrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = useState<RegistrationData>({});
  const [loading, setLoading] = useState(false);

  const setStepData = useCallback((newData: Partial<RegistrationData>) => {
    setData((prev) => ({ ...prev, ...newData }));
  }, []);

  // Chamado na Página 3 (Senha)
  const signUp = useCallback(async () => {
    if (!data.email || !data.password) {
      Toast.show({
        type: "error",
        text1: "Dados incompletos para o cadastro.",
      });
      return false;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { phone: data.phone ?? null },
        },
      });

      if (error) throw error;
      return true;
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: translateSupabaseError(error.message),
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [data]);

  // Chamado na Página 5 (Detalhes)
  const completeProfile = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: data.full_name,
          cpf: data.cpf,
        })
        .eq("id", user.id);

      if (error) throw error;
      return true;
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: translateSupabaseError(error.message),
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [data]);

  const value = useMemo(
    () => ({
      data,
      loading,
      setStepData,
      signUp,
      completeProfile,
    }),
    [data, loading, setStepData, signUp, completeProfile],
  );

  return (
    <AuthRegistrationContext.Provider value={value}>
      {children}
    </AuthRegistrationContext.Provider>
  );
}

export function useAuthRegistration() {
  const context = useContext(AuthRegistrationContext);
  if (!context) {
    throw new Error(
      "useAuthRegistration deve ser usado dentro de AuthRegistrationProvider",
    );
  }
  return context;
}
