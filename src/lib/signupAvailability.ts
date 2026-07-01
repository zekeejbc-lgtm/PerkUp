import { supabase } from "./supabase";

type SignupAvailability = {
  emailAvailable?: boolean;
  usernameAvailable?: boolean;
  phoneAvailable?: boolean;
};

const getFunctionErrorMessage = async (error: unknown) => {
  if (!error || typeof error !== "object") return "Could not check account availability.";
  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
  if (context?.json) {
    try {
      const body = await context.json();
      if (body.error) return body.error;
    } catch {
      // Use the fallback below when the function response is not JSON.
    }
  }
  return (error as { message?: string }).message || "Could not check account availability.";
};

export async function checkSignupAvailability(input: {
  email?: string;
  username?: string;
  phone?: string;
}): Promise<SignupAvailability> {
  const { data, error } = await supabase.functions.invoke<SignupAvailability>("check-signup-availability", {
    body: input,
  });

  if (error || !data) throw new Error(await getFunctionErrorMessage(error));
  return data;
}
