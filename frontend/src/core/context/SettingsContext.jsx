import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo
} from "react";
import axiosInstance from "@core/api/axios";
import { getWithDedupe } from "@core/api/dedupe";
import { DEFAULT_SETTINGS, applyThemeVariables } from "./SettingsDefaults";

// Create context with null so we can check if it's provided
const SettingsContext = createContext(null);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const deepMergeSettings = (defaults, data) => {
    if (!data || typeof data !== "object") return { ...defaults };
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const defVal = defaults[key];
      const dataVal = data[key];
      if (
        defVal &&
        typeof defVal === "object" &&
        !Array.isArray(defVal) &&
        dataVal &&
        typeof dataVal === "object" &&
        !Array.isArray(dataVal)
      ) {
        result[key] = { ...defVal, ...dataVal };
      } else if (dataVal !== undefined) {
        result[key] = dataVal;
      }
    }
    for (const key of Object.keys(data)) {
      if (!(key in result)) {
        result[key] = data[key];
      }
    }
    return result;
  };

  const fetchSettings = useCallback(async (options = {}) => {
    try {
      setLoading(true);
      setError(null);
      // Use deduplicated fetch for app settings
      const res = await getWithDedupe("/settings", {}, { 
        ttl: 60 * 1000,
        forceRefresh: options.forceRefresh || false 
      });
      const data = res.data?.result || res.data;
      const merged = deepMergeSettings(DEFAULT_SETTINGS, data);
      setSettings(merged);
      applyThemeVariables(merged);
    } catch (err) {
      console.error("Failed to fetch settings", err);
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Failed to load settings",
      );
      setSettings(DEFAULT_SETTINGS);
      applyThemeVariables(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // UseMemo to avoid rerenders of children if values haven't changed
  const value = useMemo(() => ({
    settings,
    loading,
    error,
    refetch: fetchSettings,
  }), [settings, loading, error, fetchSettings]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};

export default SettingsContext;
