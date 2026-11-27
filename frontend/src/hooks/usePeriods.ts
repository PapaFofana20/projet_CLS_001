import { useCallback, useEffect, useRef, useState } from "react";
import type { Period } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useAsync } from "@/hooks/useAsync";
import { periodInfo } from "@/services/reportService";

/** Période d'évaluation sélectionnée (semestre / trimestre configuré dans les paramètres). */
export function usePeriods(): { periods: Period[]; period: string; setPeriod: (id: string) => void } {
  const { schoolId } = useAuth();
  // periodInfo est synchrone mais les réglages arrivent après l'hydratation :
  // useAsync fournit `loading` pour ne pas figer la période sur "S1" par défaut.
  const state = useAsync(async () => periodInfo(schoolId), [schoolId]);
  const info = state.data;
  const [period, setPeriodState] = useState("");
  /** Vrai dès que l'utilisateur a choisi une période : on ne l'écrase plus. */
  const userChose = useRef(false);

  useEffect(() => {
    userChose.current = false;
    setPeriodState("");
  }, [schoolId]);

  useEffect(() => {
    if (!info || state.loading) return;
    // Tant que l'utilisateur n'a pas interagi, on resynchronise avec la
    // période courante réellement chargée (fin d'hydratation / retry).
    if (!userChose.current) setPeriodState(info.current);
  }, [info, state.loading]);

  const setPeriod = useCallback((id: string) => {
    userChose.current = true;
    setPeriodState(id);
  }, []);

  const periods = info?.periods ?? [];
  return { periods, period: periods.some((p) => p.id === period) ? period : (info?.current ?? ""), setPeriod };
}
