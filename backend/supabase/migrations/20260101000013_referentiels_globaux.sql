-- ============================================================================
-- SCOLIA — Référentiels globaux (niveaux et formules d'abonnement).
--
-- Données de PRODUCTION : requises par l'application. Auparavant insérées
-- uniquement par le seed (développement local) ; elles font désormais partie
-- du jeu de migrations pour référence. Le seed (école + comptes de démo) doit
-- JAMAIS être appliqué en production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Niveaux (identiques à frontend/src/data/school.ts)
-- ----------------------------------------------------------------------------
insert into public.levels (id, label, cycle, level_order, exam) values
  ('ci',    'CI',        'elementaire', 0,  null),
  ('cp',    'CP',        'elementaire', 1,  null),
  ('ce1',   'CE1',       'elementaire', 2,  null),
  ('ce2',   'CE2',       'elementaire', 3,  null),
  ('cm1',   'CM1',       'elementaire', 4,  null),
  ('cm2',   'CM2',       'elementaire', 5,  'CFEE'),
  ('6e',    '6ème',      'moyen',       6,  null),
  ('5e',    '5ème',      'moyen',       7,  null),
  ('4e',    '4ème',      'moyen',       8,  null),
  ('3e',    '3ème',      'moyen',       9,  'BFEM'),
  ('2nde',  '2nde',      'secondaire', 10, null),
  ('1ere',  '1ère',      'secondaire', 11, null),
  ('tle',   'Terminale', 'secondaire', 12, 'BAC')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Formules d'abonnement (identiques à frontend/src/data/plans.ts), prix en FCFA
-- ----------------------------------------------------------------------------
insert into public.plans (id, name, tagline, student_limit, monthly_price, yearly_price, features, highlight) values
  ('essentiel', 'Essentiel', 'Pour démarrer une école', 100, 0, 0,
   array['Jusqu''à 100 élèves', 'Classes, notes et bulletins', 'Espace parents', 'Support par WhatsApp'], false),
  ('pro',       'Pro',       'La formule la plus choisie', 300, 30000, 300000,
   array['Jusqu''à 300 élèves', 'Affectations et emplois du temps', 'Paiements Wave / Orange Money / Free Money',
         'Messagerie parents-enseignants', 'Rappels automatiques des impayés'], true),
  ('premium',   'Premium',   'Grands établissements', null, 50000, 500000,
   array['Élèves illimités', 'Tous les modules Pro', 'Comptes econome et surveillant inclus',
         'Export des données et rapports', 'Accompagnement dédié'], false),
  ('illimite',  'Illimité',  'Réseau scolaire', null, 90000, 900000,
   array['Élèves illimités', 'Tous les modules Premium', 'Multi-sièges / multi-campus',
         'Contrat annuel Engagement', 'Responsable dédié'], false)
on conflict (id) do nothing;
