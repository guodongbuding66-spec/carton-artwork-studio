function scalar(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  return JSON.stringify(value);
}

export function flattenJson(value, prefix = "", out = {}) {
  if (value === null || typeof value !== "object") {
    out[prefix || "$"] = value;
    return out;
  }
  if (Array.isArray(value)) {
    if (!value.length) out[prefix || "$"] = [];
    value.forEach((item, index) => flattenJson(item, `${prefix}[${index}]`, out));
    return out;
  }
  const keys = Object.keys(value).sort();
  if (!keys.length) out[prefix || "$"] = {};
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    flattenJson(value[key], path, out);
  }
  return out;
}

export function diffJson(left, right) {
  const a = flattenJson(left ?? {});
  const b = flattenJson(right ?? {});
  const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changes = [];
  for (const path of paths) {
    const hasA = Object.prototype.hasOwnProperty.call(a, path);
    const hasB = Object.prototype.hasOwnProperty.call(b, path);
    const av = a[path];
    const bv = b[path];
    if (hasA && hasB && scalar(av) === scalar(bv)) continue;
    changes.push({
      path,
      from: hasA ? av : undefined,
      to: hasB ? bv : undefined,
      change: !hasA ? "ADDED" : !hasB ? "REMOVED" : "CHANGED"
    });
  }
  return {
    total: changes.length,
    added: changes.filter((x) => x.change === "ADDED").length,
    removed: changes.filter((x) => x.change === "REMOVED").length,
    changed: changes.filter((x) => x.change === "CHANGED").length,
    changes
  };
}
