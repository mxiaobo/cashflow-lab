import { supabase } from "./supabase";

const LOCAL_KEY = "cashflow-lab-data";
const PIN_KEY = "cashflow-pin";
const SHEETS_URL_KEY = "cashflow-sheets-url";

// Simple hash for PIN (not crypto-grade, but fine for a personal identifier)
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "cashflow-salt-2026");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---- PIN Auth ----
export function getSavedPin() {
  return localStorage.getItem(PIN_KEY) || "";
}

export function savePin(pin) {
  localStorage.setItem(PIN_KEY, pin);
}

export function clearPin() {
  localStorage.removeItem(PIN_KEY);
}

// ---- Cloud operations ----

export async function cloudLoad(pin) {
  const id = await hashPin(pin);
  const { data, error } = await supabase
    .from("cashflow_data")
    .select("data")
    .eq("user_id", id)
    .maybeSingle();

  if (error) throw error;
  return data?.data || null;
}

export async function cloudSave(pin, payload) {
  const id = await hashPin(pin);
  const now = new Date().toISOString();

  // Upsert main data
  const { error } = await supabase
    .from("cashflow_data")
    .upsert({ user_id: id, data: payload, updated_at: now }, { onConflict: "user_id" });
  if (error) throw error;

  // Insert version
  await supabase
    .from("cashflow_versions")
    .insert({ user_id: id, data: payload, created_at: now });
}

export async function cloudGetVersions(pin) {
  const id = await hashPin(pin);
  const { data, error } = await supabase
    .from("cashflow_versions")
    .select("id, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}

export async function cloudRestoreVersion(pin, versionId) {
  const id = await hashPin(pin);
  const { data, error } = await supabase
    .from("cashflow_versions")
    .select("data")
    .eq("id", versionId)
    .eq("user_id", id)
    .single();

  if (error) throw error;
  return data?.data || null;
}

// ---- Local cache ----

export function localLoad() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function localSave(payload) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
  } catch {}
}

// ---- Sheets URL ----
export function getSheetsUrl() {
  return localStorage.getItem(SHEETS_URL_KEY) || "";
}
export function saveSheetsUrl(url) {
  localStorage.setItem(SHEETS_URL_KEY, url);
}
