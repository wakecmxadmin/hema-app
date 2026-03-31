import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, ApiResponse } from "./api";
import { supabase } from "./supabase";

const saveUserCache = async (name: string, email: string) => {
  try {
    await AsyncStorage.setItem("@hema_user_name", name);
    await AsyncStorage.setItem("@hema_user_email", email);
  } catch (e) {
    console.error("Erro ao salvar cache", e);
  }
};

const translateAuthError = (errorMsg: string) => {
  if (errorMsg.includes("Invalid login credentials"))
    return "E-mail ou senha incorretos.";
  if (errorMsg.includes("User already registered"))
    return "Este e-mail já está cadastrado.";
  if (errorMsg.includes("Password should be")) return "A senha é muito fraca.";
  return "Ocorreu um erro de autenticação.";
};

export async function signup(
  email: string,
  password: string,
  name: string,
): Promise<ApiResponse<any>> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    return { success: false, message: translateAuthError(error.message) };
  }

  if (data.user?.user_metadata?.name) {
    await saveUserCache(data.user.user_metadata.name, email);
  }

  return { success: true, message: "Conta criada com sucesso!", data };
}

export async function login(
  email: string,
  password: string,
): Promise<ApiResponse<any>> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, message: translateAuthError(error.message) };
  }

  const userName = data.user?.user_metadata?.name;
  if (userName) {
    await saveUserCache(userName, email);
  }

  return { success: true, message: "Login realizado com sucesso!", data };
}

export async function updateUserProfile(updates: {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  cpf?: string;
}): Promise<ApiResponse<any>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      message: "Sessão expirada. Faça login novamente.",
    };
  }

  const { data: authData, error: authError } = await supabase.auth.updateUser({
    email: updates.email,
    password: updates.password,
    data: { name: updates.name },
  });

  if (authError) {
    return { success: false, message: translateAuthError(authError.message) };
  }

  const response = await apiFetch("/profile", {
    method: "PATCH",
    body: JSON.stringify({
      name: updates.name,
      phone: updates.phone,
      cpf: updates.cpf,
    }),
  });

  if (!response.success) {
    return response;
  }

  if (authData.user) {
    const newName = authData.user.user_metadata?.name || updates.name;
    const newEmail = authData.user.email || updates.email;
    await saveUserCache(newName!, newEmail!);
  }

  return {
    success: true,
    message: "Perfil atualizado com sucesso!",
    data: authData,
  };
}

export async function getCurrentUser(): Promise<ApiResponse<any>> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { success: false, message: "Usuário não logado" };
  }

  return { success: true, message: "Sessão ativa", data: user };
}

export async function logout(): Promise<ApiResponse<void>> {
  await supabase.auth.signOut();
  await AsyncStorage.removeItem("@hema_user_name");
  await AsyncStorage.removeItem("@hema_user_email");

  return { success: true, message: "Você saiu da sua conta." };
}

export async function sendPasswordResetEmail(
  email: string,
): Promise<ApiResponse<void>> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: "hemaapp://auth/reset-password",
  });

  if (error) {
    return { success: false, message: translateAuthError(error.message) };
  }

  return { success: true, message: "Instruções enviadas para o seu e-mail!" };
}

// Define a nova senha (usada na tela final de reset)
export async function resetPassword(
  newPassword: string,
): Promise<ApiResponse<void>> {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { success: false, message: translateAuthError(error.message) };
  }

  return { success: true, message: "Senha alterada com sucesso!" };
}
