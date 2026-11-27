// Validation des demandes d'inscription d'élèves et de parents.
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { AsyncView } from "@/components/ui/AsyncView";
import { PendingList } from "@/features/registrations/PendingList";
import { useCurrentUser } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { approve, listAll, listPending, reject } from "@/services/registrationService";

/** /app/eleves/demandes — validation des inscriptions (directeur uniquement). */
export default function PendingStudentsPage() {
  const user = useCurrentUser();
  const school = useSchool();
  const { toast } = useToast();
  // Les deux listes sont indépendantes : requêtes en parallèle (et non
  // en séquence) pour diviser par deux le temps d'affichage de la page.
  const state = useAsync(async () => {
    const [pending, history] = await Promise.all([listPending(user), listAll(user)]);
    return { pending, history };
  }, [user.id]);
  const [busy, setBusy] = useState(false);

  const run = async (ids: string[], kind: "approve" | "reject") => {
    setBusy(true);
    try {
      if (kind === "approve") {
        const n = await approve(user, ids);
        toast(`${n} inscription(s) approuvée(s). La famille peut désormais se connecter.`);
      } else {
        const n = await reject(user, ids);
        toast(`${n} demande(s) refusée(s).`);
      }
      state.reload();
    } catch (e) {
      // L'erreur est déjà notifiée : on ne la relance pas (sinon unhandled rejection).
      toast(e instanceof Error ? e.message : "Action impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Demandes d'inscription" subtitle={`Élèves et parents de ${school.schoolName} · validation individuelle ou en lot.`} />
      <AsyncView state={state} skeleton={<SkeletonTable rows={6} />}>
        {(d) => (
          <PendingList
            pending={d.pending}
            history={d.history}
            busy={busy}
            limitReached={school.limitReached}
            onApprove={(ids) => run(ids, "approve")}
            onReject={(ids) => run(ids, "reject")}
          />
        )}
      </AsyncView>
    </>
  );
}