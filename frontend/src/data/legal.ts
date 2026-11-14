// Textes des pages légales : conditions générales et politique de confidentialité.
export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalDocument {
  slug: "cgu" | "confidentialite";
  eyebrow: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  intro: string[];
  sections: LegalSection[];
}

const CONTACT_EMAIL = "contact@classora.sn";
const CDP = "Commission de protection des données à caractère personnel (CDP)";

export const cgu: LegalDocument = {
  slug: "cgu",
  eyebrow: "Informations légales",
  title: "Conditions Générales d'Utilisation",
  subtitle: "Les règles applicables à l'accès et à l'utilisation de la plateforme Classora.",
  updatedAt: "23 octobre 2026",
  intro: [
    "Les présentes Conditions Générales d'Utilisation (« CGU ») régissent l'accès et l'utilisation de la plateforme Classora, service en ligne de gestion scolaire destiné aux établissements d'enseignement privés et à leurs communautés éducatives.",
    "Elles sont conclues entre Classora, éditeur de la plateforme, et toute personne physique ou morale qui crée un compte ou utilise le service (l'« Utilisateur »). En cochant la case d'acceptation lors de la création de son compte, l'Utilisateur reconnaît avoir lu, compris et accepté sans réserve l'intégralité des présentes CGU ainsi que la Politique de confidentialité.",
    "Les CGU sont soumises au droit sénégalais, notamment à la loi n° 2008-12 du 25 janvier 2008 portant sur la protection des données à caractère personnel, à la loi n° 2008-08 du 25 janvier 2008 sur les transactions électroniques et à la loi n° 2008-11 du 25 janvier 2008 sur la cybercriminalité.",
  ],
  sections: [
    {
      id: "objet",
      title: "1. Objet et champ d'application",
      paragraphs: [
        "Classora met à disposition une plateforme permettant aux établissements scolaires de gérer leurs inscriptions, classes, élèves, enseignants, notes, bulletins, paiements et échanges avec les familles.",
        "Le service est accessible depuis un navigateur web, sur ordinateur, tablette ou téléphone. Certaines fonctionnalités peuvent dépendre du forfait souscrit par l'établissement.",
        "Les présentes CGU s'appliquent à tous les comptes, quel que soit le rôle : directeur, économe, secrétaire, surveillant, instituteur, professeur, élève ou parent.",
      ],
    },
    {
      id: "definitions",
      title: "2. Définitions",
      items: [
        "« Plateforme » : le service en ligne Classora et l'ensemble de ses fonctionnalités.",
        "« Établissement » : la personne morale, l'école ou le groupe scolaire qui souscrit au service et crée un espace scolaire.",
        "« Utilisateur » : toute personne disposant d'un compte sur la plateforme.",
        "« Compte » : l'espace personnel associé à un Utilisateur, protégé par des identifiants.",
        "« Contenu » : les données, informations, fichiers, messages et documents enregistrés sur la plateforme.",
        "« Sous-traitant » : le prestataire qui traite des données personnelles pour le compte de l'Établissement, au sens de la loi n° 2008-12.",
      ],
    },
    {
      id: "acces",
      title: "3. Accès au service et création de compte",
      paragraphs: [
        "La création d'un compte est réservée aux personnes majeures et capables. Pour les élèves mineurs, le compte est créé par l'Établissement ou par un parent ou tuteur légal, qui autorise le traitement des données nécessaires au suivi scolaire.",
        "L'Utilisateur s'engage à fournir des informations exactes, complètes et à jour, et à les mettre à jour en cas de changement. Toute information inexacte peut entraîner la suspension ou la suppression du compte.",
        "L'accès au service nécessite une connexion internet. Les coûts de connexion et de matériel restent à la charge de l'Utilisateur.",
        "L'Utilisateur est seul responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son compte. Il doit informer immédiatement Classora de toute utilisation non autorisée.",
      ],
    },
    {
      id: "comptes-roles",
      title: "4. Comptes, rôles et habilitations",
      paragraphs: [
        "Chaque Utilisateur dispose d'un rôle qui détermine les données et les fonctionnalités auxquelles il peut accéder. Les droits d'accès sont limités au strict nécessaire et sont configurés par l'Établissement pour les comptes qu'il crée.",
        "Les comptes du personnel (enseignants, secrétaires, économes et surveillants) sont créés par la direction de l'Établissement. Un enseignant ne peut consulter et saisir que les notes des classes et matières qui lui sont affectées. Le secrétariat dispose d'un accès de consultation, sans droit de modification des notes ni de gestion du personnel.",
        "L'Établissement s'engage à vérifier l'identité des personnes auxquelles il attribue un compte et à retirer sans délai les accès des personnes qui ne font plus partie de son personnel.",
      ],
    },
    {
      id: "obligations-utilisateur",
      title: "5. Obligations de l'Utilisateur",
      paragraphs: ["L'Utilisateur s'engage à utiliser la plateforme de manière loyale, conformément à sa destination et aux lois en vigueur. Il est notamment interdit :"],
      items: [
        "de porter atteinte aux droits d'un tiers, notamment à sa vie privée, à son image ou à ses données personnelles ;",
        "de diffuser des contenus illicites, diffamatoires, injurieux, discriminatoires, violents ou contraires à l'ordre public ;",
        "de tenter d'accéder à des données ou à des comptes auxquels l'Utilisateur n'est pas habilité ;",
        "d'extraire, de copier ou de réutiliser massivement les données de la plateforme sans autorisation ;",
        "d'introduire un virus, un code malveillant ou de perturber le fonctionnement du service ;",
        "d'usurper l'identité d'un autre Utilisateur ou de transmettre ses identifiants à un tiers ;",
        "d'utiliser la plateforme à des fins de prospection commerciale non sollicitée.",
      ],
    },
    {
      id: "obligations-etablissement",
      title: "6. Rôle et responsabilité de l'Établissement",
      paragraphs: [
        "L'Établissement est responsable de l'exactitude des données qu'il enregistre, des décisions pédagogiques et administratives qu'il prend et du respect des obligations qui lui incombent en qualité de responsable de traitement pour les données de ses élèves, de ses familles et de son personnel.",
        "L'Établissement s'engage à informer les élèves et les parents des traitements réalisés dans le cadre de la scolarité, à recueillir les autorisations nécessaires et à ne collecter que les données utiles à la gestion scolaire.",
        "L'Établissement garantit que les personnes qu'il habilite disposent des informations et de la formation nécessaires à la protection des données.",
      ],
    },
    {
      id: "donnees",
      title: "7. Données personnelles",
      paragraphs: [
        "Les traitements de données personnelles réalisés via la plateforme sont décrits dans la Politique de confidentialité, qui fait partie intégrante des présentes CGU.",
        "Classora met en œuvre les mesures techniques et organisationnelles appropriées pour protéger les données contre la perte, l'altération, la divulgation et l'accès non autorisé.",
      ],
    },
    {
      id: "propriete",
      title: "8. Propriété intellectuelle",
      paragraphs: [
        "La plateforme, sa structure, ses textes, logos, interfaces, bases de données et éléments graphiques sont protégés par les droits de propriété intellectuelle. Toute reproduction, représentation, adaptation ou exploitation non autorisée est interdite.",
        "Les contenus enregistrés par l'Établissement et les Utilisateurs restent leur propriété. L'Établissement concède à Classora une licence limitée, non exclusive et strictement nécessaire à l'hébergement, à la fourniture du service et à l'exécution des présentes CGU.",
        "Les marques et logos de l'Établissement ne peuvent être utilisés par Classora à des fins de communication qu'avec son accord préalable.",
      ],
    },
    {
      id: "disponibilite",
      title: "9. Disponibilité, maintenance et évolutions",
      paragraphs: [
        "Classora s'efforce d'assurer la disponibilité du service 24 heures sur 24 et 7 jours sur 7, sous réserve des opérations de maintenance, des mises à jour de sécurité et des événements indépendants de sa volonté.",
        "Des interruptions temporaires peuvent survenir pour maintenance ou amélioration. Classora informe les Établissements, dans la mesure du possible, des interventions programmées susceptibles d'affecter le service.",
        "Classora peut faire évoluer les fonctionnalités de la plateforme. Toute modification substantielle des CGU est notifiée selon les modalités prévues à l'article 13.",
      ],
    },
    {
      id: "abonnement",
      title: "10. Tarifs, abonnement et paiement",
      paragraphs: [
        "Les conditions tarifaires applicables sont celles présentées sur la page Tarifs ou dans le devis accepté par l'Établissement. Les prix sont indiqués en francs CFA (FCFA).",
        "Sauf mention contraire, l'abonnement est dû pour la durée convenue et peut être renouvelé selon les modalités du forfait choisi.",
        "Tout retard de paiement peut entraîner la suspension de l'accès aux fonctionnalités payantes, après information de l'Établissement, sans préjudice des sommes déjà dues.",
        "Les données de l'Établissement sont conservées pendant la durée de la relation contractuelle, puis restituées ou supprimées selon les modalités prévues par la loi et la Politique de confidentialité.",
      ],
    },
    {
      id: "resiliation",
      title: "11. Suspension et résiliation",
      paragraphs: [
        "Classora peut suspendre ou résilier un compte en cas de manquement grave ou répété aux présentes CGU, de non-paiement, d'utilisation frauduleuse ou de risque pour la sécurité de la plateforme ou des tiers.",
        "L'Établissement peut résilier son abonnement selon les conditions du forfait souscrit. La résiliation prend effet à la fin de la période en cours, sauf accord contraire.",
        "En cas de résiliation, l'Établissement peut demander l'export de ses données pendant une durée raisonnable. Passé ce délai, les données sont supprimées ou anonymisées, sous réserve des obligations légales de conservation.",
      ],
    },
    {
      id: "responsabilite",
      title: "12. Responsabilité",
      paragraphs: [
        "Classora fournit le service selon une obligation de moyens. Sa responsabilité ne peut être engagée pour les dommages indirects, la perte de données résultant d'une mauvaise utilisation ou d'un défaut de sauvegarde de l'Établissement, ou les interruptions dues à un tiers, au réseau ou à un cas de force majeure.",
        "L'Établissement demeure responsable des contenus qu'il enregistre, des accès qu'il accorde et des décisions qu'il prend à l'égard des élèves et des familles.",
        "Rien dans les présentes CGU n'exclut ou ne limite la responsabilité lorsque la loi l'interdit, notamment en cas de faute lourde ou de dommage corporel.",
      ],
    },
    {
      id: "modification",
      title: "13. Modification des CGU",
      paragraphs: [
        "Classora peut modifier les présentes CGU pour tenir compte de l'évolution du service, de la réglementation ou des besoins de sécurité. La version en vigueur est publiée sur cette page avec sa date de mise à jour.",
        "Les modifications substantielles sont notifiées aux Établissements par e-mail ou par un message dans la plateforme au moins quinze (15) jours avant leur entrée en vigueur, sauf urgence liée à la sécurité ou à la loi.",
        "L'utilisation du service après l'entrée en vigueur vaut acceptation des nouvelles CGU. À défaut d'acceptation, l'Utilisateur peut résilier son compte selon les modalités prévues.",
      ],
    },
    {
      id: "droit-applicable",
      title: "14. Droit applicable et règlement des litiges",
      paragraphs: [
        "Les présentes CGU sont régies par le droit sénégalais.",
        "En cas de différend, les parties s'efforcent de trouver une solution amiable. À défaut d'accord dans un délai de trente (30) jours, le litige est porté devant les juridictions compétentes de Dakar, sous réserve des dispositions impératives applicables aux consommateurs.",
      ],
    },
    {
      id: "contact",
      title: "15. Contact et mentions légales",
      paragraphs: [
        `Pour toute question relative aux présentes CGU, l'Utilisateur peut écrire à ${CONTACT_EMAIL}.`,
        "Les mentions légales complètes (forme juridique, numéro d'immatriculation, adresse du siège) sont disponibles sur demande à la même adresse. L'éditeur est Classora, dont l'établissement est situé à Dakar, Sénégal.",
      ],
    },
  ],
};

