interface Language {
  followDirection: string;
  enableFollowDirectionMode: string;
  disableFollowDirectionMode: string;
  createPoint: string;
  createIntermediatePoint: string;
  deletePoint: string;
}

export type AvailableLanguages = "en" | "fr";

type Languages = {
  [languageId in AvailableLanguages]: Language;
};

export const languages: Languages = {
  en: {
    followDirection: "Follow direction",
    enableFollowDirectionMode: "Enable direction",
    disableFollowDirectionMode: "Disable direction",
    createPoint: "Create point",
    createIntermediatePoint: "Create intermediate point",
    deletePoint: "Delete point",
  },
  fr: {
    followDirection: "Suivre la direction",
    enableFollowDirectionMode: "Activer la direction",
    disableFollowDirectionMode: "Désactiver la direction",
    createPoint: "Créer un point",
    createIntermediatePoint: "Créer un point intermédiaire",
    deletePoint: "Supprimer le point",
  },
};
