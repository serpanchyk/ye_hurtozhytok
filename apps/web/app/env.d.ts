// The secrets are listed in wrangler.jsonc (`secrets.required`). DEV_LOGIN is
// an empty var there, so .dev.vars may override it locally; it is widened to
// a string here because the generated type is the literal "".
interface Env {
  DEV_LOGIN?: string;
}
