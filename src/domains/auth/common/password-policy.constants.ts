export const AUTH_PASSWORD_MIN_LENGTH = 8;
export const AUTH_PASSWORD_MAX_LENGTH = 16;

export const AUTH_PASSWORD_PATTERN = new RegExp(
  `^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)\\S{${AUTH_PASSWORD_MIN_LENGTH},${AUTH_PASSWORD_MAX_LENGTH}}$`,
);
