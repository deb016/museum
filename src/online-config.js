const REQUIRED_CONFIG_FIELDS = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];

export function readFirebaseConfig(environment) {
  const config = {
    apiKey: environment.VITE_FIREBASE_API_KEY,
    authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: environment.VITE_FIREBASE_DATABASE_URL,
    projectId: environment.VITE_FIREBASE_PROJECT_ID,
    appId: environment.VITE_FIREBASE_APP_ID,
  };
  return REQUIRED_CONFIG_FIELDS.every((field) => typeof config[field] === "string" && config[field].trim())
    ? config
    : null;
}
