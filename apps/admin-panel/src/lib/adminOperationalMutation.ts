import { functions, httpsCallable } from './firebase';

type AdminOperationalMutationResult = {
  success: boolean;
  id?: string;
  [key: string]: unknown;
};

export async function runAdminOperationalMutation(
  action: string,
  payload: Record<string, unknown>,
): Promise<AdminOperationalMutationResult> {
  const callable = httpsCallable(functions, 'adminOperationalMutation');
  const response = await callable({ action, payload });
  return (response.data || { success: true }) as AdminOperationalMutationResult;
}
