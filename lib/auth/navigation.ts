export function safeNextPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\r\n]/.test(value)
  )
    return "/dashboard";
  try {
    const url = new URL(value, "https://econtent.invalid");
    if (url.origin !== "https://econtent.invalid") return "/dashboard";
    if (
      !/^\/(dashboard|projects(?:\/[a-zA-Z0-9-]+)?|settings|editor|reset-password)$/.test(
        url.pathname,
      )
    )
      return "/dashboard";
    return url.pathname;
  } catch {
    return "/dashboard";
  }
}
