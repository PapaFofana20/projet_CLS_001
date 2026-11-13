// Creation d'un nouvel emploi du temps (brouillon).

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useCurrentUser } from "@/context/AuthContext";
import { useFeature } from "@/utils/features";
import { useToast } from "@/context/ToastContext";
import { SCHOOL_YEAR } from "@/data/school";
import { createTimetable } from "@/services/timetableService";
import { supabase } from "@/lib/supabase";

interface ClassOption {
  id: string;
  name: string;
}

// Extrait un message lisible d'une erreur inconnue.
const errorMessage = (e: unknown) =>
  e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
    ? (e as { message: string }).message
    : "Création impossible.";

// Formulaire court : nom, classe et annee scolaire du futur emploi du temps.
export default function TimetableCreationPage() {
  const user = useCurrentUser();
  const hasScheduling = useFeature("scheduling");
  const { toast } = useToast();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [form, setForm] = useState({ name: "", classId: "", schoolYear: SCHOOL_YEAR });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("class_rooms")
        .select("id, name")
        .eq("school_id", user.schoolId)
        .order("name");

      if (cancelled) return;
      if (error) toast(error.message, "error");
      else setClasses((data ?? []) as unknown as ClassOption[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.schoolId, toast]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim() || !form.classId) {
      toast("Renseignez un nom et une classe.", "error");
      return;
    }

    setBusy(true);
    try {
      const id = await createTimetable(
        { name: form.name.trim(), classId: form.classId, schoolYear: form.schoolYear },
        user.schoolId,
        user.id,
      );
      toast("Emploi du temps créé.");
      navigate(`/app/timetables/${id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!hasScheduling) {
    return (
      <>
        <PageHeader title="Nouvel emploi du temps" subtitle="Fonctionnalité disponible à partir du plan Pro." />
        <Card className="max-w-3xl">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Icon name="workspace_premium" className="text-4xl text-neutral-300" />
            <p className="font-semibold text-ink">Création d'emplois du temps réservée aux plans Pro et supérieurs.</p>
            <p className="max-w-sm text-sm text-neutral-500">Passez à un plan supérieur depuis l'onglet Abonnement pour débloquer cette fonctionnalité.</p>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Nouvel emploi du temps"
        subtitle="Créez un brouillon, puis ajoutez les cours."
        actions={
          <LinkButton to="/app/timetables" variant="outline" icon="arrow_back">
            Retour
          </LinkButton>
        }
      />

      <Card className="max-w-3xl">
        <form onSubmit={submit} className="space-y-5">
          <Input
            label="Nom"
            required
            placeholder={`Ex. Emploi du temps ${SCHOOL_YEAR}`}
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Classe"
              required
              placeholder={loading ? "Chargement…" : "Sélectionner une classe"}
              disabled={loading}
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
              value={form.classId}
              onChange={(event) => setForm((prev) => ({ ...prev, classId: event.target.value }))}
            />

            <Input
              label="Année scolaire"
              required
              placeholder="2026-2027"
              value={form.schoolYear}
              onChange={(event) => setForm((prev) => ({ ...prev, schoolYear: event.target.value }))}
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" loading={busy} icon="save">
              Créer l'emploi du temps
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/app/timetables")}>
              Annuler
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
