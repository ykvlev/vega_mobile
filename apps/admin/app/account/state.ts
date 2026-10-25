export type AccountFormState = {
  message?: string;
  fields?: { phone?: string; password?: string };
};

export const initialAccountState: AccountFormState = {};