export const privacy: LegalDocument = {
  slug: "confidentialite",
  eyebrow: "Vie privée",
  title: "Politique de confidentialité",
  subtitle: "Comment Classora collecte, utilise, protège et conserve les données personnelles.",
  updatedAt: "23 octobre 2026",
  intro: [
    "Classora accorde une importance particulière à la protection de la vie privée et des données personnelles. La présente Politique de confidentialité décrit les traitements réalisés dans le cadre de la plateforme et les droits des personnes concernées.",
    "Elle est établie conformément à la loi n° 2008-12 du 25 janvier 2008 portant sur la protection des données à caractère personnel, à son décret d'application n° 2008-721 du 30 juin 2008, ainsi qu'aux autres textes sénégalais applicables en matière de transactions électroniques, de cybercriminalité et de protection des consommateurs.",
    "Elle s'applique aux visiteurs du site, aux Établissements clients et à tous les Utilisateurs de la plateforme : direction, personnel, enseignants, élèves et parents.",
  ],
  sections: [
    {
      id: "responsable",
      title: "1. Responsable du traitement et rôles",
      paragraphs: [
        `Classora, éditeur de la plateforme, est responsable du traitement des données relatives à la création et à la gestion des comptes, à la fourniture du service, à la sécurité, au support et à la communication institutionnelle. Pour ces traitements, Classora peut être contactée à ${CONTACT_EMAIL}.`,
        "Pour les données scolaires enregistrées dans son espace (élèves, familles, personnel, notes, absences, paiements), l'Établissement agit en qualité de responsable du traitement. Classora agit alors comme sous-traitant, sur les instructions de l'Établissement et dans les limites du service.",
        "L'Établissement doit informer les élèves et les parents des traitements qu'il réalise et recueillir, le cas échéant, les consentements requis. Classora fournit les moyens techniques permettant la mise en œuvre de ces obligations.",
      ],
    },
    {
      id: "donnees",
      title: "2. Données collectées",
      paragraphs: ["Selon le rôle de la personne concernée et l'utilisation de la plateforme, les catégories de données suivantes peuvent être traitées :"],
      items: [
        "Données d'identification et de contact : nom, prénom, adresse e-mail, numéro de téléphone, adresse postale, ville.",
        "Données relatives à l'établissement : nom de l'école, cycles, classes, matricule, coordonnées et informations administratives.",
        "Données scolaires de l'élève : nom, prénom, sexe, date de naissance, classe, notes, moyennes, rangs, appréciations, absences, bulletins et décisions d'inscription.",
        "Données de vie scolaire : notes, absences, paiements, justificatifs et pièces transmises.",
        "Données financières : montant des frais de scolarité, échéances, statut des paiements et références de transactions. Les données bancaires ou de portefeuille électronique complètes ne sont pas conservées par Classora ; elles sont traitées par les opérateurs de paiement.",
        "Données de connexion et de sécurité : identifiant, adresse IP, date et heure de connexion, journaux d'accès et d'activité, appareil et navigateur utilisés.",
        "Données de préférence : paramètres du compte, choix de cycle, préférences d'affichage et de notification.",
      ],
    },
    {
      id: "finalites",
      title: "3. Finalités et bases légales",
      paragraphs: ["Les données sont traitées pour des finalités déterminées, explicites et légitimes. Les bases légales sont les suivantes :"],
      items: [
        "Exécution du contrat ou de mesures précontractuelles : création et gestion du compte, fourniture du service, inscriptions, notes, bulletins, paiements et support.",
        "Obligation légale : conservation de documents comptables, réponse aux réquisitions des autorités compétentes, lutte contre la fraude et la cybercriminalité.",
        "Consentement : communications facultatives, acceptation des CGU et de la Politique de confidentialité, certains cookies non essentiels.",
        "Intérêt légitime : sécurité de la plateforme, prévention des abus, amélioration du service, journalisation technique et défense des droits en cas de litige.",
        "Mission d'intérêt public ou intérêt légitime de l'Établissement : suivi de la scolarité, vie scolaire et communication avec les familles, dans le respect du droit à l'éducation et des règles applicables.",
      ],
    },
    {
      id: "obligatoire",
      title: "4. Caractère obligatoire des réponses",
      paragraphs: [
        "Les informations signalées comme obligatoires dans les formulaires doivent être renseignées pour permettre la création du compte ou la fourniture du service. À défaut, la demande peut ne pas être traitée.",
        "Les autres informations sont facultatives. L'Utilisateur peut les renseigner librement ou les omettre, sans conséquence sur l'accès au service, sauf mention contraire.",
      ],
    },
    {
      id: "destinataires",
      title: "5. Destinataires et sous-traitants",
      paragraphs: [
        "Les données sont accessibles aux personnes habilitées de Classora, dans la limite de leurs attributions, ainsi qu'aux personnes habilitées par l'Établissement selon leur rôle.",
        "Classora peut faire appel à des prestataires techniques (hébergement, base de données, envoi d'e-mails et de notifications, paiement, support) agissant comme sous-traitants. Ces prestataires sont liés par des obligations de confidentialité et de sécurité et ne peuvent utiliser les données que pour les besoins du service.",
        "Les données peuvent également être communiquées aux autorités administratives ou judiciaires lorsque la loi l'exige, ou aux opérateurs de paiement pour l'exécution des transactions.",
        "Classora ne vend pas les données personnelles et ne les utilise pas à des fins de publicité ciblée.",
      ],
    },
    {
      id: "transferts",
      title: "6. Transferts hors du Sénégal",
      paragraphs: [
        "Certains prestataires techniques peuvent être situés hors du Sénégal. Conformément à la loi n° 2008-12, tout transfert de données vers un pays tiers est encadré par des garanties appropriées et, lorsque la réglementation l'exige, soumis à l'autorisation préalable de la CDP.",
        "Classora s'efforce de privilégier des prestataires offrant un niveau de protection adéquat et met en place des mesures contractuelles et techniques destinées à préserver la confidentialité et la sécurité des données transférées.",
      ],
    },
    {
      id: "conservation",
      title: "7. Durées de conservation",
      paragraphs: [
        "Les données sont conservées pendant la durée nécessaire aux finalités pour lesquelles elles ont été collectées, puis supprimées ou anonymisées, sous réserve des obligations légales d'archivage.",
      ],
      items: [
        "Compte et données de service : pendant la durée de la relation contractuelle, puis pendant la durée nécessaire à la gestion des litiges et au respect des obligations légales.",
        "Données scolaires : selon les instructions de l'Établissement et les règles applicables à la conservation des documents scolaires.",
        "Documents comptables et pièces de paiement : pendant la durée légale de conservation applicable au Sénégal.",
        "Journaux de connexion et de sécurité : pour une durée limitée, généralement douze (12) mois, sauf obligation légale ou enquête en cours.",
        "Cookies et traceurs : pour une durée maximale de treize (13) mois, avec possibilité de retrait du consentement à tout moment.",
        "Données de contact et prospects : pendant la durée des échanges, puis suppression ou anonymisation si aucune relation contractuelle n'est conclue.",
      ],
    },
    {
      id: "securite",
      title: "8. Sécurité des données",
      paragraphs: [
        "Classora met en œuvre des mesures techniques et organisationnelles appropriées pour protéger les données contre la perte, l'altération, la divulgation et l'accès non autorisé, notamment :",
      ],
      items: [
        "contrôle d'accès fondé sur les rôles et le principe du moindre privilège ;",
        "authentification des Utilisateurs et gestion des sessions ;",
        "chiffrement des connexions et protection des données en transit ;",
        "journalisation des accès et des opérations sensibles ;",
        "sauvegardes régulières et procédures de restauration ;",
        "sensibilisation des personnes habilitées et engagement de confidentialité ;",
        "procédure de notification des violations de données à la CDP et aux personnes concernées lorsque la loi l'exige.",
      ],
    },
    {
      id: "droits",
      title: "9. Droits des personnes concernées",
      paragraphs: [
        `Conformément à la loi n° 2008-12, toute personne concernée dispose de droits sur ses données personnelles. Pour les exercer, elle peut écrire à ${CONTACT_EMAIL} en précisant son identité, son rôle et l'objet de sa demande. Une réponse est apportée dans un délai d'un (1) mois, sauf complexité particulière.`,
        "Les droits suivants peuvent être exercés, dans les conditions prévues par la loi :",
      ],
      items: [
        "droit à l'information : savoir si des données la concernant sont traitées et obtenir les informations relatives à ce traitement ;",
        "droit d'accès : obtenir une copie des données la concernant ;",
        "droit de rectification : faire corriger, compléter ou mettre à jour des données inexactes ou incomplètes ;",
        "droit d'effacement : demander la suppression des données lorsque leur conservation n'est plus nécessaire ou lorsque le traitement est illicite ;",
        "droit à la limitation du traitement : demander le gel temporaire de l'utilisation de certaines données ;",
        "droit d'opposition : s'opposer, pour des motifs légitimes, à un traitement de ses données ;",
        "droit au retrait du consentement : retirer à tout moment un consentement donné, sans affecter la licéité des traitements déjà réalisés ;",
        "droit à la portabilité : recevoir, lorsque cela est applicable, les données fournies dans un format structuré et lisible par machine.",
      ],
    },
    {
      id: "mineurs",
      title: "10. Données des élèves mineurs",
      paragraphs: [
        "La plateforme est utilisée pour le suivi d'élèves pouvant être mineurs. Les comptes d'élèves sont créés par l'Établissement ou par un parent ou tuteur légal. Le consentement du titulaire de l'autorité parentale est requis lorsque la loi l'impose.",
        "Les données des mineurs sont traitées uniquement pour les besoins de la scolarité, de la vie scolaire et de la communication avec les familles. Elles ne font l'objet d'aucune prospection commerciale.",
        "Les parents et tuteurs peuvent exercer les droits de leur élève mineur dans les conditions prévues par la loi et les règles applicables à l'établissement.",
      ],
    },
    {
      id: "cookies",
      title: "11. Cookies et traceurs",
      paragraphs: [
        "Classora utilise des cookies et technologies similaires strictement nécessaires au fonctionnement du service : maintien de la session, mémorisation des préférences, sécurité et équilibrage de charge.",
        "Ces traceurs essentiels ne nécessitent pas de consentement préalable. Les cookies de mesure d'audience ou de personnalisation non essentiels, s'ils sont utilisés, sont soumis au consentement de l'Utilisateur, qui peut le retirer à tout moment depuis les paramètres de son navigateur ou les outils prévus à cet effet.",
        "Classora n'utilise pas de cookies publicitaires ni de revente de profils à des annonceurs.",
      ],
    },
    {
      id: "violation",
      title: "12. Violation de données et réclamation",
      paragraphs: [
        "En cas de violation de données personnelles susceptible d'engendrer un risque pour les droits et libertés des personnes, Classora informe la CDP dans les conditions et délais prévus par la loi et, lorsque cela est requis, les personnes concernées.",
        `Toute personne qui estime que ses droits ne sont pas respectés peut adresser une réclamation à la ${CDP} : Complexe SICAP, Point E, 1er étage, Immeuble A, Avenue Cheikh Anta Diop x Canal IV, Dakar, Sénégal. Téléphone : +221 33 859 70 30. Site : cdp.sn.`,
        `Avant toute réclamation, la personne concernée est invitée à contacter Classora à ${CONTACT_EMAIL} afin de rechercher une solution amiable.`,
      ],
    },
    {
      id: "modification",
      title: "13. Modification de la Politique de confidentialité",
      paragraphs: [
        "La présente Politique peut être modifiée pour tenir compte de l'évolution du service, de la réglementation ou des exigences de sécurité. La version en vigueur est publiée sur cette page avec sa date de mise à jour.",
        "En cas de modification substantielle, les Établissements et les Utilisateurs sont informés par e-mail ou par un message dans la plateforme. L'utilisation du service après l'entrée en vigueur vaut acceptation de la nouvelle version.",
      ],
    },
    {
      id: "contact",
      title: "14. Contact",
      paragraphs: [
        `Pour toute question relative à la protection des données ou pour exercer vos droits, écrivez à ${CONTACT_EMAIL}.`,
        "Classora, Dakar, Sénégal. Les demandes sont traitées dans les meilleurs délais et, au plus tard, dans le délai d'un (1) mois prévu par la loi n° 2008-12.",
      ],
    },
  ],
};

export const legalDocuments = { cgu, confidentialite: privacy };
