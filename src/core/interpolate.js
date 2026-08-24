const EXACT_REFERENCE = /^\$\{([^}]+)\}$/;
const ANY_REFERENCE = /\$\{([^}]+)\}/g;

export function interpolate(value, context) {
  if (Array.isArray(value)) return value.map((item) => interpolate(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolate(item, context)]));
  }
  if (typeof value !== "string") return value;

  const exact = value.match(EXACT_REFERENCE);
  if (exact) return getPath(context, exact[1]);

  return value.replace(ANY_REFERENCE, (_, expression) => {
    const resolved = getPath(context, expression);
    if (resolved === null || resolved === undefined) return "";
    if (typeof resolved === "object") return JSON.stringify(resolved);
    return String(resolved);
  });
}

export function getPath(source, expression) {
  const parts = expression.split(".").filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current === null || current === undefined || !(part in Object(current))) {
      throw new Error(`Cannot resolve reference: ${expression}`);
    }
    current = current[part];
  }
  return current;
}

