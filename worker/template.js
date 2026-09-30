export function parseTemplateJson(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "{}")); }
  catch { throw new Error("TEMPLATE_JSON_INVALID"); }
}

export function validateTemplateJson(value) {
  let data;
  try { data = parseTemplateJson(value); }
  catch { return { ok:false, errors:["Template JSON must be valid JSON."] }; }

  const errors=[];
  if (!Number.isInteger(Number(data.schemaVersion)) || Number(data.schemaVersion) < 1) {
    errors.push("schemaVersion must be an integer >= 1.");
  }
  if (!data.geometry || typeof data.geometry.type !== "string" || !data.geometry.type.trim()) {
    errors.push("geometry.type is required.");
  }
  if (data.geometry?.units !== "mm") {
    errors.push("geometry.units must be mm.");
  }
  if (!Array.isArray(data.print?.colors) || !data.print.colors.includes("K")) {
    errors.push("print.colors must include K for this production profile.");
  }
  if (!Array.isArray(data.codeBlock?.profiles) || !data.codeBlock.profiles.some((x)=>["250x80","200x64"].includes(x))) {
    errors.push("codeBlock.profiles must contain an approved 250x80 or 200x64 profile.");
  }
  if (data.codeBlock?.locked !== true) {
    errors.push("codeBlock.locked must be true.");
  }
  if (!Number.isInteger(Number(data.rules?.crnPlacements)) || Number(data.rules.crnPlacements) < 1) {
    errors.push("rules.crnPlacements must be an integer >= 1.");
  }
  return { ok:errors.length===0, errors, data };
}
